import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { engine, useEngine } from '../context/EngineContext';
import { useSensorAnalysis } from '../hooks/useSensorAnalysis';
import { buildDiagnosisSystemPrompt, buildSensorDiagnosisPrompt } from '../services/prompts';
import { buildSensorEvidence } from '../services/sensor-evidence';
import { buildContextString, loadDocuments } from '../services/knowledge-store';
import { isOpenAIConfigured } from '../services/openai-client';
import { useSensorFocus } from '../context/SensorFocusContext';

interface SensorRow {
  sensorId: string;
  label: string;
  unit: string;
  decimals: number;
  actual: number;
  expected: number;
  histKey: string;
  baseKey: string;
}

function deviationColor(dev: number, physRange: number): string {
  const pct = Math.abs(dev / physRange);
  if (pct > 0.15) return 'var(--risk-critical)';
  if (pct > 0.10) return 'var(--risk-high)';
  if (pct > 0.05) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

const PHYS_RANGES: Record<string, number> = {
  exhaustTemp: 400, lubeOilPressure: 6.5, fuelRack: 115,
  scavengeAir: 4.5, tcRPM: 30000, jacketOutlet: 55, sfoc: 85,
  chargeAirTemp: 75, fuelOilPressure: 9.0, fuelOilTemp: 35,
  loFilterDP: 2.0, pistonCoolingPress: 8.0, shaftPower: 6000,
};

function SensorDeviationCard({
  row, history, baseHistory,
}: {
  row: SensorRow;
  history: number[];
  baseHistory: number[];
}) {
  const [showAI, setShowAI] = useState(false);
  const { analyze, result, analyzing, error } = useSensorAnalysis();
  const eng = useEngine();
  const deviation = row.actual - row.expected;
  const physRange = PHYS_RANGES[row.histKey] ?? 100;
  const col = deviationColor(deviation, physRange);

  const len = Math.max(history.length, baseHistory.length);
  const chartData = Array.from({ length: len }, (_, i) => ({
    t: i - len + 1,
    actual: history[i] ?? null,
    baseline: baseHistory[i] ?? null,
  }));

  // Rolling stats (last 30)
  const recent = history.slice(-30);
  const meanDev = recent.length
    ? recent.reduce((s, v, i) => s + (v - (baseHistory[baseHistory.length - 30 + i] ?? v)), 0) / recent.length
    : 0;
  const maxDev = recent.reduce((m, v, i) => Math.max(m, Math.abs(v - (baseHistory[baseHistory.length - 30 + i] ?? v))), 0);

  function handleAnalyze() {
    if (!eng.snapshot || !eng.baseline) return;
    const evidence = buildSensorEvidence({
      sensorId: row.sensorId,
      snapshot: eng.snapshot, baseline: eng.baseline, history: eng.history, decision: eng.decision,
      rootFactors: engine.getRootFactors(),
      engineState: eng.engineState,
      knowledgeContext: buildContextString(loadDocuments()),
    });
    void analyze(buildDiagnosisSystemPrompt(), buildSensorDiagnosisPrompt(evidence));
    setShowAI(true);
  }

  return (
    <div className="glass-card" style={{ padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div className="label-xs">{row.sensorId}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginTop: 1 }}>{row.label}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums',
            background: `rgba(${col === 'var(--risk-normal)' ? '0,212,170' : col === 'var(--risk-warning)' ? '245,158,11' : col === 'var(--risk-high)' ? '249,115,22' : '239,68,68'}, 0.1)`,
            padding: '3px 8px', borderRadius: 4,
          }}>
            {deviation >= 0 ? '+' : ''}{deviation.toFixed(row.decimals)} {row.unit}
          </span>
        </div>
      </div>

      {/* Area chart */}
      <ResponsiveContainer width="100%" height={90}>
        <AreaChart data={chartData} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g-${row.histKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={col} stopOpacity={0.25}/>
              <stop offset="100%" stopColor={col} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis dataKey="t" hide />
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font)' }}
            formatter={(v: number, n: string) => [v?.toFixed(row.decimals) + ' ' + row.unit, n]}
          />
          <Area dataKey="baseline" stroke="var(--border-hi)" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 2" name="Baseline" />
          <Area dataKey="actual" stroke={col} strokeWidth={2} fill={`url(#g-${row.histKey})`} dot={false} name="Actual" />
        </AreaChart>
      </ResponsiveContainer>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[
          { label: 'ACTUAL',   val: row.actual.toFixed(row.decimals) },
          { label: 'BASELINE', val: row.expected.toFixed(row.decimals) },
          { label: 'MEAN DEV', val: (meanDev >= 0 ? '+' : '') + meanDev.toFixed(row.decimals) },
          { label: 'MAX DEV',  val: maxDev.toFixed(row.decimals) },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: 'var(--bg-inset)', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{s.val}</div>
          </div>
        ))}
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="mag-btn mag-btn-ghost"
          style={{ fontSize: 8, padding: '4px 8px', whiteSpace: 'nowrap' }}
        >
          {analyzing ? '…' : isOpenAIConfigured() ? 'AI' : '—'}
        </button>
      </div>

      {/* AI result */}
      {showAI && (result || error) && (
        <div style={{ marginTop: 8 }}>
          {error && <div style={{ fontSize: 10, color: 'var(--risk-critical)' }}>{error}</div>}
          {result && <div className="ai-stream">{result}</div>}
        </div>
      )}
    </div>
  );
}

export function DeviationDashboard() {
  const { snapshot, baseline, history } = useEngine();
  const { focus } = useSensorFocus();

  if (!snapshot || !baseline) {
    return <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>Waiting for engine data…</div>;
  }

  const rows: SensorRow[] = [
    { sensorId: 'ME.ExhaustTemp',         label: 'Exhaust Temperature',      unit: '°C',    decimals: 1, actual: snapshot.exhaustTemp,         expected: baseline.expectedExhaust,           histKey: 'exhaustTemp',        baseKey: 'baseExhaust' },
    { sensorId: 'ME.LubeOilPressure',     label: 'LO Pressure',              unit: 'bar',   decimals: 2, actual: snapshot.lubeOilPressure,     expected: baseline.expectedLube,              histKey: 'lubeOilPressure',    baseKey: 'baseLube' },
    { sensorId: 'ME.ScavengeAirPressure', label: 'Charge Air Pressure',      unit: 'bar',   decimals: 2, actual: snapshot.scavengeAir,         expected: baseline.expectedScavenge,          histKey: 'scavengeAir',        baseKey: 'baseScavenge' },
    { sensorId: 'ME.ChargeAirTemp',       label: 'Charge Air Temperature',   unit: '°C',    decimals: 1, actual: snapshot.chargeAirTemp,       expected: baseline.expectedChargeAirTemp,     histKey: 'chargeAirTemp',      baseKey: 'baseChargeAirTemp' },
    { sensorId: 'ME.TCSpeed',             label: 'Turbocharger Speed',        unit: 'RPM',   decimals: 0, actual: snapshot.tcRPM,               expected: baseline.expectedTcRPM,             histKey: 'tcRPM',              baseKey: 'baseTcRPM' },
    { sensorId: 'ME.JacketCoolingOutlet', label: 'Jacket Cooling Outlet',    unit: '°C',    decimals: 1, actual: snapshot.jacketOutlet,        expected: baseline.expectedJacket,            histKey: 'jacketOutlet',       baseKey: 'baseJacket' },
    { sensorId: 'ME.FuelOilPressure',     label: 'Fuel Oil Pressure',        unit: 'bar',   decimals: 2, actual: snapshot.fuelOilPressure,     expected: baseline.expectedFuelOilPressure,   histKey: 'fuelOilPressure',    baseKey: 'baseFuelOilPressure' },
    { sensorId: 'ME.FuelOilTemp',         label: 'Fuel Oil Temperature',     unit: '°C',    decimals: 1, actual: snapshot.fuelOilTemp,         expected: baseline.expectedFuelOilTemp,       histKey: 'fuelOilTemp',        baseKey: 'baseFuelOilTemp' },
    { sensorId: 'ME.LOFilterDP',          label: 'LO Filter Diff. Pressure', unit: 'bar',   decimals: 3, actual: snapshot.loFilterDP,          expected: baseline.expectedLoFilterDP,        histKey: 'loFilterDP',         baseKey: 'baseLoFilterDP' },
    { sensorId: 'ME.PistonCoolingPress',  label: 'Piston Cooling Oil Press', unit: 'bar',   decimals: 2, actual: snapshot.pistonCoolingPress,  expected: baseline.expectedPistonCoolingPress,histKey: 'pistonCoolingPress', baseKey: 'basePistonCoolingPress' },
    { sensorId: 'ME.FuelRack',            label: 'Fuel Rack Position',       unit: 'mm',    decimals: 1, actual: snapshot.fuelRack,            expected: baseline.expectedFuelRack,          histKey: 'fuelRack',           baseKey: 'baseFuelRack' },
    { sensorId: 'ME.SFOC',               label: 'SFOC',                      unit: 'g/kWh', decimals: 1, actual: snapshot.sfoc,                expected: baseline.expectedSfoc,              histKey: 'sfoc',               baseKey: 'baseSfoc' },
  ];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">DEVIATION OVERVIEW</div>
          <div className="page-subtitle">ACTUAL vs BASELINE — LAST 120 TICKS</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)', alignItems: 'center' }}>
          <span style={{ display: 'inline-block', width: 20, height: 2, background: 'var(--border-hi)', verticalAlign: 'middle' }} /> Baseline
          <span style={{ display: 'inline-block', width: 20, height: 2, background: 'var(--risk-normal)', verticalAlign: 'middle', marginLeft: 8 }} /> Actual
        </div>
      </div>
      <div className="page-body" style={{ paddingTop: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {(focus ? rows.filter(r => r.sensorId === focus) : rows).map(row => (
            <SensorDeviationCard
              key={row.sensorId}
              row={row}
              history={history[row.histKey as keyof typeof history] as number[]}
              baseHistory={history[row.baseKey as keyof typeof history] as number[]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
