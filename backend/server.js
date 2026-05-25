'use strict';

require('dotenv').config();
const fastify = require('fastify')({ logger: false });
const { randomUUID, createHash } = require('crypto');
const { createClient } = require('redis');
const { query, initDb, encryptSecret, decryptSecret } = require('./db');

const DEFAULT_RPM_LIMIT = Number(process.env.RATE_LIMIT_DEFAULT_PER_MIN || 2);
const redis = createClient({ url: process.env.REDIS_URL });

fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-keygate-client', 'x-project-id'],
});
fastify.register(require('@fastify/helmet'), { contentSecurityPolicy: false });

function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
function maskKey(apiKey) { return apiKey.slice(0, 7) + '••••••••' + apiKey.slice(-4); }

async function rateLimitBySubkey(subkeyId, limit = DEFAULT_RPM_LIMIT) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowSec = 60;
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const redisKey = `rl:subkey:${subkeyId}:${windowStart}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSec);
  const remaining = Math.max(limit - count, 0);
  const reset = windowStart + windowSec;
  return { remaining, reset, limit, allowed: count <= limit };
}

fastify.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

async function getProject(req, reply) {
  const projectRef = String(req.headers['x-project-id'] || '').trim();
  if (!projectRef) {
    reply.code(400).send({ error: 'Missing x-project-id header' });
    return null;
  }
  const { rows } = await query(`SELECT id,name,slug,status FROM projects WHERE id::text = $1 OR slug = $1 LIMIT 1`, [projectRef]);
  const project = rows[0];
  if (!project) {
    reply.code(404).send({ error: 'project not found' });
    return null;
  }
  if (project.status !== 'active') {
    reply.code(403).send({ error: 'project is not active' });
    return null;
  }
  return project;
}

fastify.get('/api/projects', async () => {
  const { rows } = await query(`SELECT id,name,slug,status,EXTRACT(EPOCH FROM created_at)::bigint AS created_at FROM projects ORDER BY created_at DESC`);
  return rows;
});

fastify.post('/api/projects', async (req, reply) => {
  const { name, slug = null } = req.body || {};
  if (!name) return reply.code(400).send({ error: 'name required' });
  const { rows: countRows } = await query('SELECT COUNT(*)::int AS c FROM projects');
  if ((countRows[0]?.c || 0) >= 3) return reply.code(400).send({ error: 'max 3 projects allowed for now' });
  const id = randomUUID();
  const generatedSlug = `project-${Math.random().toString(36).slice(2, 10)}`;
  await query(`INSERT INTO projects (id,name,slug,status) VALUES ($1,$2,$3,$4)`, [id, String(name).trim(), slug ? String(slug).trim() : generatedSlug, 'active']);
  return { id, name: String(name).trim(), slug: slug ? String(slug).trim() : generatedSlug, status: 'active', created_at: Math.floor(Date.now()/1000) };
});

async function deleteProjectByRef(projectRef) {
  const ref = decodeURIComponent(String(projectRef || '').trim());
  if (!ref) return { success: true, deleted: false, reason: 'empty_ref' };
  const { rows } = await query('SELECT id,slug FROM projects WHERE slug = $1 OR id::text = $1 LIMIT 1', [ref]);
  const project = rows[0];
  if (!project) return { success: true, deleted: false, reason: 'not_found' };
  await query('DELETE FROM projects WHERE id = $1', [project.id]);
  return { success: true, deleted: true, id: project.id, slug: project.slug };
}

fastify.delete('/api/projects/:id', async (req, reply) => {
  try {
    return await deleteProjectByRef(req.params.id);
  } catch (err) {
    req.log.error(err);
    return reply.code(200).send({ success: false, deleted: false, reason: 'internal_error' });
  }
});



fastify.route({
  method: ['DELETE', 'GET', 'POST'],
  url: '/api/projects/by-slug/:slug',
  handler: async (req, reply) => {
    try {
      return await deleteProjectByRef(req.params.slug);
    } catch (err) {
      req.log.error(err);
      return reply.code(200).send({ success: false, deleted: false, reason: 'internal_error' });
    }
  },
});

fastify.get('/api/master-keys', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { rows } = await query(`
    SELECT id, provider, name, key_masked, key_version,
           EXTRACT(EPOCH FROM created_at)::bigint AS created_at,
           EXTRACT(EPOCH FROM updated_at)::bigint AS updated_at
    FROM master_keys WHERE project_id = $1 ORDER BY created_at DESC
  `, [project.id]);
  return rows;
});

fastify.post('/api/master-keys', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { provider, api_key, name } = req.body || {};
  if (!provider || !api_key) return reply.code(400).send({ error: 'provider and api_key required' });
  const encrypted = encryptSecret(api_key, provider);
  await query(
    `INSERT INTO master_keys (id, project_id, provider, name, key_masked, ciphertext_b64, iv_b64, auth_tag_b64, key_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), project.id, provider, name || provider, maskKey(api_key), encrypted.ciphertext_b64, encrypted.iv_b64, encrypted.auth_tag_b64, encrypted.key_version],
  );
  return { success: true };
});


fastify.delete('/api/master-keys/:id', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { id } = req.params;
  try {
    await query('BEGIN');
    await query('UPDATE subkeys SET master_key_id = NULL WHERE master_key_id = $1 AND project_id = $2', [id, project.id]);
    const result = await query('DELETE FROM master_keys WHERE id = $1 AND project_id = $2', [id, project.id]);
    await query('COMMIT');
    if (!result.rowCount) return reply.code(404).send({ error: 'master key not found' });
    return { success: true };
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    if (/invalid input syntax for type uuid/i.test(String(err?.message || ''))) {
      return reply.code(400).send({ error: 'invalid master key id' });
    }
    throw err;
  }
});

fastify.delete('/api/subkeys/:id', async (req, reply) => {
  await query('DELETE FROM subkeys WHERE id = $1', [req.params.id]);
  return { success: true };
});

fastify.get('/api/subkeys', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { rows } = await query(`SELECT id, name, token_prefix, token_ciphertext_b64, token_iv_b64, token_auth_tag_b64, provider, master_key_id, auto_route_on_exhausted, monthly_token_limit, requests_per_minute_limit, tokens_used, status, spend_limit_usd, max_requests, request_count, allowed_models, EXTRACT(EPOCH FROM expires_at)::bigint AS expires_at, EXTRACT(EPOCH FROM created_at)::bigint AS created_at FROM subkeys WHERE project_id = $1 ORDER BY created_at DESC`, [project.id]);
  return rows.map((row) => {
    let token = null;
    if (row.token_ciphertext_b64 && row.token_iv_b64 && row.token_auth_tag_b64) {
      try { token = decryptSecret({ ciphertext_b64: row.token_ciphertext_b64, iv_b64: row.token_iv_b64, auth_tag_b64: row.token_auth_tag_b64 }, `subkey:${row.id}`); } catch (_) {}
    }
    return { ...row, token };
  });
});

fastify.patch('/api/subkeys/:id', async (req, reply) => {
  const { id } = req.params;
  const body = req.body || {};
  const updates = [];
  const values = [];

  if (body.status !== undefined) {
    if (!['active', 'paused', 'revoked'].includes(body.status)) return reply.code(400).send({ error: 'status must be active|paused|revoked' });
    updates.push(`status = $${values.length + 1}`);
    values.push(body.status);
  }
  if (body.monthly_token_limit !== undefined) {
    const v = Number(body.monthly_token_limit);
    if (!Number.isFinite(v) || v < 1) return reply.code(400).send({ error: 'monthly_token_limit must be a positive number' });
    updates.push(`monthly_token_limit = $${values.length + 1}`);
    values.push(Math.round(v));
  }
  if (body.max_requests !== undefined) {
    const v = Number(body.max_requests);
    if (!Number.isFinite(v) || v < 1) return reply.code(400).send({ error: 'max_requests must be a positive number' });
    updates.push(`max_requests = $${values.length + 1}`);
    values.push(Math.round(v));
  }
  if (body.expires_in_days !== undefined) {
    if (body.expires_in_days === null || body.expires_in_days === '') {
      updates.push(`expires_at = NULL`);
    } else {
      const v = Number(body.expires_in_days);
      if (!Number.isFinite(v) || v < 1) return reply.code(400).send({ error: 'expires_in_days must be a positive number or null' });
      updates.push(`expires_at = NOW() + ($${values.length + 1} || ' days')::interval`);
      values.push(String(Math.round(v)));
    }
  }

  if (!updates.length) return reply.code(400).send({ error: 'no editable fields provided' });
  values.push(id);
  await query(`UPDATE subkeys SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
  return { success: true };
});

fastify.post('/api/subkeys', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { name, provider, master_key_id = null, auto_route_on_exhausted = false, monthly_token_limit = 50000, max_requests = 5000, allowed_models = ['all'], spend_limit_usd = null, expires_in_days = null } = req.body || {};
  if (!name || !provider) return reply.code(400).send({ error: 'name and provider required' });
  const id = randomUUID();
  const token = `sk-kg-${randomUUID().replace(/-/g, '')}`;
  const enc = encryptSecret(token, `subkey:${id}`);
  const expiresAt = expires_in_days ? new Date(Date.now() + Number(expires_in_days) * 86400 * 1000) : null;
  await query(`INSERT INTO subkeys (id,project_id,name,token_hash,token_prefix,token_ciphertext_b64,token_iv_b64,token_auth_tag_b64,token_key_version,provider,master_key_id,auto_route_on_exhausted,monthly_token_limit,requests_per_minute_limit,spend_limit_usd,max_requests,allowed_models,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`, [id, project.id, name, hashToken(token), token.slice(0, 12), enc.ciphertext_b64, enc.iv_b64, enc.auth_tag_b64, enc.key_version, provider, master_key_id, Boolean(auto_route_on_exhausted), Number(monthly_token_limit) || 50000, DEFAULT_RPM_LIMIT, spend_limit_usd, Number(max_requests) || 5000, JSON.stringify(allowed_models && allowed_models.length ? allowed_models : ['all']), expiresAt]);
  return { id, name, provider, token_prefix: token.slice(0, 12), token, requests_per_minute_limit: DEFAULT_RPM_LIMIT };
});

fastify.get('/api/models', async () => ({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }, { id: 'gpt-4.1-mini' }, { id: 'gpt-4.1' }, { id: 'gemini-2.5-flash' }, { id: 'gemini-2.5-pro' }] }));

fastify.get('/api/analytics', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const [{ rows: totals }, { rows: logs }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total_requests, COALESCE(SUM(tokens_used),0)::int AS total_tokens FROM request_logs WHERE project_id = $1`, [project.id]),
    query(`SELECT id,subkey_id,subkey_name,model,tokens_used,status,source,latency_ms,EXTRACT(EPOCH FROM created_at)::bigint AS created_at FROM request_logs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200`, [project.id]),
  ]);
  const totalRequests = totals[0]?.total_requests || 0;
  const totalTokens = totals[0]?.total_tokens || 0;
  const avgLatency = logs.length ? Math.round(logs.reduce((s, r) => s + Number(r.latency_ms || 0), 0) / logs.length) : 0;
  const topModels = [...logs.reduce((m, r) => (m.set(r.model || 'unknown', (m.get(r.model || 'unknown') || 0) + 1), m), new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([model, count]) => ({ model, count }));
  const costAttribution = logs.map((l) => {
    const t = Number(l.tokens_used || 0);
    const isGemini = String(l.model || '').startsWith('gemini');
    const est_cost_usd = isGemini ? (t / 1_000_000) * 0.15 : (t / 1_000_000) * 2.0;
    return { model: l.model || 'unknown', est_cost_usd };
  });
  return { totalRequests, totalTokens, avgLatency, topModels, logs, costAttribution };
});

fastify.get('/api/quota-requests', async () => {
  const { rows } = await query(`SELECT q.id,q.subkey_id,s.name AS subkey_name,q.request_type,q.amount,q.note,q.status,EXTRACT(EPOCH FROM q.created_at)::bigint AS created_at FROM quota_requests q LEFT JOIN subkeys s ON s.id=q.subkey_id ORDER BY q.created_at DESC`);
  return rows;
});


fastify.patch('/api/quota-requests/:id', async (req, reply) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return reply.code(400).send({ error: 'status must be approved|rejected|pending' });
  const { rows } = await query('UPDATE quota_requests SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  const r = rows[0];
  if (r && status === 'approved') {
    if (r.request_type === 'credits' && r.amount) {
      const add = Math.max(0, Number(String(r.amount).replace(/[^0-9.]/g, '')) || 0) * 1000;
      await query('UPDATE subkeys SET monthly_token_limit = COALESCE(monthly_token_limit,0) + $1 WHERE id = $2', [Math.round(add), r.subkey_id]);
    }
    if (r.request_type === 'expiry_extend' && r.amount) {
      const days = Math.max(0, Number(String(r.amount).replace(/[^0-9.]/g, '')) || 0);
      await query("UPDATE subkeys SET expires_at = COALESCE(expires_at, NOW()) + ($1 || ' days')::interval WHERE id = $2", [String(Math.round(days)), r.subkey_id]);
    }
  }
  return { success: true };
});

fastify.post('/api/quota-requests', async (req, reply) => {
  const project = await getProject(req, reply); if (!project) return;
  const { subkey_id, request_type, amount = null, note = '' } = req.body || {};
  if (!subkey_id || !request_type) return reply.code(400).send({ error: 'subkey_id and request_type required' });
  await query(`INSERT INTO quota_requests (id,project_id,subkey_id,request_type,amount,note,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), project.id, subkey_id, request_type, amount ? String(amount) : null, note, 'pending']);
  return { success: true };
});

fastify.post('/v1/chat/completions', async (req, reply) => {
  const started = Date.now();
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return reply.code(401).send({ error: { message: 'Missing Authorization header.', type: 'auth_error' } });

  const { rows } = await query(`SELECT id,project_id,name,provider,master_key_id,auto_route_on_exhausted,status,requests_per_minute_limit,max_requests,request_count,monthly_token_limit,tokens_used,expires_at,allowed_models FROM subkeys WHERE token_hash = $1`, [hashToken(bearer)]);
  const subkey = rows[0];
  if (!subkey) return reply.code(401).send({ error: { message: 'Invalid subkey.', type: 'auth_error' } });
  if (subkey.status !== 'active') return reply.code(403).send({ error: { message: `Subkey is ${subkey.status}.`, type: 'permission_error' } });
  if (subkey.expires_at && new Date(subkey.expires_at).getTime() < Date.now()) return reply.code(403).send({ error: { message: 'Subkey expired.', type: 'permission_error' } });
  if (Number(subkey.request_count || 0) >= Number(subkey.max_requests || 5000)) {
    await query(`INSERT INTO request_logs (id,project_id,subkey_id,subkey_name,model,tokens_used,status,source,latency_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), subkey.project_id, subkey.id, subkey.name, (req.body||{}).model || null, 0, 'max_requests_reached', req.headers['x-keygate-client'] || 'external', Date.now() - started]);
    return reply.code(403).send({ error: { message: 'Max requests reached.', type: 'permission_error' } });
  }


  if (Number(subkey.tokens_used || 0) >= Number(subkey.monthly_token_limit || 0)) {
    await query(`INSERT INTO request_logs (id,project_id,subkey_id,subkey_name,model,tokens_used,status,source,latency_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), subkey.project_id, subkey.id, subkey.name, (req.body||{}).model || null, 0, 'quota_reached', req.headers['x-keygate-client'] || 'external', Date.now() - started]);
    return reply.code(403).send({
      error: {
        message: 'Quota reached for this subkey. Please use /api/quota-requests endpoint to request a quota extension.',
        type: 'quota_error',
      }
    });
  }
  const rate = await rateLimitBySubkey(subkey.id, Number(subkey.requests_per_minute_limit || DEFAULT_RPM_LIMIT));
  reply.header('X-RateLimit-Limit', String(rate.limit));
  reply.header('X-RateLimit-Remaining', String(rate.remaining));
  reply.header('X-RateLimit-Reset', String(rate.reset));
  if (!rate.allowed) return reply.code(429).send({ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Try again later.' });

  const mkQuery = subkey.master_key_id
    ? query('SELECT * FROM master_keys WHERE id = $1 AND provider = $2 AND project_id = $3 LIMIT 1', [subkey.master_key_id, subkey.provider, subkey.project_id])
    : query('SELECT * FROM master_keys WHERE provider = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1', [subkey.provider, subkey.project_id]);
  const { rows: mkRows } = await mkQuery;
  const mk = mkRows[0];
  if (!mk) return reply.code(400).send({ error: { message: `No master key found for provider ${subkey.provider}.`, type: 'config_error' } });

  const providerKey = decryptSecret(mk, subkey.provider);
  const payload = req.body || {};
  const allowed = subkey.allowed_models === 'all' || (Array.isArray(subkey.allowed_models) && subkey.allowed_models.includes(payload.model));
  if (!allowed) return reply.code(403).send({ error: { message: 'Model not allowed for this subkey.', type: 'permission_error' } });

  let status = 'success'; let tokensUsed = 0; let responseBody; let statusCode = 200;
  try {
    let upstream;
    if (subkey.provider === 'google') {
      const geminiModel = payload.model || 'gemini-2.5-flash';
      const geminiBody = { contents: [{ role: 'user', parts: [{ text: (payload.messages || []).map((m) => m.content).join('\n') || '' }] }] };
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${providerKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) });
    } else {
      upstream = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${providerKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    responseBody = await upstream.json().catch(() => ({}));
    if (subkey.provider === 'google' && upstream.ok) {
      responseBody = { choices: [{ message: { content: responseBody?.candidates?.[0]?.content?.parts?.[0]?.text || '' } }], usage: { total_tokens: responseBody?.usageMetadata?.totalTokenCount || 0 }, raw: responseBody };
    }
    statusCode = upstream.status;
    if (!upstream.ok) status = upstream.status === 429 ? 'rate_limited' : 'error';
    tokensUsed = Number(responseBody?.usage?.total_tokens || 0);
  } catch (e) {
    status = 'error'; responseBody = { error: { message: e.message || 'Upstream request failed', type: 'upstream_error' } }; statusCode = 502;
  }

  await query(`INSERT INTO request_logs (id,project_id,subkey_id,subkey_name,model,tokens_used,status,source,latency_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), subkey.project_id, subkey.id, subkey.name, payload.model || null, tokensUsed, status, req.headers['x-keygate-client'] || 'external', Date.now() - started]);
  await query(`UPDATE subkeys SET tokens_used = COALESCE(tokens_used,0) + $1, request_count = COALESCE(request_count,0) + 1 WHERE id = $2`, [tokensUsed, subkey.id]);
  return reply.code(statusCode).send(responseBody);
});

async function start() {
  await redis.connect();
  await initDb();
  const port = 3001;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`🚀 Server running on http://localhost:${port}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
