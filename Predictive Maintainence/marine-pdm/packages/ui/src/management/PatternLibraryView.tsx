import React, { useState } from 'react';
import type { PatternLibrary } from '@marine-pdm/knowledge';
import type { FaultPattern } from '@marine-pdm/shared';

interface Props {
  patternLibrary: PatternLibrary;
}

export function PatternLibraryView({ patternLibrary }: Props) {
  const [patterns, setPatterns] = useState<FaultPattern[]>(() => patternLibrary.getAll());

  function refresh() {
    setPatterns(patternLibrary.getAll());
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        Fault Pattern Library
      </div>
      {patterns.map(p => {
        const fpRate = p.timesTriggered > 0 ? p.timesFalsePositive / p.timesTriggered : 0;
        const suggestion = patternLibrary.getSuggestedThresholdAdjustment(p.id);

        return (
          <div key={p.id} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '12px 14px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Window: {p.actionWindow}
              </div>
            </div>

            {/* Conditions */}
            <div style={{ marginBottom: 8 }}>
              {p.conditions.map((c, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', paddingLeft: 8 }}>
                  — {c.tag} {c.metric} {c.operator} {c.threshold}
                </div>
              ))}
            </div>

            {/* Performance stats */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              background: 'var(--bg-main)', borderRadius: 4, padding: '8px 10px',
              marginBottom: suggestion ? 8 : 0,
            }}>
              {[
                { label: 'Triggered', value: p.timesTriggered, color: 'var(--text-primary)' },
                { label: 'Confirmed', value: p.timesConfirmed, color: 'var(--risk-normal)' },
                { label: 'False +ve', value: p.timesFalsePositive, color: fpRate > 0.3 ? 'var(--risk-critical)' : 'var(--text-muted)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {suggestion && (
              <div style={{
                fontSize: 10, color: 'var(--risk-warning)',
                background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)',
                borderRadius: 3, padding: '6px 8px',
              }}>
                ⚠ {suggestion}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
