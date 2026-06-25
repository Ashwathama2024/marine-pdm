import React, { useState } from 'react';
import type { SensorFailureConfig, FailureMode } from '@marine-pdm/simulator';
import { SensorFailureRegistry } from '@marine-pdm/simulator';
import { MTU8000 } from '@marine-pdm/shared';

// All 52 MTU 8000 sensor tags (from PDF §4)
const MTU8000_TAGS: string[] = [
  // Exhaust temperatures B4.1–B4.20
  ...MTU8000.CYL_NAMES.map(n => `ME.Cyl${n}.ExhaustTemp`),
  'ME.ExhaustMean',
  'ME.ExhaustBackPressure',
  // Lube oil & bearings
  'ME.LubeOilPressure.BeforeFilter',
  'ME.LubeOilPressure.AfterFilter',
  'ME.LubeOilPressure.PistonCooling',
  'ME.LubeOilPressure.LastBearing',
  'ME.LubeOilTemp',
  ...Array.from({ length: 11 }, (_, i) => `ME.BearingTemp.${i + 1}`),
  // Cooling & charge air
  'ME.CoolantTemp.AfterEngine',
  'ME.CoolantPressure',
  'ME.ChargeAirPressure',
  'ME.ChargeAirTemp',
  // Turbochargers
  'ME.TC.A1.Speed',
  'ME.TC.A2.Speed',
  'ME.TC.B1.Speed',
  'ME.TC.B2.Speed',
  // Fuel
  'ME.FuelRailPressure',
  'ME.FuelTemp',
  // Misc
  'ME.CrankcasePressure',
  'ME.RPM',
  'ME.RPM.Redundant',
];

const FAILURE_MODES: FailureMode[] = ['DROPOUT', 'DRIFT', 'SPIKE', 'INTERMITTENT', 'FREEZE'];

const MODE_ECS_CODES: Record<FailureMode, string> = {
  DROPOUT:      'SD (Sensor Defect)',
  DRIFT:        'TD (Transmitter Deviation)',
  SPIKE:        'SD (Sensor Defect)',
  INTERMITTENT: 'SD (Sensor Defect)',
  FREEZE:       'SD (Sensor Defect)',
};

const MODE_DESCRIPTIONS: Record<FailureMode, string> = {
  DROPOUT:      'Sensor goes null for configurable duration, then recovers',
  DRIFT:        'Value drifts linearly from truth — hardest for AI to discriminate',
  SPIKE:        'Sudden impulse then returns to normal. Cross-correlated tags stay stable',
  INTERMITTENT: 'Alternates between valid readings and null — loose connector behavior',
  FREEZE:       'Value stuck at last-known. StdDev → 0 over freeze window',
};

function healthColor(score: number): string {
  if (score >= 80) return 'var(--risk-normal)';
  if (score >= 50) return 'var(--risk-warning)';
  return 'var(--risk-critical)';
}

interface ActiveFailureRow {
  sensorId: string;
  mode: FailureMode;
  health: number;
  since: number;
  ecsCode: string;
}

interface Props {
  registry: SensorFailureRegistry;
  onRegistryChange: () => void;  // call to re-render parent after mutations
}

export function SensorFailurePanel({ registry, onRegistryChange }: Props) {
  const [search, setSearch]           = useState('');
  const [selectedSensor, setSelected] = useState<string>(MTU8000_TAGS[0]);
  const [mode, setMode]               = useState<FailureMode>('DROPOUT');

  // Mode-specific config state
  const [dropoutDuration, setDropoutDuration] = useState(30);
  const [dropoutPeriod, setDropoutPeriod]     = useState(0);
  const [driftRate, setDriftRate]             = useState(1.0);
  const [spikeAmp, setSpikeAmp]               = useState(20);
  const [spikeFreq, setSpikeFreq]             = useState(2);
  const [onTime, setOnTime]                   = useState(5);
  const [offTime, setOffTime]                 = useState(3);
  const [freezeDuration, setFreezeDuration]   = useState(120);

  const filteredTags = MTU8000_TAGS.filter(t =>
    t.toLowerCase().includes(search.toLowerCase()),
  );

  const activeIds = registry.getActiveIds();
  const activeRows: ActiveFailureRow[] = activeIds.map(id => {
    const cfg = registry.getConfig(id);
    const health = registry.getHealth(id, 1.5);
    return {
      sensorId: id,
      mode: cfg?.mode ?? 'DROPOUT',
      health,
      since: Date.now(),
      ecsCode: cfg ? MODE_ECS_CODES[cfg.mode] : '',
    };
  });

  function buildConfig(): SensorFailureConfig {
    const base: SensorFailureConfig = { sensorId: selectedSensor, mode, active: true };
    switch (mode) {
      case 'DROPOUT':
        return { ...base, dropoutDuration_s: dropoutDuration, dropoutPeriod_s: dropoutPeriod };
      case 'DRIFT':
        return { ...base, driftRate_perMin: driftRate };
      case 'SPIKE':
        return { ...base, spikeAmplitude: spikeAmp, spikeFreq_perMin: spikeFreq };
      case 'INTERMITTENT':
        return { ...base, onTime_s: onTime, offTime_s: offTime };
      case 'FREEZE':
        return { ...base, freezeDuration_s: freezeDuration };
    }
  }

  function activate() {
    registry.activate(buildConfig(), 100);  // 100 = default truth estimate
    onRegistryChange();
  }

  function deactivate(sensorId: string) {
    registry.deactivate(sensorId);
    onRegistryChange();
  }

  function deactivateAll() {
    registry.deactivateAll();
    onRegistryChange();
  }

  const hasActive = activeIds.length > 0;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${hasActive ? 'rgba(245,158,11,0.35)' : 'var(--border-dim)'}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: hasActive ? 'rgba(245,158,11,0.06)' : 'var(--bg-elevated)',
        borderBottom: `1px solid ${hasActive ? 'rgba(245,158,11,0.2)' : 'var(--border-dim)'}`,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="label-sm" style={{ color: hasActive ? '#f59e0b' : undefined }}>
            Sensor Failure Simulator
          </span>
          {hasActive && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              color: '#f59e0b', background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 3, padding: '1px 6px',
            }}>
              {activeIds.length} ACTIVE
            </span>
          )}
        </div>
        <span className="label-xs">ECS SD/TD EMULATION</span>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Sensor selector */}
        <div>
          <div className="label-xs" style={{ marginBottom: 5 }}>Sensor</div>
          <input
            type="text"
            placeholder="Search 52 tags..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '6px 10px', marginBottom: 4,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 11,
              boxSizing: 'border-box',
            }}
          />
          <select
            value={selectedSensor}
            onChange={e => setSelected(e.target.value)}
            size={4}
            style={{
              width: '100%', padding: '4px 8px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 10,
            }}
          >
            {filteredTags.map(tag => {
              const health = registry.getHealth(tag, 1.5);
              const isActive = activeIds.includes(tag);
              return (
                <option key={tag} value={tag} style={{
                  color: isActive ? '#f59e0b' : undefined,
                }}>
                  {isActive ? `⚠ ` : ''}{tag}
                  {isActive ? `  [H:${health}]` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Failure mode selector */}
        <div>
          <div className="label-xs" style={{ marginBottom: 5 }}>Failure Mode</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {FAILURE_MODES.map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '5px 0', fontSize: 8, fontWeight: 700,
                  borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${mode === m ? '#f59e0b' : 'var(--border-dim)'}`,
                  background: mode === m ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)',
                  color: mode === m ? '#f59e0b' : 'var(--text-muted)',
                }}
              >
                {m.slice(0, 6)}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
            {MODE_DESCRIPTIONS[mode]}
          </div>
          <div style={{ fontSize: 8, color: '#f59e0b', marginTop: 2 }}>
            ECS: {MODE_ECS_CODES[mode]}
          </div>
        </div>

        {/* Mode-specific config */}
        <div style={{
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          border: '1px solid var(--border-dim)',
        }}>
          {mode === 'DROPOUT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ConfigSlider label="Duration (s)" value={dropoutDuration} min={1} max={600} step={1} onChange={setDropoutDuration} />
              <ConfigSlider label="Period (s, 0=one-shot)" value={dropoutPeriod} min={0} max={600} step={5} onChange={setDropoutPeriod} />
            </div>
          )}
          {mode === 'DRIFT' && (
            <ConfigSlider label="Drift rate (units/min)" value={driftRate} min={-10} max={10} step={0.1} onChange={setDriftRate} />
          )}
          {mode === 'SPIKE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ConfigSlider label="Amplitude (units)" value={spikeAmp} min={1} max={200} step={1} onChange={setSpikeAmp} />
              <ConfigSlider label="Frequency (/min)" value={spikeFreq} min={0.5} max={20} step={0.5} onChange={setSpikeFreq} />
            </div>
          )}
          {mode === 'INTERMITTENT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ConfigSlider label="ON time (s)" value={onTime} min={1} max={120} step={1} onChange={setOnTime} />
              <ConfigSlider label="OFF time (s)" value={offTime} min={1} max={60} step={1} onChange={setOffTime} />
            </div>
          )}
          {mode === 'FREEZE' && (
            <ConfigSlider label="Duration (s, 0=permanent)" value={freezeDuration} min={0} max={3600} step={30} onChange={setFreezeDuration} />
          )}
        </div>

        {/* Activate button */}
        <button
          className="mag-btn"
          onClick={activate}
          style={{
            width: '100%', padding: '8px 0', fontWeight: 700,
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.4)',
            color: '#f59e0b', cursor: 'pointer', borderRadius: 4,
          }}
        >
          Activate {mode} on {selectedSensor.split('.').slice(-1)[0]}
        </button>

        {/* Active failures table */}
        {activeRows.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div className="label-xs">Active Failures ({activeRows.length})</div>
              <button
                onClick={deactivateAll}
                style={{
                  fontSize: 8, padding: '2px 7px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--border-dim)',
                  borderRadius: 3, color: 'var(--text-muted)',
                }}
              >
                Clear All
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {activeRows.map(row => {
                const hc = healthColor(row.health);
                return (
                  <div key={row.sensorId} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px',
                    background: 'rgba(245,158,11,0.05)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 4, fontSize: 9,
                  }}>
                    <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.sensorId.replace('ME.', '')}
                    </span>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>{row.mode.slice(0, 4)}</span>
                    {/* Health badge */}
                    <span style={{
                      padding: '1px 5px', borderRadius: 3,
                      border: `1px solid ${hc}`,
                      color: hc, fontWeight: 700,
                      background: `color-mix(in srgb, ${hc} 10%, transparent)`,
                    }}>
                      H:{row.health}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 8 }}>{row.ecsCode.split(' ')[0]}</span>
                    <button
                      onClick={() => deactivate(row.sensorId)}
                      style={{
                        fontSize: 8, padding: '1px 6px', cursor: 'pointer',
                        background: 'transparent', border: '1px solid var(--border-dim)',
                        borderRadius: 3, color: 'var(--text-muted',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function ConfigSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#f59e0b' } as React.CSSProperties}
      />
    </div>
  );
}
