// Persistent memory for JARVIS — one continuous conversation thread in this browser (localStorage).
// Survives reloads and navigation. Only visible messages are stored; transient flags are stripped on
// load so a reload never shows a stuck "streaming" cursor.

import type { ChatMessage } from '../hooks/useAssistantChat';

const KEY = 'pdm_jarvis_history';
const CAP = 200;   // keep the most recent N messages to bound storage size

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(arr)) return [];
    return arr.map(m => ({ ...m, streaming: false, activity: undefined }));
  } catch {
    return [];
  }
}

export function saveHistory(msgs: ChatMessage[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(msgs.slice(-CAP)));
  } catch { /* storage may be unavailable / full */ }
}

export function clearHistory(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
