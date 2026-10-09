/**
 * OpenRouter free-model catalog for Health OS.
 * Ranked for coaching quality: instruction-following chat (not music/vision/safety-only).
 * Verified against OpenRouter /api/v1/models (free tier, 2026).
 */

export type AiProviderId = 'openrouter' | 'nvidia' | 'local' | 'ollama';

export interface FreeModelInfo {
  id: string;
  label: string;
  provider: AiProviderId;
  contextLength: number;
  /** Higher = preferred for coaching */
  rank: number;
  notes: string;
  chatCapable: boolean;
  /** Supported efforts for models that reject other reasoning settings. */
  reasoningEfforts?: Array<'low' | 'medium' | 'high'>;
}

/** Small, stable suggestions. Providers change their catalogues often; users may type any current model ID. */
export const OPENROUTER_FREE_CHAT_MODELS: FreeModelInfo[] = [
  {
    id: 'openrouter/free',
    label: 'OpenRouter Free Router',
    provider: 'openrouter',
    contextLength: 200000,
    rank: 90,
    notes: 'Auto-routes to available free models when one is rate-limited.',
    chatCapable: true,
  },
];

/** Curated paid option. The user may still enter any current OpenRouter model ID. */
export const OPENROUTER_FEATURED_CHAT_MODELS: FreeModelInfo[] = [
  {
    id: 'deepseek/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash (OpenRouter)',
    provider: 'openrouter',
    contextLength: 1_048_576,
    rank: 94,
    notes: 'DeepSeek V4 Flash. Uses the saved OpenRouter key and available account credit.',
    chatCapable: true,
    reasoningEfforts: ['high'],
  },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash (OpenRouter)',
    provider: 'openrouter',
    contextLength: 1_050_000,
    rank: 95,
    notes: 'Fast paid OpenRouter model. Uses the saved OpenRouter key and available account credit.',
    chatCapable: true,
  },
];

export const OPENROUTER_CHAT_MODELS: FreeModelInfo[] = [
  ...OPENROUTER_FEATURED_CHAT_MODELS,
  ...OPENROUTER_FREE_CHAT_MODELS,
];

export const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';

/** Verified free, instruction-following alternatives (catalogue checked 2026-10-03).
 * Keep the router first; these recover bad routes without switching to paid models. */
export const OPENROUTER_FREE_CHAT_FALLBACKS = [
  'apodex/apodex-1.1-mini:free',
  'google/gemma-4-26b-a4b-it:free',
];

export const NVIDIA_MODELS: FreeModelInfo[] = [
  {
    id: 'meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct (Nvidia)',
    provider: 'nvidia',
    contextLength: 128000,
    rank: 90,
    notes: 'Standard fast Llama model on Nvidia.',
    chatCapable: true,
  },
];

export const NVIDIA_DEFAULT_MODEL = NVIDIA_MODELS[0].id;

/** Ordered fallback chain when a free model is rate-limited or down. */
export function openRouterFallbackChain(preferred?: string): string[] {
  const ordered = [...OPENROUTER_FREE_CHAT_MODELS.map((m) => m.id), ...OPENROUTER_FREE_CHAT_FALLBACKS];
  if (preferred && !ordered.includes(preferred)) {
    return [preferred, ...ordered];
  }
  if (preferred) {
    return [preferred, ...ordered.filter((id) => id !== preferred)];
  }
  return ordered;
}

export function modelLabel(id: string): string {
  const all = [...OPENROUTER_CHAT_MODELS, ...NVIDIA_MODELS];
  return all.find((m) => m.id === id)?.label || id;
}
