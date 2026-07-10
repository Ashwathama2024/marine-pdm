// Assembles a COMPREHENSIVE text snapshot of the current live engine state — every sensor the
// simulator produces — injected fresh into the model on every question (and every event narration)
// so answers always reflect the running tick. Also reused verbatim as the deterministic
// no-API-key fallback shown in the widget.
//
// "Jarvis-level": the assistant sees all 20 cylinders (A1–A10, B1–B10), all 11 bearings, all 4
// turbochargers, every subsystem pressure/temperature, plus pre-computed stats (bank means/medians,
// hottest/coldest, imbalance) so it can answer "list all A-bank temps" or "median for each bank"
// directly instead of claiming the data isn't available.

import type { EngineSnapshot, DecisionOutput, BaselineSnapshot } from '@marine-pdm/shared';
import { MTU8000, MTU8000_CYL_SPREAD, BSIDE_TEMP_BIAS, MTU8000_LIMITS } from '@marine-pdm/shared';
import { FAULT_DEFINITIONS } from '@marine-pdm/simulator';
import type { FaultConfig } from '@marine-pdm/simulator';
import type { DegradationEvent } from '../context/DegradationContext';
import type { BaselineAlert } from '../context/AlertContext';

export interface RootFactors {
  injFaultMax: number; coolingEffDrop: number; tcEffDrop: number;
  lubeFault: number; bearingFaultMax: number; pistonBlowby: number;
}

export interface LiveContextInput {
  engineState: string;
  isOperational: boolean;
  snapshot: EngineSnapshot | null;
  decision: DecisionOutput | null;
  baseline: BaselineSnapshot | null;
  faults: FaultConfig[];
  rootFactors: RootFactors;
  degradationEvents: DegradationEvent[];
  baselineAlerts: BaselineAlert[];
}

const CYL_NAMES = MTU8000.CYL_NAMES as readonly string[];
const faultName = (id: string) => FAULT_DEFINITIONS.find(f => f.id === id)?.name ?? id;
const n = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const dev = (actual: number, base: number, d = 1) => {
  const delta = actual - base;
  return `${n(actual, d)} (base ${n(base, d)}, Δ${delta >= 0 ? '+' : ''}${n(delta, d)})`;
};
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

// Read index-signature fields off EngineSnapshot as number / number[].
const getNum = (snap: EngineSnapshot, k: string): number => {
  const v = snap[k];
  return typeof v === 'number' ? v : NaN;
};
const getArr = (snap: EngineSnapshot, k: string): number[] => {
  const v = snap[k];
  return Array.isArray(v) ? v : [];
};

// ── Per-cylinder exhaust temps: full list per bank + stats + outliers vs healthy baseline ─────────
function cylinderSection(snap: EngineSnapshot, b: BaselineSnapshot | null): string {
  const cyls = snap.cylTemps;
  if (!Array.isArray(cyls) || cyls.length < 20) return 'Cylinder temperatures unavailable.';

  // Healthy per-cylinder baseline = mean baseline + natural spread + B-side bias (matches physics).
  const baseMean = b?.expectedExhaust ?? mean(cyls);
  const expected = (i: number) => baseMean + (MTU8000_CYL_SPREAD[i] ?? 0) + (i >= 10 ? BSIDE_TEMP_BIAS : 0);

  const A = cyls.slice(0, 10), B = cyls.slice(10, 20);
  const line = (vals: number[], off: number) =>
    vals.map((v, j) => `${CYL_NAMES[off + j]} ${n(v)}`).join(', ');

  // Hottest / coldest / imbalance across all 20.
  let hotI = 0, coldI = 0;
  cyls.forEach((v, i) => { if (v > cyls[hotI]!) hotI = i; if (v < cyls[coldI]!) coldI = i; });
  const imbalance = cyls[hotI]! - cyls[coldI]!;

  // Outliers = cylinders more than 8 °C off their healthy baseline (injector/cooling signature).
  const outliers = cyls
    .map((v, i) => ({ i, d: v - expected(i) }))
    .filter(o => Math.abs(o.d) > 8)
    .map(o => `${CYL_NAMES[o.i]} ${o.d >= 0 ? '+' : ''}${n(o.d)}°C`);

  return [
    `A-bank (A1–A10): ${line(A, 0)}`,
    `B-bank (B1–B10): ${line(B, 10)}`,
    `Stats — A-bank mean ${n(mean(A))}, median ${n(median(A))}; B-bank mean ${n(mean(B))}, median ${n(median(B))}.`,
    `All-20 mean ${n(mean(cyls))}, median ${n(median(cyls))}. Hottest ${CYL_NAMES[hotI]} ${n(cyls[hotI]!)}, coldest ${CYL_NAMES[coldI]} ${n(cyls[coldI]!)}, imbalance (max−min) ${n(imbalance)} °C.`,
    `Outliers vs healthy baseline (|Δ|>8°C): ${outliers.length ? outliers.join(', ') : 'none — spread is natural'}.`,
    `Imbalance alarm bands: warn ${MTU8000_LIMITS.exhaust.spread_warn} °C, alarm ${MTU8000_LIMITS.exhaust.spread_alarm} °C. Note: B5 naturally runs ~+17°C from mean (design spread + B-side bias), not a fault.`,
  ].join('\n');
}

function bearingSection(snap: EngineSnapshot): string {
  const bt = getArr(snap, 'bearingTemps');
  if (bt.length === 0) return 'Bearing temperatures unavailable.';
  const list = bt.map((v, i) => `B57.${i + 1} ${n(v)}`).join(', ');
  const hotI = bt.reduce((mi, v, i) => (v > bt[mi]! ? i : mi), 0);
  return [
    `Values (°C): ${list}`,
    `Hottest B57.${hotI + 1} ${n(bt[hotI]!)}. Bands: HI ${MTU8000_LIMITS.lubeOil.bearing_temp_hi} °C, SS shutdown ${MTU8000_LIMITS.lubeOil.bearing_temp_max} °C (hot oil at rated ≈107°C is normal).`,
  ].join('\n');
}

function tcSection(snap: EngineSnapshot): string {
  const tc = getArr(snap, 'tcSpeeds');
  if (tc.length === 0) return `TC1 ${n(snap.tcRPM, 0)} RPM.`;
  const names = ['A1', 'A2', 'B1', 'B2'];
  const list = tc.map((v, i) => `TC-${names[i] ?? i + 1} ${n(v, 0)}`).join(', ');
  return `Speeds (RPM): ${list}. Nominal ≈${MTU8000_LIMITS.turbocharger.speed_nominal_at_85pct} at rated; idle ≈${MTU8000_LIMITS.turbocharger.speed_idle}.`;
}

// Full subsystem scalar readings, with baseline+deviation where a baseline exists.
function subsystemSection(snap: EngineSnapshot, b: BaselineSnapshot | null): string {
  const lines: string[] = [];
  lines.push(`- Mean exhaust: ${b ? dev(snap.exhaustTemp, b.expectedExhaust) : n(snap.exhaustTemp)} °C`);
  lines.push(`- A-side mean exhaust: ${n(getNum(snap, 'aSideMeanExhaust'))} °C · B-side mean exhaust: ${n(getNum(snap, 'bSideMeanExhaust'))} °C`);
  lines.push(`- Lube oil pressure (gallery): ${b ? dev(snap.lubeOilPressure, b.expectedLube, 2) : n(snap.lubeOilPressure, 2)} bar`);
  lines.push(`- LO after filter: ${n(getNum(snap, 'lubeOilPressureAfterFilter'), 2)} bar · last-bearing: ${n(getNum(snap, 'lubeLastBearingPressure'), 2)} bar (SS < ${MTU8000_LIMITS.lubeOil.pressure_last_bearing_min})`);
  lines.push(`- Piston cooling pressure: ${b ? dev(snap.pistonCoolingPress, b.expectedPistonCoolingPress, 2) : n(snap.pistonCoolingPress, 2)} bar · LO filter ΔP: ${b ? dev(snap.loFilterDP, b.expectedLoFilterDP, 2) : n(snap.loFilterDP, 2)} bar`);
  lines.push(`- Lube oil temp: ${n(getNum(snap, 'lubeOilTemp'))} °C (HI ${MTU8000_LIMITS.lubeOil.temp_max})`);
  lines.push(`- Jacket outlet: ${b ? dev(snap.jacketOutlet, b.expectedJacket) : n(snap.jacketOutlet)} °C (HI ${MTU8000_LIMITS.cooling.coolant_temp_after_engine_max}, SS ${MTU8000_LIMITS.cooling.coolant_temp_ss}) · coolant pressure ${n(getNum(snap, 'coolantPressure'), 2)} bar`);
  lines.push(`- Charge air pressure: ${b ? dev(snap.scavengeAir, b.expectedScavenge, 2) : n(snap.scavengeAir, 2)} bar · charge air temp ${b ? dev(snap.chargeAirTemp, b.expectedChargeAirTemp) : n(snap.chargeAirTemp)} °C (LT-cooled, HI ${MTU8000_LIMITS.chargeAir.temp_after_intercooler_hi})`);
  lines.push(`- SFOC: ${b ? dev(snap.sfoc, b.expectedSfoc) : n(snap.sfoc)} g/kWh`);
  lines.push(`- Fuel rail pressure: ${n(getNum(snap, 'fuelRailPressure'), 0)} bar (SD < ${MTU8000_LIMITS.fuel.rail_pressure_min}) · fuel oil ${n(snap.fuelOilPressure, 2)} bar / ${n(snap.fuelOilTemp)} °C`);
  lines.push(`- Crankcase pressure: ${n(getNum(snap, 'crankcasePressure'), 2)} mbar (HI ${MTU8000_LIMITS.crankcase.pressure_hi}) · exhaust back pressure ${n(getNum(snap, 'exhaustBackPressure'), 0)} mbar`);
  lines.push(`- Shaft power: ${n(snap.shaftPower, 0)} kW`);
  return lines.join('\n');
}

function faultLines(faults: FaultConfig[]): string {
  if (faults.length === 0) return 'None injected.';
  return faults.map(fc => {
    const target = fc.targetCyls?.length ? ` cyl[${fc.targetCyls.map(i => CYL_NAMES[i] ?? i).join(',')}]`
      : fc.targetBearing != null ? ` bearing B57.${fc.targetBearing + 1}`
      : fc.targetTC != null ? ` TC ${fc.targetTC}` : '';
    return `- ${fc.id} ${faultName(fc.id)}${target} — intensity ${fc.intensity}%, ${fc.speed}, severity ${(fc.currentSeverity * 100).toFixed(0)}%`;
  }).join('\n');
}

function rootFactorLines(rf: RootFactors): string {
  const active = Object.entries(rf).filter(([, v]) => Math.abs(v) > 0.001);
  if (active.length === 0) return 'All nominal (healthy).';
  return active.map(([k, v]) => `- ${k}: ${n(v, 3)}`).join('\n');
}

function decisionLines(d: DecisionOutput): string {
  const alerts = d.alerts.length
    ? d.alerts.map(a => `  · ${a.component}: ${a.issue} → ${a.recommendedAction}` +
        `${a.ecsAlarmCode ? ` [${a.ecsAlarmCode}]` : ''}${a.maintenanceTask ? ` {${a.maintenanceTask}}` : ''} (risk ${a.riskScore.toFixed(0)})`).join('\n')
    : '  · none';
  const cylRisk = d.cylRisks?.length ? `; peak cyl risk ${Math.max(...d.cylRisks).toFixed(0)}` : '';
  return [
    `System risk: ${d.systemRisk.toFixed(0)} — status ${d.status}`,
    `Subsystem risk — exhaust ${d.exhaustRisk.toFixed(0)}, lube ${d.lubeRisk.toFixed(0)}, cooling ${d.coolingRisk.toFixed(0)}${cylRisk}`,
    `Active decision alerts:\n${alerts}`,
  ].join('\n');
}

function degradationLines(events: DegradationEvent[]): string {
  const active = events.filter(e => e.status === 'ACTIVE');
  if (active.length === 0) return 'None active.';
  return active.map(e =>
    `- ${e.label} ${e.direction === 'falling' ? '↓' : '↑'} [${e.severity}] — ${e.rootCause} ` +
    `(now ${n(e.currentValue, 2)} ${e.unit}, base ${n(e.baselineValue, 2)}, ${e.consecutiveTicks} ticks)`
  ).join('\n');
}

function baselineAlertLines(alerts: BaselineAlert[]): string {
  const active = alerts.filter(a => !a.acknowledged);
  if (active.length === 0) return 'None active.';
  return active.slice(0, 10).map(a =>
    `- ${a.label}: ${a.type} [${a.severity}] Δ${a.deviation >= 0 ? '+' : ''}${n(a.deviation, 2)} over ${a.durationTicks} ticks`
  ).join('\n');
}

export function buildLiveContext(input: LiveContextInput): string {
  const { snapshot, decision, baseline } = input;
  if (!snapshot) return 'The engine simulator has not produced a snapshot yet.';

  const header = `Engine state: ${input.engineState} (${input.isOperational ? 'operational' : 'pre-start / not producing valid readings'}). ` +
    `RPM ${snapshot.rpm.toFixed(0)}, load ${snapshot.load.toFixed(0)}%. Engine: ${MTU8000.MODEL}, ${MTU8000.CYLINDERS} cyl.`;

  return [
    `## Live engine state\n${header}`,
    `## Cylinder exhaust temperatures (°C) — all 20\n${cylinderSection(snapshot, baseline)}`,
    `## Bearing temperatures — 11 crank bearings\n${bearingSection(snapshot)}`,
    `## Turbocharger speeds — 4 ETCs\n${tcSection(snapshot)}`,
    `## Subsystem sensor readings (actual vs baseline)\n${subsystemSection(snapshot, baseline)}`,
    `## Injected faults\n${faultLines(input.faults)}`,
    `## Root-factor excursions (the degradation X-vector)\n${rootFactorLines(input.rootFactors)}`,
    decision ? `## Decision engine\n${decisionLines(decision)}` : '',
    `## Active degradation events\n${degradationLines(input.degradationEvents)}`,
    `## Active baseline deviation alerts\n${baselineAlertLines(input.baselineAlerts)}`,
  ].filter(Boolean).join('\n\n');
}
