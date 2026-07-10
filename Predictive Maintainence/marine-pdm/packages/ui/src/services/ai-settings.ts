/// <reference types="vite/client" />
// Runtime AI configuration — single source of truth for the assistant.
// Persisted in localStorage so the key/model survive reloads and can be injected from the UI
// (the AI page) rather than only from a build-time env var. The env var remains a dev fallback.
//
// Scoped to the GPT-5.4 small models (mini / nano). These are reasoning models, so the API:
//   • does NOT accept `temperature` (or top_p / penalties) — we never send it;
//   • uses `max_completion_tokens`, NOT `max_tokens`;
//   • spends hidden reasoning tokens from that budget, so we keep reasoning_effort low and the
//     token cap generous to guarantee visible output.

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface AiSettings {
  apiKey: string;               // OpenAI key entered from the UI (overrides the env fallback)
  model: string;                // one of AI_MODEL_PRESETS
  reasoningEffort: ReasoningEffort; // GPT-5 reasoning depth (low = fastest, least hidden-token use)
  maxTokens: number;            // sent as max_completion_tokens (must cover reasoning + answer)
  narrationEnabled: boolean;    // proactive event narration on/off
}

const STORAGE_KEY = 'pdm_ai_settings';

// The only two models this build targets, per requirement. Both are GPT-5.4 reasoning models.
export const AI_MODEL_PRESETS = ['gpt-5.4-mini', 'gpt-5.4-nano'] as const;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiKey: '',
  model: 'gpt-5.4-mini',
  reasoningEffort: 'low',
  maxTokens: 2000,   // generous so hidden reasoning tokens don't starve the visible answer
  narrationEnabled: true,
};

let cache: AiSettings | null = null;
const listeners = new Set<() => void>();

export function getAiSettings(): AiSettings {
  if (cache) return cache;
  let next: AiSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    next = raw
      ? { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) }
      : { ...DEFAULT_AI_SETTINGS };
  } catch {
    next = { ...DEFAULT_AI_SETTINGS };
  }
  // Migrate any stale/legacy model id (e.g. an older gpt-4o/gpt-5 default) to a supported one.
  if (!(AI_MODEL_PRESETS as readonly string[]).includes(next.model)) {
    next.model = DEFAULT_AI_SETTINGS.model;
  }
  cache = next;
  return next;
}

export function setAiSettings(patch: Partial<AiSettings>): AiSettings {
  const next = { ...getAiSettings(), ...patch };
  cache = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  listeners.forEach(l => l());
  return next;
}

/** Subscribe to settings changes (e.g. so the widget reacts to a key added on the AI page). */
export function subscribeAiSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Effective key: UI setting first, then the VITE_OPENAI_API_KEY env fallback. */
export function resolveApiKey(): string {
  const s = getAiSettings();
  if (s.apiKey && s.apiKey.trim()) return s.apiKey.trim();
  const env = import.meta.env?.VITE_OPENAI_API_KEY;
  return env ? String(env) : '';
}

export function isAiConfigured(): boolean {
  return !!resolveApiKey();
}
