import React from 'react';
import { useEngine } from '../context/EngineContext';

const MIN_START_BAR  = 14;   // minimum pressure required for start
const RATED_START_BAR = 25;  // full bottle charge

function ArcGauge({ pct, color, label, value, unit }: {
  pct: number; color: string; label: string; value: string; unit: string;
}) {
  const r = 38;
  const cx = 50, cy = 54;
  const startAngle = -200;
  const sweepDeg   = 220;
  const endAngle   = startAngle + sweepDeg * Math.min(1, Math.max(0, pct));

  const toXY = (deg: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180),
  });

  const p0 = toXY(startAngle);
  const p1 = toXY(endAngle);
  const largeArc = sweepDeg * pct > 180 ? 1 : 0;

  const trackPath = `M ${toXY(startAngle).x} ${toXY(startAngle).y} A ${r} ${r} 0 1 1 ${toXY(startAngle + sweepDeg).x} ${toXY(startAngle + sweepDeg).y}`;
  const valuePath = pct > 0 ? `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}` : '';

  return (
    <svg viewBox="0 0 100 72" style={{ width: 110, height: 80 }}>
      {/* Track */}
      <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeLinecap="round" />
      {/* Value arc */}
      {valuePath && (
        <path d={valuePath} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
      )}
      {/* Center text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="13" fontWeight="700" fontFamily="monospace">
        {value}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="7" fontFamily="monospace">
        {unit}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="6.5" fontFamily="monospace" letterSpacing="0.5">
        {label}
      </text>
    </svg>
  );
}

export function StartAirGauge() {
  const { startSeq, engineControls } = useEngine();
  const bar = startSeq.startAirBar;
  const pct = bar / RATED_START_BAR;
  const ok  = bar >= MIN_START_BAR;
  const color = !ok ? '#ef4444' : bar > 20 ? '#00C878' : '#FFD700';

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 14,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 10 }}>
        START AIR BOTTLE
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ArcGauge
          pct={pct}
          color={color}
          label="START AIR"
          value={bar.toFixed(1)}
          unit="bar"
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 6 }}>
            Set pressure:
          </div>
          <input
            type="range" min={0} max={30} step={0.5} value={bar}
            onChange={e => engineControls.setStartAir(+e.target.value)}
            style={{ width: '100%', accentColor: color }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>0 bar</span>
            <span style={{ fontSize: 7, color: ok ? '#00C878' : '#ef4444', fontWeight: 700 }}>
              MIN {MIN_START_BAR} bar required
            </span>
            <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>30 bar</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 8, color: 'var(--text-secondary)' }}>
            Attempts remaining:{' '}
            <span style={{ color: startSeq.attemptsRemaining > 0 ? '#00C878' : '#ef4444', fontWeight: 700 }}>
              {startSeq.attemptsRemaining} / 3
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
