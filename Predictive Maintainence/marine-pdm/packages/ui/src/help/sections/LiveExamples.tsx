// packages/ui/src/help/sections/LiveExamples.tsx
//
// Small LIVE widgets that read the running engine via useEngine(), used inside the manual to show a
// real, annotated example next to the explanation of how to read it. All are null-guarded so they
// render a static placeholder during pre-start (before the first snapshot).

import React from 'react';
import { MTU8000_LIMITS as LIM } from '@marine-pdm/shared';
import { useEngine } from '../../context/EngineContext';
import { LiveBadge } from '../HelpPrimitives';

function riskColor(r: number): string {
  if (r >= 75) return 'var(--risk-critical)';
  if (r >= 50) return 'var(--risk-high)';
  if (r >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

// ── Live KPI strip — RPM / Load / System risk / Status, mirroring the header ─────────
export function LiveKpiStrip() {
  const { snapshot, decision, isOperational } = useEngine();
  const kpi = (label: string, value: string, color = 'var(--text-primary)') => (
    <div className="card" style={{ padding: '9px 13px', flex: 1, minWidth: 96 }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
  const status = decision?.status ?? 'CONNECTING';
  const risk = decision ? Math.round(decision.systemRisk) : 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <LiveBadge />
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
          These read the engine right now — start it (Quick Start) to see them move.
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {kpi('Engine RPM', snapshot ? snapshot.rpm.toFixed(0) : '—', 'var(--accent-blue)')}
        {kpi('Load', snapshot ? `${snapshot.load.toFixed(0)}%` : '—', 'var(--risk-normal)')}
        {kpi('System Risk', isOperational && decision ? String(risk) : '—', riskColor(risk))}
        {kpi('Status', isOperational ? status : 'PRE-START', isOperational ? riskColor(risk) : 'var(--text-dim)')}
      </div>
    </div>
  );
}

// ── Annotated live gauge — exhaust temperature on a banded scale with callouts ───────
export function LiveGaugeAnnotated() {
  const { snapshot, isOperational } = useEngine();
  const value = snapshot?.exhaustTemp ?? 0;

  // Zones read from MTU8000_LIMITS, never typed in: this illustration carried a hardcoded 460/530
  // pair and went stale the moment the exhaust band was corrected to its OEM curve-10 value. The
  // scale top follows the band so the upper zone stays on the chart.
  const HI = LIM.exhaust.mean_hi;        // MTU curve 10 at rated
  const SS = LIM.exhaust.critical_max;   // the coded +20 °C offset escalation above it
  const MIN = 200, MAX = Math.ceil((SS + 20) / 20) * 20;
  const W = 560, H = 120, padL = 12, padR = 12, barY = 58, barH = 18;
  const usableW = W - padL - padR;
  const x = (v: number) => padL + ((Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN)) * usableW;

  const zones: { from: number; to: number; color: string }[] = [
    { from: MIN, to: HI, color: 'rgba(0,212,170,0.35)' },   // normal (green)
    { from: HI, to: SS, color: 'rgba(245,158,11,0.40)' },   // HI band (yellow)
    { from: SS, to: MAX, color: 'rgba(239,68,68,0.45)' },   // escalation (red)
  ];
  const needleX = x(value);

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <LiveBadge />
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600 }}>Sample gauge — Mean Exhaust Temp</span>
        <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 700, color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>
          {isOperational ? `${value.toFixed(0)} °C` : 'PRE-START'}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
        {/* zone bands */}
        {zones.map((z, i) => (
          <rect key={i} x={x(z.from)} y={barY} width={x(z.to) - x(z.from)} height={barH} fill={z.color} />
        ))}
        <rect x={padL} y={barY} width={usableW} height={barH} fill="none" stroke="var(--border)" />
        {/* scale ticks */}
        {[MIN, 400, 600, HI, SS].map(t => (
          <g key={t}>
            <line x1={x(t)} y1={barY + barH} x2={x(t)} y2={barY + barH + 5} stroke="var(--text-dim)" />
            <text x={x(t)} y={barY + barH + 16} fontSize="9" fill="var(--text-dim)" textAnchor="middle">{t}</text>
          </g>
        ))}
        {/* needle */}
        {isOperational && (
          <g>
            <line x1={needleX} y1={barY - 8} x2={needleX} y2={barY + barH + 2} stroke="var(--accent-blue)" strokeWidth="2.5" />
            <polygon points={`${needleX - 5},${barY - 8} ${needleX + 5},${barY - 8} ${needleX},${barY - 1}`} fill="var(--accent-blue)" />
          </g>
        )}
        {/* callouts */}
        <text x={x(MIN + (HI - MIN) / 2)} y={30} fontSize="10" fill="var(--risk-normal)" textAnchor="middle">NORMAL envelope</text>
        <text x={x(HI + (SS - HI) / 2)} y={30} fontSize="10" fill="var(--risk-warning)" textAnchor="middle">HI mean {HI} °C</text>
        <text x={x(MAX)} y={44} fontSize="9" fill="var(--risk-critical)" textAnchor="end">+{SS - HI} °C offset</text>
      </svg>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 6 }}>
        The <span style={{ color: 'var(--accent-blue)' }}>blue needle</span> is the live value. Green is the
        normal band, yellow is the pre-alarm (HI) band, red is the emergency-stop threshold. On the real
        dashboard gauges the same idea is drawn as a radial dial plus a rolling sparkline of the last minute.
      </div>
    </div>
  );
}
