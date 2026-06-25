import React from 'react';
import { useEngine } from '../context/EngineContext';
import { useSimulatorControl } from '../context/SimulatorControlContext';

const PRESETS: { label: string; rpm: number; load: number; desc: string }[] = [
  { label: 'IDLE',  rpm: 400,  load: 4,   desc: '400 RPM · 4%'    },
  { label: 'HALF',  rpm: 900,  load: 35,  desc: '900 RPM · 35%'   },
  { label: 'RATED', rpm: 1150, load: 85,  desc: '1150 RPM · 85%'  },
  { label: 'MCR',   rpm: 1150, load: 100, desc: '1150 RPM · 100%' },
];

function simCtrlBtn(enabled: boolean, color: string): React.CSSProperties {
  return {
    flex: 1, padding: '6px 4px', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.09em', borderRadius: 5, fontFamily: 'var(--font)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    background: enabled ? `${color}18` : 'rgba(255,255,255,0.03)',
    border: `1px solid ${enabled ? `${color}55` : 'var(--border-dim)'}`,
    color: enabled ? color : 'var(--text-dim)',
    transition: 'all 0.2s',
  };
}

export function EngineControlPanel() {
  const { snapshot, engineState, engineControls, interlocks } = useEngine();
  const { rpm, load, coupled, mode, setRpm, setLoad, setCoupled, setMode, applyPreset } = useSimulatorControl();

  const ilStatus   = interlocks.getStatus();
  const allReady   = ilStatus.filter(s => s.ok).length === 8;
  const isPreOp    = ['ENGINE_OFF', 'STANDBY', 'SAFETY_TURNING', 'CRANKING'].includes(engineState);
  const isRunning  = !isPreOp && engineState !== 'STOPPING';
  const canStart   = engineState === 'ENGINE_OFF' || (engineState === 'STANDBY' && allReady);
  const canStop    = isRunning;
  const canClutch  = ['IDLE', 'WARMING', 'DECLUTCHED_RUN'].includes(engineState);
  const canDeclutch= ['CLUTCHED', 'LOADED'].includes(engineState);
  const startLabel = engineState === 'ENGINE_OFF' ? '▶ READY UP'
    : engineState === 'STANDBY' ? (allReady ? '▶ START ENG' : '… INTERLOCKS')
    : ['SAFETY_TURNING', 'CRANKING'].includes(engineState) ? '… STARTING'
    : '✓ RUNNING';
  const clutchLabel= engineState === 'DECLUTCHED_RUN' ? '⊕ ENGAGE'
    : engineState === 'CLUTCHING' ? '… CLUTCHING'
    : '⊕ CLUTCH';

  const liveRpm  = snapshot?.rpm  ?? rpm;
  const liveLoad = snapshot?.load ?? load;
  const loadColor = liveLoad >= 85 ? '#ef4444' : liveLoad >= 60 ? '#f97316' : liveLoad >= 30 ? '#f59e0b' : 'var(--risk-normal)';
  // Sliders active in CLUTCHED (speed lever sets RPM) and LOADED (full control)
  const slidersActive = engineState === 'LOADED' || engineState === 'CLUTCHED';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      marginBottom: 16,
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

      {/* Engine lifecycle control strip — 4 permanent buttons */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border-dim)',
        background: 'rgba(255,255,255,0.015)',
        display: 'flex', gap: 6,
      }}>
        <button onClick={() => engineControls.initStart()} disabled={!canStart} style={simCtrlBtn(canStart, '#00C878')}>
          {startLabel}
        </button>
        <button onClick={() => engineControls.stopEngine()} disabled={!canStop} style={simCtrlBtn(canStop, '#FF3B3B')}>
          {engineState === 'STOPPING' ? '… STOPPING' : '■ STOP'}
        </button>
        <button onClick={() => engineControls.engageClutch()} disabled={!canClutch} style={simCtrlBtn(canClutch, '#F59E0B')}>
          {clutchLabel}
        </button>
        <button onClick={() => engineControls.clutchNeutral()} disabled={!canDeclutch} style={simCtrlBtn(canDeclutch, '#F97316')}>
          ⊘ DECLUTCH
        </button>
      </div>

      <div style={{
        padding: '12px 16px',
        opacity: slidersActive ? 1 : 0.45,
        pointerEvents: slidersActive ? 'auto' : 'none',
      }}>
        {/* Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 10 }}>

          {/* RPM slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label-xs">RPM</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#38BDF8', fontVariantNumeric: 'tabular-nums' }}>{rpm}</span>
            </div>
            <input type="range" min={400} max={1150} step={5} value={rpm}
              onChange={e => setRpm(+e.target.value)}
              style={{ width: '100%', accentColor: '#38BDF8' } as React.CSSProperties} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
              <span>400 IDLE</span><span>1150 RATED</span>
            </div>
            <button
              onClick={() => setCoupled(!coupled)}
              style={{
                marginTop: 6, width: '100%', padding: '3px 0', fontSize: 8, letterSpacing: '0.07em',
                background: coupled ? 'rgba(56,189,248,0.10)' : 'var(--bg-elevated)',
                border: `1px solid ${coupled ? 'rgba(56,189,248,0.5)' : 'var(--border-dim)'}`,
                color: coupled ? '#38BDF8' : 'var(--text-muted)',
                borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              {coupled ? '⛓ RPM→LOAD COUPLED' : '⛓ DECOUPLE LOAD'}
            </button>
          </div>

          {/* Load slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="label-xs" style={{ color: coupled ? undefined : 'var(--risk-warning)' }}>
                LOAD{coupled ? '' : ' (manual)'}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: loadColor, fontVariantNumeric: 'tabular-nums' }}>{load}%</span>
            </div>
            <input type="range" min={0} max={100} step={1} value={load}
              disabled={coupled}
              onChange={e => setLoad(+e.target.value)}
              style={{ width: '100%', opacity: coupled ? 0.45 : 1, accentColor: loadColor } as React.CSSProperties} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
              <span>0%</span><span>85% NOR</span><span>100%</span>
            </div>
            <div style={{ marginTop: 6, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${liveLoad}%`, background: loadColor, transition: 'width 0.5s, background 0.3s', borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* Presets + Stress — single compact row */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', minWidth: 44, flexShrink: 0 }}>PRESETS</span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.rpm, p.load)}
              title={p.desc}
              style={{
                flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font)',
                background: rpm === p.rpm && load === p.load ? 'rgba(56,189,248,0.14)' : 'var(--bg-elevated)',
                border: `1px solid ${rpm === p.rpm && load === p.load ? 'rgba(56,189,248,0.5)' : 'var(--border-dim)'}`,
                color: rpm === p.rpm && load === p.load ? '#38BDF8' : 'var(--text-muted)',
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
