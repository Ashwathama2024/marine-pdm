import React, { useState, useCallback } from 'react';
import { useEngine } from '../context/EngineContext';

export function InterlockPanel() {
  const { interlocks, engineControls } = useEngine();
  const [, rerender] = useState(0);
  const refresh = useCallback(() => rerender(n => n + 1), []);

  const status = interlocks.getStatus();
  const allOk  = interlocks.allSatisfied();

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>
            PRE-START INTERLOCKS
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
            8 CONDITIONS REQUIRED
          </div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 5, fontSize: 9, fontWeight: 700,
          background: allOk ? 'rgba(0,200,120,0.12)' : 'rgba(239,68,68,0.10)',
          border:     `1px solid ${allOk ? 'rgba(0,200,120,0.4)' : 'rgba(239,68,68,0.3)'}`,
          color:      allOk ? '#00C878' : '#ef4444',
        }}>
          {allOk ? 'ALL SATISFIED' : `${status.filter(s => !s.ok).length} PENDING`}
        </div>
      </div>

      {/* Interlock rows */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {status.map((il, idx) => (
          <div key={il.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 6,
            background: il.ok ? 'rgba(0,200,120,0.05)' : 'rgba(239,68,68,0.04)',
            border: `1px solid ${il.ok ? 'rgba(0,200,120,0.25)' : 'rgba(239,68,68,0.20)'}`,
          }}>
            {/* Status dot */}
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: il.ok ? '#00C878' : '#ef4444',
              boxShadow: il.ok ? '0 0 4px #00C878' : 'none',
            }} />

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: il.ok ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {il.id}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 6 }}>
                {il.label}
              </span>
            </div>

            {/* Detail value */}
            <span style={{
              fontSize: 9, fontWeight: 700, color: il.ok ? '#00C878' : '#ef4444',
              letterSpacing: '0.04em',
            }}>
              {il.detail}
            </span>

            {/* Per-interlock controls */}
            <InterlockControl idx={idx} il={il} interlocks={interlocks} onChange={refresh} />
          </div>
        ))}
      </div>

      {/* Priming pump + preheater actuators */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8,
      }}>
        <ActuatorButton
          label={interlocks.primingActive ? 'PRIMING PUMP ON' : 'PRIMING PUMP OFF'}
          active={interlocks.primingActive}
          onClick={() => { interlocks.setPrimingActive(!interlocks.primingActive); refresh(); }}
          color="#4F8EF7"
        />
        <ActuatorButton
          label={interlocks.preheaterOn ? 'PREHEATER ON' : 'PREHEATER OFF'}
          active={interlocks.preheaterOn}
          onClick={() => { interlocks.setPreheaterOn(!interlocks.preheaterOn); refresh(); }}
          color="#F7934F"
        />
      </div>
    </div>
  );
}

function ActuatorButton({ label, active, onClick, color }: {
  label: string; active: boolean; onClick: () => void; color: string;
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '7px 0',
      background: active ? `${color}18` : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? color + '60' : 'var(--border)'}`,
      color: active ? color : 'var(--text-dim)',
      borderRadius: 6, fontFamily: 'var(--font)',
      fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
      cursor: 'pointer',
    }}>
      {label}
    </button>
  );
}

function InterlockControl({ idx, il, interlocks, onChange }: {
  idx: number;
  il: { id: string; ok: boolean };
  interlocks: ReturnType<typeof useEngine>['interlocks'];
  onChange: () => void;
}) {
  // IL-1 (idx 0), IL-2 (1), IL-4 (3), IL-8 (7): boolean toggles
  if (idx === 0) {
    return <Toggle value={interlocks.values.il1_externalClear} onChange={v => { interlocks.setToggle('il1_externalClear', v); onChange(); }} />;
  }
  if (idx === 1) {
    return <Toggle value={interlocks.values.il2_airFlapsOpen} onChange={v => { interlocks.setToggle('il2_airFlapsOpen', v); onChange(); }} />;
  }
  // IL-3 (idx 2): slider 0–100%
  if (idx === 2) {
    return (
      <input type="range" min={0} max={100} value={interlocks.values.il3_lubeLevel}
        onChange={e => { interlocks.setLubeLevel(+e.target.value); onChange(); }}
        style={{ width: 64, accentColor: '#00C878' }}
      />
    );
  }
  if (idx === 3) {
    return <Toggle value={interlocks.values.il4_coolantLevel} onChange={v => { interlocks.setToggle('il4_coolantLevel', v); onChange(); }} />;
  }
  // IL-5 (idx 4): slider 0–30 bar
  if (idx === 4) {
    return (
      <input type="range" min={0} max={30} step={0.5} value={interlocks.values.il5_startAirBar}
        onChange={e => { interlocks.setStartAir(+e.target.value); onChange(); }}
        style={{ width: 64, accentColor: '#00C878' }}
      />
    );
  }
  // IL-6 (idx 5): handled by preheater button — read-only display
  if (idx === 5) return null;
  // IL-7 (idx 6): auto-increments with priming pump — read-only
  if (idx === 6) return null;
  if (idx === 7) {
    return <Toggle value={interlocks.values.il8_fuelReady} onChange={v => { interlocks.setToggle('il8_fuelReady', v); onChange(); }} />;
  }
  return null;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      padding: '3px 10px', borderRadius: 4,
      background: value ? 'rgba(0,200,120,0.12)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${value ? 'rgba(0,200,120,0.4)' : 'rgba(239,68,68,0.3)'}`,
      color: value ? '#00C878' : '#ef4444',
      fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700, cursor: 'pointer',
    }}>
      {value ? 'ON' : 'OFF'}
    </button>
  );
}
