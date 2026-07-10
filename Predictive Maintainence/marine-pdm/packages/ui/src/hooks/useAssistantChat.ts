import { useState, useCallback, useRef, useEffect } from 'react';
import { createChatCompletion } from '../services/openai-client';
import type { ChatMessage as ApiMsg } from '../services/openai-client';
import { isAiConfigured } from '../services/ai-settings';
import { ENGINE_KNOWLEDGE } from '../services/engine-knowledge';
import { buildAssistantSystemPrompt, buildAssistantContextMessage } from '../services/prompts';
import { JARVIS_TOOLS, runTool } from '../services/jarvis-tools';
import type { ToolContext } from '../services/jarvis-tools';
import { getJarvisSelfKnowledge } from '../services/jarvis-self-knowledge';
import { loadHistory, saveHistory, clearHistory } from '../services/chat-history';

// The system prompt is fully static (engine reference + self-knowledge, both derived once from source
// constants). Assemble it lazily and cache it so it isn't rebuilt on every turn.
let _systemPrompt: string | null = null;
const systemPrompt = () => (_systemPrompt ??= buildAssistantSystemPrompt(ENGINE_KNOWLEDGE, getJarvisSelfKnowledge()));

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;      // turn in progress (non-streamed — shown as a working state)
  error?: boolean;
  narration?: boolean;      // proactively-generated event note (styled differently)
  activity?: string[];      // tool names JARVIS is currently accessing (shown as chips)
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const MAX_TOOL_ROUNDS = 6;
const HISTORY_TURNS = 24;   // visible messages sent back to the model (bounds tokens)

const safeParse = (s: string): Record<string, unknown> => {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
};

export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist the thread whenever it changes.
  useEffect(() => { saveHistory(messages); }, [messages]);

  const stop = useCallback(() => { abortRef.current?.abort(); setBusy(false); }, []);
  const clear = useCallback(() => { abortRef.current?.abort(); clearHistory(); setMessages([]); setBusy(false); }, []);

  // One turn. `visibleUserText` shows in the thread (empty for narration). When `toolCtx` is provided,
  // JARVIS runs an agentic loop with read-only tools; narration passes no tools (single call).
  const run = useCallback(async (
    visibleUserText: string,
    promptText: string,
    liveContext: string,
    toolCtx: ToolContext | null,
    opts?: { narration?: boolean },
  ) => {
    if (!isAiConfigured()) {
      setMessages(prev => [
        ...prev,
        ...(visibleUserText ? [{ id: uid(), role: 'user' as const, content: visibleUserText }] : []),
        { id: uid(), role: 'assistant', content: 'No OpenAI API key is configured. Open the **JARVIS** page (sidebar → Reference) to add your key. The live state summary is still available below.', error: true },
      ]);
      return;
    }

    // System prompt + trimmed prior conversation + fresh live-state + the new user turn.
    const prior = messages
      .filter(m => !m.error && !m.narration)
      .slice(-HISTORY_TURNS)
      .map(m => ({ role: m.role, content: m.content }) as ApiMsg);
    let convo: ApiMsg[] = [
      { role: 'system', content: systemPrompt() },
      ...prior,
      { role: 'system', content: buildAssistantContextMessage(liveContext) },
      { role: 'user', content: promptText },
    ];

    const assistantId = uid();
    setMessages(prev => [
      ...prev,
      ...(visibleUserText ? [{ id: uid(), role: 'user' as const, content: visibleUserText }] : []),
      { id: assistantId, role: 'assistant', content: '', streaming: true, narration: opts?.narration },
    ]);
    setBusy(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      let finalText = '';
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // Offer tools only when we have a tool context; force a final answer on the last round.
        const useTools = !!toolCtx && round < MAX_TOOL_ROUNDS - 1;
        const res = await createChatCompletion(convo, useTools ? JARVIS_TOOLS : undefined, signal);
        const msg = res.choices?.[0]?.message;
        const toolCalls = msg?.tool_calls ?? [];

        if (toolCtx && toolCalls.length > 0) {
          const names = toolCalls.map(t => t.function.name);
          setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, activity: names } : m)));
          convo = [...convo, { role: 'assistant', content: msg?.content ?? null, tool_calls: toolCalls }];
          for (const tc of toolCalls) {
            let out: string;
            try { out = runTool(tc.function.name, safeParse(tc.function.arguments), toolCtx); }
            catch (e) { out = JSON.stringify({ error: String(e) }); }
            convo = [...convo, { role: 'tool', content: out, tool_call_id: tc.id }];
          }
          continue; // loop again with tool results
        }

        finalText = (msg?.content ?? '').trim();
        break;
      }
      const shown = finalText || '_(No visible answer — a reasoning model may have spent its whole budget thinking. Raise **Max completion tokens** or lower **Reasoning** on the JARVIS page.)_';
      setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, streaming: false, activity: undefined, content: shown } : m)));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, streaming: false, activity: undefined, content: m.content || '(stopped)' } : m)));
      } else {
        const raw = (err as Error).message;
        const msg = raw === 'NO_KEY' ? 'No API key configured.' : raw;
        setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, streaming: false, activity: undefined, error: true, content: `Error: ${msg}` } : m)));
      }
    } finally {
      setBusy(false);
    }
  }, [messages]);

  /** User-initiated question — runs the agentic loop with read-only tools. */
  const send = useCallback((userText: string, liveContext: string, toolCtx: ToolContext) => {
    const text = userText.trim();
    if (!text || busy) return;
    void run(text, text, liveContext, toolCtx);
  }, [busy, run]);

  /** Proactive narration — no visible user turn, no tools (it already has full context). */
  const narrate = useCallback((promptText: string, liveContext: string) => {
    void run('', promptText, liveContext, null, { narration: true });
  }, [run]);

  return { messages, busy, send, narrate, stop, clear };
}
