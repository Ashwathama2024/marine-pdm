// One-shot AI analysis for the diagnosis surfaces (sensor popup, deviation table, alert analytics).
//
// Replaces useGPTAnalysis, which hardcoded `model: 'gpt-4o'` with `temperature` + `max_tokens`. The
// GPT-5.4 reasoning models this build targets REJECT all three (400), so that hook could not succeed
// against a current key — every click failed. Going through services/openai-client.createChatCompletion
// means there is exactly one place in the app that knows how to shape a request, and the model, key,
// reasoning effort and token budget all come from the JARVIS page's settings.
//
// Differences from the old hook that callers rely on:
//   • analyze() RESOLVES WITH THE TEXT. The old one resolved void, so AlertAnalytics'
//     `.then(() => { if (result) … })` read a stale render closure and never persisted a narrative.
//   • It takes a system + user message pair rather than one blob, so the static contract can be
//     cached by the provider and the volatile DATA block stays in the user turn.
//   • Not streaming: the contract caps output at 70–110 words, so a spinner beats a second
//     request-shaping code path in openai-client.

import { useState, useCallback, useRef } from 'react';
import { createChatCompletion, type ChatMessage } from '../services/openai-client';
import { isAiConfigured } from '../services/ai-settings';

export interface SensorAnalysisState {
  result: string;
  analyzing: boolean;
  error: string | null;
}

const NO_KEY_MSG = 'No OpenAI API key configured. Add one on the JARVIS page (sidebar → Reference).';

export function useSensorAnalysis() {
  const [state, setState] = useState<SensorAnalysisState>({ result: '', analyzing: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (systemPrompt: string, userPrompt: string): Promise<string> => {
    if (!isAiConfigured()) {
      setState({ result: '', analyzing: false, error: NO_KEY_MSG });
      return '';
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ result: '', analyzing: true, error: null });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const res = await createChatCompletion(messages, undefined, ctrl.signal);
      const text = (res.choices?.[0]?.message?.content ?? '').trim();
      // A reasoning model can spend its whole budget on hidden tokens and return nothing visible.
      const shown = text || '(No visible answer — the model spent its budget reasoning. Raise Max completion tokens or lower Reasoning on the JARVIS page.)';
      setState({ result: shown, analyzing: false, error: null });
      return shown;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return '';
      const raw = (err as Error).message;
      setState({ result: '', analyzing: false, error: raw === 'NO_KEY' ? NO_KEY_MSG : raw });
      return '';
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ result: '', analyzing: false, error: null });
  }, []);

  return { ...state, analyze, reset };
}
