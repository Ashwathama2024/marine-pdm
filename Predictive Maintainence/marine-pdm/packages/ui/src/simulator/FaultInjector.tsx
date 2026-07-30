import React, { useState } from 'react';
import type { SimulatorEngine } from '@marine-pdm/simulator';
import {
  FAULT_DEFINITIONS,
  getECSAlarmPreview,
  getParameterImpactPreview,
  createFaultConfig,
} from '@marine-pdm/simulator';
import type { FaultConfig, FaultSpeed } from '@marine-pdm/simulator';
import { isRampMode, setRampMode, subscribeRampMode, initialSeverity } from '../services/ramp-mode';

// F01 and F07 (requiresCylSelect) are handled by CylinderInjectorPanel
const SCENARIO_FAULTS = FAULT_DEFINITIONS.filter(f => !f.requiresCylSelect);

// Intensity label thresholds
const INTENSITY_LABELS = [
  { max: 10,  label: 'Incipient',   color: 'var(--text-muted)' },
  { max: 30,  label: 'Developing',  color: 'var(--risk-warning)' },
  { max: 55,  label: 'Significant', color: '#f59e0b' },
  { max: 80,  label: 'Severe',      color: '#ef4444' },
  { max: 100, label: 'Critical',    color: 'var(--risk-critical)' },
] as const;

function intensityLabel(v: number) {
  return INTENSITY_LABELS.find(l => v <= l.max) ?? INTENSITY_LABELS[INTENSITY_LABELS.length - 1];
}

const SPEEDS: { key: FaultSpeed; label: string; timeToMax: string }[] = [
  { key: 'SLOW',   label: 'SLOW',   timeToMax: '~20 min' },
  { key: 'MEDIUM', label: 'MED',    timeToMax: '~5 min'  },
  { key: 'FAST',   label: 'FAST',   timeToMax: '~80 sec' },
];

interface Props {
  engine: SimulatorEngine;
  activeFaultIds: Set<string>;
  onActiveFaultIdsChange: (ids: Set<string>) => void;
  onResetAll?: () => void;
}

export function FaultInjector({ engine, activeFaultIds, onActiveFaultIdsChange, onResetAll }: Props) {
  const [selectedFaultId, setSelectedFaultId] = useState<string>('F02');
  const [intensity, setIntensity]             = useState(50);
  const [speed, setSpeed]                     = useState<FaultSpeed>('MEDIUM');
  const [selectedBearing, setSelectedBearing] = useState<number>(0);
  const [selectedTC, setSelectedTC]           = useState<number>(0);
  const [compoundMode, setCompoundMode]       = useState(false);
  const [rampMode, setRampModeState]          = useState(isRampMode);

  // Ramp mode is shared with the cylinder injector and read by the training recorder, so mirror the
  // module state rather than owning it.
  React.useEffect(() => subscribeRampMode(() => setRampModeState(isRampMode())), []);

  const faultDef = SCENARIO_FAULTS.find(f => f.id === selectedFaultId)!;

  // intensity/100 is the saturated severity — preview the alarms the fault ends at, not mid-ramp.
  const alarmPreviews = getECSAlarmPreview(selectedFaultId, intensity / 100);
  const impactItems = getParameterImpactPreview(selectedFaultId, intensity);

  function activateFault() {
    if (!compoundMode) {
      engine.clearAllMTUFaults();
      onActiveFaultIdsChange(new Set());
    }

    const config: FaultConfig = createFaultConfig(selectedFaultId, {
      intensity,
      speed,
      // Ramp on → start at 0 and grow at FAULT_GROWTH_RATES[speed]; off → immediate full effect.
      currentSeverity: initialSeverity(intensity),
      targetBearing: faultDef.requiresBearingSelect ? selectedBearing : undefined,
      targetTC: faultDef.requiresTCSelect ? selectedTC : undefined,
    });

    engine.injectMTUFault(config);
    onActiveFaultIdsChange(new Set([...activeFaultIds, selectedFaultId]));
  }

  function clearFault(id: string) {
    engine.clearMTUFault(id);
    const n = new Set(activeFaultIds); n.delete(id);
    onActiveFaultIdsChange(n);
  }

  function resetAll() {
    engine.clearAllMTUFaults();
    onActiveFaultIdsChange(new Set());
    onResetAll?.();
  }

  const hasActive = activeFaultIds.size > 0;
  const borderCol = hasActive ? 'rgba(239,68,68,0.35)' : 'var(--border-dim)';
  const lbl = intensityLabel(intensity);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${borderCol}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'border-color 0.4s',
    }}>
      {/* Header */}
      <div style={{
        background: hasActive ? 'rgba(239,68,68,0.06)' : 'var(--bg-elevated)',
        borderBottom: `1px solid ${hasActive ? 'rgba(239,68,68,0.2)' : 'var(--border-dim)'}`,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="label-sm" style={{ color: hasActive ? 'var(--risk-critical)' : undefined }}>
            MTU 8000 Fault Injector
          </span>
          {hasActive && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              color: 'var(--risk-critical)',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 3, padding: '1px 6px',
              animation: 'pulse-dot 1.5s ease-in-out infinite',
            }}>FAULT ACTIVE</span>
          )}
        </div>
        <span className="label-xs">SIMULATOR ONLY</span>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Fault selector */}
        <div>
          <div className="label-xs" style={{ marginBottom: 6 }}>Fault Scenario</div>
          <select
            value={selectedFaultId}
            onChange={e => setSelectedFaultId(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          >
            {SCENARIO_FAULTS.map(f => (
              <option key={f.id} value={f.id}>
                {f.id} — {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Bearing selector (F04) */}
        {faultDef.requiresBearingSelect && (
          <div>
            <div className="label-xs" style={{ marginBottom: 6 }}>Target Bearing (1–11)</div>
            <select
              value={selectedBearing}
              onChange={e => setSelectedBearing(Number(e.target.value))}
              style={{
                width: '100%', padding: '7px 10px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 12,
              }}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>Bearing {i + 1}{i === 10 ? ' (free end — runs hottest)' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* TC selector (F06) */}
        {faultDef.requiresTCSelect && (
          <div>
            <div className="label-xs" style={{ marginBottom: 6 }}>Target Turbocharger</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['TC A1', 'TC A2', 'TC B1', 'TC B2'].map((tc, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedTC(i)}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600,
                    borderRadius: 4, border: '1px solid', cursor: 'pointer',
                    background: selectedTC === i ? 'rgba(239,68,68,0.15)' : 'var(--bg-elevated)',
                    borderColor: selectedTC === i ? 'var(--risk-critical)' : 'var(--border-dim)',
                    color: selectedTC === i ? 'var(--risk-critical)' : 'var(--text-muted)',
                  }}
                >
                  {tc}
                </button>
              ))}
            </div>
          </div>
        )}

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
          {/* Label markers */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            {['Incipient', 'Developing', 'Significant', 'Severe', 'Critical'].map((l, i) => (
              <span key={i} style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600 }}>{l}</span>
            ))}
          </div>
        </div>

        {/* Progression speed */}
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
                <span
                  key={i}
                  style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 7px',
                    borderRadius: 3, border: '1px solid',
                    background: a.active
                      ? 'rgba(239,68,68,0.15)' : a.approaching
                      ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)',
                    borderColor: a.active ? 'var(--risk-critical)' : a.approaching ? '#f59e0b' : 'var(--border-dim)',
                    color: a.active ? 'var(--risk-critical)' : a.approaching ? '#f59e0b' : 'var(--text-muted)',
                    transition: 'all 0.3s',
                  }}
                >
                  {a.active ? '🔴 ' : a.approaching ? '🟡 ' : ''}{a.code}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Parameter impact preview */}
        {impactItems.length > 0 && (
          <div style={{
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            border: '1px solid var(--border-dim)',
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

        {/* Compound fault toggle */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={compoundMode}
            onChange={e => setCompoundMode(e.target.checked)}
            style={{ marginTop: 2, accentColor: 'var(--accent-blue)' }}
          />
          <div>
            <div className="label-sm">Compound Fault Mode</div>
            {compoundMode && (
              <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 2 }}>
                Compound fault active — decision engine will attempt to discriminate root cause.
              </div>
            )}
          </div>
        </label>

        {/* Severity ramp toggle — governs both this panel and the cylinder injector */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={rampMode}
            onChange={e => setRampMode(e.target.checked)}
            style={{ marginTop: 2, accentColor: 'var(--accent-teal, var(--risk-normal))' }}
          />
          <div>
            <div className="label-sm">
              Severity Ramp
              <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 6, letterSpacing: 0 }}>
                makes SLOW / MED / FAST actually do something
              </span>
            </div>
            <div style={{ fontSize: 9, color: rampMode ? 'var(--risk-normal)' : '#f59e0b', marginTop: 2, lineHeight: 1.5 }}>
              {rampMode
                ? `Severity starts at 0 and grows to ${intensity}% over ${SPEEDS.find(s => s.key === speed)?.timeToMax ?? '—'} — the incipient phase is recorded, so training data can support prediction.`
                : 'Severity jumps straight to the cap (demo mode). Alarms fire at once, but every recorded sample sits at a fully-developed fault.'}
            </div>
          </div>
        </label>

        {/* Active faults list */}
        {activeFaultIds.size > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 6 }}>Active Faults</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...activeFaultIds].map(id => {
                const def = FAULT_DEFINITIONS.find(f => f.id === id);
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 8px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 4,
                  }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--risk-critical)' }}>{id}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>
                        {def?.name}
                      </span>
                    </div>
                    <button
                      onClick={() => clearFault(id)}
                      style={{
                        fontSize: 9, padding: '2px 7px', cursor: 'pointer',
                        background: 'transparent', border: '1px solid rgba(239,68,68,0.4)',
                        borderRadius: 3, color: 'var(--risk-critical)',
                      }}
                    >
                      Clear
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="mag-btn mag-btn-danger"
            onClick={activateFault}
            style={{ flex: 2, padding: '8px 0', fontWeight: 700 }}
          >
            Inject {selectedFaultId}
          </button>
          <button
            className="mag-btn mag-btn-ghost"
            onClick={resetAll}
            disabled={!hasActive}
            style={{
              flex: 1, padding: '8px 0',
              opacity: hasActive ? 1 : 0.35,
              cursor: hasActive ? 'pointer' : 'default',
            }}
          >
            Reset All
          </button>
        </div>

      </div>
    </div>
  );
}
