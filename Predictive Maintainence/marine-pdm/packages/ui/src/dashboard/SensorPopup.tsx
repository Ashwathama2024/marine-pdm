import React, { useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { getCauseChain } from '../services/cause-chains';
import { useGPTAnalysis } from '../hooks/useGPTAnalysis';
import { buildSensorAnalysisPrompt } from '../services/prompts';
import { isOpenAIConfigured } from '../services/openai-client';
import { buildContextString, loadDocuments } from '../services/knowledge-store';

interface Props {
  sensorId: string;
  label: string;
  unit: string;
  actual: number;
  expected: number;
  decimals?: number;
  history: number[];
  baselineHistory: number[];
  load: number;
  rpm: number;
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
  history, baselineHistory, load, rpm, onClose,
}: Props) {
  const deviation = actual - expected;
  const physRange = Math.max(1, Math.max(...history, ...baselineHistory) - Math.min(...history, ...baselineHistory)) * 3;
  const col = riskColor(deviation, physRange);
  const chain = getCauseChain(sensorId);
  const dir = deviation > 0 ? 'highDeviation' : 'lowDeviation';

  const { analyze, result, analyzing, error, reset } = useGPTAnalysis();

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
    const context = buildContextString(loadDocuments());
    const prompt = buildSensorAnalysisPrompt(
      sensorId, label, unit, actual, expected, deviation,
      (deviation / expected) * 100,
      0, load, rpm, chain, context,
    );
    analyze(prompt);
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
              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Set VITE_OPENAI_API_KEY to enable</span>
            )}
          </div>
          {error && <div style={{ fontSize: 10, color: 'var(--risk-critical)' }}>{error}</div>}
          {result && <div className="ai-stream">{result}</div>}
          {!result && !error && !analyzing && (
            <div className="ai-placeholder">Click "Analyze with AI" for root-cause analysis by GPT-4o.</div>
          )}
          {analyzing && !result && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Generating analysis…</div>
          )}
        </div>
      </div>
    </div>
  );
}
