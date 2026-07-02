import React from 'react';
import { useEngine } from '../context/EngineContext';
import { useSimulatorControl } from '../context/SimulatorControlContext';

// RPM-only telegraph presets — load is the propeller cube-law consequence of RPM (shown for reference).
const PRESETS: { label: string; rpm: number; desc: string }[] = [
  { label: 'IDLE', rpm: 400,  desc: '400 RPM · ~4% load'  },
  { label: 'SLOW', rpm: 700,  desc: '700 RPM · ~19% load' },
  { label: 'HALF', rpm: 900,  desc: '900 RPM · ~41% load' },
  { label: 'FULL', rpm: 1150, desc: '1150 RPM · 85% load' },
];

export function EngineControlPanel() {
  // Lifecycle (START/STOP/CLUTCH/DECLUTCH) lives on the LOP console + sidebar — not duplicated here.
  // This panel is the speed lever + telegraph presets + mode only.
  const { snapshot, engineState } = useEngine();
  const { rpm, mode, setRpm, setMode, applyPreset } = useSimulatorControl();

  const liveRpm  = snapshot?.rpm  ?? rpm;
  const liveLoad = snapshot?.load ?? 0;
  const loadColor = liveLoad >= 85 ? '#ef4444' : liveLoad >= 60 ? '#f97316' : liveLoad >= 30 ? '#f59e0b' : 'var(--risk-normal)';
  // Speed lever is live whenever the engine is running — declutched rev raises RPM, not load.
  const rpmActive = ['IDLE', 'WARMING', 'DECLUTCHED_RUN', 'CLUTCHED', 'LOADED'].includes(engineState);
  const declutched = ['IDLE', 'WARMING', 'DECLUTCHED_RUN'].includes(engineState);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-dim)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label-sm">Engine Control</span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            color: mode === 'STRESS' ? 'var(--risk-critical)' : 'var(--risk-normal)',
            background: mode === 'STRESS' ? 'rgba(239,68,68,0.12)' : 'rgba(0,212,170,0.08)',
            border: `1px solid ${mode === 'STRESS' ? 'rgba(239,68,68,0.4)' : 'rgba(0,212,170,0.25)'}`,
            borderRadius: 3, padding: '1px 7px',
          }}>
            {mode} MODE
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          <span><span style={{ color: 'var(--text-dim)' }}>LIVE RPM </span>
            <span style={{ color: '#38BDF8', fontWeight: 700 }}>{liveRpm.toFixed(0)}</span>
          </span>
          <span><span style={{ color: 'var(--text-dim)' }}>LOAD </span>
            <span style={{ color: loadColor, fontWeight: 700 }}>{liveLoad.toFixed(0)}%</span>
          </span>
        </div>
      </div>

      <div style={{
        padding: '12px 16px',
        opacity: rpmActive ? 1 : 0.45,
        pointerEvents: rpmActive ? 'auto' : 'none',
      }}>
        {/* Speed lever (RPM) + propeller-derived load readout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 10 }}>

          {/* RPM speed lever — the only operator control */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label-xs">SPEED LEVER · RPM</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#38BDF8', fontVariantNumeric: 'tabular-nums' }}>{rpm}</span>
            </div>
            <input type="range" min={400} max={1150} step={5} value={rpm}
              onChange={e => setRpm(+e.target.value)}
              style={{ width: '100%', accentColor: '#38BDF8' } as React.CSSProperties} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
              <span>400 IDLE</span><span>1150 RATED</span>
            </div>
          </div>

          {/* Load — propeller cube-law of RPM (read-only; 0 when declutched) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label-xs">LOAD · PROPELLER</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: loadColor, fontVariantNumeric: 'tabular-nums' }}>{liveLoad.toFixed(0)}%</span>
            </div>
            <div style={{ height: 14, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${liveLoad}%`, background: loadColor, transition: 'width 0.5s, background 0.3s', borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
              <span style={{ color: declutched ? 'var(--accent-blue)' : undefined }}>{declutched ? 'DECLUTCHED · 0%' : 'CLUTCHED'}</span><span>85% NOR</span>
            </div>
          </div>
        </div>

        {/* Presets + Stress — single compact row */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', minWidth: 44, flexShrink: 0 }}>PRESETS</span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.rpm)}
              title={p.desc}
              style={{
                flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font)',
                background: rpm === p.rpm ? 'rgba(56,189,248,0.14)' : 'var(--bg-elevated)',
                border: `1px solid ${rpm === p.rpm ? 'rgba(56,189,248,0.5)' : 'var(--border-dim)'}`,
                color: rpm === p.rpm ? '#38BDF8' : 'var(--text-muted)',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setMode(mode === 'NORMAL' ? 'STRESS' : 'NORMAL')}
            style={{
              padding: '4px 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              fontFamily: 'var(--font)', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
              background: mode === 'STRESS' ? 'rgba(239,68,68,0.12)' : 'rgba(0,212,170,0.08)',
              border: `1px solid ${mode === 'STRESS' ? 'rgba(239,68,68,0.5)' : 'rgba(0,212,170,0.3)'}`,
              color: mode === 'STRESS' ? 'var(--risk-critical)' : 'var(--risk-normal)',
              transition: 'all 0.2s',
            }}
          >
            {mode === 'STRESS' ? '⚡ EXIT STRESS' : '⚡ STRESS'}
          </button>
        </div>
      </div>
    </div>
  );
}
