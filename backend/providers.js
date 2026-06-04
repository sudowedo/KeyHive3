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

function openAICompatibleProvider({ id, displayName, defaultModel, supportedModels, upstreamUrl, costEstimatorDefaults }) {
  return {
    id,
    displayName,
    defaultModel,
    supportedModels,
    openAICompatible: true,
    upstreamUrl: () => upstreamUrl,
    buildAuthHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    transformRequest: (payload) => ({ ...payload, model: payload.model || defaultModel }),
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
    defaultModel: 'claude-3-5-haiku-latest',
    supportedModels: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'],
    openAICompatible: false,
    upstreamUrl: () => 'https://api.anthropic.com/v1/messages',
    buildAuthHeaders: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    transformRequest: (payload) => ({
      model: payload.model || 'claude-3-5-haiku-latest',
      max_tokens: payload.max_tokens || payload.max_completion_tokens || 1024,
      messages: (payload.messages || [])
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content || '' })),
      ...(payload.messages?.some((message) => message.role === 'system')
        ? { system: extractMessageText(payload.messages.filter((message) => message.role === 'system')) }
        : {}),
      ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
    }),
    normalizeResponse: (body) => ({
      id: body.id,
      model: body.model,
      choices: [{
        message: {
          role: 'assistant',
          content: (body.content || []).map((part) => part.text || '').filter(Boolean).join('\n'),
        },
        finish_reason: body.stop_reason || null,
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
    defaultModel: 'deepseek-chat',
    supportedModels: ['deepseek-chat', 'deepseek-reasoner'],
    upstreamUrl: 'https://api.deepseek.com/v1/chat/completions',
    costEstimatorDefaults: { inputPerMillionUsd: 0.27, outputPerMillionUsd: 1.10, blendedPerMillionUsd: 1.00 },
  }),
  xai: openAICompatibleProvider({
    id: 'xai',
    displayName: 'xAI',
    defaultModel: 'grok-2-latest',
    supportedModels: ['grok-2-latest', 'grok-2-vision-latest'],
    upstreamUrl: 'https://api.x.ai/v1/chat/completions',
    costEstimatorDefaults: { inputPerMillionUsd: 2.00, outputPerMillionUsd: 10.00, blendedPerMillionUsd: 5.00 },
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
