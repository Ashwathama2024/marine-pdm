import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, CartesianGrid, ReferenceLine, Legend,
} from 'recharts';
import { useEngine } from '../context/EngineContext';
import {
  DEGRADATION_MODES, ROOT_FACTORS, type RootFactor,
} from '@marine-pdm/simulator';
import {
  getDegradationSamples, clearDegradationSamples, linregress, type RootKey, type DevKey,
} from '../services/degradation-regression';

// ── Matrix ↔ logged-data mappings ─────────────────────────────────────────────
const ROOT_TO_KEY: Record<RootFactor, RootKey> = {
  injFault: 'injFaultMax', coolingEff: 'coolingEffDrop', tcEff: 'tcEffDrop',
  lubeFault: 'lubeFault', bearingFault: 'bearingFaultMax', pistonBlowby: 'pistonBlowby',
};
// matrix sensorId (strip [..]) → logged dev key (null = not logged for regression)
const SENSOR_TO_DEV: Record<string, DevKey | null> = {
  exhaustMeanTemp: 'exhaustMeanTemp', cylTemps: 'exhaustMeanTemp', aSideMeanExhaust: 'exhaustMeanTemp', bSideMeanExhaust: 'exhaustMeanTemp',
  coolantTempAfterEngine: 'coolantTempAfterEngine', lubeOilTemp: null,
  lubeOilPressure: 'lubeOilPressure', lubeLastBearingPressure: 'lubeLastBearingPressure',
  lubeOilPressureAfterFilter: null, pistonCoolingPress: null, filterDifferentialP: null,
  bearingTemps: 'bearingTempMax', tcSpeeds: 'tcSpeed', chargeAirPressure: 'chargeAirPressure',
  chargeAirTemp: null, sfoc: 'sfoc', crankcasePressure: 'crankcasePressure',
  fuelRailPressure: null, exhaustBackPressure: null, cylImbalance: null,
};
const baseSensor = (id: string) => id.replace(/\[.*\]$/, '');

const ROOT_KEYS_ORDER: RootKey[] = ['injFaultMax', 'coolingEffDrop', 'tcEffDrop', 'lubeFault', 'bearingFaultMax', 'pistonBlowby'];
const ROOT_LABEL: Record<RootKey, string> = {
  injFaultMax: 'Injector', coolingEffDrop: 'HT Cooler', tcEffDrop: 'Turbo', lubeFault: 'Lube', bearingFaultMax: 'Bearing', pistonBlowby: 'Blow-by',
};
const ROOT_COLOR: Record<RootKey, string> = {
  injFaultMax: '#EF4444', coolingEffDrop: '#38BDF8', tcEffDrop: '#F59E0B', lubeFault: '#A78BFA', bearingFaultMax: '#F97316', pistonBlowby: '#10B981',
};
// Physical span of each root factor → normalises raw values to a 0–1 severity for KPIs.
const ROOT_MAX: Record<RootKey, number> = {
  injFaultMax: 1, coolingEffDrop: ROOT_FACTORS.coolingEff.rootMax, tcEffDrop: ROOT_FACTORS.tcEff.rootMax,
  lubeFault: 1, bearingFaultMax: 1, pistonBlowby: 1,
};

function Card({ title, children, span = 1 }: { title: string; children: React.ReactNode; span?: number }) {
  return (
    <div className="glass-card" style={{ padding: '12px 14px', gridColumn: `span ${span}` }}>
      <div className="label-xs" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// ── KPI cards ─────────────────────────────────────────────────────────────────
function Kpis({ rf, activeEvents }: { rf: Record<RootKey, number> | null; activeEvents: number }) {
  const degrading = rf ? ROOT_KEYS_ORDER.filter(k => rf[k] > 0.001) : [];
  const peak = rf ? Math.max(0, ...ROOT_KEYS_ORDER.map(k => rf[k])) : 0;
  const dominant = degrading.length ? degrading.reduce((a, b) => (rf![a] >= rf![b] ? a : b)) : null;
  const gaps = DEGRADATION_MODES.reduce((s, m) => s + m.effects.filter(e => !e.modeled).length, 0);
  const kpis = [
    { label: 'COMPONENTS DEGRADING', val: String(degrading.length), col: degrading.length ? 'var(--risk-high)' : 'var(--risk-normal)' },
    { label: 'PEAK ROOT SEVERITY', val: (peak * 100).toFixed(0) + '%', col: peak > 0.5 ? 'var(--risk-critical)' : peak > 0 ? 'var(--risk-warning)' : 'var(--risk-normal)' },
    { label: 'DOMINANT', val: dominant ? ROOT_LABEL[dominant] : '—', col: dominant ? ROOT_COLOR[dominant] : 'var(--text-dim)' },
    { label: 'ACTIVE EVENTS', val: String(activeEvents), col: activeEvents ? 'var(--risk-warning)' : 'var(--risk-normal)' },
    { label: 'MODELING GAPS', val: String(gaps), col: gaps ? 'var(--risk-obs)' : 'var(--risk-normal)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
      {kpis.map(k => (
        <div key={k.label} className="glass-card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: k.col, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.val}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)' }}>{k.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Live effect decomposition (per sensor, contribution from each root factor) ──
function Decomposition({ rf }: { rf: Record<RootKey, number> | null }) {
  if (!rf) return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Start the engine to see live effects.</div>;
  // For each logged sensor, sum contributions = rootValue · matrixWeight across modes.
  const perSensor: Record<string, Record<RootKey, number>> = {};
  for (const mode of DEGRADATION_MODES) {
    const key = ROOT_TO_KEY[mode.rootFactor];
    const sev = rf[key];
    if (sev <= 0.001) continue;
    for (const eff of mode.effects) {
      if (!eff.modeled) continue;
      const dev = SENSOR_TO_DEV[baseSensor(eff.sensorId)];
      if (!dev) continue;
      const contrib = sev * eff.weight;
      perSensor[dev] = perSensor[dev] || {} as Record<RootKey, number>;
      perSensor[dev][key] = (perSensor[dev][key] ?? 0) + contrib;
    }
  }
  const rows = Object.entries(perSensor).map(([sensor, contribs]) => {
    const row: Record<string, number | string> = { sensor };
    let total = 0;
    for (const k of ROOT_KEYS_ORDER) if (contribs[k]) { row[k] = contribs[k]; total += contribs[k]; }
    row.total = total;
    return row;
  });
  if (rows.length === 0) return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No active degradation — inject a fault on the Simulator.</div>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 42)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 40, right: 40, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text-dim)' }} />
        <YAxis type="category" dataKey="sensor" width={130} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} />
        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        {ROOT_KEYS_ORDER.map(k => (
          <Bar key={k} dataKey={k} name={ROOT_LABEL[k]} stackId="a" fill={ROOT_COLOR[k]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Weight matrix heatmap table ─────────────────────────────────────────────────
const MATRIX_COLS = ['cylTemps', 'exhaustMeanTemp', 'coolantTempAfterEngine', 'lubeOilPressure', 'lubeLastBearingPressure', 'bearingTemps', 'tcSpeeds', 'chargeAirPressure', 'sfoc', 'crankcasePressure', 'exhaustBackPressure', 'fuelRailPressure'];
const COL_SHORT: Record<string, string> = {
  cylTemps: 'Cyl T', exhaustMeanTemp: 'Exh', coolantTempAfterEngine: 'Jkt', lubeOilPressure: 'LO P', lubeLastBearingPressure: 'LastBrg',
  bearingTemps: 'Brg T', tcSpeeds: 'TC', chargeAirPressure: 'ChA P', sfoc: 'SFOC', crankcasePressure: 'Crank', exhaustBackPressure: 'BackP', fuelRailPressure: 'Rail',
};
function MatrixTable() {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table" style={{ fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)' }}>Mode</th>
            <th>Root</th>
            {MATRIX_COLS.map(c => <th key={c} style={{ textAlign: 'center' }}>{COL_SHORT[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {DEGRADATION_MODES.map(mode => {
            const byCol: Record<string, { w: number; kind: string; modeled: boolean }> = {};
            for (const e of mode.effects) { const b = baseSensor(e.sensorId); byCol[b] = { w: e.weight, kind: e.kind, modeled: e.modeled }; }
            return (
              <tr key={mode.id}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', whiteSpace: 'nowrap' }}>
                  <span style={{ color: ROOT_COLOR[ROOT_TO_KEY[mode.rootFactor]], fontWeight: 700 }}>{mode.id}</span> {mode.name.split('(')[0].trim()}
                </td>
                <td style={{ color: 'var(--text-dim)' }}>{ROOT_FACTORS[mode.rootFactor].label}</td>
                {MATRIX_COLS.map(c => {
                  const cell = byCol[c];
                  if (!cell) return <td key={c} style={{ textAlign: 'center', color: 'var(--border)' }}>·</td>;
                  const mag = Math.min(1, Math.abs(cell.w) / 65);
                  const isPrimary = cell.kind === 'PRIMARY';
                  const bg = !cell.modeled ? 'rgba(167,139,250,0.10)' : `rgba(${isPrimary ? '239,68,68' : '56,189,248'},${0.08 + mag * 0.32})`;
                  return (
                    <td key={c} title={`${cell.kind}${cell.modeled ? '' : ' · NOT MODELED (gap)'} · weight ${cell.w}`}
                      style={{ textAlign: 'center', background: bg, fontWeight: isPrimary ? 700 : 500, color: !cell.modeled ? 'var(--risk-obs)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {cell.modeled ? cell.w : '⌀'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 8, color: 'var(--text-dim)' }}>
        <span style={{ color: '#EF4444' }}>■ primary</span>
        <span style={{ color: '#38BDF8' }}>■ secondary (∂sensor/∂root)</span>
        <span style={{ color: 'var(--risk-obs)' }}>⌀ claimed but not in physics</span>
      </div>
    </div>
  );
}

// ── Dependency graph: fault → root factor → sensor (layered SVG) ─────────────────
function DependencyGraph({ rf }: { rf: Record<RootKey, number> | null }) {
  const W = 760, rowH = 26;
  const factors = ROOT_KEYS_ORDER;
  const sensors = MATRIX_COLS;
  const H = Math.max(DEGRADATION_MODES.length, factors.length, sensors.length) * rowH + 20;
  const xMode = 70, xFactor = W / 2, xSensor = W - 70;
  const yOf = (i: number, n: number) => ((i + 0.5) / n) * H;
  const factorY = (k: RootKey) => yOf(factors.indexOf(k), factors.length);
  const sensorY = (s: string) => yOf(sensors.indexOf(s), sensors.length);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ minWidth: 600 }}>
        {/* edges mode→factor */}
        {DEGRADATION_MODES.map((m, i) => {
          const k = ROOT_TO_KEY[m.rootFactor];
          const active = rf && rf[k] > 0.001;
          return <line key={'mf' + m.id} x1={xMode + 34} y1={yOf(i, DEGRADATION_MODES.length)} x2={xFactor - 30} y2={factorY(k)}
            stroke={active ? ROOT_COLOR[k] : 'var(--border)'} strokeWidth={active ? 2 : 1} opacity={active ? 0.9 : 0.4} />;
        })}
        {/* edges factor→sensor (weighted) */}
        {DEGRADATION_MODES.flatMap(m => {
          const k = ROOT_TO_KEY[m.rootFactor];
          const active = rf && rf[k] > 0.001;
          return m.effects.filter(e => e.modeled).map((e, j) => {
            const s = baseSensor(e.sensorId); if (!sensors.includes(s)) return null;
            return <line key={'fs' + m.id + j} x1={xFactor + 30} y1={factorY(k)} x2={xSensor - 34} y2={sensorY(s)}
              stroke={active ? ROOT_COLOR[k] : 'var(--border)'} strokeWidth={Math.max(0.6, Math.min(3, Math.abs(e.weight) / 25))} opacity={active ? 0.6 : 0.18} />;
          });
        })}
        {/* nodes */}
        {DEGRADATION_MODES.map((m, i) => (
          <text key={'m' + m.id} x={xMode} y={yOf(i, DEGRADATION_MODES.length) + 3} fontSize={9} fill="var(--text-secondary)" textAnchor="middle">{m.id}</text>
        ))}
        {factors.map(k => {
          const active = rf && rf[k] > 0.001;
          return <g key={'f' + k}>
            <circle cx={xFactor} cy={factorY(k)} r={5} fill={active ? ROOT_COLOR[k] : 'var(--bg-elevated)'} stroke={ROOT_COLOR[k]} strokeWidth={1.2} />
            <text x={xFactor + 10} y={factorY(k) + 3} fontSize={9} fill={active ? ROOT_COLOR[k] : 'var(--text-dim)'}>{ROOT_LABEL[k]}</text>
          </g>;
        })}
        {sensors.map(s => (
          <text key={'s' + s} x={xSensor} y={sensorY(s) + 3} fontSize={8} fill="var(--text-dim)" textAnchor="middle">{COL_SHORT[s]}</text>
        ))}
        <text x={xMode} y={12} fontSize={8} fill="var(--text-dim)" textAnchor="middle">FAULT</text>
        <text x={xFactor} y={12} fontSize={8} fill="var(--text-dim)" textAnchor="middle">ROOT FACTOR</text>
        <text x={xSensor} y={12} fontSize={8} fill="var(--text-dim)" textAnchor="middle">SENSOR</text>
      </svg>
    </div>
  );
}

// Per-sensor thermal/hydraulic lag α (mirrors physics.ts LAG). Lag-matching the root
// factor to this cancels ramp hysteresis so the slope recovers the steady-state weight.
const SENSOR_LAG: Record<DevKey, number> = {
  exhaustMeanTemp: 0.08, coolantTempAfterEngine: 0.02, lubeOilPressure: 0.06,
  lubeLastBearingPressure: 0.05, bearingTempMax: 0.02, tcSpeed: 0.08,
  chargeAirPressure: 0.08, sfoc: 0.03, crankcasePressure: 0.15,
};

// ── Time-series + regression validation (selected root × sensor) ─────────────────
function RegressionPanel() {
  const [rootKey, setRootKey] = useState<RootKey>('coolingEffDrop');
  const [devKey, setDevKey] = useState<DevKey>('exhaustMeanTemp');
  const [lagMatch, setLagMatch] = useState(true);
  const [, setArm] = useState(0);
  const samples = getDegradationSamples();
  // Lag-match the root-factor series to the sensor time constant (α=1 → no lag).
  const alpha = lagMatch ? (SENSOR_LAG[devKey] ?? 0.08) : 1;
  const xs: number[] = [];
  let lagVal = samples.length ? samples[0]!.rf[rootKey] : 0;
  for (const s of samples) { lagVal = lagVal + alpha * (s.rf[rootKey] - lagVal); xs.push(lagVal); }
  const pts = samples.map((s, i) => ({ i, x: xs[i]!, y: s.dev[devKey] }));
  const reg = linregress(pts.map(p => p.x), pts.map(p => p.y));
  // matrix weight for this (rootKey, devKey) pair, if any
  const matchMode = DEGRADATION_MODES.find(m => ROOT_TO_KEY[m.rootFactor] === rootKey && m.effects.some(e => e.modeled && SENSOR_TO_DEV[baseSensor(e.sensorId)] === devKey));
  const matrixW = matchMode?.effects.find(e => SENSOR_TO_DEV[baseSensor(e.sensorId)] === devKey && e.modeled)?.weight;
  const sel: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', color: 'var(--text-secondary)', fontSize: 10, borderRadius: 4, padding: '3px 6px', fontFamily: 'var(--font)' };
  const tsData = samples.map((s, i) => ({ i, root: s.rf[rootKey], dev: s.dev[devKey] }));
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>ROOT</span>
        <select style={sel} value={rootKey} onChange={e => setRootKey(e.target.value as RootKey)}>
          {ROOT_KEYS_ORDER.map(k => <option key={k} value={k}>{ROOT_LABEL[k]}</option>)}
        </select>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>SENSOR Δ</span>
        <select style={sel} value={devKey} onChange={e => setDevKey(e.target.value as DevKey)}>
          {(['exhaustMeanTemp', 'coolantTempAfterEngine', 'lubeOilPressure', 'lubeLastBearingPressure', 'bearingTempMax', 'tcSpeed', 'chargeAirPressure', 'sfoc', 'crankcasePressure'] as DevKey[]).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <button
          onClick={() => { clearDegradationSamples(); setArm(n => n + 1); }}
          title="Clear the sample buffer and capture a fresh window — arm just before injecting a fault for a clean fit"
          style={{ ...sel, cursor: 'pointer', color: 'var(--accent-blue)', borderColor: 'rgba(56,189,248,0.4)' }}
        >
          ⟳ CLEAR &amp; ARM
        </button>
        <button
          onClick={() => setLagMatch(v => !v)}
          title="Lag-match the root factor to the sensor's thermal time constant so the regression recovers the steady-state weight even during a fast ramp"
          style={{ ...sel, cursor: 'pointer', color: lagMatch ? 'var(--risk-normal)' : 'var(--text-dim)', borderColor: lagMatch ? 'rgba(0,212,170,0.4)' : 'var(--border-dim)' }}
        >
          {lagMatch ? '◉' : '○'} LAG-MATCH
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {reg ? <>slope <b style={{ color: 'var(--accent-blue)' }}>{reg.slope.toFixed(2)}</b> · R² <b style={{ color: reg.r2 > 0.9 ? 'var(--risk-normal)' : 'var(--risk-warning)' }}>{reg.r2.toFixed(3)}</b> · n {reg.n}</> : 'collecting…'}
          {matrixW !== undefined && <> · matrix <b style={{ color: 'var(--risk-obs)' }}>{matrixW}</b></>}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12 }}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={tsData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="i" hide />
            <YAxis yAxisId="l" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} width={32} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} width={32} />
            <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
            <Line yAxisId="l" dataKey="root" name={ROOT_LABEL[rootKey] + ' (root)'} stroke={ROOT_COLOR[rootKey]} dot={false} strokeWidth={2} />
            <Line yAxisId="r" dataKey="dev" name={devKey + ' Δ'} stroke="var(--text-secondary)" dot={false} strokeWidth={1.5} />
            <Legend wrapperStyle={{ fontSize: 8 }} />
          </LineChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={180}>
          <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis type="number" dataKey="x" name="root" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
            <YAxis type="number" dataKey="y" name="dev" tick={{ fontSize: 8, fill: 'var(--text-dim)' }} width={32} />
            <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
            <Scatter data={pts} fill={ROOT_COLOR[rootKey]} />
            {reg && <ReferenceLine ifOverflow="extendDomain" segment={[{ x: 0, y: reg.intercept }, { x: Math.max(...pts.map(p => p.x), 0.01), y: reg.intercept + reg.slope * Math.max(...pts.map(p => p.x), 0.01) }]} stroke="var(--accent-blue)" strokeWidth={2} />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function DegradationBI() {
  const { snapshot } = useEngine();          // re-render each tick
  void snapshot;
  const samples = getDegradationSamples();
  const rf = samples.length ? samples[samples.length - 1]!.rf : null;
  // active detected events count (DegradationContext) — read via the live samples proxy isn't available here;
  // use root-factor activity as the live signal.
  const activeEvents = rf ? ROOT_KEYS_ORDER.filter(k => rf[k] > 0.001).length : 0;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="page-title">DEGRADATION ANALYTICS</div>
          <div className="page-subtitle">WEIGHT MATRIX · LIVE EFFECT DECOMPOSITION · DEPENDENCY GRAPH · REGRESSION VALIDATION</div>
        </div>
      </div>
      <Kpis rf={rf} activeEvents={activeEvents} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, alignItems: 'start' }}>
        <Card title="LIVE EFFECT DECOMPOSITION — Σ root factor × weight"><Decomposition rf={rf} /></Card>
        <Card title="DEPENDENCY GRAPH — fault → root factor → sensor"><DependencyGraph rf={rf} /></Card>
      </div>
      <div style={{ marginTop: 12 }}>
        <Card title="DEGRADATION WEIGHT MATRIX — ∂sensor / ∂root factor (per unit severity·intensity)"><MatrixTable /></Card>
      </div>
      <div style={{ marginTop: 12 }}>
        <Card title="SEVERITY → DEVIATION (time-series) + REGRESSION VALIDATION (slope ≈ matrix weight, R²)"><RegressionPanel /></Card>
      </div>
    </div>
  );
}
