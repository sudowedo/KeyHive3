'use strict';

function extractMessageText(messages = []) {
  return messages
    .map((message) => {
      const content = message?.content;
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part?.type === 'text') return part.text || '';
            return part?.text || '';
          })
          .filter(Boolean)
          .join('\n');
      }
      return content || '';
    })
    .filter(Boolean)
    .join('\n');
}

function dataUrlToAnthropicSource(url) {
  const match = String(url || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return { type: 'base64', media_type: match[1], data: match[2] };
}

function toAnthropicContent(content) {
  if (Array.isArray(content)) {
    const blocks = content.map((part) => {
      if (typeof part === 'string') return { type: 'text', text: part };
      if (part?.type === 'text') return { type: 'text', text: part.text || '' };
      if (part?.type === 'image_url') {
        const imageUrl = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
        const source = dataUrlToAnthropicSource(imageUrl) || { type: 'url', url: imageUrl };
        return { type: 'image', source };
      }
      return { type: 'text', text: part?.text || JSON.stringify(part || {}) };
    }).filter((part) => part.type !== 'text' || part.text);
    return blocks.length ? blocks : [{ type: 'text', text: '' }];
  }
  return content || '';
}

function mergeAnthropicMessages(messages = []) {
  return messages.reduce((merged, message) => {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const content = message.role === 'tool'
      ? [{ type: 'text', text: `Tool result (${message.tool_call_id || 'unknown'}): ${message.content || ''}` }]
      : toAnthropicContent(message.content);
    const previous = merged[merged.length - 1];

    if (previous?.role === role) {
      previous.content = [
        ...(Array.isArray(previous.content) ? previous.content : [{ type: 'text', text: previous.content }]),
        ...(Array.isArray(content) ? content : [{ type: 'text', text: content }]),
      ];
      return merged;
    }

    merged.push({ role, content });
    return merged;
  }, []);
}

function mapAnthropicStopReason(stopReason) {
  if (stopReason === 'end_turn' || stopReason === 'stop_sequence') return 'stop';
  if (stopReason === 'max_tokens') return 'length';
  if (stopReason === 'tool_use') return 'tool_calls';
  return stopReason || null;
}

function normalizeOpenAIUsage(body = {}) {
  const usage = body.usage || {};
  const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: Number(usage.total_tokens || inputTokens + outputTokens || 0),
  };
}

function openAICompatibleProvider({ id, displayName, defaultModel, supportedModels, upstreamUrl, costEstimatorDefaults, transformRequest }) {
  return {
    id,
    displayName,
    defaultModel,
    supportedModels,
    openAICompatible: true,
    upstreamUrl: () => upstreamUrl,
    buildAuthHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    transformRequest: transformRequest || ((payload) => ({ ...payload, model: payload.model || defaultModel })),
    normalizeResponse: (body) => body,
    normalizeTokenUsage: normalizeOpenAIUsage,
    costEstimatorDefaults,
  };
}

const providers = {
  openai: openAICompatibleProvider({
    id: 'openai',
    displayName: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    supportedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    upstreamUrl: 'https://api.openai.com/v1/chat/completions',
    costEstimatorDefaults: { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.60, blendedPerMillionUsd: 2.00 },
  }),
  google: {
    id: 'google',
    displayName: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    supportedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    openAICompatible: false,
    upstreamUrl: (payload, apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(payload.model || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(apiKey)}`,
    buildAuthHeaders: () => ({}),
    transformRequest: (payload) => ({
      contents: [{
        role: 'user',
        parts: [{ text: extractMessageText(payload.messages) }],
      }],
    }),
    normalizeResponse: (body) => ({
      choices: [{
        message: {
          role: 'assistant',
          content: body?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').filter(Boolean).join('\n') || '',
        },
      }],
      usage: { total_tokens: Number(body?.usageMetadata?.totalTokenCount || 0) },
      raw: body,
    }),
    normalizeTokenUsage: (body = {}) => ({
      input_tokens: Number(body?.usageMetadata?.promptTokenCount || 0),
      output_tokens: Number(body?.usageMetadata?.candidatesTokenCount || 0),
      total_tokens: Number(body?.usageMetadata?.totalTokenCount || 0),
    }),
    costEstimatorDefaults: { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.60, blendedPerMillionUsd: 0.15 },
  },
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic',
    defaultModel: 'claude-3-5-haiku-20241022',
    supportedModels: ['claude-3-5-haiku-20241022', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'],
    openAICompatible: false,
    upstreamUrl: () => 'https://api.anthropic.com/v1/messages',
    buildAuthHeaders: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    transformRequest: (payload) => ({
      model: payload.model || 'claude-3-5-haiku-20241022',
      max_tokens: payload.max_tokens || payload.max_completion_tokens || 1024,
      messages: mergeAnthropicMessages((payload.messages || []).filter((message) => message.role !== 'system')),
      ...(payload.messages?.some((message) => message.role === 'system')
        ? { system: extractMessageText(payload.messages.filter((message) => message.role === 'system')) }
        : {}),
      ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
      ...(payload.top_p !== undefined ? { top_p: payload.top_p } : {}),
      ...(payload.stop !== undefined ? { stop_sequences: Array.isArray(payload.stop) ? payload.stop : [payload.stop] } : {}),
    }),
    normalizeResponse: (body) => ({
      id: body.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: (body.content || []).filter((part) => part.type === 'text').map((part) => part.text || '').filter(Boolean).join('\n'),
        },
        finish_reason: mapAnthropicStopReason(body.stop_reason),
      }],
      usage: {
        prompt_tokens: Number(body?.usage?.input_tokens || 0),
        completion_tokens: Number(body?.usage?.output_tokens || 0),
        total_tokens: Number(body?.usage?.input_tokens || 0) + Number(body?.usage?.output_tokens || 0),
      },
      raw: body,
    }),
    normalizeTokenUsage: (body = {}) => ({
      input_tokens: Number(body?.usage?.input_tokens || 0),
      output_tokens: Number(body?.usage?.output_tokens || 0),
      total_tokens: Number(body?.usage?.input_tokens || 0) + Number(body?.usage?.output_tokens || 0),
    }),
    costEstimatorDefaults: { inputPerMillionUsd: 0.80, outputPerMillionUsd: 4.00, blendedPerMillionUsd: 3.00 },
  },
  deepseek: openAICompatibleProvider({
    id: 'deepseek',
    displayName: 'DeepSeek',
    defaultModel: 'deepseek-v4-flash',
    supportedModels: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    transformRequest: (payload) => {
      const body = { ...payload, model: payload.model || 'deepseek-v4-flash' };
      if (body.max_completion_tokens !== undefined && body.max_tokens === undefined) body.max_tokens = body.max_completion_tokens;
      delete body.max_completion_tokens;
      return body;
    },
    upstreamUrl: 'https://api.deepseek.com/chat/completions',
    costEstimatorDefaults: { inputPerMillionUsd: 0.27, outputPerMillionUsd: 1.10, blendedPerMillionUsd: 1.00 },
  }),
  xai: openAICompatibleProvider({
    id: 'xai',
    displayName: 'xAI',
    defaultModel: 'grok-4.3',
    supportedModels: ['grok-4.3', 'grok-4.3-latest', 'grok-4.20', 'grok-4.20-reasoning', 'grok-4.20-non-reasoning', 'grok-4', 'grok-4-latest', 'grok-build-0.1', 'grok-code-fast-1'],
    upstreamUrl: 'https://api.x.ai/v1/chat/completions',
    costEstimatorDefaults: { inputPerMillionUsd: 1.25, outputPerMillionUsd: 2.50, blendedPerMillionUsd: 2.00 },
  }),
  groq: openAICompatibleProvider({
    id: 'groq',
    displayName: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    supportedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    upstreamUrl: 'https://api.groq.com/openai/v1/chat/completions',
    costEstimatorDefaults: { inputPerMillionUsd: 0.59, outputPerMillionUsd: 0.79, blendedPerMillionUsd: 0.70 },
  }),
};

function getProvider(providerId) {
  return providers[providerId] || null;
}

function getModels() {
  return Object.values(providers).flatMap((provider) => provider.supportedModels.map((model) => ({
    id: model,
    provider: provider.id,
    provider_name: provider.displayName,
  })));
}

function getProviderForModel(modelId) {
  return Object.values(providers).find((provider) => provider.supportedModels.includes(modelId)) || null;
}

function estimateCostUsd(modelId, totalTokens) {
  const provider = getProviderForModel(modelId);
  const blendedPerMillionUsd = provider?.costEstimatorDefaults?.blendedPerMillionUsd || 0;
  return (Number(totalTokens || 0) / 1_000_000) * blendedPerMillionUsd;
}

module.exports = {
  providers,
  getProvider,
  getModels,
  getProviderForModel,
  estimateCostUsd,
};
