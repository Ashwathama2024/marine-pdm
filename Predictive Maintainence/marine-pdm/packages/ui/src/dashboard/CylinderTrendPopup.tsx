import React, { useState, useMemo, useEffect } from 'react';
import { cylName, riskColor } from './cylinder-utils';

type SessionTab = 'current' | 'historical';

interface Props {
  cylIndex: number;
  history: number[];
  cylRisks: number[];
  bankMean: number;
  onClose: () => void;
}

// ── Probable-cause lookup by direction + pace ─────────────────────────────────
const CAUSES: Record<string, Record<string, string[]>> = {
  Rising: {
    steady:   ['Normal warm-up or slow load increase', 'Minor injector carbon deposit (early stage)', 'Slight fuel quality variation'],
    gradual:  ['Injector nozzle wear or partial carbon fouling', 'Compression ring wear — reduced sealing pressure', 'Intake valve leakage — hot gases blowback'],
    moderate: ['Injector nozzle hole erosion or blockage', 'Compression ring failure or stuck ring', 'Valve seat recession — late valve closing'],
    rapid:    ['Injector seizure or stuck-open injector', 'Broken or collapsed compression ring', 'Cylinder head gasket beginning to fail', 'Scavenge port fouling — restricted air flow'],
    'very rapid': ['Injector seized open — uncontrolled combustion', 'Catastrophic compression loss (ring or liner failure)', 'Cylinder head gasket rupture', 'Scavenge fire — immediate action required'],
  },
  Falling: {
    steady:   ['Normal load reduction or fuel trim', 'Fault recently cleared — cylinder cooling down', 'Engine warm-up settling to steady state'],
    gradual:  ['Injector under-spray or partial blockage', 'Fuel rack position reducing (governor action)', 'Recovering after fault clearance'],
    moderate: ['Significant reduction in fuel delivery', 'Injector failure — very lean combustion', 'Loss of cylinder compression — misfire'],
    rapid:    ['Injector failure or fuel cutoff to this cylinder', 'Cylinder misfiring — no combustion heat', 'Fuel supply interruption to bank'],
    'very rapid': ['Complete combustion loss — injector or fuel supply failed', 'Emergency fuel cutoff activated'],
  },
  Volatile: {
    steady:   ['Mild sensor noise — verify sensor health', 'Minor combustion variability within normal range'],
    gradual:  ['Intermittent injector sticking or partial blockage', 'Fuel contamination — inconsistent combustion', 'Pressure fluctuation in fuel rail'],
    moderate: ['Injector needle chattering or stuck intermittently', 'Air/fuel ratio instability — possible air leak', 'Combustion knock — check ignition timing'],
    rapid:    ['Severe injector malfunction — erratic spray pattern', 'Cylinder detonation or pre-ignition', 'High risk of mechanical damage — reduce load'],
    'very rapid': ['Uncontrolled combustion event — reduce load immediately', 'Possible detonation — shutdown risk'],
  },
  Stable: {
    steady:   ['Normal operation — all parameters within expected range', 'Combustion consistent and balanced across cylinder bank'],
    gradual:  [],
    moderate: [],
    rapid:    [],
    'very rapid': [],
  },
};

export function CylinderTrendPopup({ cylIndex, history, cylRisks, bankMean, onClose }: Props) {
  const [tab, setTab] = useState<SessionTab>('current');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name  = cylName(cylIndex);
  const risk  = cylRisks[cylIndex] ?? 0;
  const color = riskColor(risk);
  const last  = history[history.length - 1] ?? 0;

  const statsMin  = history.length ? Math.min(...history) : 0;
  const statsMax  = history.length ? Math.max(...history) : 0;
  const statsMean = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
  const deviation = last - bankMean;

  // ── Rate of change (°C / min) — uses last 30 ticks @ 1 tick/s ────────────
  const { ratePerMin, rateLabel, rateDir } = useMemo(() => {
    const windowLen = Math.min(30, history.length - 1);
    if (windowLen < 5) return { ratePerMin: 0, rateLabel: 'collecting', rateDir: 'stable' };
    const recent = history[history.length - 1]!;
    const older  = history[history.length - 1 - windowLen]!;
    const rpm = (recent - older) / (windowLen / 60);
    const absRpm = Math.abs(rpm);
    const label =
      absRpm < 1  ? 'steady' :
      absRpm < 3  ? 'gradual' :
      absRpm < 8  ? 'moderate' :
      absRpm < 20 ? 'rapid' : 'very rapid';
    const dir = rpm >  0.8 ? 'Rising' : rpm < -0.8 ? 'Falling' : 'Stable';
    return { ratePerMin: rpm, rateLabel: label, rateDir: dir };
  }, [history]);

  // ── Trend direction (10-tick vs 10-tick window) ───────────────────────────
  const trend = useMemo<string>(() => {
    if (history.length < 10) return 'Collecting';
    const recent = history.slice(-10);
    const older  = history.slice(-20, -10);
    if (!older.length) return 'Collecting';
    const rMean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const oMean = older.reduce((a, b) => a + b, 0) / older.length;
    const diff  = rMean - oMean;
    const vol   = recent.reduce((a, b) => a + Math.abs(b - rMean), 0) / recent.length;
    if (vol > 8)   return 'Volatile';
    if (diff > 3)  return 'Rising';
    if (diff < -3) return 'Falling';
    return 'Stable';
  }, [history]);

  const trendColor: Record<string, string> = {
    Stable:     'var(--risk-normal)',
    Rising:     'var(--risk-warning)',
    Falling:    'var(--accent-blue)',
    Volatile:   'var(--risk-high)',
    Collecting: 'var(--text-muted)',
  };

  // ── Time-to-limit (only when rising toward a threshold) ──────────────────
  const WARNING_LIMIT = 460;
  const CRITICAL_LIMIT = 540;
  const nextLimit = last < WARNING_LIMIT ? WARNING_LIMIT : last < CRITICAL_LIMIT ? CRITICAL_LIMIT : null;
  const timeToLimit = (ratePerMin > 0.5 && nextLimit !== null)
    ? (nextLimit - last) / ratePerMin  // minutes
    : null;

  // ── Probable causes ───────────────────────────────────────────────────────
  const causes = useMemo(() => {
    const dir = trend === 'Volatile' ? 'Volatile' : rateDir === 'Falling' ? 'Falling' : trend === 'Rising' ? 'Rising' : 'Stable';
    const bucket = CAUSES[dir]?.[rateLabel] ?? CAUSES[dir]?.['steady'] ?? [];
    return bucket.filter(Boolean);
  }, [trend, rateDir, rateLabel]);

  // ── Narrative sentence ────────────────────────────────────────────────────
  const narrative = useMemo(() => {
    if (history.length < 6) return 'Collecting data — trend analysis available after ~10 ticks.';
    const totalChange = last - (history[0] ?? last);
    const elapsed = history.length; // seconds
    const elapsedLabel = elapsed >= 60
      ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
      : `${elapsed}s`;

    if (trend === 'Stable') {
      return `Temperature has remained stable around ${statsMean.toFixed(1)}°C over the last ${elapsedLabel} of this session. Combustion in this cylinder appears consistent.`;
    }
    if (trend === 'Rising') {
      const changeLabel = totalChange > 0 ? `+${totalChange.toFixed(1)}°C` : `${totalChange.toFixed(1)}°C`;
      const paceDesc = rateLabel === 'steady' ? 'very slowly' : rateLabel === 'gradual' ? 'gradually' : rateLabel === 'moderate' ? 'at a moderate pace' : rateLabel === 'rapid' ? 'rapidly' : 'very rapidly';
      const limitNote = timeToLimit !== null && timeToLimit > 0
        ? ` At this rate, reaches the ${nextLimit}°C ${nextLimit === WARNING_LIMIT ? 'warning' : 'critical'} threshold in ~${timeToLimit < 1 ? `${Math.round(timeToLimit * 60)}s` : `${timeToLimit.toFixed(1)} min`}.`
        : '';
      return `Temperature has risen ${changeLabel} over the last ${elapsedLabel}, currently climbing ${paceDesc} at ${ratePerMin > 0 ? '+' : ''}${ratePerMin.toFixed(1)}°C/min.${limitNote}`;
    }
    if (trend === 'Falling') {
      const changeLabel = `${totalChange.toFixed(1)}°C`;
      return `Temperature has dropped ${changeLabel} over the last ${elapsedLabel}, cooling at ${ratePerMin.toFixed(1)}°C/min. This may indicate a fault clearing, fuel reduction, or injector failure.`;
    }
    if (trend === 'Volatile') {
      const spread = statsMax - statsMin;
      return `Temperature has fluctuated ±${(spread / 2).toFixed(1)}°C over the last ${elapsedLabel} (min ${statsMin.toFixed(0)}° / max ${statsMax.toFixed(0)}°). Irregular combustion or sensor instability — investigate injector and fuel supply.`;
    }
    return '';
  }, [history, trend, rateLabel, rateDir, ratePerMin, last, statsMean, statsMin, statsMax, timeToLimit, nextLimit]);

  // ── SVG chart ─────────────────────────────────────────────────────────────
  const W = 560, H = 180;
  const chartMin = Math.max(0, statsMin - 10);
  const chartMax = statsMax + 10;
  const chartRange = Math.max(chartMax - chartMin, 5);

  const pts = history.map((v, i) => {
    const x = (i / Math.max(history.length - 1, 1)) * W;
    const y = H - ((v - chartMin) / chartRange) * H * 0.86 - H * 0.07;
    return [x, y] as [number, number];
  });

  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPath = pts.length >= 2
    ? `M${pts[0]![0]},${H} ` + pts.map(([x, y]) => `L${x},${y}`).join(' ') + ` L${pts[pts.length - 1]![0]},${H} Z`
    : '';

  const yRefs = [0.25, 0.5, 0.75].map(t => ({
    y: H - t * H * 0.86 - H * 0.07,
    val: (chartMin + t * chartRange).toFixed(0),
  }));

  // Warning / critical reference lines on chart (if in range)
  const refLines = [
    { val: WARNING_LIMIT,  label: '460° warn',  color: 'var(--risk-warning)' },
    { val: CRITICAL_LIMIT, label: '540° crit',  color: 'var(--risk-critical)' },
  ].filter(r => r.val >= chartMin && r.val <= chartMax).map(r => ({
    ...r,
    y: H - ((r.val - chartMin) / chartRange) * H * 0.86 - H * 0.07,
  }));

  const riskLabel = risk >= 75 ? 'CRITICAL' : risk >= 50 ? 'HIGH' : risk >= 25 ? 'WARNING' : 'NORMAL';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(3px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${color}55`,
        borderRadius: 12,
        width: 680, maxWidth: '96vw', maxHeight: '92vh',
        overflow: 'auto',
        boxShadow: `0 24px 80px rgba(0,0,0,0.65), 0 0 60px ${color}18`,
      }}>

        {/* ── Header ── */}
        <div style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-dim)',
          padding: '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.08em', color }}>
              CYL {name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
                EXHAUST TEMPERATURE
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 8, padding: '1px 7px', borderRadius: 3,
                  background: `${trendColor[trend] ?? 'transparent'}22`,
                  color: trendColor[trend] ?? 'var(--text-dim)',
                  border: `1px solid ${trendColor[trend] ?? 'var(--border-dim)'}55`,
                  fontWeight: 700, letterSpacing: '0.08em',
                }}>{trend.toUpperCase()}</span>
                {rateLabel !== 'collecting' && (
                  <span style={{
                    fontSize: 8, padding: '1px 7px', borderRadius: 3,
                    background: 'var(--bg-inset)', color: 'var(--text-dim)',
                    border: '1px solid var(--border-dim)',
                    fontWeight: 700, letterSpacing: '0.06em',
                  }}>
                    {ratePerMin >= 0 ? '+' : ''}{ratePerMin.toFixed(1)}°C/min
                  </span>
                )}
                <span style={{
                  fontSize: 8, padding: '1px 7px', borderRadius: 3,
                  background: `${color}18`, color,
                  border: `1px solid ${color}44`,
                  fontWeight: 700, letterSpacing: '0.08em',
                }}>RISK {riskLabel}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {last.toFixed(1)}°C
              </div>
              <div style={{ fontSize: 9, color: Math.abs(deviation) > 15 ? 'var(--risk-warning)' : 'var(--text-dim)', marginTop: 2 }}>
                {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}°C vs bank mean
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: '1px solid var(--border-dim)',
              color: 'var(--text-muted)', borderRadius: 6, padding: '5px 12px',
              cursor: 'pointer', fontSize: 11,
            }}>✕</button>
          </div>
        </div>

        {/* ── Session tabs ── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-dim)',
          background: 'var(--bg-elevated)',
          padding: '0 18px',
        }}>
          {(['current', 'historical'] as SessionTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none',
              borderBottom: tab === t ? `2px solid ${color}` : '2px solid transparent',
              color: tab === t ? color : 'var(--text-muted)',
              padding: '9px 16px',
              cursor: 'pointer', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              transition: 'color 0.2s, border-color 0.2s',
            }}>
              {t === 'current' ? 'Current Session' : 'Historical Sessions'}
            </button>
          ))}
        </div>

        <div style={{ padding: '16px 18px 18px' }}>
          {tab === 'current' ? (
            <>
              {/* ── Stats row ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Current',       value: `${last.toFixed(1)}°C`,                                   hi: false },
                  { label: 'Session Mean',  value: `${statsMean.toFixed(1)}°C`,                              hi: false },
                  { label: 'Session Min',   value: `${statsMin.toFixed(1)}°C`,                               hi: false },
                  { label: 'Session Max',   value: `${statsMax.toFixed(1)}°C`,                               hi: statsMax > 540 },
                  { label: 'Δ Bank Mean',   value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}°C`,  hi: Math.abs(deviation) > 15 },
                ].map(({ label, value, hi }) => (
                  <div key={label} style={{
                    background: 'var(--bg-inset)',
                    border: `1px solid ${hi ? 'var(--risk-warning)' : 'var(--border-dim)'}`,
                    borderRadius: 6, padding: '7px 8px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: hi ? 'var(--risk-warning)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Chart ── */}
              <div style={{
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-dim)',
                borderRadius: 8, padding: '12px 12px 8px',
                marginBottom: 12,
              }}>
                <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>
                  EXHAUST TEMPERATURE TREND — LAST {history.length}s
                </div>
                <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id={`cyl-area-${cylIndex}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={color} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Grid */}
                  {yRefs.map(({ y, val }) => (
                    <g key={val}>
                      <line x1="0" y1={y} x2={W} y2={y} stroke="var(--border-dim)" strokeWidth="0.6" strokeDasharray="4 3" />
                      <text x="4" y={y - 3} fill="var(--text-dim)" fontSize="8">{val}°</text>
                    </g>
                  ))}

                  {/* Warning / critical reference lines */}
                  {refLines.map(r => (
                    <g key={r.val}>
                      <line x1="0" y1={r.y} x2={W} y2={r.y} stroke={r.color} strokeWidth="0.8" strokeDasharray="6 4" opacity="0.6" />
                      <text x={W - 2} y={r.y - 3} fill={r.color} fontSize="7" textAnchor="end" opacity="0.8">{r.label}</text>
                    </g>
                  ))}

                  {areaPath && <path d={areaPath} fill={`url(#cyl-area-${cylIndex})`} />}

                  {pts.length >= 2 && (
                    <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  {pts.length > 0 && (
                    <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r="4.5" fill={color}
                      style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                  )}
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{history.length}s ago</span>
                  <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>now</span>
                </div>
              </div>

              {/* ── Condition narrative ── */}
              <div style={{
                background: 'var(--bg-inset)',
                border: `1px solid ${trendColor[trend] ?? 'var(--border-dim)'}44`,
                borderRadius: 8, padding: '12px 14px',
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Condition Narrative
                </div>

                {/* Rate badge row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 10, fontWeight: 700,
                    color: trendColor[trend] ?? 'var(--text-muted)',
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: trendColor[trend] ?? 'var(--text-muted)',
                      boxShadow: `0 0 5px ${trendColor[trend] ?? 'transparent'}88`,
                    }} />
                    {trend}
                  </div>
                  {rateLabel !== 'collecting' && (
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                      · {rateLabel} pace · {ratePerMin >= 0 ? '+' : ''}{ratePerMin.toFixed(1)}°C/min
                    </div>
                  )}
                  {timeToLimit !== null && timeToLimit > 0 && (
                    <div style={{
                      fontSize: 8, padding: '1px 8px', borderRadius: 3,
                      background: nextLimit === CRITICAL_LIMIT ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: nextLimit === CRITICAL_LIMIT ? 'var(--risk-critical)' : 'var(--risk-warning)',
                      border: `1px solid ${nextLimit === CRITICAL_LIMIT ? 'var(--risk-critical)' : 'var(--risk-warning)'}44`,
                      fontWeight: 700,
                    }}>
                      ~{timeToLimit < 1 ? `${Math.round(timeToLimit * 60)}s` : `${timeToLimit.toFixed(1)}min`} to {nextLimit}°C limit
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                  {narrative}
                </p>
              </div>

              {/* ── Probable causes ── */}
              {causes.length > 0 && (
                <div style={{
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border-dim)',
                  borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Probable Causes
                  </div>
                  <ol style={{ margin: 0, padding: '0 0 0 16px' }}>
                    {causes.map((c, i) => (
                      <li key={i} style={{
                        fontSize: 10, color: 'var(--text-secondary)',
                        lineHeight: 1.6, paddingBottom: i < causes.length - 1 ? 4 : 0,
                      }}>
                        {c}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          ) : (
            /* ── Historical placeholder ── */
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 14,
              padding: '50px 24px',
            }}>
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <circle cx="26" cy="26" r="22" stroke="var(--border)" strokeWidth="1.5" />
                <path d="M26 15v11l7 4.5" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 36h36" stroke="var(--border-dim)" strokeWidth="1" strokeDasharray="4 4" />
                <circle cx="8"  cy="36" r="2.5" fill="var(--border-dim)" />
                <circle cx="26" cy="36" r="2.5" fill="var(--text-dim)" />
                <circle cx="44" cy="36" r="2.5" fill="var(--border-dim)" />
              </svg>
              <div style={{ textAlign: 'center', maxWidth: 380 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Historical Data Not Yet Available
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                  Historical session data will appear here once an external data source is connected (IPMS / OPC-UA) or server-side logging is enabled. Current-session data is kept in memory and resets each run.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Connect IPMS', 'Enable Logging', 'Load CSV'].map(label => (
                  <div key={label} style={{
                    fontSize: 9, padding: '5px 12px', borderRadius: 5,
                    background: 'var(--bg-inset)', color: 'var(--text-dim)',
                    border: '1px solid var(--border-dim)',
                    letterSpacing: '0.07em', fontWeight: 600,
                  }}>
                    {label}
                  </div>
                ))}
              </div>
              <div style={{
                fontSize: 9, color: 'var(--text-dim)',
                background: 'var(--bg-inset)', border: '1px solid var(--border-dim)',
                borderRadius: 4, padding: '4px 10px',
              }}>
                OPC-UA client ready — see <code style={{ fontSize: 9 }}>packages/ingestion/src/opc-ua-client.ts</code>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
