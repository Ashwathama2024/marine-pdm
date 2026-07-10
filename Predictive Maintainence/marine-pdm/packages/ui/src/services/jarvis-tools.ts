// JARVIS agentic tool layer — READ-ONLY tools that let the model actively pull any data on demand:
// the full current snapshot, 120-tick historical trends (not in the per-turn context), per-cylinder
// history, and detailed fault / degradation / alert records. Observe-only: nothing here changes the
// simulator.

import type { DecisionOutput } from '@marine-pdm/shared';
import { MTU8000 } from '@marine-pdm/shared';
import { FAULT_DEFINITIONS, DEGRADATION_MODES } from '@marine-pdm/simulator';
import type { FaultConfig } from '@marine-pdm/simulator';
import type { SensorHistory } from '../context/EngineContext';
import type { DegradationEvent } from '../context/DegradationContext';
import type { BaselineAlert } from '../context/AlertContext';
import type { ToolDef } from './openai-client';

const CYL_NAMES = MTU8000.CYL_NAMES as readonly string[];

export interface ToolContext {
  liveContext: () => string;        // full current snapshot (buildLiveContext)
  history: SensorHistory;           // live 120-tick buffers (mutated in place — always current)
  decision: DecisionOutput | null;
  faults: FaultConfig[];
  degradationEvents: DegradationEvent[];
  baselineAlerts: BaselineAlert[];
}

// metric name → history series (+ baseline series) + unit
const TREND_MAP: Record<string, { key: keyof SensorHistory; baseKey?: keyof SensorHistory; unit: string }> = {
  exhaust:            { key: 'exhaustTemp',        baseKey: 'baseExhaust',            unit: '°C' },
  lube:               { key: 'lubeOilPressure',    baseKey: 'baseLube',              unit: 'bar' },
  sfoc:               { key: 'sfoc',               baseKey: 'baseSfoc',              unit: 'g/kWh' },
  jacket:             { key: 'jacketOutlet',       baseKey: 'baseJacket',            unit: '°C' },
  tcSpeed:            { key: 'tcRPM',              baseKey: 'baseTcRPM',             unit: 'RPM' },
  chargeAirPressure:  { key: 'scavengeAir',        baseKey: 'baseScavenge',          unit: 'bar' },
  chargeAirTemp:      { key: 'chargeAirTemp',      baseKey: 'baseChargeAirTemp',     unit: '°C' },
  fuelOilPressure:    { key: 'fuelOilPressure',    baseKey: 'baseFuelOilPressure',   unit: 'bar' },
  fuelOilTemp:        { key: 'fuelOilTemp',        baseKey: 'baseFuelOilTemp',       unit: '°C' },
  loFilterDP:         { key: 'loFilterDP',         baseKey: 'baseLoFilterDP',        unit: 'bar' },
  pistonCoolingPress: { key: 'pistonCoolingPress', baseKey: 'basePistonCoolingPress',unit: 'bar' },
  shaftPower:         { key: 'shaftPower',         baseKey: 'baseShaftPower',        unit: 'kW' },
  systemRisk:         { key: 'systemRisk',                                           unit: '0–100' },
};
const TREND_METRICS = Object.keys(TREND_MAP);

const r = (x: number, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const asNum = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
const asStr = (v: unknown) => (typeof v === 'string' ? v : '');

function stats(ys: number[]) {
  const n = ys.length;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  const mx = (n - 1) / 2;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (ys[i]! - mean); den += (i - mx) ** 2; }
  return { n, first: ys[0]!, last: ys[n - 1]!, min: Math.min(...ys), max: Math.max(...ys), mean, slope: den ? num / den : 0 };
}
function downsample(a: number[], max: number): number[] {
  if (a.length <= max) return a;
  const step = a.length / max;
  return Array.from({ length: max }, (_, i) => a[Math.floor(i * step)]!);
}

function getTrend(args: Record<string, unknown>, ctx: ToolContext): string {
  const metric = asStr(args.metric);
  const m = TREND_MAP[metric];
  if (!m) return JSON.stringify({ error: `unknown metric "${metric}". Valid: ${TREND_METRICS.join(', ')}. For a cylinder use get_cylinder_history.` });
  const ticks = Math.min(Math.max(asNum(args.ticks, 60), 5), 120);
  const series = (ctx.history[m.key] as number[]).slice(-ticks);
  if (series.length === 0) return JSON.stringify({ metric, note: 'No history yet — start the engine and let it run.' });
  const base = m.baseKey ? (ctx.history[m.baseKey] as number[]).slice(-ticks) : [];
  const st = stats(series);
  const baseNow = base.length ? base[base.length - 1]! : undefined;
  return JSON.stringify({
    metric, unit: m.unit, ticks: st.n, note: 'series is oldest→newest, ~1 tick/sec',
    first: r(st.first), last: r(st.last), min: r(st.min), max: r(st.max), mean: r(st.mean),
    slopePerTick: r(st.slope, 4), slopePerMin: r(st.slope * 60, 3),
    baselineNow: baseNow !== undefined ? r(baseNow) : undefined,
    deviationNow: baseNow !== undefined ? r(st.last - baseNow) : undefined,
    series: downsample(series, 24).map(v => r(v)),
  });
}

function getCylinderHistory(args: Record<string, unknown>, ctx: ToolContext): string {
  const name = asStr(args.cylinder).toUpperCase();
  const idx = CYL_NAMES.indexOf(name);
  if (idx < 0) return JSON.stringify({ error: `unknown cylinder "${args.cylinder}". Use A1–A10 or B1–B10.` });
  const ticks = Math.min(Math.max(asNum(args.ticks, 60), 5), 120);
  const series = (ctx.history.cylTemps[idx] ?? []).slice(-ticks);
  if (series.length === 0) return JSON.stringify({ cylinder: name, note: 'No history yet.' });
  const base = (ctx.history.baseCylTemps[idx] ?? []).slice(-ticks);
  const st = stats(series);
  const baseNow = base.length ? base[base.length - 1]! : undefined;
  return JSON.stringify({
    cylinder: name, unit: '°C', ticks: st.n,
    first: r(st.first), last: r(st.last), min: r(st.min), max: r(st.max), mean: r(st.mean),
    slopePerMin: r(st.slope * 60, 3),
    baselineNow: baseNow !== undefined ? r(baseNow) : undefined,
    deviationNow: baseNow !== undefined ? r(st.last - baseNow) : undefined,
    series: downsample(series, 24).map(v => r(v)),
  });
}

function getFaultDetail(args: Record<string, unknown>, ctx: ToolContext): string {
  const id = asStr(args.id).toUpperCase();
  const def = FAULT_DEFINITIONS.find(f => f.id === id);
  if (!def) return JSON.stringify({ error: `unknown fault "${args.id}". Valid: ${FAULT_DEFINITIONS.map(f => f.id).join(', ')}` });
  const mode = DEGRADATION_MODES.find(m => m.id === id);
  const effects = mode ? mode.effects.filter(e => e.modeled).map(e => ({ sensor: e.sensorId, weight: e.weight, unit: e.unit, kind: e.kind })) : [];
  const live = ctx.faults.find(f => f.id === id);
  return JSON.stringify({
    id, name: def.name, ecsAlarmCode: def.ecsAlarmCode, primarySignal: def.primarySignal,
    crossCorrelations: def.crossCorrelations, ssTrigger: def.ssTrigger, modeledEffects: effects,
    injectedNow: live ? { intensity: live.intensity, speed: live.speed, severityPct: Math.round(live.currentSeverity * 100) } : null,
  });
}

function getDegradationEvents(ctx: ToolContext): string {
  const events = ctx.degradationEvents.map(e => ({
    label: e.label, status: e.status, severity: e.severity, direction: e.direction,
    rootCause: e.rootCause, reasoning: e.reasoning, checkItems: e.checkItems,
    current: r(e.currentValue), baseline: r(e.baselineValue), unit: e.unit, ticks: e.consecutiveTicks,
  }));
  return JSON.stringify({ count: events.length, events });
}

function getAlerts(ctx: ToolContext): string {
  const d = ctx.decision;
  const decisionAlerts = d ? d.alerts.map(a => ({
    component: a.component, issue: a.issue, action: a.recommendedAction,
    ecs: a.ecsAlarmCode, task: a.maintenanceTask, risk: Math.round(a.riskScore), evidence: a.evidence,
  })) : [];
  const baselineAlerts = ctx.baselineAlerts.filter(a => !a.acknowledged).map(a => ({
    label: a.label, type: a.type, severity: a.severity, deviation: r(a.deviation), ticks: a.durationTicks,
  }));
  return JSON.stringify({
    systemRisk: d ? Math.round(d.systemRisk) : null, status: d?.status ?? null,
    decisionAlerts, baselineAlerts,
  });
}

/** Execute a tool call and return a compact JSON string result. */
export function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): string {
  switch (name) {
    case 'get_live_state':        return ctx.liveContext();
    case 'get_trend':             return getTrend(args, ctx);
    case 'get_cylinder_history':  return getCylinderHistory(args, ctx);
    case 'get_fault_detail':      return getFaultDetail(args, ctx);
    case 'get_degradation_events':return getDegradationEvents(ctx);
    case 'get_alerts':            return getAlerts(ctx);
    default:                      return JSON.stringify({ error: `unknown tool "${name}"` });
  }
}

// ── OpenAI function schemas ───────────────────────────────────────────────────────
export const JARVIS_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_live_state',
      description: 'Re-read the complete current engine snapshot (all sensors, cylinders, bearings, TCs, faults, risk). Use to refresh if unsure the live-state block is current.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trend',
      description: 'Historical time-series + slope for a subsystem metric over the last N ticks (~1/sec). Use for any "trend / over time / rising / falling / rate" question — this data is NOT in the live-state block.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: TREND_METRICS, description: 'Which metric to trend.' },
          ticks: { type: 'integer', description: 'How many recent ticks (5–120, default 60).' },
        },
        required: ['metric'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cylinder_history',
      description: 'Historical exhaust-temp series + slope + deviation for one cylinder (A1–A10, B1–B10).',
      parameters: {
        type: 'object',
        properties: {
          cylinder: { type: 'string', description: 'Cylinder name, e.g. A4 or B5.' },
          ticks: { type: 'integer', description: 'How many recent ticks (5–120, default 60).' },
        },
        required: ['cylinder'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fault_detail',
      description: 'Full detail for a fault mode (F01–F09): ECS code, primary signal, cross-correlations, the modeled sensor effects (∂sensor/∂root weights), and whether it is injected right now.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Fault id F01–F09.' } },
        required: ['id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_degradation_events',
      description: 'All degradation events (active + acknowledged/resolved) with root cause, reasoning, and maintenance check-items.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_alerts',
      description: 'Current decision-engine alerts (ECS codes, W-numbers, evidence, risk) and active baseline deviation alerts.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];
