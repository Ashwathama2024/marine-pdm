import React, { useState } from 'react';
import { useAlerts, type BaselineAlert } from '../context/AlertContext';
import { useEngine } from '../context/EngineContext';
import { useGPTAnalysis } from '../hooks/useGPTAnalysis';
import { buildAlertNarrativePrompt } from '../services/prompts';
import { getCauseChain } from '../services/cause-chains';
import { buildContextString, loadDocuments } from '../services/knowledge-store';
import { isOpenAIConfigured } from '../services/openai-client';
import type { FaultAlert } from '@marine-pdm/shared';
import { useSensorFocus, alertTextMatchesSensor } from '../context/SensorFocusContext';

const SENSOR_ID_MAP: Record<string, string> = {
  'ME.ExhaustTemp':         'ME.ExhaustTemp',
  'ME.LubeOilPressure':     'ME.LubeOilPressure',
  'ME.FuelRack':            'ME.FuelRack',
  'ME.ScavengeAirPressure': 'ME.ScavengeAirPressure',
  'ME.TCSpeed':             'ME.TCSpeed',
  'ME.JacketCoolingOutlet': 'ME.JacketCoolingOutlet',
  'ME.SFOC':                'ME.SFOC',
};

const PHYS_RANGES: Record<string, number> = {
  'ME.ExhaustTemp': 360, 'ME.LubeOilPressure': 5.5, 'ME.FuelRack': 115,
  'ME.ScavengeAirPressure': 4.5, 'ME.TCSpeed': 22000,
  'ME.JacketCoolingOutlet': 52, 'ME.SFOC': 85,
};

function severityColor(s: BaselineAlert['severity']): string {
  const m: Record<BaselineAlert['severity'], string> = {
    URGENT: 'var(--risk-critical)', ACTION: 'var(--risk-high)',
    WATCH: 'var(--risk-warning)',  INFO: 'var(--accent-blue)',
  };
  return m[s];
}
function severityBadge(s: BaselineAlert['severity']): string {
  const m: Record<BaselineAlert['severity'], string> = {
    URGENT: 'badge-critical', ACTION: 'badge-high', WATCH: 'badge-warning', INFO: 'badge-info',
  };
  return `badge ${m[s]}`;
}
function typeLabel(t: BaselineAlert['type']): string {
  const m: Record<BaselineAlert['type'], string> = {
    SUSTAINED_HIGH: 'Sustained High', SUSTAINED_LOW: 'Sustained Low',
    TRENDING_UP: 'Trending Up', TRENDING_DOWN: 'Trending Down',
    SPIKE: 'Spike', IMBALANCE: 'Imbalance',
  };
  return m[t];
}

function AlertCard({ alert }: { alert: BaselineAlert }) {
  const { acknowledge, setNarrative } = useAlerts();
  const { analyze, result, analyzing, error } = useGPTAnalysis();
  const [expanded, setExpanded] = useState(false);
  const col = severityColor(alert.severity);
  const physRange = PHYS_RANGES[alert.sensorId] ?? 100;
  const durationMins = (alert.durationTicks * 1000) / 60000;

  function handleAnalyze() {
    const chain = getCauseChain(SENSOR_ID_MAP[alert.sensorId] ?? alert.sensorId);
    const ctx = buildContextString(loadDocuments());
    analyze(buildAlertNarrativePrompt(
      typeLabel(alert.type), alert.severity, alert.label,
      alert.deviation, '', alert.deviationPct,
      durationMins, alert.trend, chain, ctx,
    )).then(() => {
      if (result) setNarrative(alert.id, result);
    });
    setExpanded(true);
  }

  const narrative = alert.aiNarrative ?? result ?? '';

  return (
    <div className="glass-card" style={{
      padding: '14px 16px',
      borderLeft: `3px solid ${col}`,
      opacity: alert.acknowledged ? 0.55 : 1,
      transition: 'opacity 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className={severityBadge(alert.severity)}>{alert.severity}</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{typeLabel(alert.type)}</span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
              {new Date(alert.triggeredAt).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {alert.label}
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-muted)' }}>
            <span>Deviation: <b style={{ color: col }}>{alert.deviation >= 0 ? '+' : ''}{alert.deviation.toFixed(2)}</b></span>
            <span>Duration: <b style={{ color: 'var(--text-secondary)' }}>{alert.durationTicks} ticks</b></span>
            <span>Trend: <b style={{ color: alert.trend > 0 ? 'var(--risk-warning)' : 'var(--text-dim)' }}>{alert.trend >= 0 ? '+' : ''}{alert.trend.toFixed(4)}</b></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {isOpenAIConfigured() && !narrative && (
            <button onClick={handleAnalyze} disabled={analyzing}
              className="mag-btn mag-btn-ghost" style={{ fontSize: 9, padding: '4px 10px' }}>
              {analyzing ? '…' : 'AI'}
            </button>
          )}
          {!alert.acknowledged && (
            <button onClick={() => acknowledge(alert.id)}
              className="mag-btn mag-btn-ghost" style={{ fontSize: 9, padding: '4px 10px' }}>
              ACK
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ fontSize: 10, color: 'var(--risk-critical)', marginTop: 8 }}>{error}</div>}
      {(narrative || (expanded && analyzing)) && (
        <div style={{ marginTop: 8 }}>
          {analyzing && !narrative && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Generating…</div>}
          {narrative && <div className="ai-stream">{narrative}</div>}
        </div>
      )}
    </div>
  );
}

// ── Real-time decision alert card (FaultAlert from DecisionEngine) ────────────
function DecisionAlertCard({ alert }: { alert: FaultAlert }) {
  const riskColor = (r: number) =>
    r >= 75 ? 'var(--risk-critical)' : r >= 50 ? 'var(--risk-high)' :
    r >= 25 ? 'var(--risk-warning)' : 'var(--risk-normal)';
  const riskGlow = (r: number) =>
    r >= 75 ? '239,68,68' : r >= 50 ? '249,115,22' :
    r >= 25 ? '245,158,11' : '0,212,170';
  const col = riskColor(alert.riskScore);
  const glow = riskGlow(alert.riskScore);

  return (
    <div style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)',
      border: `1px solid rgba(${glow},0.30)`,
      borderLeft: `3px solid ${col}`,
      borderRadius: 8,
      padding: '12px 16px',
      boxShadow: `0 4px 20px rgba(${glow},0.10)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
              background: `rgba(${glow},0.12)`, color: col, letterSpacing: '0.1em',
            }}>
              LIVE · RISK {Math.round(alert.riskScore)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{alert.faultSource}</span>
            {alert.ecsAlarmCode && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                border: `1px solid rgba(${glow},0.35)`, color: col, letterSpacing: '0.08em',
              }}>
                ECS: {alert.ecsAlarmCode}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {alert.component}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{alert.issue}</div>
          {alert.evidence.map((e, i) => (
            <div key={i} style={{ fontSize: 9, color: 'var(--text-muted)', paddingLeft: 8, marginBottom: 2 }}>
              — {e}
            </div>
          ))}
        </div>
        <div style={{
          fontSize: 24, fontWeight: 700, color: col,
          fontVariantNumeric: 'tabular-nums', flexShrink: 0, paddingLeft: 12,
        }}>
          {Math.round(alert.riskScore)}
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
        padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 5,
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{alert.recommendedAction}</span>
        {alert.maintenanceTask && (
          <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--text-dim)' }}>
            {alert.maintenanceTask.split('—')[0]?.trim()}
          </span>
        )}
      </div>
    </div>
  );
}

export function AlertAnalytics() {
  const { alerts, unacknowledgedCount } = useAlerts();
  const { decision } = useEngine();
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<BaselineAlert['severity'] | 'ALL'>('ALL');
  const [tab, setTab] = useState<'LIVE' | 'BASELINE'>('LIVE');

  const { focus } = useSensorFocus();
  const decisionAlerts = decision?.alerts ?? [];
  const shownDecision = focus
    ? decisionAlerts.filter(a => alertTextMatchesSensor(focus, [a.component, a.ecsAlarmCode, a.patternName, a.issue].filter(Boolean).join(' ')))
    : decisionAlerts;

  const filtered = alerts.filter(a => {
    const ackOk = filter === 'ALL' ? true : filter === 'ACTIVE' ? !a.acknowledged : a.acknowledged;
    const sevOk = severityFilter === 'ALL' || a.severity === severityFilter;
    const focusOk = !focus || a.sensorId === focus;
    return ackOk && sevOk && focusOk;
  });

  const counts = {
    urgent: alerts.filter(a => a.severity === 'URGENT' && !a.acknowledged).length,
    action: alerts.filter(a => a.severity === 'ACTION' && !a.acknowledged).length,
    watch:  alerts.filter(a => a.severity === 'WATCH'  && !a.acknowledged).length,
    total:  alerts.length,
    acked:  alerts.filter(a => a.acknowledged).length,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)', marginBottom: 2 }}>
              ALERT ANALYTICS
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              AI DECISION ENGINE · BASELINE DEVIATION · ROOT CAUSE
            </div>
          </div>
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['LIVE', 'BASELINE'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '6px 16px', fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.08em', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  background: tab === t
                    ? t === 'LIVE' ? 'rgba(239,68,68,0.15)' : 'rgba(56,189,248,0.12)'
                    : 'transparent',
                  border: `1px solid ${tab === t
                    ? t === 'LIVE' ? 'rgba(239,68,68,0.5)' : 'rgba(56,189,248,0.4)'
                    : 'var(--border-dim)'}`,
                  color: tab === t
                    ? t === 'LIVE' ? 'var(--risk-critical)' : 'var(--accent-blue)'
                    : 'var(--text-dim)',
                }}
              >
                {t === 'LIVE' ? `LIVE ALERTS (${decisionAlerts.length})` : `BASELINE LOG (${alerts.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {[
            { label: 'LIVE NOW',  val: decisionAlerts.length,                              col: 'var(--risk-critical)', glow: '239,68,68' },
            { label: 'URGENT',    val: counts.urgent,                                      col: 'var(--risk-high)',     glow: '249,115,22' },
            { label: 'ACTION',    val: counts.action,                                      col: 'var(--risk-warning)',  glow: '245,158,11' },
            { label: 'TOTAL',     val: counts.total,                                       col: 'var(--text-secondary)',glow: '56,189,248' },
            { label: 'ACK\'D',    val: counts.acked,                                       col: 'var(--text-dim)',      glow: '129,140,248' },
          ].map(s => (
            <div key={s.label} style={{
              background: `rgba(${s.glow},0.06)`,
              border: `1px solid rgba(${s.glow},0.18)`,
              borderRadius: 8, padding: '10px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.col, fontVariantNumeric: 'tabular-nums' }}>
                {s.val}
              </div>
              <div style={{ fontSize: 8, color: s.col, letterSpacing: '0.12em', opacity: 0.8, marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LIVE tab — decision engine alerts */}
      {tab === 'LIVE' && (
        <div>
          {shownDecision.length === 0 ? (
            <div style={{
              background: 'rgba(0,212,170,0.05)',
              border: '1px solid rgba(0,212,170,0.2)',
              borderRadius: 10, padding: '32px 24px', textAlign: 'center',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <span className="live-dot" style={{ width: 10, height: 10 }} />
              </div>
              <div style={{ fontWeight: 700, color: 'var(--risk-normal)', fontSize: 12, marginBottom: 4 }}>
                {focus ? 'No live alerts for this sensor' : 'All subsystems nominal'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {focus ? 'Clear the focus filter to see all live alerts.' : 'No active fault patterns. Decision engine is monitoring all sensors.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shownDecision.map((a, i) => <DecisionAlertCard key={i} alert={a} />)}
            </div>
          )}
        </div>
      )}

      {/* BASELINE tab — historical deviation alerts */}
      {tab === 'BASELINE' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>STATUS:</span>
              {(['ALL', 'ACTIVE', 'ACKNOWLEDGED'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding: '3px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontWeight: 600,
                    background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: `1px solid ${filter === f ? 'var(--border-hi)' : 'var(--border-dim)'}`,
                    color: filter === f ? 'var(--text-secondary)' : 'var(--text-dim)',
                  }}>
                  {f}
                </button>
              ))}
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--border-dim)' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>SEVERITY:</span>
              {(['ALL', 'URGENT', 'ACTION', 'WATCH', 'INFO'] as const).map(s => (
                <button key={s} onClick={() => setSeverityFilter(s)}
                  style={{
                    padding: '3px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
                    fontFamily: 'var(--font)',
                    background: 'transparent', border: '1px solid var(--border-dim)',
                    color: 'var(--text-dim)',
                    opacity: severityFilter === s ? 1 : 0.5,
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              {alerts.length === 0
                ? 'No baseline deviation alerts yet. Alerts trigger after 30+ ticks of sustained deviation from baseline values.'
                : 'No alerts match the current filter.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(a => <AlertCard key={a.id} alert={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
