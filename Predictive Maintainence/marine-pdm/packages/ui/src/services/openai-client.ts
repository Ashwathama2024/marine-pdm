/// <reference types="vite/client" />
import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const key = import.meta.env.VITE_OPENAI_API_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
  }
  return _client;
}

export function isOpenAIConfigured(): boolean {
  return !!import.meta.env.VITE_OPENAI_API_KEY;
}
