import React, { useState, useEffect } from 'react';

interface Props {
  cylIndex:        number;
  currentSeverity: number | undefined;
  onInject:        (cylIndex: number, severity: number) => void;
  onClear:         (cylIndex: number) => void;
  onClose:         () => void;
}

function cylLabel(idx: number): string {
  return idx < 10 ? `Cylinder A${idx + 1}` : `Cylinder B${idx - 9}`;
}

function severityLabel(level: number): string {
  if (level >= 80) return 'Severe';
  if (level >= 50) return 'Moderate';
  if (level >= 20) return 'Mild';
  return 'None';
}

const SFOC_BASE = 190;

export function CylinderDegradationPopup({ cylIndex, currentSeverity, onInject, onClear, onClose }: Props) {
  const [level, setLevel] = useState<number>(() =>
    currentSeverity !== undefined ? Math.round(currentSeverity * 100) : 20,
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sev           = level / 100;
  const cylTempImpact = (sev * 55).toFixed(1);
  const sfocImpact    = (sev * 4.5).toFixed(1);
  const sfocPct       = ((sev * 4.5 / SFOC_BASE) * 100).toFixed(1);
  const rackImpact    = (sev * 1.2).toFixed(2);
  const hasActiveFault = currentSeverity !== undefined;

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
        style={{ width: 460, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label-sm" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {cylLabel(cylIndex)}
            </span>
            {hasActiveFault && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                color: 'var(--risk-critical)',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 3, padding: '1px 6px',
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }}>
                FAULT ACTIVE
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 4,
            }}
          >×</button>
        </div>

        {/* Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="label-xs">Degradation Level</span>
            <span style={{
              fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: level > 0 ? 'var(--risk-critical)' : 'var(--text-muted)',
            }}>
              {level}% — {severityLabel(level)}
            </span>
          </div>
          <input
            type="range" min={0} max={100} step={5} value={level}
            onChange={e => setLevel(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'var(--risk-critical)' } as React.CSSProperties}
          />
        </div>

        {/* Impact preview */}
        <div style={{
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-dim)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
        }}>
          <div className="label-xs" style={{ marginBottom: 10 }}>Expected Parameter Impact</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
            <ImpactRow label="Cyl Exhaust Temp" value={`+${cylTempImpact}°C`} active={sev > 0} />
            <ImpactRow label="SFOC" value={`+${sfocImpact} g/kWh (+${sfocPct}%)`} active={sev > 0} />
            <ImpactRow label="Fuel Rack" value={`+${rackImpact} mm`} active={sev > 0} />
            <ImpactRow
              label="Other cylinders"
              value="No change"
              note="Localized fault"
              active={false}
              dimmed
            />
          </div>
          {sev > 0 && (
            <div style={{
              marginTop: 10, fontSize: 10, color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-dim)', paddingTop: 8,
            }}>
              Fault grows automatically at 0.3%/s — parameters will continue rising after injection.
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="mag-btn mag-btn-ghost"
            disabled={level === 0}
            onClick={() => { onInject(cylIndex, level / 100); onClose(); }}
            style={{
              flex: 1, padding: '9px 0',
              opacity: level === 0 ? 0.35 : 1,
              cursor: level === 0 ? 'default' : 'pointer',
              borderColor: level > 0 ? 'var(--risk-critical)' : undefined,
              color: level > 0 ? 'var(--risk-critical)' : undefined,
              background: level > 0 ? 'rgba(239,68,68,0.08)' : undefined,
            }}
          >
            Inject Fault
          </button>
          <button
            className="mag-btn mag-btn-ghost"
            disabled={!hasActiveFault}
            onClick={() => { onClear(cylIndex); onClose(); }}
            style={{
              flex: 1, padding: '9px 0',
              opacity: hasActiveFault ? 1 : 0.35,
              cursor: hasActiveFault ? 'pointer' : 'default',
            }}
          >
            Clear Fault
          </button>
        </div>
      </div>
    </div>
  );
}

function ImpactRow({ label, value, note, active, dimmed }: {
  label: string; value: string; note?: string; active: boolean; dimmed?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{
        fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: dimmed ? 'var(--text-muted)' : active ? 'var(--risk-warning)' : 'var(--text-muted)',
      }}>
        {value}
      </span>
      {note && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{note}</span>
      )}
    </div>
  );
}
