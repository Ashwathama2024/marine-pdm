import React, { useState, useEffect } from 'react';
import type { EngineSnapshot, BaselineSnapshot } from '@marine-pdm/shared';
// Sequential-TC state lives in services/turbo-state.ts so the 3D engine view shows the same four
// turbochargers rather than reading tcSpeeds[] and disagreeing. Behaviour here is unchanged.
import {
  TC_META,
  REF,
  INITIAL_CUTIN,
  nextCutInState,
  deriveTCInfos,
  turboWheelPeriodS,
  type TCInfo,
  type TCStatus,
} from '../services/turbo-state';

// ── SVG Turbocharger Wheel ────────────────────────────────────────────────────
function makeBladePath(
  cx: number, cy: number,
  rI: number, rO: number,
  angleBase: number, n: number,
): string {
  const sector   = 360 / n;
  const sweep    = sector * 0.68;
  const backSwp  = 14;  // outer leading edge sweeps back — backward-curved blades
  const toRad    = (d: number) => (d * Math.PI) / 180;

  const a1 = toRad(angleBase);
  const a2 = toRad(angleBase + sweep);
  const a3 = toRad(angleBase - backSwp);  // outer leading (swept back)
  const a4 = toRad(angleBase + sweep);    // outer trailing

  const ix1 = cx + rI * Math.cos(a1); const iy1 = cy + rI * Math.sin(a1);
  const ix2 = cx + rI * Math.cos(a2); const iy2 = cy + rI * Math.sin(a2);
  const ox1 = cx + rO * Math.cos(a3); const oy1 = cy + rO * Math.sin(a3);
  const ox2 = cx + rO * Math.cos(a4); const oy2 = cy + rO * Math.sin(a4);

  return `M${ix1.toFixed(2)} ${iy1.toFixed(2)} L${ix2.toFixed(2)} ${iy2.toFixed(2)} L${ox2.toFixed(2)} ${oy2.toFixed(2)} L${ox1.toFixed(2)} ${oy1.toFixed(2)} Z`;
}

interface WheelProps {
  id: string;
  displaySpeed: number;  // scaled RPM for this TC
  status: TCStatus;
  size?: number;
  reducedMotion?: boolean;
  // True when the ENGINE itself is stopped (no exhaust flow at all) — freezes the wheel entirely.
  // Distinct from status==='STANDBY' while the engine is running (a load-switched-out TC still
  // windmills slowly from residual flow with its bypass valve closed).
  stopped?: boolean;
}

function TurboWheel({ id, displaySpeed, status, size = 72, reducedMotion = false, stopped = false }: WheelProps) {
  const cx = size / 2;  const cy = size / 2;
  const rO = size * 0.43;
  const rI = size * 0.16;
  const rHub = size * 0.09;
  const N = 7;

  const color = status === 'ACTIVE'  ? '#22C55E'
              : status === 'ALARM'   ? '#EF4444'
              : '#475569';

  const glowColor = status === 'ACTIVE' ? 'rgba(34,197,94,0.35)'
                  : status === 'ALARM'  ? 'rgba(239,68,68,0.45)'
                  : 'transparent';

  // Animation: map display speed → rotation period. Shared with the 3D view so both spin alike.
  const periodS = turboWheelPeriodS(displaySpeed, status);

  const blades = Array.from({ length: N }, (_, i) => makeBladePath(cx, cy, rI, rO, (i / N) * 360, N));

  const filterId = `glow-${id}`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={status !== 'STANDBY' ? '3' : '0'} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer casing ring */}
      <circle cx={cx} cy={cy} r={rO + 3}
        fill="none" stroke={color} strokeWidth="1.5"
        opacity={status === 'STANDBY' ? 0.18 : 0.55} />

      {/* Glow halo */}
      {status !== 'STANDBY' && (
        <circle cx={cx} cy={cy} r={rO + 7}
          fill="none" stroke={glowColor} strokeWidth="6"
          style={{ filter: 'blur(6px)' }} />
      )}

      {/* Rotating wheel group — uses SVG-native animateTransform (no CSS keyframes) */}
      <g filter={status !== 'STANDBY' ? `url(#${filterId})` : undefined}>
        {blades.map((d, i) => (
          <path key={i} d={d} fill={color}
            opacity={status === 'STANDBY' ? 0.22 : 0.88} />
        ))}
        {/* Hub outer */}
        <circle cx={cx} cy={cy} r={rHub * 1.5} fill={color}
          opacity={status === 'STANDBY' ? 0.22 : 0.95} />
        {/* Hub center (dark void) */}
        <circle cx={cx} cy={cy} r={rHub * 0.65} fill="var(--bg-main)" />

        {/* SVG-native rotation — no CSS keyframes, no transform-origin quirks */}
        {!reducedMotion && !stopped && (
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur={`${periodS}s`}
            repeatCount="indefinite"
            additive="sum"
          />
        )}
      </g>

      {/* Standby overlay: ✕ mark */}
      {status === 'STANDBY' && (
        <g opacity={0.6}>
          <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6}
            stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={cx + 6} y1={cy - 6} x2={cx - 6} y2={cy + 6}
            stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

// ── Active-TC count badge ─────────────────────────────────────────────────────
function ActiveCount({ statuses }: { statuses: TCStatus[] }) {
  const n = statuses.filter(s => s === 'ACTIVE').length;
  const alarm = statuses.some(s => s === 'ALARM');
  const color = alarm ? '#EF4444' : n === 4 ? '#22C55E' : n >= 2 ? '#F59E0B' : '#64748B';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}22`, border: `1px solid ${color}55`,
      borderRadius: 4, padding: '1px 6px', letterSpacing: '0.06em',
    }}>
      {alarm ? '⚠ ALARM' : `${n}/4 ACTIVE`}
    </span>
  );
}

// ── Compact TC chip (used in compact strip) ───────────────────────────────────
function TCChip({ meta, status, displaySpeed, compact = false }: {
  meta: typeof TC_META[number];
  status: TCStatus;
  displaySpeed: number;
  compact?: boolean;
}) {
  const color = status === 'ACTIVE'  ? '#22C55E'
              : status === 'ALARM'   ? '#EF4444'
              : '#475569';
  const bg    = status === 'ACTIVE'  ? 'rgba(34,197,94,0.08)'
              : status === 'ALARM'   ? 'rgba(239,68,68,0.10)'
              : 'rgba(71,85,105,0.06)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 3, padding: compact ? '6px 8px' : '8px 10px',
      background: bg,
      border: `1px solid ${color}44`,
      borderRadius: 8,
      minWidth: compact ? 56 : 70,
      transition: 'background 0.4s ease, border-color 0.4s ease',
    }}>
      {/* Status dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: color,
          boxShadow: status !== 'STANDBY' ? `0 0 6px ${color}` : 'none',
          display: 'inline-block',
          transition: 'background 0.4s ease',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>{meta.name}</span>
      </div>

      {/* Status label */}
      <div style={{ fontSize: 8, fontWeight: 600, color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {status === 'ACTIVE' ? 'CUT-IN' : status === 'ALARM' ? 'ALARM' : 'CUT-OFF'}
      </div>

      {/* Speed */}
      <div style={{
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        color: status === 'STANDBY' ? 'var(--text-dim)' : color,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600,
      }}>
        {status === 'STANDBY'
          ? '—'
          : `${Math.round(displaySpeed / 1000).toFixed(0)}k`
        } <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>RPM</span>
      </div>
    </div>
  );
}

// ── Expanded Modal ────────────────────────────────────────────────────────────
interface ModalProps {
  snap: EngineSnapshot;
  tcInfos: TCInfo[];
  onClose: () => void;
}

function TurboModal({ snap, tcInfos, onClose }: ModalProps) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const engineOff = snap.rpm <= 0;

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const activeCount = tcInfos.filter(t => t.status === 'ACTIVE').length;

  const statusColor = (s: TCStatus) =>
    s === 'ACTIVE' ? '#22C55E' : s === 'ALARM' ? '#EF4444' : '#64748B';

  // Group by side
  const aSide = tcInfos.filter((_, i) => i === 0 || i === 1); // A1, A2
  const bSide = tcInfos.filter((_, i) => i === 2 || i === 3); // B1, B2

  function SidePanel({ label, tcs, startIdx }: { label: string; tcs: TCInfo[]; startIdx: number }) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: 12,
        padding: '14px 16px',
        background: 'var(--bg-inset)',
        borderRadius: 10,
        border: '1px solid var(--border-dim)',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>{label} — SIDE</div>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          {tcs.map((tc, j) => {
            const tcIdx = startIdx + j;
            const col = statusColor(tc.status);
            return (
              <div key={tc.name} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '12px 10px',
                borderRadius: 10,
                background: tc.status === 'ACTIVE'  ? 'rgba(34,197,94,0.06)'
                           : tc.status === 'ALARM'  ? 'rgba(239,68,68,0.08)'
                           : 'rgba(255,255,255,0.02)',
                border: `1px solid ${col}33`,
                minWidth: 120,
                transition: 'background 0.5s ease',
              }}>
                {/* Animated wheel */}
                <TurboWheel
                  id={`modal-tc${tcIdx}`}
                  displaySpeed={tc.displaySpeed}
                  status={tc.status}
                  size={96}
                  reducedMotion={reducedMotion}
                  stopped={engineOff}
                />

                {/* TC identity */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: col, letterSpacing: '0.04em',
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    {tc.name}
                  </div>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.1em', marginTop: 1 }}>
                    {TC_META[tcIdx]!.label}
                  </div>
                </div>

                {/* Status badge */}
                <div style={{
                  fontSize: 9, fontWeight: 700, color: col,
                  background: `${col}18`,
                  border: `1px solid ${col}55`,
                  borderRadius: 4,
                  padding: '2px 8px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  {tc.status === 'ACTIVE' ? 'CUT-IN' : tc.status === 'ALARM' ? '⚠ ALARM' : 'CUT-OFF'}
                </div>

                {/* Speed readout */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 22, fontWeight: 700,
                    color: tc.status === 'STANDBY' ? 'var(--text-dim)' : col,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                  }}>
                    {tc.status === 'STANDBY'
                      ? '—'
                      : Math.round(tc.displaySpeed).toLocaleString()
                    }
                  </div>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>RPM</div>
                </div>

                {/* Deviation flag */}
                {tc.status === 'ALARM' && (
                  <div style={{
                    fontSize: 8, color: '#EF4444',
                    background: 'rgba(239,68,68,0.1)',
                    borderRadius: 3, padding: '2px 6px',
                    fontWeight: 600,
                  }}>
                    Δ {tc.deviation >= 0 ? '+' : ''}{Math.round(tc.deviation)} RPM
                  </div>
                )}

                {/* Cut-in condition (for switchable TCs) */}
                {TC_META[tcIdx]!.type === 'switchable' && (
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>
                    {tc.status === 'ACTIVE'
                      ? `Active ≥ ${TC_META[tcIdx]!.cutInRpm} RPM`
                      : `Cuts in at ${TC_META[tcIdx]!.cutInRpm} eng. RPM`
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="overlay-backdrop"
      onClick={onClose}
      style={{ zIndex: 60 }}
    >
      <div
        className="glass-card-hi"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(760px, 96vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em',
              textTransform: 'uppercase', marginBottom: 3 }}>
              MTU 20V 8000 M71 / M91 — ECU-4 Sequential Turbocharging
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '0.06em' }}>
              TURBOCHARGER SYSTEM
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 22, padding: '0 4px', lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>

        {/* ── Engine state row ── */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          background: 'var(--bg-inset)', borderRadius: 8, padding: '8px 14px',
          fontSize: 10, color: 'var(--text-secondary)',
        }}>
          {[
            { label: 'ENGINE', value: `${Math.round(snap.rpm)} RPM` },
            { label: 'LOAD',   value: `${snap.load.toFixed(1)} %` },
            { label: 'TURBOS ACTIVE', value: `${activeCount} / 4` },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: 8, letterSpacing: '0.1em',
                textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)',
                fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
              <span style={{ color: 'var(--border)', fontSize: 14, lineHeight: 1, marginLeft: 4 }}>│</span>
            </div>
          ))}
        </div>

        {/* ── TC cards: A-side & B-side ── */}
        <div style={{ display: 'flex', gap: 12 }}>
          <SidePanel label="A" tcs={aSide} startIdx={0} />
          <SidePanel label="B" tcs={bSide} startIdx={2} />
        </div>

        {/* ── Switching sequence reference table ── */}
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 8 }}>
            ECU-4 Switching Reference — Hydraulically Actuated Solenoid Valves
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace",
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-dim)' }}>
                  {['Step', 'Transition', 'Engine RPM', 'TC Speed RPM'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '5px 10px',
                      color: 'var(--text-dim)', fontWeight: 600,
                      fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { step: 'CUT-IN',      trans: '2 → 3 Turbos (A1)', eng: '> 850',   tc: '37 000', color: '#22C55E' },
                  { step: 'CUT-IN',      trans: '3 → 4 Turbos (B1)', eng: '> 1 000', tc: '37 000', color: '#22C55E' },
                  { step: 'CUT-OUT',     trans: '4 → 3 Turbos',      eng: '< 950',   tc: '28 000', color: '#F59E0B' },
                  { step: 'CUT-OUT',     trans: '3 → 2 Turbos',      eng: '< 830',   tc: '26 000', color: '#F59E0B' },
                  { step: 'OVRSPD L1',   trans: 'Yellow Alarm',        eng: '—',       tc: '40 500', color: '#FBBF24' },
                  { step: 'OVRSPD L2',   trans: 'Power Limitation',    eng: '—',       tc: '41 000', color: '#EF4444' },
                ].map((r, i) => (
                  <tr key={i} style={{
                    borderBottom: '1px solid var(--border-dim)',
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  }}>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, color: r.color,
                        background: `${r.color}18`, borderRadius: 3, padding: '1px 5px',
                        letterSpacing: '0.06em',
                      }}>{r.step}</span>
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.trans}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.eng}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.tc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Legend ── */}
        <div style={{
          display: 'flex', gap: 16, alignItems: 'center',
          paddingTop: 8, borderTop: '1px solid var(--border-dim)',
          fontSize: 9,
        }}>
          {[
            { color: '#22C55E', label: 'CUT-IN — Active & running' },
            { color: '#64748B', label: 'CUT-OFF — Standby (valve closed)' },
            { color: '#EF4444', label: 'ALARM — Overspeed or deviation detected' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block',
                boxShadow: color !== '#64748B' ? `0 0 5px ${color}` : 'none' }} />
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface Props {
  snap: EngineSnapshot;
  expectedTcRPM: number;
}

export function TurbochargerPanel({ snap, expectedTcRPM }: Props) {
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = typeof window !== 'undefined'
    ? (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false)
    : false;

  // Hysteresis-correct cut-in tracking with dual condition (engine RPM + TC speed).
  // Re-evaluates whenever engine RPM or TC base speed changes.
  const [cutInState, setCutInState] = useState<boolean[]>(INITIAL_CUTIN);
  useEffect(() => {
    setCutInState(prev => nextCutInState(prev, snap.rpm, snap.tcRPM));
  }, [snap.rpm, snap.tcRPM]);

  const tcInfos   = deriveTCInfos(snap, expectedTcRPM, cutInState);
  const statuses  = tcInfos.map(t => t.status);
  const hasAlarm  = statuses.some(s => s === 'ALARM');
  const engineOff = snap.rpm <= 0;

  const borderColor = hasAlarm ? '#EF4444' : 'var(--border-dim)';
  const boxShadow   = hasAlarm
    ? '0 0 20px rgba(239,68,68,0.18), inset 0 0 40px rgba(239,68,68,0.04)'
    : 'none';

  // Group into A-side and B-side for the compact strip
  const aSideInfos = [tcInfos[0]!, tcInfos[1]!]; // A1, A2
  const bSideInfos = [tcInfos[2]!, tcInfos[3]!]; // B1, B2

  return (
    <>
      {/* ── Compact strip card ── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Turbocharger system — click to expand"
        onClick={() => setExpanded(true)}
        onKeyDown={e => e.key === 'Enter' && setExpanded(true)}
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${borderColor}`,
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px',
          cursor: 'pointer',
          transition: 'border-color 0.5s ease, box-shadow 0.5s ease, transform 0.15s ease',
          boxShadow,
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.005)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; }}
      >
        {/* Top ribbon */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'var(--accent-purple)', opacity: 0.75,
        }} />

        {/* Header row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="label-xs" style={{ opacity: 0.75 }}>TURBOCHARGER SYSTEM</span>
            <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>20V 8000 — 4× ETC</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ActiveCount statuses={statuses} />
            {/* Expand arrow */}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 4l4 4 4-4" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* TC indicators grid: A-side | divider | B-side */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          {/* A-side */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em',
              textTransform: 'uppercase', marginBottom: 2 }}>A-SIDE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {aSideInfos.map((tc, j) => (
                <div key={tc.name} style={{ flex: 1 }}>
                  <TCChip meta={TC_META[j]!} status={tc.status} displaySpeed={tc.displaySpeed} compact />
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: 'var(--border-dim)', alignSelf: 'stretch' }} />

          {/* B-side */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em',
              textTransform: 'uppercase', marginBottom: 2 }}>B-SIDE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {bSideInfos.map((tc, j) => (
                <div key={tc.name} style={{ flex: 1 }}>
                  <TCChip meta={TC_META[j + 2]!} status={tc.status} displaySpeed={tc.displaySpeed} compact />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mini wheel row for compact visual */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center',
          marginTop: 10, padding: '6px 0',
          borderTop: '1px solid var(--border-dim)',
        }}>
          {tcInfos.map((tc, i) => (
            <div key={tc.name} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <TurboWheel
                id={`compact-tc${i}`}
                displaySpeed={tc.displaySpeed}
                status={tc.status}
                size={36}
                reducedMotion={reducedMotion}
                stopped={engineOff}
              />
              <span style={{
                fontSize: 9, color: tc.status === 'STANDBY' ? 'var(--text-dim)'
                  : tc.status === 'ALARM' ? '#EF4444' : '#22C55E',
                fontWeight: 600, letterSpacing: '0.06em',
              }}>
                {tc.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Expanded modal ── */}
      {expanded && (
        <TurboModal
          snap={snap}
          tcInfos={tcInfos}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}
