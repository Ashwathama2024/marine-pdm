import React, { useState, useEffect } from 'react';
import {
  getECSAlarmPreview,
  getParameterImpactPreview,
} from '@marine-pdm/simulator';
import type { FaultSpeed } from '@marine-pdm/simulator';

// ── Shared types ──────────────────────────────────────────────────────────────
export interface CylFaultEntry {
  faultType: 'F01' | 'F07';
  intensity: number;    // 0–100
  speed:     FaultSpeed;
  uniqueId:  string;    // e.g. 'F01_cyl_3'
}

export type CylFaultMap = Record<number, CylFaultEntry>;

// ── Constants ─────────────────────────────────────────────────────────────────
const INTENSITY_LABELS = [
  { max: 10,  label: 'Incipient',   color: 'var(--text-muted)'      },
  { max: 30,  label: 'Developing',  color: 'var(--risk-warning)'    },
  { max: 55,  label: 'Significant', color: '#f59e0b'                },
  { max: 80,  label: 'Severe',      color: '#ef4444'                },
  { max: 100, label: 'Critical',    color: 'var(--risk-critical)'   },
] as const;

function intensityLabel(v: number) {
  return INTENSITY_LABELS.find(l => v <= l.max) ?? INTENSITY_LABELS[INTENSITY_LABELS.length - 1];
}

const SPEEDS: { key: FaultSpeed; label: string; timeToMax: string }[] = [
  { key: 'SLOW',   label: 'SLOW', timeToMax: '~20 min' },
  { key: 'MEDIUM', label: 'MED',  timeToMax: '~5 min'  },
  { key: 'FAST',   label: 'FAST', timeToMax: '~80 sec' },
];

const FAULT_TYPES: { id: 'F01' | 'F07'; label: string; desc: string }[] = [
  { id: 'F01', label: 'Injector Degradation',       desc: 'Thermal rise — localized to single cyl' },
  { id: 'F07', label: 'Spray Pattern Failure',      desc: 'Erratic combustion + ±30°C oscillation' },
];

function cylLabel(idx: number): string {
  return idx < 10 ? `Cylinder A${idx + 1}` : `Cylinder B${idx - 9}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  cylIndex:     number;
  currentFault: CylFaultEntry | undefined;
  onInject:     (cylIndex: number, faultType: 'F01' | 'F07', intensity: number, speed: FaultSpeed) => void;
  onClear:      (cylIndex: number) => void;
  onClose:      () => void;
}

export function CylinderFaultPopup({ cylIndex, currentFault, onInject, onClear, onClose }: Props) {
  const [faultType, setFaultType] = useState<'F01' | 'F07'>(currentFault?.faultType ?? 'F01');
  const [intensity, setIntensity] = useState(currentFault?.intensity ?? 50);
  const [speed, setSpeed]         = useState<FaultSpeed>(currentFault?.speed ?? 'MEDIUM');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const lbl           = intensityLabel(intensity);
  const hasActive     = currentFault !== undefined;
  const alarmPreviews = getECSAlarmPreview(faultType, intensity / 100, intensity);
  const impactItems   = getParameterImpactPreview(faultType, intensity);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card-hi"
        style={{ width: 500, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label-sm" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {cylLabel(cylIndex)}
            </span>
            {hasActive && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                color: 'var(--risk-critical)',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 3, padding: '1px 6px',
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }}>
                {currentFault.faultType} ACTIVE
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 4 }}
          >×</button>
        </div>

        {/* Fault type selector */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>Fault Type</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {FAULT_TYPES.map(ft => (
              <button
                key={ft.id}
                onClick={() => setFaultType(ft.id)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 5, cursor: 'pointer',
                  border: `1px solid ${faultType === ft.id ? 'rgba(239,68,68,0.6)' : 'var(--border-dim)'}`,
                  background: faultType === ft.id ? 'rgba(239,68,68,0.10)' : 'var(--bg-elevated)',
                  color: faultType === ft.id ? 'var(--risk-critical)' : 'var(--text-muted)',
                  textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700 }}>{ft.id} — {ft.label}</div>
                <div style={{ fontSize: 8, opacity: 0.7, marginTop: 2 }}>{ft.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Intensity slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="label-sm">Fault Intensity</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: lbl.color, fontVariantNumeric: 'tabular-nums' }}>
              {intensity}% — {lbl.label}
            </span>
          </div>
          <input
            type="range" min={0} max={100} step={5} value={intensity}
            onChange={e => setIntensity(Number(e.target.value))}
            style={{ width: '100%', accentColor: lbl.color } as React.CSSProperties}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            {['Incipient', 'Developing', 'Significant', 'Severe', 'Critical'].map((l, i) => (
              <span key={i} style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{l}</span>
            ))}
          </div>
        </div>

        {/* Speed selector */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>Progression Speed</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {SPEEDS.map(s => (
              <button
                key={s.key}
                onClick={() => setSpeed(s.key)}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${speed === s.key ? 'var(--accent-blue)' : 'var(--border-dim)'}`,
                  background: speed === s.key ? 'rgba(59,130,246,0.12)' : 'var(--bg-elevated)',
                  color: speed === s.key ? 'var(--accent-blue)' : 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 8, marginTop: 1, opacity: 0.7 }}>{s.timeToMax}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ECS alarm preview */}
        {alarmPreviews.length > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 6 }}>ECS Alarm Preview</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {alarmPreviews.map((a, i) => (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 7px',
                  borderRadius: 3, border: '1px solid',
                  background: a.active ? 'rgba(239,68,68,0.15)' : a.approaching ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)',
                  borderColor: a.active ? 'var(--risk-critical)' : a.approaching ? '#f59e0b' : 'var(--border-dim)',
                  color: a.active ? 'var(--risk-critical)' : a.approaching ? '#f59e0b' : 'var(--text-muted)',
                  transition: 'all 0.3s',
                }}>
                  {a.active ? '🔴 ' : a.approaching ? '🟡 ' : ''}{a.code}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Parameter impact preview */}
        {impactItems.length > 0 && (
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
            padding: '8px 10px', border: '1px solid var(--border-dim)',
          }}>
            <div className="label-xs" style={{ marginBottom: 5 }}>Expected Impact at {intensity}% Intensity</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {impactItems.map((item, i) => (
                <span key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="mag-btn mag-btn-ghost"
            disabled={intensity === 0}
            onClick={() => { onInject(cylIndex, faultType, intensity, speed); onClose(); }}
            style={{
              flex: 1, padding: '9px 0',
              opacity: intensity === 0 ? 0.35 : 1,
              cursor: intensity === 0 ? 'default' : 'pointer',
              borderColor: intensity > 0 ? 'var(--risk-critical)' : undefined,
              color: intensity > 0 ? 'var(--risk-critical)' : undefined,
              background: intensity > 0 ? 'rgba(239,68,68,0.08)' : undefined,
            }}
          >
            Inject {faultType}
          </button>
          <button
            className="mag-btn mag-btn-ghost"
            disabled={!hasActive}
            onClick={() => { onClear(cylIndex); onClose(); }}
            style={{
              flex: 1, padding: '9px 0',
              opacity: hasActive ? 1 : 0.35,
              cursor: hasActive ? 'pointer' : 'default',
            }}
          >
            Clear Fault
          </button>
        </div>
      </div>
    </div>
  );
}
