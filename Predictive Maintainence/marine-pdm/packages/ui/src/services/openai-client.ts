/// <reference types="vite/client" />
import OpenAI from 'openai';
import { resolveApiKey, getAiSettings } from './ai-settings';

let _client: OpenAI | null = null;
let _clientKey = '';

/** Returns a client bound to the current effective key, rebuilding it when the key changes. */
export function getOpenAIClient(): OpenAI | null {
  const key = resolveApiKey();
  if (!key) { _client = null; _clientKey = ''; return null; }
  if (!_client || _clientKey !== key) {
    _client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    _clientKey = key;
  }
  return _client;
}

export function isOpenAIConfigured(): boolean {
  return !!resolveApiKey();
}

// ── Message / tool types (structural — decoupled from SDK version typing) ─────────
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; }
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];   // on an assistant message that requested tools
  tool_call_id?: string;     // on a tool-result message
}
export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface CompletionResult {
  choices?: Array<{
    finish_reason?: string;
    message?: { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] };
  }>;
}

// GPT-5.4 mini/nano are reasoning models: `temperature` and `max_tokens` are rejected (400), so we
// send neither — only `max_completion_tokens` and `reasoning_effort`. If a model rejects
// `reasoning_effort`, the error text names it and we retry once without it.
function isReasoningEffortError(err: unknown): boolean {
  const m = (err as Error)?.message?.toLowerCase() ?? '';
  return m.includes('reasoning_effort') || m.includes('reasoning effort');
}

function buildParams(messages: ChatMessage[], dropReasoning: boolean, tools?: ToolDef[]) {
  const s = getAiSettings();
  const p: Record<string, unknown> = {
    model: s.model,
    messages,
    max_completion_tokens: s.maxTokens,
  };
  if (!dropReasoning) p.reasoning_effort = s.reasoningEffort;
  if (tools && tools.length) { p.tools = tools; p.tool_choice = 'auto'; }
  return p;
}

/**
 * Non-streaming chat completion (with optional function-calling tools), resilient to a model that
 * rejects reasoning_effort. Returns the full assistant message so callers can act on `tool_calls`.
 */
export async function createChatCompletion(
  messages: ChatMessage[], tools?: ToolDef[], signal?: AbortSignal,
): Promise<CompletionResult> {
  const client = getOpenAIClient();
  if (!client) throw new Error('NO_KEY');
  const make = (drop: boolean) =>
    client.chat.completions.create(buildParams(messages, drop, tools) as never, { signal }) as unknown as Promise<CompletionResult>;
  try {
    return await make(false);
  } catch (err) {
    if (isReasoningEffortError(err)) return await make(true);
    throw err;
  }
}

/** One-shot probe used by the AI page. Surfaces OpenAI's real error so a wrong model id self-corrects. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getOpenAIClient();
  if (!client) return { ok: false, message: 'No API key configured. Add one below.' };
  const model = getAiSettings().model;
  const probe: ChatMessage[] = [{ role: 'user', content: 'Reply with the single word: ready' }];
  const call = (drop: boolean) => client.chat.completions.create(buildParams(probe, drop) as never) as unknown as Promise<{ choices?: unknown[] }>;
  try {
    let res: { choices?: unknown[] };
    try { res = await call(false); }
    catch (err) { if (isReasoningEffortError(err)) res = await call(true); else throw err; }
    const ok = Array.isArray(res.choices) && res.choices.length > 0;
    return ok
      ? { ok: true, message: `Connected — model "${model}" responded.` }
      : { ok: false, message: 'Reached OpenAI but got no completion.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message || 'Connection failed.' };
  }
}
