import React, { useState } from 'react';
import {
  getAiSettings, setAiSettings, isAiConfigured, resolveApiKey,
  AI_MODEL_PRESETS, DEFAULT_AI_SETTINGS,
} from '../services/ai-settings';
import type { ReasoningEffort } from '../services/ai-settings';
import { testConnection } from '../services/openai-client';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div className="label-xs" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 };
const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-muted)', width: 160, flexShrink: 0 };

export function AIAssistant() {
  const [settings, setLocal] = useState(getAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const update = (patch: Partial<typeof settings>) => { setLocal(setAiSettings(patch)); setResult(null); };

  const usingEnvKey = !settings.apiKey.trim() && !!resolveApiKey();
  const configured = isAiConfigured();

  const runTest = async () => {
    setTesting(true); setResult(null);
    setResult(await testConnection());
    setTesting(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header" style={{ padding: 0, marginBottom: 14 }}>
        <div>
          <div className="page-title">JARVIS</div>
          <div className="page-subtitle">MTU 8000 ENGINE INTELLIGENCE · OPENAI KEY · MODEL · MEMORY</div>
        </div>
      </div>

      {/* Status */}
      <Card title="STATUS">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: configured ? 'var(--risk-normal)' : 'var(--risk-critical)', boxShadow: configured ? '0 0 8px var(--risk-normal)' : undefined }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: configured ? 'var(--risk-normal)' : 'var(--risk-critical)' }}>
            {configured ? 'Configured' : 'Not configured'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {configured ? `· model "${settings.model}"${usingEnvKey ? ' · using env key (VITE_OPENAI_API_KEY)' : ''}` : '· add an API key below to enable chat'}
          </span>
        </div>
      </Card>

      {/* API key */}
      <Card title="OPENAI API KEY">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={settings.apiKey}
            onChange={e => update({ apiKey: e.target.value })}
            placeholder={usingEnvKey ? 'Using VITE_OPENAI_API_KEY (env) — enter a key here to override' : 'sk-…'}
            style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font)' }}
            autoComplete="off" spellCheck={false}
          />
          <button onClick={() => setShowKey(s => !s)} className="mag-btn mag-btn-ghost" style={{ fontSize: 10 }}>
            {showKey ? 'Hide' : 'Show'}
          </button>
          <button onClick={() => update({ apiKey: '' })} className="mag-btn mag-btn-danger" style={{ fontSize: 10 }}>
            Clear
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          ⚠ The key is stored in this browser (localStorage) and sent directly to OpenAI from the client.
          Fine for a local demo / simulator; not for a shared or production deployment.
        </div>
      </Card>

      {/* Model + params */}
      <Card title="MODEL & PARAMETERS">
        <div style={row}>
          <span style={lbl}>MODEL</span>
          <select value={settings.model} onChange={e => update({ model: e.target.value })} style={{ fontSize: 12, width: 200 }}>
            {AI_MODEL_PRESETS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1 }}>
            {settings.model === 'gpt-5.4-nano' ? 'smallest · fastest · cheapest' : 'more capable · still fast'}
          </span>
        </div>

        <div style={row}>
          <span style={lbl}>REASONING</span>
          <select value={settings.reasoningEffort} onChange={e => update({ reasoningEffort: e.target.value as ReasoningEffort })} style={{ fontSize: 12, width: 200 }}>
            <option value="low">low — fastest (demo explainer)</option>
            <option value="medium">medium — deeper analysis</option>
            <option value="high">high — hardest questions</option>
          </select>
        </div>

        <div style={row}>
          <span style={lbl}>MAX COMPLETION TOKENS</span>
          <input type="range" min={512} max={8000} step={256} value={settings.maxTokens}
            onChange={e => update({ maxTokens: +e.target.value })} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 42, textAlign: 'right', color: 'var(--accent-blue)' }}>{settings.maxTokens}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', margin: '-4px 0 0 170px', lineHeight: 1.5 }}>
          GPT-5.4 are reasoning models — they spend hidden tokens before the visible answer, so keep
          this generous. Temperature isn't supported by these models and is never sent.
        </div>
      </Card>

      {/* Behaviour */}
      <Card title="BEHAVIOUR">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.narrationEnabled}
            onChange={e => update({ narrationEnabled: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: 'var(--risk-normal)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Proactive event narration — auto-explain when a fault is injected, an alert fires, or a
            degradation event triggers (bounded to key events, badge on the floating icon).
          </span>
        </label>
      </Card>

      {/* Test connection */}
      <Card title="TEST CONNECTION">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={runTest} disabled={testing || !configured} className="mag-btn mag-btn-solid" style={{ fontSize: 11, opacity: (testing || !configured) ? 0.6 : 1 }}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {result && (
            <span style={{ fontSize: 11.5, color: result.ok ? 'var(--risk-normal)' : 'var(--risk-critical)' }}>
              {result.ok ? '✓ ' : '✕ '}{result.message}
            </span>
          )}
          {!configured && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Add a key first.</span>}
        </div>
      </Card>

      {/* How it works */}
      <Card title="HOW IT WORKS">
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
          JARVIS is the floating assistant (bottom-right, every page), grounded in this app's own engine
          reference — physics equations, the fault catalogue (F01–F09), and the sensor↔root-factor
          matrix — assembled from the running constants so it can't drift. Each question carries a fresh
          live snapshot of every sensor, and JARVIS can <b>call read-only tools</b> to pull historical
          trends, per-cylinder history, and fault/alert detail on demand. It <b>remembers the
          conversation</b> across reloads (stored in this browser). It is <b>read-only</b> — it monitors
          and explains but never changes the simulator. Reset defaults:{' '}
          <button onClick={() => update({ ...DEFAULT_AI_SETTINGS, apiKey: settings.apiKey })} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 11.5, padding: 0 }}>
            restore model &amp; params
          </button>.
        </div>
      </Card>
    </div>
  );
}
