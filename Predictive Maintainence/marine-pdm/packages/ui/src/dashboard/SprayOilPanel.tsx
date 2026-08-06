// Spray-oil temperatures B77.11–B77.20 (ECS channels B1–B10), one per crank throw.
//
// Presented as ten channels rather than one arc gauge, because that is the shape of the parameter:
// MTU codes no absolute band for it at all, only T-Splash Oil Difference Lim1 4 °C / Lim2 6 °C, and
// the ECS names the offending channel ("HI T-Splash Oil B7"). A single arc could show the deviation
// but never which throw produced it, which is the one thing an engineer needs before opening a
// crankcase door.
//
// Why it earns dashboard space: the oil thrown off a big end warms before the bearing casting does,
// so this deviation moves ahead of HI T-Bearing on the same fault. It is the earliest bearing
// distress signal the engine has.

import React from 'react';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { MTU8000, MTU8000_LIMITS, sprayOilDeviation, sprayOilTemps } from '@marine-pdm/shared';

const WARN = MTU8000_LIMITS.sprayOil.diff_warn;
const TRIP = MTU8000_LIMITS.sprayOil.diff_shutdown;

function devColor(dev: number): string {
  if (dev > TRIP) return 'var(--risk-critical)';
  if (dev > WARN) return 'var(--risk-high)';
  if (dev > WARN * 0.5) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

interface Props {
  snap: EngineSnapshot;
  isOperational?: boolean;
}

export function SprayOilPanel({ snap, isOperational = true }: Props) {
  const temps = sprayOilTemps(snap);
  const { dev, channel, mean } = sprayOilDeviation(temps);
  const dimmed = !isOperational;

  if (temps.length === 0) return null;

  // Each channel is drawn by its OWN deviation from the mean, not its absolute temperature — a
  // common offset (cold oil, high load) moves all ten together and is not a fault. This is the same
  // reasoning that makes the alarm differential.
  const devs = temps.map(t => t - mean);
  const scale = Math.max(TRIP, ...devs.map(Math.abs)) * 1.15;

  return (
    <div className="glass-card" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <div className="label-xs" style={{ opacity: 0.7 }}>
          SPRAY OIL SPREAD — B77.11–B77.20
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          mean {dimmed ? '—' : `${mean.toFixed(1)} °C`}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: dimmed ? 'var(--text-dim)' : devColor(dev),
          }}
        >
          {dimmed ? '—' : `+${dev.toFixed(1)}`}
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}> °C max dev</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {devs.map((d, i) => {
          const isHot = !dimmed && i === channel && dev > WARN * 0.5;
          const height = Math.min(100, (Math.abs(d) / scale) * 100);
          return (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  height: 46,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                }}
              >
                <div
                  title={`B${i + 1} · B77.${i + 11} · ${temps[i]!.toFixed(1)} °C · ${d >= 0 ? '+' : ''}${d.toFixed(1)} vs mean`}
                  style={{
                    height: `${height}%`,
                    minHeight: 2,
                    background: dimmed ? 'var(--text-dim)' : devColor(d > 0 ? d : 0),
                    opacity: d < 0 ? 0.35 : 1,   // channels BELOW the mean cannot alarm — the limit is ↑
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 240ms ease',
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 9,
                  marginTop: 3,
                  color: isHot ? devColor(dev) : 'var(--text-muted)',
                  fontWeight: isHot ? 700 : 400,
                }}
              >
                B{i + 1}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
        {dimmed
          ? `${MTU8000.CRANK_THROWS} crank throws · engine stopped`
          : dev > TRIP
            ? `SS T-Splash Oil B${channel + 1} — ${dev.toFixed(1)} °C above mean, past the ${TRIP} °C shutdown`
            : dev > WARN
              ? `HI T-Splash Oil B${channel + 1} — ${dev.toFixed(1)} °C above mean, past the ${WARN} °C warning`
              : `within limits · warning at +${WARN} °C, shutdown at +${TRIP} °C`}
      </div>
    </div>
  );
}
