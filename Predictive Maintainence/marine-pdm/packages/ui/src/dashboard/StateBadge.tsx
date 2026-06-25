import React from 'react';
import type { EngineState } from '@marine-pdm/simulator';
import { STATE_BADGE } from '@marine-pdm/simulator';

interface Props {
  engineState: EngineState;
  compact?: boolean;
}

export function StateBadge({ engineState, compact = false }: Props) {
  const badge = STATE_BADGE[engineState];

  const pulse = badge.pulse
    ? { animation: 'statePulse 1.2s ease-in-out infinite' }
    : {};

  if (compact) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 4,
        background: `${badge.color}18`,
        border: `1px solid ${badge.color}60`,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
        color: badge.color, ...pulse,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: badge.color, flexShrink: 0,
        }} />
        {badge.label}
      </span>
    );
  }

  return (
    <>
      <style>{`@keyframes statePulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', borderRadius: 8,
        background: `${badge.color}10`,
        border: `1.5px solid ${badge.color}50`,
        ...pulse,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: badge.color,
          boxShadow: `0 0 6px ${badge.color}`,
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 1 }}>
            ENGINE STATE
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: badge.color }}>
            {badge.label}
          </div>
        </div>
      </div>
    </>
  );
}
