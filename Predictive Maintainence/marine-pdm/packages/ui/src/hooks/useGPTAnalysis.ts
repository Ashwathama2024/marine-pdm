import { useState, useCallback, useRef } from 'react';
import { getOpenAIClient } from '../services/openai-client';

export interface GPTState {
  result: string;
  analyzing: boolean;
  error: string | null;
}

export function useGPTAnalysis() {
  const [state, setState] = useState<GPTState>({ result: '', analyzing: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (prompt: string) => {
    const client = getOpenAIClient();
    if (!client) {
      setState({ result: '', analyzing: false, error: 'API key not configured. Set VITE_OPENAI_API_KEY in packages/ui/.env.local' });
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState({ result: '', analyzing: true, error: null });

    try {
      const stream = await client.chat.completions.create(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
          temperature: 0.3,
          stream: true,
        },
        { signal: abortRef.current.signal },
      );

      let accumulated = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        accumulated += delta;
        setState({ result: accumulated, analyzing: true, error: null });
      }
      setState({ result: accumulated, analyzing: false, error: null });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setState({ result: '', analyzing: false, error: (err as Error).message });
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ result: '', analyzing: false, error: null });
  }, []);

  return { ...state, analyze, reset };
}
