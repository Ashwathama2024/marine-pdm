import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { engine, useEngine } from '../context/EngineContext';
import { useSensorAnalysis } from '../hooks/useSensorAnalysis';
import {
  buildDiagnosisSystemPrompt, buildSensorDiagnosisPrompt,
  buildSystemDiagnosisSystemPrompt, buildBatchDeviationPrompt,
} from '../services/prompts';
import { buildSensorEvidence, describeRootFactors, describeDecision } from '../services/sensor-evidence';
import { buildContextString, loadDocuments } from '../services/knowledge-store';
import { isOpenAIConfigured } from '../services/openai-client';
import { toCsvRow, downloadCsv } from '../services/csv';
import { useSensorFocus } from '../context/SensorFocusContext';

interface DeviationRow {
  sensorId: string;
  label: string;
  unit: string;
  decimals: number;
  actual: number;
  baseline: number;
  deviation: number;
  deviationPct: number;
  risk: number;
  rate: number;
  histKey: string;
}

const PHYS_RANGES: Record<string, number> = {
  exhaustTemp: 400, lubeOilPressure: 6.5,
  scavengeAir: 4.5, tcRPM: 30000, jacketOutlet: 55, sfoc: 85,
  chargeAirTemp: 75, fuelOilPressure: 9.0, fuelOilTemp: 35,
  loFilterDP: 2.0, pistonCoolingPress: 8.0, shaftPower: 6000,
};

function riskBadge(risk: number): string {
  if (risk >= 75) return 'badge badge-critical';
  if (risk >= 50) return 'badge badge-high';
  if (risk >= 25) return 'badge badge-warning';
  return 'badge badge-normal';
}

function riskLabel(risk: number): string {
  if (risk >= 75) return 'CRITICAL';
  if (risk >= 50) return 'HIGH';
  if (risk >= 25) return 'WARNING';
  return 'NORMAL';
}

function devColor(dev: number, physRange: number): string {
  const pct = Math.abs(dev / physRange);
  if (pct > 0.15) return '#EF4444';
  if (pct > 0.10) return '#F97316';
  if (pct > 0.05) return '#F59E0B';
  return '#00D4AA';
}

function RowAI({ row }: { row: DeviationRow }) {
  const [expanded, setExpanded] = useState(false);
  const { analyze, result, analyzing, error } = useSensorAnalysis();
  const { snapshot, baseline, history, decision, engineState } = useEngine();

  function handleAnalyze() {
    if (!snapshot || !baseline) return;
    const evidence = buildSensorEvidence({
      sensorId: row.sensorId, snapshot, baseline, history, decision,
      rootFactors: engine.getRootFactors(),
      engineState,
      knowledgeContext: buildContextString(loadDocuments()),
    });
    void analyze(buildDiagnosisSystemPrompt(), buildSensorDiagnosisPrompt(evidence));
    setExpanded(true);
  }

  return (
    <>
      <tr>
        <td style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{row.label}</td>
        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{row.actual.toFixed(row.decimals)} {row.unit}</td>
        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-dim)' }}>{row.baseline.toFixed(row.decimals)}</td>
        <td>
          <span style={{ color: devColor(row.deviation, PHYS_RANGES[row.sensorId.replace('ME.', '').charAt(0).toLowerCase() + row.sensorId.slice(4)] ?? 100), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {row.deviation >= 0 ? '+' : ''}{row.deviation.toFixed(row.decimals)}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 4 }}>
            ({row.deviationPct >= 0 ? '+' : ''}{row.deviationPct.toFixed(1)}%)
          </span>
        </td>
        <td style={{ color: row.rate > 0.01 ? 'var(--risk-warning)' : row.rate < -0.01 ? 'var(--accent-blue)' : 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
          {row.rate >= 0 ? '+' : ''}{row.rate.toFixed(3)}
        </td>
        <td><span className={riskBadge(row.risk)}>{riskLabel(row.risk)}</span></td>
        <td>
          {isOpenAIConfigured() ? (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="mag-btn mag-btn-ghost"
              style={{ fontSize: 8, padding: '3px 8px' }}
            >
              {analyzing ? '…' : result ? 'Done' : 'Analyze'}
            </button>
          ) : <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>—</span>}
        </td>
      </tr>
      {expanded && (result || error) && (
        <tr>
          <td colSpan={7} style={{ padding: '0 12px 10px' }}>
            {error && <div style={{ fontSize: 10, color: 'var(--risk-critical)' }}>{error}</div>}
            {result && <div className="ai-stream">{result}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

export function DeviationTable() {
  const { snapshot, baseline, decision, history, engineState } = useEngine();
  const { analyze: analyzeAll, result: batchResult, analyzing: batchAnalyzing, reset } = useSensorAnalysis();
  const { focus } = useSensorFocus();

  if (!snapshot || !baseline || !decision) {
    return <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>Waiting for engine data…</div>;
  }

  const SENSOR_MAP: Array<{ sensorId: string; label: string; unit: string; decimals: number; actual: number; expected: number; risk: number; histKey: string }> = [
    { sensorId: 'ME.ExhaustTemp',         label: 'Exhaust Temp',   unit: '°C',    decimals: 1, actual: snapshot.exhaustTemp,         expected: baseline.expectedExhaust,           risk: decision.exhaustRisk,                       histKey: 'exhaustTemp' },
    { sensorId: 'ME.LubeOilPressure',     label: 'LO Pressure',    unit: 'bar',   decimals: 2, actual: snapshot.lubeOilPressure,     expected: baseline.expectedLube,              risk: decision.lubeRisk,                          histKey: 'lubeOilPressure' },
    { sensorId: 'ME.ScavengeAirPressure', label: 'Charge Air P',   unit: 'bar',   decimals: 2, actual: snapshot.scavengeAir,         expected: baseline.expectedScavenge,          risk: decision.exhaustRisk * 0.5,                 histKey: 'scavengeAir' },
    { sensorId: 'ME.ChargeAirTemp',       label: 'Charge Air T',   unit: '°C',    decimals: 1, actual: snapshot.chargeAirTemp,       expected: baseline.expectedChargeAirTemp,     risk: decision.exhaustRisk * 0.35,                histKey: 'chargeAirTemp' },
    { sensorId: 'ME.TCSpeed',             label: 'TC Speed',       unit: 'RPM',   decimals: 0, actual: snapshot.tcRPM,               expected: baseline.expectedTcRPM,             risk: decision.exhaustRisk * 0.4,                 histKey: 'tcRPM' },
    { sensorId: 'ME.JacketCoolingOutlet', label: 'Jacket Outlet',  unit: '°C',    decimals: 1, actual: snapshot.jacketOutlet,        expected: baseline.expectedJacket,            risk: decision.coolingRisk,                       histKey: 'jacketOutlet' },
    { sensorId: 'ME.FuelOilPressure',     label: 'FO Pressure',    unit: 'bar',   decimals: 2, actual: snapshot.fuelOilPressure,     expected: baseline.expectedFuelOilPressure,   risk: decision.lubeRisk * 0.4,                    histKey: 'fuelOilPressure' },
    { sensorId: 'ME.FuelOilTemp',         label: 'FO Temp',        unit: '°C',    decimals: 1, actual: snapshot.fuelOilTemp,         expected: baseline.expectedFuelOilTemp,       risk: decision.lubeRisk * 0.2,                    histKey: 'fuelOilTemp' },
    { sensorId: 'ME.LOFilterDP',          label: 'LO Filter ΔP',   unit: 'bar',   decimals: 3, actual: snapshot.loFilterDP,          expected: baseline.expectedLoFilterDP,        risk: decision.lubeRisk * 0.7,                    histKey: 'loFilterDP' },
    { sensorId: 'ME.PistonCoolingPress',  label: 'Piston Cool P',  unit: 'bar',   decimals: 2, actual: snapshot.pistonCoolingPress,  expected: baseline.expectedPistonCoolingPress,risk: decision.coolingRisk * 0.6,                 histKey: 'pistonCoolingPress' },
    { sensorId: 'ME.SFOC',               label: 'SFOC',           unit: 'g/kWh', decimals: 1, actual: snapshot.sfoc,                expected: baseline.expectedSfoc,              risk: decision.coolingRisk * 0.6,                 histKey: 'sfoc' },
    { sensorId: 'ME.ShaftPower',          label: 'Shaft Power',    unit: 'kW',    decimals: 0, actual: snapshot.shaftPower,          expected: baseline.expectedShaftPower,        risk: decision.systemRisk * 0.3,                  histKey: 'shaftPower' },
  ];

  const rows: DeviationRow[] = SENSOR_MAP.map(s => {
    const dev = s.actual - s.expected;
    const physRange = PHYS_RANGES[s.histKey] ?? 100;
    const hist = history[s.histKey as keyof typeof history] as number[];
    const rate = hist.length > 5
      ? (hist[hist.length - 1]! - hist[hist.length - 6]!) / 5
      : 0;
    return {
      sensorId: s.sensorId, label: s.label, unit: s.unit, decimals: s.decimals,
      actual: s.actual, baseline: s.expected,
      deviation: dev, deviationPct: (dev / physRange) * 100,
      risk: s.risk, rate, histKey: s.histKey,
    };
  }).sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  function handleAnalyzeAll() {
    if (!snapshot) return;
    void analyzeAll(
      buildSystemDiagnosisSystemPrompt(),
      buildBatchDeviationPrompt(
        rows.map(r => ({ sensorId: r.sensorId, displayName: r.label, unit: r.unit, actual: r.actual, baseline: r.baseline, deviation: r.deviation, deviationPct: r.deviationPct, risk: r.risk })),
        snapshot.load, snapshot.rpm, engineState,
        describeRootFactors(engine.getRootFactors()),
        describeDecision(decision),
        buildContextString(loadDocuments()),
      ),
    );
  }

  function exportCSV() {
    const cols = ['Sensor', 'Actual', 'Baseline', 'Deviation', 'Deviation%', 'Risk'];
    const lines = [toCsvRow(cols)];
    for (const r of rows) {
      lines.push(toCsvRow([r.label, r.actual, r.baseline, r.deviation.toFixed(3), r.deviationPct.toFixed(2), riskLabel(r.risk)]));
    }
    downloadCsv(`deviation-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'));
  }

  const chartData = rows.map(r => ({ name: r.label, dev: Math.abs(r.deviation), color: devColor(r.deviation, PHYS_RANGES[r.histKey as keyof typeof PHYS_RANGES] ?? 100) }));

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">DEVIATION TABLE</div>
          <div className="page-subtitle">REAL-TIME SENSOR ANALYSIS — SORTED BY DEVIATION</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {isOpenAIConfigured() && (
            <button
              onClick={batchResult ? reset : handleAnalyzeAll}
              disabled={batchAnalyzing}
              className="mag-btn mag-btn-ghost"
              style={{ fontSize: 10 }}
            >
              {batchAnalyzing ? 'Analyzing…' : batchResult ? 'Reset' : 'Analyze All'}
            </button>
          )}
          <button onClick={exportCSV} className="mag-btn mag-btn-ghost" style={{ fontSize: 10 }}>Export CSV</button>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 0 }}>
        {/* Deviation bar chart */}
        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 14 }}>
          <div className="label-xs" style={{ marginBottom: 8 }}>DEVIATION MAGNITUDE BY SENSOR</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={28}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'var(--font)' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font)' }}
                formatter={(v: number) => [v.toFixed(3), 'Abs Dev']}
              />
              <Bar dataKey="dev" radius={[3, 3, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AI batch result */}
        {batchResult && (
          <div className="glass-card" style={{ padding: '12px 16px', marginBottom: 14 }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>AI SYSTEM ANALYSIS</div>
            <div className="ai-stream">{batchResult}</div>
          </div>
        )}

        {/* Deviation table */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Sensor</th><th>Actual</th><th>Baseline</th>
                <th>Deviation</th><th>Δ/tick</th><th>Risk</th><th>AI</th>
              </tr>
            </thead>
            <tbody>
              {(focus ? rows.filter(r => r.sensorId === focus) : rows).map(row => (
                <RowAI key={row.sensorId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
