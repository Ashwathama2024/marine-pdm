import React, { useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getCauseChain } from '../services/cause-chains';
import { stats, minutesToAlarm, FORECAST_LIMITS, SLOPE_TICKS } from '../services/forecast';
import { SENSOR_META } from '../services/sensor-map';
import { useSensorAnalysis } from '../hooks/useSensorAnalysis';
import { buildDiagnosisSystemPrompt, buildSensorDiagnosisPrompt } from '../services/prompts';
import { isOpenAIConfigured } from '../services/openai-client';
import { buildContextString, loadDocuments } from '../services/knowledge-store';
import { buildSensorEvidence } from '../services/sensor-evidence';
import { engine, useEngine } from '../context/EngineContext';

interface Props {
  sensorId: string;
  label: string;
  unit: string;
  actual: number;
  expected: number;
  decimals?: number;
  history: number[];
  baselineHistory: number[];
  onClose: () => void;
}

function riskColor(dev: number, physRange: number): string {
  const pct = Math.abs(dev) / physRange * 100;
  if (pct >= 15) return 'var(--risk-critical)';
  if (pct >= 10) return 'var(--risk-high)';
  if (pct >= 5)  return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

export function SensorPopup({
  sensorId, label, unit, actual, expected, decimals = 2,
  history, baselineHistory, onClose,
}: Props) {
  const deviation = actual - expected;
  const physRange = Math.max(1, Math.max(...history, ...baselineHistory) - Math.min(...history, ...baselineHistory)) * 3;
  const col = riskColor(deviation, physRange);
  const chain = getCauseChain(sensorId);

  /**
   * Deterministic summary of the visible window: spread, drift rate, and — where the sensor has a
   * coded alarm band — the naive linear ETA to it. Computed from the same `stats`/`minutesToAlarm`
   * the training recorder writes as `minsToAlarm_*`, so what the operator reads here and what the
   * dataset records are the same number rather than two independent estimates.
   *
   * Deliberately separate from the AI panel below: this is available with no API key, and it is the
   * evidence against which a model's narrative can be judged.
   */
  const hist = React.useMemo(() => {
    if (history.length < 2) return null;
    const recent = history.slice(-SLOPE_TICKS);
    const st = stats(recent);
    const fk = SENSOR_META[sensorId]?.forecastKey;
    const etaMin = fk ? minutesToAlarm(history, fk) : null;
    const band = fk ? FORECAST_LIMITS[fk] : undefined;
    return {
      n: st.n, min: st.min, max: st.max, mean: st.mean,
      slopePerMin: st.slope * 60,
      etaText: !band ? null
        : etaMin === null ? 'not trending to alarm'
        : etaMin === 0 ? 'already in alarm band'
        : `${etaMin.toFixed(1)} min to ${band.label}`,
    };
  }, [history, sensorId]);
  const dir = deviation > 0 ? 'highDeviation' : 'lowDeviation';

  const { analyze, result, analyzing, error, reset } = useSensorAnalysis();
  // Pulled from context rather than added as props: the diagnosis payload needs the whole engine
  // state (coupled-sensor readings, decision output, root factors), not just this one sensor.
  // `history` here is a number[] prop for this one sensor's chart; the context's SensorHistory is the
  // whole multi-series buffer the evidence payload needs, so it is aliased to avoid shadowing.
  const { snapshot, baseline, history: allHistory, decision, engineState } = useEngine();

  // Build chart data
  const len = Math.max(history.length, baselineHistory.length);
  const chartData = Array.from({ length: len }, (_, i) => ({
    tick: i - len + 1,
    actual: history[i] ?? null,
    baseline: baselineHistory[i] ?? null,
    deviation: (history[i] != null && baselineHistory[i] != null)
      ? history[i]! - baselineHistory[i]!
      : null,
  }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleAnalyze() {
    if (!snapshot || !baseline) return;
    const evidence = buildSensorEvidence({
      sensorId, snapshot, baseline, history: allHistory, decision,
      rootFactors: engine.getRootFactors(),
      engineState,
      knowledgeContext: buildContextString(loadDocuments()),
    });
    void analyze(buildDiagnosisSystemPrompt(), buildSensorDiagnosisPrompt(evidence));
  }

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="glass-card-hi"
        style={{ width: 560, maxHeight: '85vh', overflow: 'auto', padding: '20px 24px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div className="label-xs" style={{ marginBottom: 2 }}>{sensorId}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
              {label.toUpperCase()}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, padding: 4, lineHeight: 1 }}
          >×</button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'BASELINE', value: expected.toFixed(decimals), color: 'var(--text-muted)' },
            { label: 'ACTUAL', value: actual.toFixed(decimals), color: 'var(--text-primary)' },
            {
              label: 'DEVIATION',
              value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(decimals)}`,
              color: col,
            },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{unit}</div>
            </div>
          ))}
        </div>

        {/* Historic analysis — what the window itself says, before any AI is involved */}
        {hist && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
              HISTORIC ANALYSIS — LAST {hist.n} TICKS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { label: 'MIN', value: hist.min.toFixed(decimals) },
                { label: 'MAX', value: hist.max.toFixed(decimals) },
                { label: 'MEAN', value: hist.mean.toFixed(decimals) },
                { label: 'RANGE', value: (hist.max - hist.min).toFixed(decimals) },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 8, background: 'var(--bg-inset)', borderRadius: 6, padding: '8px 12px',
              display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 11,
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Trend{' '}
                <strong style={{ color: hist.slopePerMin === 0 ? 'var(--text-muted)' : col, fontVariantNumeric: 'tabular-nums' }}>
                  {hist.slopePerMin >= 0 ? '+' : ''}{hist.slopePerMin.toFixed(3)} {unit}/min
                </strong>
              </span>
              {/* Only shown where the sensor has a coded alarm band — an ETA against no threshold
                  would be a number with nothing to mean. */}
              {hist.etaText && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  Projected: <strong style={{ color: col }}>{hist.etaText}</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actual vs Baseline chart */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
            ACTUAL vs BASELINE — LAST {len} TICKS
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="grad-actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={col} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={col} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="tick" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font)' }}
                formatter={(v: number, n: string) => [v?.toFixed(decimals) + ' ' + unit, n]}
              />
              <Area dataKey="baseline" stroke="var(--text-dim)" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 2" name="Baseline" />
              <Area dataKey="actual" stroke={col} strokeWidth={2} fill="url(#grad-actual)" dot={false} name="Actual" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Deviation chart */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
            DEVIATION FROM BASELINE
          </div>
          <ResponsiveContainer width="100%" height={72}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="grad-dev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={col} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={col} stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="tick" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font)' }}
                formatter={(v: number) => [v?.toFixed(decimals) + ' ' + unit, 'Dev']}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <Area dataKey="deviation" stroke={col} strokeWidth={1.5} fill="url(#grad-dev)" dot={false} name="Deviation" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cause chain knowledge */}
        {chain && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>
              PHYSICAL PRINCIPLE
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              {chain[dir].principle}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' }}>
              LIKELY CAUSES
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {chain[dir].causes.slice(0, 3).map((c, i) => (
                <li key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', padding: '2px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--text-dim)', minWidth: 14 }}>{i + 1}.</span>
                  {c}
                </li>
              ))}
            </ul>
            <div style={{ fontSize: 9, color: col, marginTop: 6, fontWeight: 600 }}>
              ⏱ {chain[dir].actionWindow}
            </div>
          </div>
        )}

        {/* AI Analysis */}
        <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI ANALYSIS</div>
            {isOpenAIConfigured() ? (
              <button
                onClick={result ? reset : handleAnalyze}
                className="mag-btn mag-btn-ghost"
                disabled={analyzing}
                style={{ fontSize: 9, padding: '4px 10px' }}
              >
                {analyzing ? 'Analyzing…' : result ? 'Reset' : 'Analyze with AI'}
              </button>
            ) : (
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Add an API key on the JARVIS page to enable</span>
            )}
          </div>
          {error && <div style={{ fontSize: 10, color: 'var(--risk-critical)' }}>{error}</div>}
          {result && <div className="ai-stream">{result}</div>}
          {!result && !error && !analyzing && (
            <div className="ai-placeholder">
              Click "Analyze with AI" for a blind root-cause diagnosis — the model receives this sensor's
              deviation and rate, the coded MTU alarm band, the ∂sensor/∂root-factor weights of every fault
              that can move it, and the live readings of the sensors those faults must also move. It is not
              told which fault is injected.
            </div>
          )}
          {analyzing && !result && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Generating analysis…</div>
          )}
        </div>
      </div>
    </div>
  );
}
