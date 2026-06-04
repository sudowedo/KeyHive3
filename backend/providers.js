'use strict';

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    compatibility: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'gpt-4o', label: 'GPT-4o', inputPerMillion: 2.50, outputPerMillion: 10.00 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', inputPerMillion: 0.40, outputPerMillion: 1.60 },
      { id: 'gpt-4.1', label: 'GPT-4.1', inputPerMillion: 2.00, outputPerMillion: 8.00 },
    ],
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    compatibility: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', inputPerMillion: 0.30, outputPerMillion: 2.50 },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputPerMillion: 1.25, outputPerMillion: 10.00 },
    ],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-latest',
    compatibility: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', inputPerMillion: 0.80, outputPerMillion: 4.00 },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', inputPerMillion: 3.00, outputPerMillion: 15.00 },
      { id: 'claude-3-opus-latest', label: 'Claude 3 Opus', inputPerMillion: 15.00, outputPerMillion: 75.00 },
    ],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    compatibility: 'openai',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', inputPerMillion: 0.14, outputPerMillion: 0.28 },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', inputPerMillion: 0.55, outputPerMillion: 2.19 },
    ],
  },
  xai: {
    id: 'xai',
    label: 'xAI / Grok',
    defaultModel: 'grok-3',
    compatibility: 'openai',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    keyPlaceholder: 'xai-...',
    models: [
      { id: 'grok-3', label: 'Grok 3', inputPerMillion: 3.00, outputPerMillion: 15.00 },
      { id: 'grok-3-mini', label: 'Grok 3 Mini', inputPerMillion: 0.60, outputPerMillion: 3.00 },
      { id: 'grok-2-vision', label: 'Grok 2 Vision', inputPerMillion: 0.20, outputPerMillion: 1.50 },
    ],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.1-8b-instant',
    compatibility: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    keyPlaceholder: 'gsk_...',
    models: [
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', inputPerMillion: 0.05, outputPerMillion: 0.08 },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', inputPerMillion: 0.59, outputPerMillion: 0.79 },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B 32K', inputPerMillion: 0.24, outputPerMillion: 0.24 },
    ],
  },
};

const cloneProvider = (p) => ({
  id: p.id,
  label: p.label,
  default_model: p.defaultModel,
  compatibility: p.compatibility,
  key_placeholder: p.keyPlaceholder,
  models: p.models.map(({ id, label }) => ({ id, label })),
});

function listProviders() {
  return Object.values(PROVIDERS).map(cloneProvider);
}

function listModels(providerId = null) {
  const providers = providerId ? [getProvider(providerId)].filter(Boolean) : Object.values(PROVIDERS);
  return providers.flatMap((provider) => provider.models.map((model) => ({ id: model.id, label: model.label, provider: provider.id })));
}

function getProvider(providerId) {
  return PROVIDERS[String(providerId || '').toLowerCase()] || null;
}

function getProviderForModel(modelId) {
  const model = String(modelId || '');
  return Object.values(PROVIDERS).find((provider) => provider.models.some((m) => m.id === model)) || null;
}

function getDefaultModel(providerId) {
  return getProvider(providerId)?.defaultModel || null;
}

function isModelAllowedForProvider(providerId, modelId) {
  const provider = getProvider(providerId);
  if (!provider || !modelId) return false;
  return provider.models.some((m) => m.id === modelId);
}

function normalizeAllowedModels(value) {
  if (!value) return ['all'];
  if (Array.isArray(value)) return value.length ? value : ['all'];
  if (value === 'all') return ['all'];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeAllowedModels(parsed);
    } catch {
      return [value];
    }
  }
  return ['all'];
}

function normalizeUsage(body = {}) {
  const usage = body.usage || {};
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? (promptTokens + completionTokens)) || 0;
  return { promptTokens, completionTokens, totalTokens };
}

function estimateCostUsd(providerId, modelId, promptTokens = 0, completionTokens = 0, totalTokens = 0) {
  const provider = getProvider(providerId);
  const model = provider?.models.find((m) => m.id === modelId) || provider?.models.find((m) => m.id === provider.defaultModel);
  const inputPerMillion = Number(model?.inputPerMillion ?? 0.15);
  const outputPerMillion = Number(model?.outputPerMillion ?? 0.60);
  const effectivePrompt = promptTokens || totalTokens;
  return Number((((effectivePrompt / 1_000_000) * inputPerMillion) + ((completionTokens / 1_000_000) * outputPerMillion)).toFixed(6));
}

function toAnthropicPayload(payload = {}, model) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).filter(Boolean).join('\n\n');
  const anthropicMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '') }));

  return {
    model,
    max_tokens: Number(payload.max_tokens || 1024),
    ...(system ? { system } : {}),
    messages: anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: '' }],
    ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
    ...(payload.top_p !== undefined ? { top_p: payload.top_p } : {}),
  };
}

function normalizeAnthropicResponse(body = {}) {
  const text = (body.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('');
  const inputTokens = Number(body.usage?.input_tokens || 0);
  const outputTokens = Number(body.usage?.output_tokens || 0);
  return {
    id: body.id,
    model: body.model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: body.stop_reason || 'stop' }],
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    raw: body,
  };
}

function normalizeGoogleResponse(body = {}) {
  const usageMetadata = body?.usageMetadata || {};
  return {
    choices: [{ message: { content: body?.candidates?.[0]?.content?.parts?.[0]?.text || '' } }],
    usage: {
      prompt_tokens: Number(usageMetadata.promptTokenCount || 0),
      completion_tokens: Number(usageMetadata.candidatesTokenCount || 0),
      total_tokens: Number(usageMetadata.totalTokenCount || 0),
    },
    raw: body,
  };
}

async function callProvider({ provider, apiKey, payload = {}, model }) {
  if (provider.compatibility === 'google') {
    const text = (payload.messages || []).map((m) => m.content).join('\n') || '';
    const geminiBody = { contents: [{ role: 'user', parts: [{ text }] }] };
    return fetch(`${provider.baseUrl}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  }

  if (provider.compatibility === 'anthropic') {
    return fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(toAnthropicPayload(payload, model)),
    });
  }

  return fetch(provider.baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, model }),
  });
}

function normalizeProviderResponse(provider, body, ok) {
  if (!ok) return body || {};
  if (provider.compatibility === 'google') return normalizeGoogleResponse(body);
  if (provider.compatibility === 'anthropic') return normalizeAnthropicResponse(body);
  return body || {};
}

module.exports = {
  PROVIDERS,
  listProviders,
  listModels,
  getProvider,
  getProviderForModel,
  getDefaultModel,
  isModelAllowedForProvider,
  normalizeAllowedModels,
  normalizeUsage,
  estimateCostUsd,
  callProvider,
  normalizeProviderResponse,
};
