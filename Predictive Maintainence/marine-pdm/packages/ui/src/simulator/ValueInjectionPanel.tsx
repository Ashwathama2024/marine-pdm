import React from 'react';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { ALARM_LIMITS } from '@marine-pdm/shared';
import { useManualOverride } from '../context/ManualOverrideContext';

const OVERRIDE_SENSORS: Array<{
  field: keyof EngineSnapshot; label: string; unit: string; min: number; max: number; step: number; group: string;
}> = [
  { field: 'exhaustTemp',        label: 'Exhaust Temp',     unit: '°C',  min: ALARM_LIMITS.exhaustTemp.physMin,        max: ALARM_LIMITS.exhaustTemp.physMax,        step: 1,    group: 'Exhaust' },
  { field: 'chargeAirTemp',      label: 'Charge Air Temp',  unit: '°C',  min: ALARM_LIMITS.chargeAirTemp.physMin,      max: ALARM_LIMITS.chargeAirTemp.physMax,      step: 0.5,  group: 'Exhaust' },
  { field: 'jacketOutlet',       label: 'Jacket Outlet',    unit: '°C',  min: ALARM_LIMITS.jacketOutlet.physMin,       max: ALARM_LIMITS.jacketOutlet.physMax,       step: 0.5,  group: 'Cooling' },
  { field: 'lubeOilPressure',    label: 'LO Pressure',      unit: 'bar', min: ALARM_LIMITS.lubeOilPressure.physMin,    max: ALARM_LIMITS.lubeOilPressure.physMax,    step: 0.1,  group: 'LO' },
  { field: 'loFilterDP',         label: 'LO Filter ΔP',     unit: 'bar', min: ALARM_LIMITS.loFilterDP.physMin,         max: ALARM_LIMITS.loFilterDP.physMax,         step: 0.01, group: 'LO' },
  { field: 'pistonCoolingPress', label: 'Piston Cool P',    unit: 'bar', min: ALARM_LIMITS.pistonCoolingPress.physMin, max: ALARM_LIMITS.pistonCoolingPress.physMax, step: 0.1,  group: 'LO' },
  { field: 'scavengeAir',        label: 'Charge Air Press', unit: 'bar', min: ALARM_LIMITS.scavengeAir.physMin,        max: ALARM_LIMITS.scavengeAir.physMax,        step: 0.05, group: 'Air' },
  { field: 'fuelOilPressure',    label: 'FO Pressure',      unit: 'bar', min: ALARM_LIMITS.fuelOilPressure.physMin,    max: ALARM_LIMITS.fuelOilPressure.physMax,    step: 0.1,  group: 'Fuel' },
  { field: 'tcRPM',              label: 'TC Speed (A1)',    unit: 'RPM', min: ALARM_LIMITS.tcRPM.physMin,              max: ALARM_LIMITS.tcRPM.physMax,              step: 100,  group: 'TC' },
];

const GROUPS = ['Exhaust', 'Cooling', 'LO', 'Air', 'Fuel', 'TC'];

export function ValueInjectionPanel() {
  const { overrides, setOverride, clearOverride, clearAll, hasAny } = useManualOverride();
  const activeCount = Object.keys(overrides).length;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${hasAny ? 'rgba(129,140,248,0.35)' : 'var(--border-dim)'}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'border-color 0.4s',
    }}>
      {/* Header */}
      <div style={{
        background: hasAny ? 'rgba(129,140,248,0.06)' : 'var(--bg-elevated)',
        borderBottom: `1px solid ${hasAny ? 'rgba(129,140,248,0.20)' : 'var(--border-dim)'}`,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="label-sm" style={{ color: hasAny ? '#818CF8' : undefined }}>
            Value Injection
          </span>
          {hasAny && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              color: '#818CF8', background: 'rgba(129,140,248,0.12)',
              border: '1px solid rgba(129,140,248,0.3)',
              borderRadius: 3, padding: '1px 6px',
              animation: 'pulse-dot 1.5s ease-in-out infinite',
            }}>
              {activeCount} OVERRIDE{activeCount > 1 ? 'S' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label-xs">MANUAL SENSOR OVERRIDE</span>
          {hasAny && (
            <button
              onClick={clearAll}
              style={{
                fontSize: 8, padding: '3px 9px', cursor: 'pointer', fontFamily: 'var(--font)',
                background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.35)',
                borderRadius: 3, color: '#818CF8', fontWeight: 700, letterSpacing: '0.06em',
              }}
            >
              CLEAR ALL
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 10 }}>
          Override raw sensor values — bypasses physics engine. Use to force alarm conditions or test AI decision thresholds.
        </div>

        {/* Sensor grid grouped by system */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 12px' }}>
          {GROUPS.map(group => {
            const sensors = OVERRIDE_SENSORS.filter(s => s.group === group);
            return (
              <React.Fragment key={group}>
                {/* Group label as first-of-group marker */}
                {sensors.map((s, i) => {
                  const active = overrides[s.field] != null;
                  return (
                    <div key={String(s.field)} style={{ position: 'relative' }}>
                      {i === 0 && (
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 2 }}>
                          {group.toUpperCase()}
                        </div>
                      )}
                      <div style={{
                        background: active ? 'rgba(129,140,248,0.07)' : 'var(--bg-elevated)',
                        border: `1px solid ${active ? 'rgba(129,140,248,0.40)' : 'var(--border-dim)'}`,
                        borderRadius: 5, padding: '6px 8px',
                        transition: 'all 0.2s',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: active ? '#818CF8' : 'var(--text-dim)', fontWeight: active ? 700 : 400 }}>
                            {active && <span style={{ marginRight: 3 }}>●</span>}{s.label}
                          </span>
                          <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{s.unit}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number"
                            min={s.min} max={s.max} step={s.step}
                            placeholder="—"
                            value={overrides[s.field] != null ? String(overrides[s.field]) : ''}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) setOverride(s.field, v);
                              else clearOverride(s.field);
                            }}
                            style={{
                              flex: 1, padding: '3px 6px', fontSize: 10,
                              borderColor: active ? 'rgba(129,140,248,0.5)' : undefined,
                              background: 'var(--bg-card)',
                            }}
                          />
                          {active && (
                            <button
                              onClick={() => clearOverride(s.field)}
                              style={{
                                background: 'none', border: 'none',
                                color: '#818CF8', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1,
                              }}
                              title="Clear override"
                            >×</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
