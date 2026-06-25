import React, { useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getCauseChain } from '../services/cause-chains';

const APPROACH_PCT = 5;
const CRITICAL_PCT = 10;

function sfocStatus(devPct: number): { label: string; color: string } {
  if (devPct >= CRITICAL_PCT) return { label: 'CRITICAL',    color: 'var(--risk-critical)' };
  if (devPct >= APPROACH_PCT) return { label: 'APPROACHING', color: 'var(--risk-high)' };
  return                              { label: 'NORMAL',      color: 'var(--risk-normal)' };
}

interface Props {
  actual:          number;
  expected:        number;
  load:            number;
  rpm:             number;
  history:         number[];
  baselineHistory: number[];
  onClose:         () => void;
}

export function SfocPopup({
  actual, expected, load, rpm, history, baselineHistory, onClose,
}: Props) {
  const deviation    = actual - expected;
  const deviationPct = expected > 0 ? (deviation / expected) * 100 : 0;
  const status       = sfocStatus(deviationPct);
  const chain        = getCauseChain('ME.SFOC');
  const dir          = deviation > 0 ? 'highDeviation' : 'lowDeviation';

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const len = Math.max(history.length, baselineHistory.length);
  const chartData = Array.from({ length: len }, (_, i) => {
    const a = history[i] ?? null;
    const b = baselineHistory[i] ?? null;
    return {
      tick:     i - len + 1,
      actual:   a,
      baseline: b,
      devPct:   a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null,
    };
  });

  const thresholds = [
    {
      color:  'var(--risk-normal)',
      label:  'NORMAL',
      range:  `< ${APPROACH_PCT}% above baseline`,
      active: deviationPct < APPROACH_PCT,
    },
    {
      color:  'var(--risk-high)',
      label:  'APPROACHING',
      range:  `${APPROACH_PCT}–${CRITICAL_PCT}% above baseline`,
      active: deviationPct >= APPROACH_PCT && deviationPct < CRITICAL_PCT,
    },
    {
      color:  'var(--risk-critical)',
      label:  'CRITICAL',
      range:  `≥ ${CRITICAL_PCT}% above baseline`,
      active: deviationPct >= CRITICAL_PCT,
    },
  ];

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="glass-card-hi"
        style={{ width: 580, maxHeight: '90vh', overflow: 'auto', padding: '20px 24px' }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ─────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div className="label-xs" style={{ marginBottom: 2, opacity: 0.55 }}>ME.SFOC</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
              SPECIFIC FUEL OIL CONSUMPTION
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, padding: 4, lineHeight: 1 }}
          >×</button>
        </div>

        {/* ── Status badge ────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          background: 'var(--bg-inset)', borderRadius: 8, padding: '9px 14px',
          border: `1px solid ${status.color}33`,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: status.color, letterSpacing: '0.1em' }}>
            {status.label}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
            {Math.abs(deviationPct) < 0.05
              ? 'at baseline'
              : `${deviation >= 0 ? '+' : ''}${deviationPct.toFixed(1)}% from baseline`}
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'BASELINE', value: expected.toFixed(1), sub: 'g/kWh', color: 'var(--text-muted)' },
            { label: 'ACTUAL',   value: actual.toFixed(1),   sub: 'g/kWh', color: 'var(--text-primary)' },
            { label: 'DEVIATION',value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}`, sub: 'g/kWh', color: status.color },
            { label: 'DEV %',    value: `${deviationPct >= 0 ? '+' : ''}${deviationPct.toFixed(1)}%`, sub: '', color: status.color },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* ── Reading logic ───────────────────────────────── */}
        <div style={{ background: 'var(--bg-inset)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            READING LOGIC
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.9, marginBottom: 10 }}>
            <span style={{ color: 'var(--text-dim)' }}>Operating point: </span>
            <strong style={{ color: 'var(--text-primary)' }}>{load.toFixed(1)}% MCR</strong>
            {' · '}
            <strong style={{ color: 'var(--text-primary)' }}>{rpm.toFixed(0)} RPM</strong>
            <br />
            <span style={{ color: 'var(--text-dim)' }}>Baseline: </span>
            MTU 8000 M71L performance model at this operating point.
            <br />
            <span style={{ color: 'var(--text-dim)' }}>Sensor: </span>
            fuel mass flow ÷ shaft power. Higher SFOC = less efficient combustion.
          </div>

          {/* Threshold table */}
          <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 9 }}>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              TRIGGER THRESHOLDS (baseline-relative, high-side)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {thresholds.map(t => (
                <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <div style={{
                    fontSize: 9, fontWeight: t.active ? 700 : 400,
                    color: t.active ? t.color : 'var(--text-dim)',
                    width: 92, letterSpacing: '0.06em',
                  }}>{t.label}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', flex: 1 }}>{t.range}</div>
                  {t.active && (
                    <div style={{
                      fontSize: 8, background: t.color + '22', color: t.color,
                      borderRadius: 3, padding: '1px 6px', fontWeight: 700, letterSpacing: '0.06em',
                    }}>ACTIVE</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Live trend ──────────────────────────────────── */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
            LIVE TREND — LAST {len} TICKS
          </div>

          {/* Actual vs baseline */}
          <ResponsiveContainer width="100%" height={96}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="sfoc-ga" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={status.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={status.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="tick" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font)' }}
                formatter={(v: number, n: string) => [v?.toFixed(1) + ' g/kWh', n]}
              />
              <Area dataKey="baseline" stroke="var(--text-dim)" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 2" name="Baseline" />
              <Area dataKey="actual"   stroke={status.color}    strokeWidth={2} fill="url(#sfoc-ga)"  dot={false} name="Actual" />
            </AreaChart>
          </ResponsiveContainer>

          {/* % deviation sparkline */}
          <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.08em', margin: '6px 0 4px', textTransform: 'uppercase' }}>
            % DEVIATION FROM BASELINE
          </div>
          <ResponsiveContainer width="100%" height={56}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="sfoc-gd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={status.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={status.color} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <XAxis dataKey="tick" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font)' }}
                formatter={(v: number) => [`${v?.toFixed(2)}%`, 'Dev']}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <ReferenceLine y={APPROACH_PCT}  stroke="var(--risk-high)"     strokeDasharray="3 3" strokeWidth={0.8} />
              <ReferenceLine y={CRITICAL_PCT}  stroke="var(--risk-critical)" strokeDasharray="3 3" strokeWidth={0.8} />
              <Area dataKey="devPct" stroke={status.color} strokeWidth={1.5} fill="url(#sfoc-gd)" dot={false} name="Dev%" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Historic trend placeholder ───────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
            HISTORIC TREND
          </div>
          <div style={{
            background: 'var(--bg-inset)', borderRadius: 8, padding: '18px 14px',
            border: '1px dashed var(--border-dim)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.08em' }}>
              NOT AVAILABLE
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.7 }}>
              Connect an IPMS source (OPC-UA) or upload historic voyage data<br />
              to enable long-term SFOC trend analysis.
            </div>
          </div>
        </div>

        {/* ── Root cause analysis ─────────────────────────── */}
        {chain && (
          <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 14 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
              ROOT CAUSE ANALYSIS
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 8 }}>
              {chain[dir].principle}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 5, textTransform: 'uppercase' }}>
              LIKELY CAUSES
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
              {chain[dir].causes.slice(0, 4).map((c, i) => (
                <li key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '3px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--text-dim)', minWidth: 14 }}>{i + 1}.</span>
                  {c}
                </li>
              ))}
            </ul>
            <div style={{ fontSize: 9, color: status.color, fontWeight: 600 }}>
              ⏱ {chain[dir].actionWindow}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
