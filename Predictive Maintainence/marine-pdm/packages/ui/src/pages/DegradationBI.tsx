import React, { useState, useMemo } from 'react';
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
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>{k.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Live effect decomposition (per sensor, contribution from each root factor) ──
function Decomposition({ rf }: { rf: Record<RootKey, number> | null }) {
  if (!rf) return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Start the engine to see live effects.</div>;
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
  if (rows.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No active degradation — inject a fault on the Simulator.</div>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 42)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 40, right: 40, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
        <YAxis type="category" dataKey="sensor" width={130} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
        <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
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
                <td style={{ color: 'var(--text-secondary)' }}>{ROOT_FACTORS[mode.rootFactor].label}</td>
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
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ color: '#EF4444' }}>■ primary</span>
        <span style={{ color: '#38BDF8' }}>■ secondary (∂sensor/∂root)</span>
        <span style={{ color: 'var(--risk-obs)' }}>⌀ claimed but not in physics</span>
      </div>
    </div>
  );
}

// ── Dependency graph: fault → root factor → sensor (layered SVG, click-to-trace) ──
type GraphNode = { kind: 'mode' | 'factor' | 'sensor'; id: string };

function DependencyGraph({ rf }: { rf: Record<RootKey, number> | null }) {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const W = 760, rowH = 28, topPad = 30;
  const factors = ROOT_KEYS_ORDER;
  const sensors = MATRIX_COLS;
  const rowsH = Math.max(DEGRADATION_MODES.length, factors.length, sensors.length) * rowH;
  const H = rowsH + topPad;
  const xMode = 70, xFactor = W / 2, xSensor = W - 70;
  // Row 0 always lands well clear of the header band — fixes header/first-row overlap.
  const yOf = (i: number, n: number) => topPad + ((i + 0.5) / n) * rowsH;
  const factorY = (k: RootKey) => yOf(factors.indexOf(k), factors.length);
  const sensorY = (s: string) => yOf(sensors.indexOf(s), sensors.length);

  // Which modes/factors/sensors light up for the current selection (click-to-trace).
  const trace = useMemo(() => {
    if (!selected) return null;
    const modes = new Set<string>(), facs = new Set<RootKey>(), sens = new Set<string>();
    const addMode = (m: (typeof DEGRADATION_MODES)[number]) => {
      modes.add(m.id);
      facs.add(ROOT_TO_KEY[m.rootFactor]);
      m.effects.filter(e => e.modeled).forEach(e => { const s = baseSensor(e.sensorId); if (sensors.includes(s)) sens.add(s); });
    };
    if (selected.kind === 'mode') {
      const m = DEGRADATION_MODES.find(mm => mm.id === selected.id);
      if (m) addMode(m);
    } else if (selected.kind === 'factor') {
      facs.add(selected.id as RootKey);
      DEGRADATION_MODES.filter(m => ROOT_TO_KEY[m.rootFactor] === selected.id).forEach(addMode);
    } else {
      sens.add(selected.id);
      DEGRADATION_MODES.forEach(m => {
        if (m.effects.some(e => e.modeled && baseSensor(e.sensorId) === selected.id)) { modes.add(m.id); facs.add(ROOT_TO_KEY[m.rootFactor]); }
      });
    }
    return { modes, facs, sens };
  }, [selected]);

  const toggle = (kind: GraphNode['kind'], id: string) =>
    setSelected(sel => (sel && sel.kind === kind && sel.id === id) ? null : { kind, id });
  const glow = (color: string, r: number) => ({ filter: `drop-shadow(0 0 ${r}px ${color})` });
  const selLabel = !selected ? null : selected.kind === 'factor' ? ROOT_LABEL[selected.id as RootKey] : selected.kind === 'sensor' ? COL_SHORT[selected.id] : selected.id;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 10 }}>
        <span style={{ color: 'var(--text-muted)' }}>
          {selected ? <>tracing <b style={{ color: 'var(--text-primary)' }}>{selLabel}</b></> : 'click a node to trace its connections'}
        </span>
        {selected && <span onClick={() => setSelected(null)} style={{ color: 'var(--accent-blue)', cursor: 'pointer' }}>✕ clear</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ minWidth: 600 }}>
          <rect x={0} y={0} width={W} height={H} fill="transparent" onClick={() => setSelected(null)} />
          {/* edges mode→factor */}
          {DEGRADATION_MODES.map((m, i) => {
            const k = ROOT_TO_KEY[m.rootFactor];
            const active = !!(rf && rf[k] > 0.001);
            const hi = !!trace && trace.modes.has(m.id) && trace.facs.has(k);
            const dim = !!trace && !hi;
            return <line key={'mf' + m.id} x1={xMode + 14} y1={yOf(i, DEGRADATION_MODES.length)} x2={xFactor - 14} y2={factorY(k)}
              stroke={hi || active ? ROOT_COLOR[k] : 'var(--border-hi)'}
              strokeWidth={hi ? 3 : active ? 2 : 1.2}
              opacity={dim ? 0.08 : hi ? 1 : active ? 0.9 : 0.6}
              style={hi ? glow(ROOT_COLOR[k], 3) : undefined} />;
          })}
          {/* edges factor→sensor (weighted) — start clears the factor label so lines don't cut through text */}
          {DEGRADATION_MODES.flatMap(m => {
            const k = ROOT_TO_KEY[m.rootFactor];
            const active = !!(rf && rf[k] > 0.001);
            return m.effects.filter(e => e.modeled).map((e, j) => {
              const s = baseSensor(e.sensorId); if (!sensors.includes(s)) return null;
              const hi = !!trace && trace.modes.has(m.id) && trace.sens.has(s);
              const dim = !!trace && !hi;
              return <line key={'fs' + m.id + j} x1={xFactor + 82} y1={factorY(k)} x2={xSensor - 14} y2={sensorY(s)}
                stroke={hi || active ? ROOT_COLOR[k] : 'var(--border-hi)'}
                strokeWidth={hi ? Math.max(1.5, Math.min(4, Math.abs(e.weight) / 18)) : Math.max(0.8, Math.min(3, Math.abs(e.weight) / 25))}
                opacity={dim ? 0.06 : hi ? 1 : active ? 0.6 : 0.38}
                style={hi ? glow(ROOT_COLOR[k], 3) : undefined} />;
            });
          })}
          {/* mode nodes */}
          {DEGRADATION_MODES.map((m, i) => {
            const k = ROOT_TO_KEY[m.rootFactor];
            const hi = !!trace && trace.modes.has(m.id);
            const isSel = selected?.kind === 'mode' && selected.id === m.id;
            const y = yOf(i, DEGRADATION_MODES.length);
            return (
              <g key={'m' + m.id} onClick={() => toggle('mode', m.id)} style={{ cursor: 'pointer' }} opacity={trace && !hi ? 0.3 : 1}>
                <circle cx={xMode} cy={y} r={isSel ? 6 : 3.5} fill={hi ? ROOT_COLOR[k] : 'var(--bg-elevated)'} stroke={ROOT_COLOR[k]} strokeWidth={1.2}
                  style={hi ? glow(ROOT_COLOR[k], isSel ? 7 : 4) : undefined} />
                <text x={xMode - 10} y={y + 3} fontSize={10} fontWeight={hi ? 700 : 500} fill={hi ? ROOT_COLOR[k] : 'var(--text-secondary)'} textAnchor="end">{m.id}</text>
              </g>
            );
          })}
          {/* factor nodes */}
          {factors.map(k => {
            const active = !!(rf && rf[k] > 0.001);
            const hi = !!trace && trace.facs.has(k);
            const isSel = selected?.kind === 'factor' && selected.id === k;
            const y = factorY(k);
            return (
              <g key={'f' + k} onClick={() => toggle('factor', k)} style={{ cursor: 'pointer' }} opacity={trace && !hi ? 0.3 : 1}>
                <circle cx={xFactor} cy={y} r={isSel ? 7 : 5} fill={active || hi ? ROOT_COLOR[k] : 'var(--bg-elevated)'} stroke={ROOT_COLOR[k]} strokeWidth={1.4}
                  style={hi ? glow(ROOT_COLOR[k], isSel ? 8 : 5) : undefined} />
                <text x={xFactor + 11} y={y + 3} fontSize={10} fontWeight={hi ? 700 : 500} fill={active || hi ? ROOT_COLOR[k] : 'var(--text-muted)'}>{ROOT_LABEL[k]}</text>
              </g>
            );
          })}
          {/* sensor nodes */}
          {sensors.map(s => {
            const hi = !!trace && trace.sens.has(s);
            const isSel = selected?.kind === 'sensor' && selected.id === s;
            const y = sensorY(s);
            return (
              <g key={'s' + s} onClick={() => toggle('sensor', s)} style={{ cursor: 'pointer' }} opacity={trace && !hi ? 0.3 : 1}>
                <circle cx={xSensor} cy={y} r={isSel ? 6 : 3.5} fill={hi ? 'var(--accent-blue)' : 'var(--bg-elevated)'} stroke={hi ? 'var(--accent-blue)' : 'var(--border-hi)'} strokeWidth={1.2}
                  style={hi ? glow('var(--accent-blue)', isSel ? 7 : 4) : undefined} />
                <text x={xSensor + 10} y={y + 3} fontSize={10} fontWeight={hi ? 700 : 500} fill={hi ? 'var(--accent-blue)' : 'var(--text-muted)'} textAnchor="start">{COL_SHORT[s]}</text>
              </g>
            );
          })}
          <text x={xMode} y={16} fontSize={10} fill="var(--text-muted)" textAnchor="middle">FAULT</text>
          <text x={xFactor} y={16} fontSize={10} fill="var(--text-muted)" textAnchor="middle">ROOT FACTOR</text>
          <text x={xSensor} y={16} fontSize={10} fill="var(--text-muted)" textAnchor="middle">SENSOR</text>
        </svg>
      </div>
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
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>ROOT</span>
        <select style={sel} value={rootKey} onChange={e => setRootKey(e.target.value as RootKey)}>
          {ROOT_KEYS_ORDER.map(k => <option key={k} value={k}>{ROOT_LABEL[k]}</option>)}
        </select>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>SENSOR Δ</span>
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
          style={{ ...sel, cursor: 'pointer', color: lagMatch ? 'var(--risk-normal)' : 'var(--text-muted)', borderColor: lagMatch ? 'rgba(0,212,170,0.4)' : 'var(--border-dim)' }}
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
            <YAxis yAxisId="l" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} width={32} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} width={32} />
            <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
            <Line yAxisId="l" dataKey="root" name={ROOT_LABEL[rootKey] + ' (root)'} stroke={ROOT_COLOR[rootKey]} dot={false} strokeWidth={2} />
            <Line yAxisId="r" dataKey="dev" name={devKey + ' Δ'} stroke="var(--text-secondary)" dot={false} strokeWidth={1.5} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </LineChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={180}>
          <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis type="number" dataKey="x" name="root" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
            <YAxis type="number" dataKey="y" name="dev" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} width={32} />
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
