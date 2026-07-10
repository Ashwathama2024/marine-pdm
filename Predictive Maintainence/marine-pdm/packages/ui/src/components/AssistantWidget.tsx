import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { engine, useEngine } from '../context/EngineContext';
import { useDegradation } from '../context/DegradationContext';
import { useAlerts } from '../context/AlertContext';
import { useAssistantChat } from '../hooks/useAssistantChat';
import type { ChatMessage } from '../hooks/useAssistantChat';
import { useAssistantNarration } from '../hooks/useAssistantNarration';
import { buildLiveContext } from '../services/live-context';
import type { ToolContext } from '../services/jarvis-tools';
import { buildNarrationPrompt } from '../services/prompts';
import { getAiSettings, setAiSettings, subscribeAiSettings, isAiConfigured } from '../services/ai-settings';
import { JarvisIcon } from './JarvisIcon';
import { MessageMarkdown } from './MessageMarkdown';

const SUGGESTIONS = [
  'What is happening right now?',
  'What is about to happen — anything trending toward an alarm?',
  'List A-bank cylinder temps and each bank median',
  'How do I test a bearing fault?',
];

// Human labels for the tool-activity chips.
const TOOL_LABEL: Record<string, string> = {
  get_live_state: 'reading full state',
  get_trend: 'pulling trend',
  get_cylinder_history: 'reading cylinder history',
  get_fault_detail: 'inspecting fault',
  get_degradation_events: 'reading degradation log',
  get_alerts: 'reading alerts',
  forecast_metric: 'forecasting',
  get_pattern_detail: 'inspecting pattern',
  get_self_info: 'checking capabilities',
  get_feature_guide: 'reading feature guide',
  how_to_test: 'building test steps',
};

function Working({ activity }: { activity?: string[] }) {
  const label = activity && activity.length
    ? activity.map(a => TOOL_LABEL[a] ?? a).join(' · ')
    : 'thinking';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 11.5 }}>
      <span className="live-dot" style={{ background: 'var(--accent-blue)' }} />
      JARVIS is {label}…
    </span>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--text-primary)', borderRadius: '10px 10px 2px 10px', padding: '7px 10px', fontSize: 12, lineHeight: 1.5 }}>
        <MessageMarkdown text={m.content} />
      </div>
    );
  }
  const isNote = m.narration;
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '92%', background: isNote ? 'rgba(245,158,11,0.08)' : 'var(--glass-bg-light)', border: `1px solid ${isNote ? 'rgba(245,158,11,0.35)' : 'var(--glass-border)'}`, color: m.error ? 'var(--risk-critical)' : 'var(--text-secondary)', borderRadius: '10px 10px 10px 2px', padding: '7px 10px', fontSize: 12, lineHeight: 1.55 }}>
      {isNote && <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--risk-warning)', marginBottom: 3 }}>◆ AUTO · EVENT</div>}
      {m.content ? <MessageMarkdown text={m.content} /> : (m.streaming ? <Working activity={m.activity} /> : null)}
    </div>
  );
}

export function AssistantWidget() {
  const { snapshot, decision, baseline, history, engineState, isOperational } = useEngine();
  const { events } = useDegradation();
  const { alerts } = useAlerts();
  const chat = useAssistantChat();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [badge, setBadge] = useState(0);
  const [, forceSettings] = useState(0);
  useEffect(() => subscribeAiSettings(() => forceSettings(x => x + 1)), []);

  const configured = isAiConfigured();
  const narrationOn = getAiSettings().narrationEnabled;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ref-stable builders so the narration effect / tool loop never capture stale values.
  const liveRef = useRef<() => string>(() => '');
  liveRef.current = () => buildLiveContext({
    engineState, isOperational, snapshot, decision, baseline,
    faults: engine.getMTUFaultList(),
    rootFactors: engine.getRootFactors(),
    degradationEvents: events,
    baselineAlerts: alerts,
  });

  const toolCtxRef = useRef<ToolContext>({} as ToolContext);
  toolCtxRef.current = {
    liveContext: () => liveRef.current(),
    history,                                   // stable object, mutated in place → always current
    decision,
    faults: engine.getMTUFaultList(),
    degradationEvents: events,
    baselineAlerts: alerts,
  };

  useAssistantNarration(
    {
      enabled: narrationOn && configured,
      isOperational,
      faults: engine.getMTUFaultList(),
      decision,
      degradationEvents: events,
      baselineAlerts: alerts,
    },
    (description: string) => {
      chat.narrate(buildNarrationPrompt(description), liveRef.current());
      setOpen(o => { if (!o) setBadge(b => b + 1); return o; });
    },
  );

  useEffect(() => { if (open) setBadge(0); }, [open, chat.messages.length]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [chat.messages]);

  const submit = (text: string) => {
    if (!text.trim() || chat.busy) return;
    chat.send(text, liveRef.current(), toolCtxRef.current);
    setInput('');
  };

  return (
    <>
      {/* Floating action button — sits above the 36px AlertTicker footer */}
      <button
        onClick={() => setOpen(o => !o)}
        title="JARVIS — engine intelligence"
        style={{
          position: 'fixed', right: 20, bottom: 48, zIndex: 150,
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #00D4AA, #38BDF8)',
          border: '1px solid rgba(56,189,248,0.5)', cursor: 'pointer',
          boxShadow: '0 6px 24px rgba(0,212,170,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
      >
        <span style={{ color: '#04121a', display: 'inline-flex' }}>
          <JarvisIcon size={26} mono spin={chat.busy} />
        </span>
        {badge > 0 && (
          <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--risk-critical)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }}>
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', right: 20, bottom: 108, zIndex: 150,
          width: 384, maxWidth: 'calc(100vw - 40px)', height: 520, maxHeight: 'calc(100vh - 140px)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border-hi)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--glass-shadow)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border-dim)', flexShrink: 0 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: !configured ? 'var(--text-dim)' : narrationOn ? 'var(--risk-normal)' : 'var(--risk-warning)',
              boxShadow: configured && narrationOn ? '0 0 6px var(--risk-normal)' : undefined,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-primary)' }}>JARVIS</div>
              <div style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>
                {!configured ? 'API KEY NOT SET' : narrationOn ? 'AUTO-MONITOR · LIVE' : 'STANDBY · MANUAL ONLY'}
              </div>
            </div>
            {/* Activate / Standby — controls whether JARVIS makes proactive (auto) API calls on events.
                Off = no unwarranted calls; you still get answers whenever you Send a message. */}
            {configured && (
              <button
                onClick={() => setAiSettings({ narrationEnabled: !narrationOn })}
                title={narrationOn
                  ? 'JARVIS is ACTIVE — auto-narrating engine events (uses API calls). Click for Standby.'
                  : 'JARVIS is on STANDBY — no automatic API calls. Click to Activate auto-monitoring.'}
                style={activateBtn(narrationOn)}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: narrationOn ? 'var(--risk-normal)' : 'var(--text-dim)', boxShadow: narrationOn ? '0 0 5px var(--risk-normal)' : undefined }} />
                {narrationOn ? 'ACTIVE' : 'STANDBY'}
              </button>
            )}
            {chat.messages.length > 0 && (
              <button onClick={chat.clear} title="New chat (clears memory)" style={newBtn}>＋ New</button>
            )}
            <Link to="/ai" title="JARVIS settings" style={{ color: 'var(--text-muted)', display: 'flex' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </Link>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chat.messages.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
                {configured
                  ? <>I'm <b style={{ color: 'var(--text-secondary)' }}>JARVIS</b> — I monitor every sensor, cylinder, bearing and fault live, and can pull historical trends and forecasts on demand. Ask me anything anytime. {narrationOn
                      ? <>I'm <b style={{ color: 'var(--risk-normal)' }}>ACTIVE</b>, so I'll also narrate events as they happen.</>
                      : <>Toggle <b style={{ color: 'var(--risk-warning)' }}>STANDBY → ACTIVE</b> in the header if you want me to narrate events automatically.</>}</>
                  : <>No API key yet. Add your OpenAI key on the <Link to="/ai" style={{ color: 'var(--accent-blue)' }}>JARVIS page</Link> to chat. Meanwhile, here's the current live state:</>}
                {!configured && (
                  <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 10.5, color: 'var(--text-secondary)', background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: 8, maxHeight: 260, overflowY: 'auto' }}>
                    {liveRef.current()}
                  </pre>
                )}
              </div>
            )}
            {chat.messages.map(m => <Bubble key={m.id} m={m} />)}
          </div>

          {/* Suggestion chips (only before a conversation starts, and only with a key) */}
          {configured && chat.messages.length === 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 8px', flexShrink: 0 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => submit(s)} style={chip}>{s}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--border-dim)', flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(input); }}
              placeholder={configured ? 'Ask JARVIS about the engine…' : 'Add an API key to chat'}
              disabled={!configured}
              style={{ flex: 1, fontSize: 12 }}
            />
            {chat.busy
              ? <button onClick={chat.stop} style={{ ...sendBtn, background: 'var(--risk-critical)', border: '1px solid var(--risk-critical)' }}>Stop</button>
              : <button onClick={() => submit(input)} disabled={!configured || !input.trim()} style={{ ...sendBtn, opacity: (!configured || !input.trim()) ? 0.5 : 1 }}>Send</button>}
          </div>
        </div>
      )}
    </>
  );
}

const newBtn: React.CSSProperties = { background: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font)', borderRadius: 5, padding: '3px 7px' };
const activateBtn = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'var(--font)',
  borderRadius: 5, padding: '3px 8px',
  background: on ? 'rgba(0,200,120,0.12)' : 'var(--bg-inset)',
  border: `1px solid ${on ? 'rgba(0,200,120,0.45)' : 'var(--border)'}`,
  color: on ? 'var(--risk-normal)' : 'var(--text-muted)',
  transition: 'all 0.2s',
});
const chip: React.CSSProperties = { background: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 12, padding: '4px 9px', fontSize: 10.5, fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left' };
const sendBtn: React.CSSProperties = { background: 'var(--risk-normal)', border: '1px solid var(--risk-normal)', color: '#04121a', borderRadius: 6, padding: '0 14px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer' };
