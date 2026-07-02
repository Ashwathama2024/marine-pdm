import React, { useState } from 'react';
import {
  LineChart, Line, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { useDegradation, type DegradationEvent, type DegradationSeverity } from '../context/DegradationContext';
import { useSensorFocus, SENSOR_TO_HISTKEY } from '../context/SensorFocusContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sevColor(s: DegradationSeverity): string {
  return s === 'ACTION' ? 'var(--risk-high)' : s === 'CAUTION' ? 'var(--risk-warning)' : 'var(--accent-blue)';
}
function sevGlow(s: DegradationSeverity): string {
  return s === 'ACTION' ? '249,115,22' : s === 'CAUTION' ? '245,158,11' : '56,189,248';
}
function statusColor(st: DegradationEvent['status']): string {
  return st === 'ACTIVE' ? 'var(--risk-critical)' : st === 'ACKNOWLEDGED' ? 'var(--risk-warning)' : 'var(--risk-normal)';
}
function dirIcon(dir: 'rising' | 'falling'): string {
  return dir === 'rising' ? '↑' : '↓';
}
function fmt(n: number, d = 3): string {
  return n.toFixed(d);
}
function elapsed(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
}

// ── Mini sparkline for history snapshot ───────────────────────────────────────
function HistorySparkline({ data, baseline, color }: {
  data: number[];
  baseline: number;
  color: string;
}) {
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ height: 64, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts}>
          <ReferenceLine
            y={baseline}
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="v"
            dot={false}
            strokeWidth={1.5}
            stroke={color}
            isAnimationActive={false}
          />
          <Tooltip
            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10 }}
            itemStyle={{ color }}
            formatter={(v: number) => [v.toFixed(3), '']}
            labelFormatter={() => ''}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Repair notes form ─────────────────────────────────────────────────────────
function RepairForm({ event, onResolve }: { event: DegradationEvent; onResolve: (notes: string) => void }) {
  const [notes, setNotes] = useState(event.repairNotes ?? '');
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 6 }}>
        REPAIR / MAINTENANCE CARRIED OUT
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Describe work performed: parts replaced, adjustments made, samples taken..."
        rows={3}
        style={{
          width: '100%',
          resize: 'vertical',
          fontSize: 11,
          lineHeight: 1.6,
          padding: '8px 10px',
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid var(--border-hi)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font)',
        }}
        disabled={event.status === 'RESOLVED'}
      />
      {event.status === 'ACKNOWLEDGED' && (
        <button
          onClick={() => notes.trim() && onResolve(notes.trim())}
          disabled={!notes.trim()}
          style={{
            marginTop: 8,
            padding: '6px 18px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            background: notes.trim() ? 'rgba(0,212,170,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${notes.trim() ? 'var(--risk-normal)' : 'var(--border-dim)'}`,
            borderRadius: 6,
            color: notes.trim() ? 'var(--risk-normal)' : 'var(--text-dim)',
            cursor: notes.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font)',
            transition: 'all 0.2s',
          }}
        >
          MARK RESOLVED
        </button>
      )}
      {event.status === 'RESOLVED' && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--risk-normal)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" />
          Resolved {elapsed(event.resolvedAt!)} — recorded for analysis
        </div>
      )}
    </div>
  );
}

// ── Single degradation event card ─────────────────────────────────────────────
function DegradationCard({ event }: { event: DegradationEvent }) {
  const { resolve, dismiss } = useDegradation();
  const [expanded, setExpanded] = useState(event.status !== 'RESOLVED');
  const col = sevColor(event.severity);
  const glow = sevGlow(event.severity);
  const stCol = statusColor(event.status);

  return (
    <div style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      border: `1px solid rgba(${glow},0.25)`,
      borderLeft: `3px solid ${col}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: `0 4px 24px rgba(${glow},0.08)`,
      transition: 'box-shadow 0.3s',
      opacity: event.status === 'RESOLVED' ? 0.75 : 1,
    }}>
      {/* Card header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
          background: `rgba(${glow},0.04)`,
          borderBottom: expanded ? `1px solid rgba(${glow},0.12)` : 'none',
        }}
      >
        {/* Direction arrow */}
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `rgba(${glow},0.12)`,
          border: `1px solid rgba(${glow},0.3)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: col, fontWeight: 700, flexShrink: 0,
        }}>
          {dirIcon(event.direction)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
              {event.label}
            </span>
            {/* Severity badge */}
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
              background: `rgba(${glow},0.12)`, color: col, letterSpacing: '0.1em',
            }}>
              {event.severity}
            </span>
            {/* Status chip */}
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
              background: `rgba(255,255,255,0.05)`,
              border: `1px solid ${stCol}`,
              color: stCol, letterSpacing: '0.1em',
            }}>
              {event.status}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: col, fontWeight: 600 }}>{event.rootCause}</span>
            <span>·</span>
            <span>
              {event.direction === 'falling' ? '−' : '+'}
              {Math.abs(event.totalDeviation).toFixed(event.unit === 'bar' || event.unit === 'g/kWh' ? 3 : 1)}
              {event.unit} vs baseline
            </span>
            <span>·</span>
            <span>Detected {elapsed(event.detectedAt)}</span>
          </div>
        </div>

        {/* Trend rate chip */}
        <div style={{
          textAlign: 'right', flexShrink: 0,
          padding: '6px 10px',
          background: 'rgba(0,0,0,0.2)',
          border: `1px solid var(--border-dim)`,
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums' }}>
            {event.direction === 'falling' ? '−' : '+'}
            {Math.abs(event.trendRatePer100Ticks).toFixed(event.unit === 'bar' ? 2 : 1)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{event.unit}/100 ticks</div>
        </div>

        {/* Expand chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>

            {/* Left: analysis */}
            <div>
              {/* Current vs baseline stats */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'CURRENT', val: event.currentValue.toFixed(2), unit: event.unit, color: col },
                  { label: 'BASELINE', val: event.baselineValue.toFixed(2), unit: event.unit, color: 'var(--text-muted)' },
                  { label: 'DEVIATION', val: `${event.totalDeviation > 0 ? '+' : ''}${event.totalDeviation.toFixed(3)}`, unit: event.unit, color: col },
                  { label: 'DURATION', val: `${event.consecutiveTicks}`, unit: 'ticks', color: 'var(--text-secondary)' },
                ].map(s => (
                  <div key={s.label} style={{
                    flex: 1, padding: '8px 10px', background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-dim)', borderRadius: 6, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.val}</div>
                    <div style={{ fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.1em', marginTop: 1 }}>{s.label}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{s.unit}</div>
                  </div>
                ))}
              </div>

              {/* Root cause section */}
              <div style={{
                marginBottom: 12,
                background: `rgba(${glow},0.05)`,
                border: `1px solid rgba(${glow},0.15)`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: col, marginBottom: 4 }}>
                  ROOT CAUSE
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {event.rootCause}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  {event.reasoning}
                </div>
              </div>

              {/* Check items */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 6 }}>
                  RECOMMENDED CHECKS
                </div>
                {event.checkItems.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5, lineHeight: 1.5,
                  }}>
                    <span style={{
                      flexShrink: 0, width: 18, height: 18, borderRadius: 4,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: 'var(--text-dim)', marginTop: 1,
                    }}>
                      {i + 1}
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: trend chart + repair */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>
                TREND AT DETECTION (last 60 samples)
              </div>
              <HistorySparkline
                data={event.historySnapshot}
                baseline={event.baselineValue}
                color={col}
              />
              <div style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'right', marginTop: 2 }}>
                — baseline reference
              </div>

              {/* Timeline */}
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: 'DETECTED', ts: event.detectedAt, active: true },
                  { label: 'ACKNOWLEDGED', ts: event.acknowledgedAt, active: !!event.acknowledgedAt },
                  { label: 'RESOLVED', ts: event.resolvedAt, active: !!event.resolvedAt },
                ].map(step => (
                  <div key={step.label} style={{
                    flex: 1, padding: '6px 8px', borderRadius: 5, textAlign: 'center',
                    background: step.active ? `rgba(${glow},0.08)` : 'rgba(0,0,0,0.15)',
                    border: `1px solid ${step.active ? `rgba(${glow},0.25)` : 'var(--border-dim)'}`,
                    opacity: step.active ? 1 : 0.4,
                  }}>
                    <div style={{ fontSize: 7, color: step.active ? col : 'var(--text-dim)', letterSpacing: '0.1em', fontWeight: 700 }}>
                      {step.label}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      {step.ts ? elapsed(step.ts) : '—'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Repair notes */}
              {(event.status === 'ACKNOWLEDGED' || event.status === 'RESOLVED') && (
                <RepairForm event={event} onResolve={notes => resolve(event.id, notes)} />
              )}

              {/* Dismiss (only for resolved) */}
              {event.status === 'RESOLVED' && (
                <button
                  onClick={() => dismiss(event.id)}
                  style={{
                    marginTop: 8, padding: '4px 12px', fontSize: 9,
                    background: 'none', border: '1px solid var(--border-dim)',
                    color: 'var(--text-dim)', borderRadius: 4, cursor: 'pointer',
                    fontFamily: 'var(--font)',
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function DegradationLog() {
  const { events, activeEvents, acknowledgedEvents } = useDegradation();
  const { focus } = useSensorFocus();
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ALL');

  const focusKey = focus ? SENSOR_TO_HISTKEY[focus] : null;
  const filtered = events
    .filter(e => filter === 'ALL' || e.status === filter)
    .filter(e => !focusKey || e.sensor === focusKey);

  const resolved = events.filter(e => e.status === 'RESOLVED').length;

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--text-primary)', marginBottom: 2,
            }}>
              DEGRADATION LOG
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              AI-DETECTED PROGRESSIVE PATTERNS · ROOT CAUSE ANALYSIS · REPAIR RECORD
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '5px 12px', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.08em', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  background: filter === f
                    ? f === 'ACTIVE' ? 'rgba(239,68,68,0.15)'
                    : f === 'ACKNOWLEDGED' ? 'rgba(245,158,11,0.15)'
                    : f === 'RESOLVED' ? 'rgba(0,212,170,0.15)'
                    : 'rgba(255,255,255,0.08)'
                    : 'transparent',
                  border: `1px solid ${filter === f
                    ? f === 'ACTIVE' ? 'var(--risk-critical)'
                    : f === 'ACKNOWLEDGED' ? 'var(--risk-warning)'
                    : f === 'RESOLVED' ? 'var(--risk-normal)'
                    : 'var(--border-hi)'
                    : 'var(--border-dim)'}`,
                  color: filter === f
                    ? f === 'ACTIVE' ? 'var(--risk-critical)'
                    : f === 'ACKNOWLEDGED' ? 'var(--risk-warning)'
                    : f === 'RESOLVED' ? 'var(--risk-normal)'
                    : 'var(--text-secondary)'
                    : 'var(--text-dim)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'ACTIVE', val: activeEvents.length, col: 'var(--risk-critical)', glow: '239,68,68' },
            { label: 'ACKNOWLEDGED', val: acknowledgedEvents.filter(e => e.status === 'ACKNOWLEDGED').length, col: 'var(--risk-warning)', glow: '245,158,11' },
            { label: 'RESOLVED', val: resolved, col: 'var(--risk-normal)', glow: '0,212,170' },
            { label: 'TOTAL', val: events.length, col: 'var(--accent-blue)', glow: '56,189,248' },
          ].map(s => (
            <div key={s.label} style={{
              background: `rgba(${s.glow},0.06)`,
              border: `1px solid rgba(${s.glow},0.2)`,
              borderRadius: 8, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.col, fontVariantNumeric: 'tabular-nums' }}>
                {s.val}
              </div>
              <div style={{ fontSize: 8, fontWeight: 700, color: s.col, letterSpacing: '0.12em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 24px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 12,
        }}>
          {events.length === 0 ? (
            <>
              <div style={{ fontSize: 28, marginBottom: 10 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-hi)" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>No degradation patterns detected</div>
              <div style={{ fontSize: 10 }}>
                The AI engine continuously monitors all sensors for slow, progressive trends.
                Degradation events appear here when a sensor shows consistent drift over 60+ ticks.
              </div>
            </>
          ) : (
            'No events match the current filter.'
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(e => <DegradationCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}
