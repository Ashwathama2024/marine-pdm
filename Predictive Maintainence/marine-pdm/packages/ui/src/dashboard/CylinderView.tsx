import React, { useState, useEffect } from 'react';
import type { EngineSnapshot, DecisionOutput } from '@marine-pdm/shared';
import { useSensorFocus, CYLINDER_FOCUS_SENSOR } from '../context/SensorFocusContext';

function riskColor(risk: number): string {
  if (risk >= 75) return 'var(--risk-critical)';
  if (risk >= 50) return 'var(--risk-high)';
  if (risk >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

// Returns bar + glow colors based on fault intensity (0–100)
function faultColor(intensity: number): { bar: string; glow: string; dot: string } {
  if (intensity >= 70) return {
    bar:  'linear-gradient(to top, rgba(239,68,68,0.95), rgba(239,68,68,0.45))',
    glow: '0 0 10px rgba(239,68,68,0.60)',
    dot:  '#ef4444',
  };
  if (intensity >= 40) return {
    bar:  'linear-gradient(to top, rgba(249,115,22,0.90), rgba(249,115,22,0.40))',
    glow: '0 0 8px rgba(249,115,22,0.50)',
    dot:  '#f97316',
  };
  return {
    bar:  'linear-gradient(to top, rgba(245,158,11,0.80), rgba(245,158,11,0.30))',
    glow: '0 0 6px rgba(245,158,11,0.40)',
    dot:  '#f59e0b',
  };
}

export interface MtuCylFault { intensity: number; faultType: string }

interface Props {
  snap: EngineSnapshot;
  decision: DecisionOutput;
  activeFaults?: Record<number, number>;
  mtuCylFaults?: Record<number, MtuCylFault>;
  onCylinderClick?: (cylIndex: number) => void;
}

interface BankProps {
  label: string;
  cylTemps: number[];
  cylRisks: number[];
  offset: number;   // A=0 (labels A1..A10), B=10 (labels B1..B10)
  bankLetter: 'A' | 'B';
  activeFaults: Record<number, number>;
  mtuCylFaults: Record<number, MtuCylFault>;
  onCylinderClick?: (cylIndex: number) => void;
}

function CylinderBank({ label, cylTemps, cylRisks, offset, bankLetter, activeFaults, mtuCylFaults, onCylinderClick }: BankProps) {
  const temps = [...cylTemps];
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const range = Math.max(maxT - minT, 8);
  const mean = temps.reduce((a, b) => a + b, 0) / temps.length;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: 'var(--text-dim)',
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-dim)',
          borderRadius: 4, padding: '2px 7px',
        }}>
          BANK {bankLetter}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          mean {mean.toFixed(1)}°C · Δ{(maxT - minT).toFixed(1)}°C
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
        {temps.map((temp, i) => {
          const globalIdx = offset + i;
          const risk = cylRisks[globalIdx] ?? 0;
          const color = riskColor(risk);
          const barH = Math.max(10, ((temp - minT + 2) / (range + 4)) * 100);
          const devFromMean = temp - mean;
          const mtuFault = mtuCylFaults[globalIdx];
          const hasLegacyFault = activeFaults[globalIdx] !== undefined;
          const hasFault = mtuFault !== undefined || hasLegacyFault;
          const fc = mtuFault ? faultColor(mtuFault.intensity) : faultColor(100);

          return (
            <div
              key={i}
              title={mtuFault
                ? `${bankLetter}${i + 1}: ${mtuFault.faultType} ${mtuFault.intensity}% active`
                : hasFault
                  ? `${bankLetter}${i + 1}: fault injected — click to configure`
                  : `${bankLetter}${i + 1}: click to inject fault`}
              onClick={() => onCylinderClick?.(globalIdx)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                cursor: onCylinderClick ? 'pointer' : 'default',
                position: 'relative',
              }}
            >
              {hasFault && (
                <div style={{
                  position: 'absolute', top: -2, right: 0,
                  width: 6, height: 6, borderRadius: '50%',
                  background: fc.dot,
                  boxShadow: `0 0 6px ${fc.dot}CC`,
                  animation: 'pulse-dot 1.5s ease-in-out infinite',
                  zIndex: 2,
                }} />
              )}
              <div style={{ fontSize: 9, fontWeight: 700, color: hasFault ? fc.dot : color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {temp.toFixed(0)}
              </div>
              <div style={{
                flex: 1, width: '100%',
                background: 'var(--border-dim)',
                borderRadius: 3,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                overflow: 'hidden',
                position: 'relative',
                minHeight: 40,
              }}>
                <div style={{
                  width: '100%',
                  height: `${barH}%`,
                  background: hasFault ? fc.bar : `linear-gradient(to top, ${color}DD, ${color}55)`,
                  borderRadius: '2px 2px 0 0',
                  boxShadow: hasFault ? fc.glow : risk > 25 ? `0 0 8px ${color}88` : 'none',
                  transition: 'height 0.4s ease, background 0.4s ease',
                }} />
              </div>
              <div style={{
                fontSize: 9, color: Math.abs(devFromMean) > 8 ? 'var(--risk-warning)' : 'var(--text-muted)',
                fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {devFromMean >= 0 ? '+' : ''}{devFromMean.toFixed(0)}
              </div>
              <div style={{ fontSize: 9, color: hasFault ? fc.dot : 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                {bankLetter}{i + 1}
              </div>
              {mtuFault && (
                <div style={{ fontSize: 8, color: fc.dot, fontWeight: 700, lineHeight: 1, letterSpacing: '0.03em' }}>
                  {mtuFault.faultType} {mtuFault.intensity}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CylinderView({ snap, decision, activeFaults = {}, mtuCylFaults = {}, onCylinderClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { focus } = useSensorFocus();
  const exhaustFocused = focus === CYLINDER_FOCUS_SENSOR;
  // Per-cylinder temps ARE the exhaust breakdown — when the workspace focuses Exhaust,
  // drill in automatically. (No provider on the Dashboard → focus null → no effect.)
  useEffect(() => { if (exhaustFocused) setExpanded(true); }, [exhaustFocused]);

  const bankA = snap.cylTemps.slice(0, 10);
  const bankB = snap.cylTemps.slice(10, 20);

  const allTemps = snap.cylTemps;
  const maxTemp  = Math.max(...allTemps);
  const minTemp  = Math.min(...allTemps);
  const meanTemp = allTemps.reduce((a, b) => a + b, 0) / allTemps.length;
  const spread   = maxTemp - minTemp;

  // Find hottest cylinder
  const hottestIdx = allTemps.indexOf(maxTemp);
  const hottestBank = hottestIdx < 10 ? 'A' : 'B';
  const hottestNum  = hottestIdx < 10 ? hottestIdx + 1 : hottestIdx - 9;

  const mtuFaultCount = Object.keys(mtuCylFaults).length;
  const hasMtuFaults  = mtuFaultCount > 0;
  const borderColor   = hasMtuFaults
    ? 'rgba(239,68,68,0.45)'
    : exhaustFocused ? 'rgba(56,189,248,0.45)'
    : spread > 25 ? 'var(--risk-warning)' : 'var(--border-dim)';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'border-color 0.4s',
    }}>
      {/* Header */}
      <div style={{
        background: hasMtuFaults ? 'rgba(239,68,68,0.05)' : 'var(--bg-elevated)',
        borderBottom: `1px solid ${hasMtuFaults ? 'rgba(239,68,68,0.20)' : 'var(--border-dim)'}`,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
        userSelect: 'none',
      }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="label-sm" style={{ color: hasMtuFaults ? 'var(--risk-critical)' : undefined }}>
            Cylinder Exhaust Temps — 20V
          </div>
          {exhaustFocused && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent-blue)',
              background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.45)',
              borderRadius: 4, padding: '1px 6px',
            }}>
              ◎ EXHAUST FOCUS
            </span>
          )}
          <div style={{ display: 'flex', gap: 5 }}>
            <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-inset)', color: 'var(--text-dim)', border: '1px solid var(--border-dim)' }}>BANK A</span>
            <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-inset)', color: 'var(--text-dim)', border: '1px solid var(--border-dim)' }}>BANK B</span>
          </div>
          {hasMtuFaults && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              color: 'var(--risk-critical)',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: 3, padding: '1px 6px',
              animation: 'pulse-dot 1.5s ease-in-out infinite',
            }}>
              {mtuFaultCount} FAULT{mtuFaultCount > 1 ? 'S' : ''} ACTIVE
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            fontSize: 10,
            color: spread > 25 ? 'var(--risk-warning)' : 'var(--text-secondary)',
            fontWeight: 600,
          }}>
            Δ{spread.toFixed(1)}°C
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {expanded ? '▲' : '▼'}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px 10px' }}>
        {/* Compact summary row (always visible) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
          {[
            { label: 'Mean',   value: `${meanTemp.toFixed(1)}°C`,    accent: false },
            { label: 'Max',    value: `${maxTemp.toFixed(1)}°C`,     accent: maxTemp > 540 },
            { label: 'Min',    value: `${minTemp.toFixed(1)}°C`,     accent: false },
            { label: 'Hottest',value: `${hottestBank}${hottestNum}`,  accent: spread > 20 },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: 'var(--bg-inset)',
              border: `1px solid ${accent ? 'var(--risk-warning)' : 'var(--border-dim)'}`,
              borderRadius: 5, padding: '5px 8px', textAlign: 'center',
            }}>
              <div className="label-xs" style={{ marginBottom: 2 }}>{label}</div>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: accent ? 'var(--risk-warning)' : 'var(--text-primary)',
              }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Expanded: full bar charts for both banks */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CylinderBank
              label="Bank A"
              cylTemps={bankA}
              cylRisks={decision.cylRisks}
              offset={0}
              bankLetter="A"
              activeFaults={activeFaults}
              mtuCylFaults={mtuCylFaults}
              onCylinderClick={onCylinderClick}
            />
            <div style={{ height: 1, background: 'var(--border-dim)' }} />
            <CylinderBank
              label="Bank B"
              cylTemps={bankB}
              cylRisks={decision.cylRisks}
              offset={10}
              bankLetter="B"
              activeFaults={activeFaults}
              mtuCylFaults={mtuCylFaults}
              onCylinderClick={onCylinderClick}
            />
          </div>
        )}

        {/* Collapsed: mini inline bar per cylinder (10+10 in two rows) */}
        {!expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['A', 'B'].map((bank, bi) => {
              const temps = bi === 0 ? bankA : bankB;
              const minT  = Math.min(...temps);
              const maxT  = Math.max(...temps);
              const rng   = Math.max(maxT - minT, 8);
              return (
                <div key={bank} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 700, width: 12, flexShrink: 0 }}>{bank}</div>
                  {temps.map((temp, i) => {
                    const globalIdx = (bi * 10) + i;
                    const risk = decision.cylRisks[globalIdx] ?? 0;
                    const color = riskColor(risk);
                    const barH = Math.max(15, ((temp - minT + 1) / (rng + 2)) * 100);
                    const mtuFault = mtuCylFaults[globalIdx];
                    const hasFault = mtuFault !== undefined || activeFaults[globalIdx] !== undefined;
                    const fc = mtuFault ? faultColor(mtuFault.intensity) : faultColor(100);
                    return (
                      <div
                        key={i}
                        onClick={() => onCylinderClick?.(globalIdx)}
                        title={mtuFault ? `${bank}${i + 1}: ${mtuFault.faultType} ${mtuFault.intensity}%` : undefined}
                        style={{
                          flex: 1, height: 22, display: 'flex', flexDirection: 'column',
                          justifyContent: 'flex-end', alignItems: 'center', gap: 1,
                          position: 'relative',
                          cursor: onCylinderClick ? 'pointer' : 'default',
                        }}
                      >
                        {hasFault && (
                          <div style={{
                            position: 'absolute', top: 0, right: 0,
                            width: 4, height: 4, borderRadius: '50%',
                            background: fc.dot,
                            animation: 'pulse-dot 1.5s ease-in-out infinite',
                            zIndex: 2,
                          }} />
                        )}
                        <div style={{
                          width: '100%',
                          height: `${barH}%`,
                          background: hasFault ? fc.dot + 'CC' : `${color}CC`,
                          borderRadius: '2px 2px 0 0',
                          minHeight: 3,
                          transition: 'height 0.4s ease',
                        }} />
                        <div style={{ fontSize: 8, color: hasFault ? fc.dot : 'var(--text-dim)', lineHeight: 1 }}>
                          {i + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
