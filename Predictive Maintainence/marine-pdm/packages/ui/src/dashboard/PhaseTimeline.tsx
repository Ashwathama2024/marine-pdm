import React from 'react';
import type { EngineState } from '@marine-pdm/simulator';
import { STATE_BADGE } from '@marine-pdm/simulator';

const PHASES: EngineState[] = [
  'ENGINE_OFF', 'STANDBY', 'SAFETY_TURNING', 'CRANKING',
  'IDLE', 'WARMING', 'DECLUTCHED_RUN', 'CLUTCHING', 'CLUTCHED', 'LOADED',
];

const SHORT: Record<EngineState, string> = {
  ENGINE_OFF:     'OFF',
  STANDBY:        'STBY',
  SAFETY_TURNING: 'TURN',
  CRANKING:       'CRNK',
  IDLE:           'IDLE',
  WARMING:        'WARM',
  DECLUTCHED_RUN: 'DCLT',
  CLUTCHING:      'CLCH',
  CLUTCHED:       'CLTD',
  LOADED:         'LOAD',
  STOPPING:       'STOP',
};

interface Props {
  engineState: EngineState;
}

export function PhaseTimeline({ engineState }: Props) {
  const currentIdx = PHASES.indexOf(engineState);
  const isStopping = engineState === 'STOPPING';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
      {PHASES.map((phase, idx) => {
        const badge  = STATE_BADGE[phase];
        const passed = currentIdx > idx;
        const active = engineState === phase;

        let bg    = 'transparent';
        let col   = 'var(--text-dim)';
        let border = '1px solid var(--border)';

        if (active) { bg = `${badge.color}18`; col = badge.color; border = `1px solid ${badge.color}60`; }
        else if (passed) { col = '#4CAF5080'; border = '1px solid #4CAF5040'; }

        return (
          <React.Fragment key={phase}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '4px 8px', borderRadius: 5, minWidth: 44,
              background: bg, border, transition: 'all 0.3s',
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: col }}>
                {SHORT[phase]}
              </div>
            </div>
            {idx < PHASES.length - 1 && (
              <div style={{
                width: 12, height: 1, flexShrink: 0,
                background: passed ? '#4CAF5060' : 'var(--border)',
              }} />
            )}
          </React.Fragment>
        );
      })}
      {isStopping && (
        <>
          <div style={{ width: 12, height: 1, flexShrink: 0, background: '#FF3B3B60' }} />
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '4px 8px', borderRadius: 5, minWidth: 44,
            background: '#FF3B3B18', border: '1px solid #FF3B3B60',
            animation: 'statePulse 1s ease-in-out infinite',
          }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: '#FF3B3B' }}>STOP</div>
          </div>
        </>
      )}
    </div>
  );
}
