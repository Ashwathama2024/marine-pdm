import React from 'react';
import type { DecisionOutput } from '@marine-pdm/shared';

function riskColor(risk: number): string {
  if (risk >= 75) return 'var(--risk-critical)';
  if (risk >= 50) return 'var(--risk-high)';
  if (risk >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

function riskGlow(risk: number): string {
  if (risk >= 75) return 'var(--glow-critical-rgb)';
  if (risk >= 50) return 'var(--glow-high-rgb)';
  if (risk >= 25) return 'var(--glow-warning-rgb)';
  return 'var(--glow-normal-rgb)';
}

interface Props {
  decision: DecisionOutput;
  onConfirm: (patternId: string) => void;
  onFalsePositive: (patternId: string) => void;
}

export function AlertBar({ decision, onConfirm, onFalsePositive }: Props) {
  const active = decision.alerts.filter(a => a.riskScore > 25);

  if (active.length === 0) {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 'var(--alert-h)',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-dim)',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 20px',
        zIndex: 100,
      }}>
        {/* Green status ribbon on left */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'var(--risk-normal)',
        }} />
        <span className="live-dot" />
        <span style={{ fontSize: 11, color: 'var(--risk-normal)', fontWeight: 500 }}>
          All parameters nominal — no active alerts
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Risk {Math.round(decision.systemRisk)} · {decision.status}
        </span>
      </div>
    );
  }

  const maxRisk = Math.max(...active.map(a => a.riskScore));
  const barCol  = riskColor(maxRisk);
  const barGlow = riskGlow(maxRisk);

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--bg-surface)',
      borderTop: `1px solid rgba(${barGlow}, 0.4)`,
      boxShadow: `0 -4px 24px rgba(${barGlow}, 0.12)`,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 16px',
      minHeight: 'var(--alert-h)',
      zIndex: 100,
      overflowX: 'auto',
    }}>
      {/* Risk ribbon */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: barCol,
        boxShadow: `0 0 10px rgba(${barGlow}, 0.8)`,
      }} />

      {/* Alert count badge */}
      <div style={{
        flexShrink: 0,
        background: `rgba(${barGlow}, 0.12)`,
        border: `1px solid rgba(${barGlow}, 0.4)`,
        borderRadius: 4, padding: '4px 10px',
        fontSize: 11, fontWeight: 700, color: barCol,
        letterSpacing: '0.06em',
      }}>
        ⚠ {active.length} ALERT{active.length > 1 ? 'S' : ''}
      </div>

      {/* Individual alert chips */}
      {active.map((alert, i) => {
        const ac  = riskColor(alert.riskScore);
        const ag  = riskGlow(alert.riskScore);
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: `rgba(${ag}, 0.07)`,
            border: `1px solid rgba(${ag}, 0.35)`,
            borderRadius: 5,
            padding: '5px 10px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: ac }}>
              {alert.component}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {alert.issue}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {Math.round(alert.riskScore)} · {(alert.confidence * 100).toFixed(0)}%
            </span>
            {alert.ecsAlarmCode && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px',
                borderRadius: 2, border: `1px solid rgba(${ag},0.5)`,
                color: ac, background: `rgba(${ag},0.1)`,
                letterSpacing: '0.03em',
              }}>
                {alert.ecsAlarmCode}
              </span>
            )}
            {alert.maintenanceTask && (
              <span style={{
                fontSize: 8, padding: '1px 5px',
                borderRadius: 2, border: '1px solid var(--border-dim)',
                color: 'var(--text-muted)', background: 'var(--bg-elevated)',
              }}>
                {alert.maintenanceTask.split('—')[0].trim()}
              </span>
            )}
            {alert.patternId && (
              <>
                <button
                  className="mag-btn"
                  onClick={() => onConfirm(alert.patternId!)}
                  style={{
                    fontSize: 9, padding: '3px 8px',
                    background: 'transparent',
                    color: 'var(--risk-normal)',
                    border: '1px solid rgba(0,212,170,0.4)',
                    borderRadius: 3,
                    transition: 'all 0.15s',
                  }}
                >
                  ✓
                </button>
                <button
                  className="mag-btn"
                  onClick={() => onFalsePositive(alert.patternId!)}
                  style={{
                    fontSize: 9, padding: '3px 8px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                    transition: 'all 0.15s',
                  }}
                >
                  ✗
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
