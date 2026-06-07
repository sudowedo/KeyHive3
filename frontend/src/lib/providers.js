export const FALLBACK_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', default_model: 'gpt-4o-mini', key_placeholder: 'sk-...', models: [{ id: 'gpt-4o-mini', label: 'GPT-4o mini' }, { id: 'gpt-4o', label: 'GPT-4o' }, { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' }, { id: 'gpt-4.1', label: 'GPT-4.1' }] },
  { id: 'google', label: 'Google Gemini', default_model: 'gemini-2.5-flash', key_placeholder: 'AIza...', models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }, { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }] },
  { id: 'anthropic', label: 'Anthropic', default_model: 'claude-haiku-4-5-20251001', key_placeholder: 'sk-ant-...', models: [{ id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }, { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' }, { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' }] },
  { id: 'deepseek', label: 'DeepSeek', default_model: 'deepseek-v4-flash', key_placeholder: 'sk-...', models: [{ id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' }, { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }] },
  { id: 'xai', label: 'xAI / Grok', default_model: 'grok-4.3', key_placeholder: 'xai-...', models: [{ id: 'grok-4.3', label: 'Grok 4.3' }, { id: 'grok-4.3-fast', label: 'Grok 4.3 Fast' }, { id: 'grok-4', label: 'Grok 4 Vision' }] },
  { id: 'groq', label: 'Groq', default_model: 'llama-3.1-8b-instant', key_placeholder: 'gsk_...', models: [{ id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' }, { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' }, { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B 32K' }] },
];

export const providerLabel = (providers, id) => (providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.label || id || 'Unknown';
export const providerModels = (providers, id) => ((providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.models || []).map((m) => m.id);
export const providerPlaceholder = (providers, id) => (providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.key_placeholder || 'sk-...';
export const providerDefaultModel = (providers, id) => (providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.default_model || providerModels(providers, id)[0] || 'gpt-4o-mini';

export function parseAllowedModels(value) {
  if (!value || value === 'all') return ['all'];
  if (Array.isArray(value)) return value.length ? value : ['all'];
  if (typeof value === 'string') {
    try { return parseAllowedModels(JSON.parse(value)); } catch { return [value]; }
  }
  return ['all'];
}
