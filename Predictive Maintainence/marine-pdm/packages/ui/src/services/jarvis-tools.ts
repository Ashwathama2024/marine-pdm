// JARVIS agentic tool layer — READ-ONLY tools that let the model actively pull any data on demand:
// the full current snapshot, 120-tick historical trends (not in the per-turn context), per-cylinder
// history, and detailed fault / degradation / alert records. Observe-only: nothing here changes the
// simulator.

import type { DecisionOutput } from '@marine-pdm/shared';
import { MTU8000, MTU8000_LIMITS } from '@marine-pdm/shared';
import { FAULT_DEFINITIONS, DEGRADATION_MODES } from '@marine-pdm/simulator';
import type { FaultConfig } from '@marine-pdm/simulator';
import { MTU8000_PATTERNS } from '@marine-pdm/knowledge';
import type { SensorHistory } from '../context/EngineContext';
import type { DegradationEvent } from '../context/DegradationContext';
import type { BaselineAlert } from '../context/AlertContext';
import type { ToolDef } from './openai-client';
import { getSelfInfo, getFeatureGuide, getHowToTest } from './jarvis-self-knowledge';

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

// ── FUTURE: project a metric to its coded alarm band ──────────────────────────────
// Each entry pairs a history series with the MTU8000_LIMITS thresholds that govern it. Only metrics
// with a real coded alarm band are forecastable — everything else stays a get_trend question.
const L = MTU8000_LIMITS;
type ForecastLimit = { key: keyof SensorHistory; unit: string; label: string; hi?: number; ss?: number; lo?: number; dir: 'high' | 'low' };
const FORECAST_LIMITS: Record<string, ForecastLimit> = {
  exhaust:            { key: 'exhaustTemp',       unit: '°C',   label: 'Mean exhaust temp',      dir: 'high', hi: L.exhaust.mean_hi,                          ss: L.exhaust.critical_max },
  jacket:            { key: 'jacketOutlet',       unit: '°C',   label: 'Jacket / coolant temp',  dir: 'high', hi: L.cooling.coolant_temp_after_engine_max,    ss: L.cooling.coolant_temp_ss },
  chargeAirTemp:      { key: 'chargeAirTemp',     unit: '°C',   label: 'Charge-air temp',        dir: 'high', hi: L.chargeAir.temp_after_intercooler_hi,      ss: L.chargeAir.temp_after_intercooler_max },
  tcSpeed:            { key: 'tcRPM',             unit: 'RPM',  label: 'TC speed (overspeed)',   dir: 'high', hi: L.turbocharger.speed_overspeed_l1,          ss: L.turbocharger.speed_overspeed_l2 },
  lube:               { key: 'lubeOilPressure',   unit: 'bar',  label: 'LO gallery pressure',    dir: 'low',  lo: L.lubeOil.pressure_before_filter_min },
  pistonCoolingPress: { key: 'pistonCoolingPress', unit: 'bar', label: 'Piston-cooling pressure', dir: 'low', lo: L.lubeOil.piston_cooling_min },
  systemRisk:         { key: 'systemRisk',        unit: '0–100', label: 'System risk',           dir: 'high', hi: 70,                                          ss: 90 },
};
const FORECAST_METRICS = Object.keys(FORECAST_LIMITS);
const SLOPE_TICKS = 30; // recent window used to estimate the current rate

// ETA (minutes) until `current` crosses `threshold`, given slope/min and travel direction.
function eta(current: number, threshold: number | undefined, slopePerMin: number, dir: 'high' | 'low'): number | null {
  if (threshold === undefined) return null;
  if (dir === 'high') {
    if (current >= threshold) return 0;
    if (slopePerMin <= 0) return null;         // stable / falling → never (at this rate)
    return (threshold - current) / slopePerMin;
  } else {
    if (current <= threshold) return 0;
    if (slopePerMin >= 0) return null;
    return (current - threshold) / (-slopePerMin);
  }
}

function forecastFrom(series: number[], lim: { unit: string; label: string; hi?: number; ss?: number; lo?: number; dir: 'high' | 'low' }, horizonMin: number): Record<string, unknown> {
  const recent = series.slice(-SLOPE_TICKS);
  const st = stats(recent);
  const slopePerMin = st.slope * 60;
  const current = st.last;
  const target = lim.dir === 'high' ? lim.hi : lim.lo;
  const critical = lim.dir === 'high' ? lim.ss : undefined;
  const etaHi = eta(current, target, slopePerMin, lim.dir);
  const etaSs = eta(current, critical, slopePerMin, lim.dir);
  const trendWord = Math.abs(slopePerMin) < 1e-6 ? 'flat'
    : (lim.dir === 'high' ? (slopePerMin > 0 ? 'rising toward alarm' : 'falling away from alarm')
       : (slopePerMin < 0 ? 'falling toward alarm' : 'rising away from alarm'));
  return {
    metric: lim.label, unit: lim.unit, ticksUsed: st.n,
    current: r(current), slopePerMin: r(slopePerMin, 3),
    alarmThreshold: target ?? null, shutdownThreshold: critical ?? null, direction: lim.dir,
    projectedIn: { minutes: horizonMin, value: r(current + slopePerMin * horizonMin) },
    etaToAlarmMin: etaHi === null ? null : Number(etaHi.toFixed(1)),
    etaToShutdownMin: etaSs === null ? null : Number(etaSs.toFixed(1)),
    verdict: etaHi === 0 ? 'already in alarm band'
      : etaHi === null ? `${trendWord} — not projected to reach the alarm band at the current rate`
      : `${trendWord} — projected to reach the alarm band in ~${etaHi.toFixed(1)} min at the current rate`,
    note: 'linear projection from the recent slope; a fault accelerating non-linearly will cross sooner.',
  };
}

function getForecast(args: Record<string, unknown>, ctx: ToolContext): string {
  const horizonMin = Math.min(Math.max(asNum(args.horizonMin, 15), 1), 120);
  const cylName = asStr(args.cylinder).toUpperCase();
  if (cylName) {
    const idx = CYL_NAMES.indexOf(cylName);
    if (idx < 0) return JSON.stringify({ error: `unknown cylinder "${args.cylinder}". Use A1–A10 or B1–B10.` });
    const series = ctx.history.cylTemps[idx] ?? [];
    if (series.length < 3) return JSON.stringify({ cylinder: cylName, note: 'Not enough history yet — let the engine run.' });
    return JSON.stringify({ cylinder: cylName, ...forecastFrom(series, { unit: '°C', label: `${cylName} exhaust temp`, dir: 'high', hi: L.exhaust.normal_max, ss: L.exhaust.critical_max }, horizonMin) });
  }
  const metric = asStr(args.metric);
  const lim = FORECAST_LIMITS[metric];
  if (!lim) return JSON.stringify({ error: `no coded alarm band for "${metric}". Forecastable: ${FORECAST_METRICS.join(', ')}, or pass a cylinder (A1–B10). For metrics without an alarm band use get_trend.` });
  const series = (ctx.history[lim.key] as number[]) ?? [];
  if (series.length < 3) return JSON.stringify({ metric: lim.label, note: 'Not enough history yet — let the engine run.' });
  return JSON.stringify(forecastFrom(series, lim, horizonMin));
}

function getPatternDetail(args: Record<string, unknown>, ctx: ToolContext): string {
  const id = asStr(args.id).toUpperCase();
  const p = MTU8000_PATTERNS.find(x => x.id === id);
  if (!p) return JSON.stringify({ error: `unknown pattern "${args.id}". Valid: ${MTU8000_PATTERNS.map(x => x.id).join(', ')}` });
  const liveAlert = ctx.decision?.alerts.find(a => a.patternId === id || a.ecsAlarmCode === p.ecsAlarmCode);
  return JSON.stringify({
    id: p.id, name: p.name, ecsAlarmCode: p.ecsAlarmCode, maintenanceTask: p.maintenanceTask,
    actionWindow: p.actionWindow, affectedTags: p.affectedTags,
    conditions: p.conditions.map(c => `${c.tag} ${c.metric} ${c.operator} ${c.threshold}`),
    firingNow: !!liveAlert,
    liveAlert: liveAlert ? { component: liveAlert.component, issue: liveAlert.issue, risk: Math.round(liveAlert.riskScore), evidence: liveAlert.evidence } : null,
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
    case 'forecast_metric':       return getForecast(args, ctx);
    case 'get_pattern_detail':    return getPatternDetail(args, ctx);
    case 'get_self_info':         return getSelfInfo();
    case 'get_feature_guide':     return getFeatureGuide(asStr(args.topic));
    case 'how_to_test':           return getHowToTest(asStr(args.subject));
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
  {
    type: 'function',
    function: {
      name: 'forecast_metric',
      description: 'FUTURE / "what is about to happen": project a metric to its coded MTU alarm band from the current trend, returning current value, slope/min, projected value, and estimated minutes-to-alarm / minutes-to-shutdown. Use for any "will it / when will it / how long until / is it about to alarm" question. Pass a subsystem metric OR a cylinder.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: FORECAST_METRICS, description: 'Subsystem metric with a coded alarm band.' },
          cylinder: { type: 'string', description: 'Forecast one cylinder\'s exhaust temp instead (A1–A10, B1–B10).' },
          horizonMin: { type: 'integer', description: 'Projection horizon in minutes for the projected value (1–120, default 15).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pattern_detail',
      description: 'Full detail for a decision-engine fault pattern (P01–P08): name, ECS code, MTU work order, action window, match conditions, affected tags, and whether it is firing right now.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Pattern id P01–P08.' } },
        required: ['id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_self_info',
      description: 'What I am and what I can do — my identity, time horizons (past/present/future), and my full tool list. Use when the user asks about YOU (e.g. "what can you do", "what tools do you have").',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_feature_guide',
      description: 'Guide to the app\'s pages/features. Omit topic for the full app map, or pass a page name (e.g. "simulator", "degradation") for that page. Use to help the user navigate or find where to do something.',
      parameters: {
        type: 'object',
        properties: { topic: { type: 'string', description: 'Optional page name or route to focus on.' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'how_to_test',
      description: 'Step-by-step guide to test/trigger a feature. Omit subject for the full playbook, or pass a fault id (F01–F09), pattern id (P01–P08), or keyword for that one. Use when the user asks "how do I test / trigger / try X".',
      parameters: {
        type: 'object',
        properties: { subject: { type: 'string', description: 'Optional fault/pattern id or keyword to focus on.' } },
        additionalProperties: false,
      },
    },
  },
];
