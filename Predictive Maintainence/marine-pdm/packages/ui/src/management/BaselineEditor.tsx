import React, { useState } from 'react';
import type { BaselineStore } from '@marine-pdm/knowledge';

interface Props {
  sensorId: string;
  store: BaselineStore;
  currentLoad: number;
  currentRpm: number;
  currentCoolingEff: number;
  recentActuals: number[]; // last 100 readings for scatter plot
}

export function BaselineEditor({
  sensorId, store, currentLoad, currentRpm, currentCoolingEff, recentActuals,
}: Props) {
  const curve = store.getActiveCurve(sensorId);
  const [equation, setEquation] = useState(curve?.equation ?? '');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const expected = store.getExpected(sensorId, { load: currentLoad, rpm: currentRpm, coolingEff: currentCoolingEff });

  function handleSave() {
    setError('');
    if (!source.trim()) {
      setError('Source field is mandatory — specify the origin of this baseline data');
      return;
    }
    try {
      store.addCurve({
        sensorId,
        equation,
        coefficients: {},
        dependsOn: ['load', 'rpm', 'coolingEff'],
        validLoadMin: 10,
        validLoadMax: 100,
        source: source.trim(),
        addedDate: new Date().toISOString(),
        isActive: true,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Generate scatter plot data: y = actual readings, x = index
  const plotH = 80;
  const plotW = 300;
  const minY = Math.min(...recentActuals, expected ?? 0) - 5;
  const maxY = Math.max(...recentActuals, expected ?? 0) + 5;
  const yRange = maxY - minY || 1;

  const dots = recentActuals.map((v, i) => ({
    cx: (i / Math.max(recentActuals.length - 1, 1)) * plotW,
    cy: plotH - ((v - minY) / yRange) * plotH,
  }));

  const expectedY = expected !== null ? plotH - ((expected - minY) / yRange) * plotH : null;

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        Baseline Editor — {sensorId}
      </div>

      {curve && (
        <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
          Active: <code style={{ color: 'var(--risk-normal)' }}>{curve.equation}</code>
          <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Source: {curve.source}</span>
        </div>
      )}

      {/* Scatter plot: actuals vs current curve */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
          Actual readings vs baseline expected (load={currentLoad}%, rpm={currentRpm})
        </div>
        <svg width={plotW} height={plotH} style={{ background: 'var(--bg-main)', borderRadius: 4, display: 'block' }}>
          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={1.5} fill="#4A9EFF" opacity={0.6} />
          ))}
          {expectedY !== null && (
            <line x1={0} y1={expectedY} x2={plotW} y2={expectedY}
              stroke="var(--risk-normal)" strokeWidth={1.5} strokeDasharray="4,4" />
          )}
        </svg>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          <span style={{ color: '#4A9EFF' }}>● actuals</span>
          &nbsp;&nbsp;
          <span style={{ color: 'var(--risk-normal)' }}>-- expected</span>
          {expected !== null && <span> ({expected.toFixed(1)})</span>}
        </div>
      </div>

      {/* Equation editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
            Equation (variables: load, rpm, coolingEff)
          </label>
          <input
            value={equation}
            onChange={e => setEquation(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            placeholder="250 + load * 1.4 + rpm / 700 * 10 / coolingEff"
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--risk-critical)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
            Source * (mandatory)
          </label>
          <input
            value={source}
            onChange={e => setSource(e.target.value)}
            style={{ width: '100%', fontSize: 12 }}
            placeholder="MAN B&W Sea Trial 2024 — 85% MCR measurements"
          />
        </div>
        {error && <div style={{ fontSize: 11, color: 'var(--risk-critical)' }}>{error}</div>}
        <button
          onClick={handleSave}
          style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600, alignSelf: 'flex-start',
            background: saved ? 'var(--risk-normal)' : 'var(--bg-main)',
            color: saved ? '#000' : 'var(--risk-normal)',
            border: '1px solid var(--risk-normal)', borderRadius: 4,
          }}
        >
          {saved ? '✓ Saved (new version)' : 'Save New Version'}
        </button>
      </div>

      {/* History */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
          Version History
        </div>
        {store.getCurveHistory(sensorId).slice().reverse().map((c, i) => (
          <div key={i} style={{ fontSize: 10, color: c.isActive ? 'var(--text-primary)' : 'var(--text-muted)', paddingBottom: 4 }}>
            {c.isActive ? '▶ ' : '  '}[{c.addedDate.split('T')[0]}] {c.equation.slice(0, 50)}… — {c.source}
          </div>
        ))}
      </div>
    </div>
  );
}
