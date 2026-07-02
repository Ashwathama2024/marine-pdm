import React, { useState, useCallback } from 'react';
import type { EngineState } from '@marine-pdm/simulator';
import { STATE_BADGE } from '@marine-pdm/simulator';
import { useEngine } from '../context/EngineContext';
import { LopDisplay } from './LopDisplay';

// Button visibility per state: LOCKED | DIM | ACTIVE | BRIGHT | FLASHING
type BtnVis = 'LOCKED' | 'DIM' | 'ACTIVE' | 'BRIGHT' | 'FLASH';

interface LOPButton {
  id: string;
  label: string;
  vis: (state: EngineState) => BtnVis;
  action: (controls: ReturnType<typeof useEngine>['engineControls'], state: EngineState) => void;
}

function vis(map: Partial<Record<EngineState, BtnVis>>, def: BtnVis = 'LOCKED'): (s: EngineState) => BtnVis {
  return (s) => map[s] ?? def;
}

const LOP_BUTTONS: LOPButton[] = [
  {
    id: 'LOCAL_OP',
    label: 'LOCAL\nOPERATION',
    vis: vis({ ENGINE_OFF: 'BRIGHT', STANDBY: 'BRIGHT', SAFETY_TURNING: 'ACTIVE', CRANKING: 'ACTIVE', IDLE: 'ACTIVE', WARMING: 'ACTIVE', DECLUTCHED_RUN: 'ACTIVE', CLUTCHING: 'ACTIVE', CLUTCHED: 'ACTIVE', LOADED: 'ACTIVE', STOPPING: 'ACTIVE' }),
    action: () => {},  // mode selector — always local in sim
  },
  {
    id: 'READY_OP',
    label: 'READY FOR\nOPERATION',
    vis: vis({ ENGINE_OFF: 'BRIGHT', STANDBY: 'ACTIVE' }),
    action: (c, s) => { if (s === 'ENGINE_OFF') c.readyForOperation(); },
  },
  {
    id: 'START',
    label: 'START',
    vis: vis({ STANDBY: 'BRIGHT' }),
    action: (c, s) => { if (s === 'STANDBY') c.startEngine(); },
  },
  {
    id: 'SPEED_INC',
    label: 'ENGINE SPEED\nINCREASE',
    vis: vis({ WARMING: 'ACTIVE', DECLUTCHED_RUN: 'DIM', CLUTCHED: 'DIM', LOADED: 'ACTIVE' }),
    action: (c) => c.speedIncrease(),
  },
  {
    id: 'SPEED_DEC',
    label: 'ENGINE SPEED\nDECREASE',
    vis: vis({ WARMING: 'ACTIVE', DECLUTCHED_RUN: 'DIM', CLUTCHED: 'DIM', LOADED: 'ACTIVE' }),
    action: (c) => c.speedDecrease(),
  },
  {
    id: 'WARMING',
    label: 'BEGIN\nWARMING',
    vis: vis({ IDLE: 'BRIGHT' }),
    action: (c, s) => { if (s === 'IDLE') c.beginWarming(); },
  },
  {
    id: 'DECLUTCHED',
    label: 'DECLUTCHED\nRUN',
    vis: vis({ WARMING: 'BRIGHT' }),
    action: (c, s) => { if (s === 'WARMING') c.advanceToDeclutched(); },
  },
  {
    id: 'CLUTCH_AHEAD',
    label: 'CLUTCH\nAHEAD',
    vis: vis({ DECLUTCHED_RUN: 'BRIGHT' }),
    action: (c, s) => { if (s === 'DECLUTCHED_RUN') c.clutchAhead(); },
  },
  {
    id: 'CLUTCH_NEUTRAL',
    label: 'CLUTCH\nNEUTRAL',
    vis: vis({ CLUTCHED: 'ACTIVE', LOADED: 'ACTIVE' }),
    action: (c) => c.clutchNeutral(),
  },
  {
    id: 'STOP',
    label: 'STOP',
    vis: vis({ IDLE: 'ACTIVE', WARMING: 'ACTIVE', DECLUTCHED_RUN: 'ACTIVE', CLUTCHED: 'ACTIVE', LOADED: 'ACTIVE' }),
    action: (c) => c.stopEngine(),
  },
  {
    id: 'EMRG_STOP',
    label: 'EMERGENCY\nSTOP',
    vis: (_) => 'ACTIVE',
    action: (c) => c.stopEngine(),
  },
];

const VIS_STYLE: Record<BtnVis, { background: string; border: string; color: string; cursor: string; opacity?: number }> = {
  LOCKED: { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'not-allowed', opacity: 0.35 },
  DIM:    { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'default' },
  ACTIVE: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-secondary)', cursor: 'pointer' },
  BRIGHT: { background: 'rgba(0,200,120,0.10)',   border: '1px solid rgba(0,200,120,0.40)',   color: '#00C878', cursor: 'pointer' },
  FLASH:  { background: 'rgba(255,140,0,0.10)',   border: '1px solid rgba(255,140,0,0.50)',   color: '#FF8C00', cursor: 'pointer' },
};

const EMRG_STYLE = {
  background: 'rgba(220,38,38,0.12)',
  border: '1.5px solid rgba(220,38,38,0.5)',
  color: '#ef4444',
  cursor: 'pointer',
};

interface Props {
  onQuickStart?: () => void;
}

export function LOPPanel({ onQuickStart }: Props) {
  const { engineState, engineControls } = useEngine();
  const badge = STATE_BADGE[engineState];
  const [flash, setFlash] = useState<string | null>(null);

  const handleBtn = useCallback((btn: LOPButton) => {
    const v = btn.vis(engineState);
    if (v === 'LOCKED' || v === 'DIM') return;
    setFlash(btn.id);
    setTimeout(() => setFlash(null), 200);
    btn.action(engineControls, engineState);
  }, [engineState, engineControls]);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>
            LOCAL OPERATING PANEL
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
            MTU 8000 — MAIN ENGINE
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 10px', borderRadius: 6,
          background: `${badge.color}15`, border: `1px solid ${badge.color}50`,
          animation: badge.pulse ? 'statePulse 1.2s ease-in-out infinite' : undefined,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: badge.color, boxShadow: `0 0 5px ${badge.color}` }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: badge.color }}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Body — LCD measured-value display (left) + control buttons (right) */}
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, alignItems: 'stretch' }}>

        {/* LEFT: live LOP display */}
        <LopDisplay />

        {/* RIGHT: control buttons + quick start */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {LOP_BUTTONS.map(btn => {
              const v = btn.vis(engineState);
              const isEmrg = btn.id === 'EMRG_STOP';
              const isFlashing = flash === btn.id;
              const baseStyle = isEmrg ? EMRG_STYLE : VIS_STYLE[v];

              return (
                <button
                  key={btn.id}
                  onClick={() => handleBtn(btn)}
                  disabled={v === 'LOCKED'}
                  style={{
                    ...baseStyle,
                    padding: '9px 6px',
                    borderRadius: 7,
                    fontFamily: 'var(--font)',
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textAlign: 'center',
                    whiteSpace: 'pre-line',
                    lineHeight: 1.35,
                    transition: 'all 0.15s',
                    opacity: isFlashing ? 0.6 : (v === 'LOCKED' ? 0.3 : 1),
                    transform: isFlashing ? 'scale(0.96)' : 'none',
                    gridColumn: btn.id === 'EMRG_STOP' ? 'span 2' : undefined,
                  }}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Quick start bypass */}
          <button
            onClick={() => { engineControls.quickStart(); onQuickStart?.(); }}
            style={{
              width: '100%', padding: '8px 0', marginTop: 'auto',
              background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.30)',
              color: 'var(--accent-blue)', borderRadius: 6,
              fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.1em', cursor: 'pointer',
            }}
          >
            QUICK START (BYPASS PROCEDURE)
          </button>
        </div>
      </div>

      <style>{`@keyframes statePulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>
    </div>
  );
}
