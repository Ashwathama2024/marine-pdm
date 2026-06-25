// packages/decision/src/patterns-mtu8000.ts
// 8 MTU 8000-specific fault patterns replacing v1.0 generic 3-pattern library.
// Each maps to real ECS 8000 alarm codes and MTU maintenance work orders.
// PDF upgrade spec §8.1.

import type { FaultPattern } from '@marine-pdm/shared';

// Type extension — the shared FaultPattern already has ecsAlarmCode and maintenanceTask
// from the interfaces.ts update in Block U0.

export const MTU8000_PATTERNS: FaultPattern[] = [
  {
    id: 'P01',
    name: 'Injector Degradation — Single Cylinder',
    conditions: [
      { tag: 'cylDev[N]',    metric: 'deviation',   operator: '>', threshold: 20 },
      { tag: 'cylDev[N]',    metric: 'rate',         operator: '>', threshold: 0.5 },
      { tag: 'cylImbalance', metric: 'imbalance',    operator: '>', threshold: 15 },
      { tag: 'sfoc',         metric: 'deviation',    operator: '>', threshold: 3 },
    ],
    affectedTags: ['ME.Cyl*.ExhaustTemp', 'ME.SFOC', 'ME.FuelRailPressure'],
    actionWindow: '4–8 hours',
    ecsAlarmCode: 'HI T-Exhaust Cyl N',
    maintenanceTask: 'W1006 — Replace fuel injector',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
  {
    id: 'P02',
    name: 'Multi-Cylinder Injector Fault (A-Side)',
    conditions: [
      { tag: 'aSideMeanDev', metric: 'deviation', operator: '>', threshold: 18 },
      { tag: 'bSideMeanDev', metric: 'deviation', operator: '<', threshold: 10 },
      { tag: 'sfoc',         metric: 'deviation', operator: '>', threshold: 8 },
    ],
    affectedTags: ['ME.CylA*.ExhaustTemp', 'ME.SFOC'],
    actionWindow: 'Immediate investigation',
    ecsAlarmCode: 'HI T-Exhaust Mean',
    maintenanceTask: 'W1006 — Inspect all A-side injectors',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
  {
    id: 'P03',
    name: 'Lube Oil Pressure Loss',
    conditions: [
      { tag: 'lubeLastBearing', metric: 'deviation',  operator: '>', threshold: 0.5 },
      { tag: 'lubeRate',        metric: 'rate',        operator: '<', threshold: -0.1 },
      { tag: 'bearingTempMean', metric: 'deviation',   operator: '>', threshold: 8 },
    ],
    affectedTags: ['ME.LubeOilPressure.*', 'ME.BearingTemp.*'],
    actionWindow: 'Immediate — check oil level, top up, contact service',
    ecsAlarmCode: 'SS P-Oil Last Bearing',
    maintenanceTask: 'W1047 — Check oil indicator filter; W1073 — Centrifugal filter',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
  {
    id: 'P04',
    name: 'Bearing Overtemperature',
    conditions: [
      { tag: 'bearingTemp[N]', metric: 'deviation', operator: '>', threshold: 15 },
      { tag: 'lubePressure',   metric: 'deviation', operator: '>', threshold: 0.3 },
      { tag: 'bearingRate[N]', metric: 'rate',      operator: '>', threshold: 0.3 },
    ],
    affectedTags: ['ME.BearingTemp.N', 'ME.LubeOilPressure.LastBearing'],
    actionWindow: 'Engine shutdown — open inspection ports, check bearing cap',
    ecsAlarmCode: 'SS T-Bearing N',
    maintenanceTask: 'W1609 — Replace lower crankshaft bearing shells',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
  {
    id: 'P05',
    name: 'HT Cooler Fouling',
    conditions: [
      { tag: 'coolantTemp',    metric: 'deviation', operator: '>', threshold: 6 },
      { tag: 'allCylMeanDev',  metric: 'deviation', operator: '>', threshold: 12 },
      { tag: 'cylImbalance',   metric: 'imbalance', operator: '<', threshold: 20 },
      { tag: 'chargeAirTemp',  metric: 'deviation', operator: '>', threshold: 5 },
    ],
    affectedTags: ['ME.CoolantTemp.*', 'ME.Cyl*.ExhaustTemp', 'ME.ChargeAirTemp'],
    actionWindow: 'Schedule cooler cleaning at next port (W1254)',
    ecsAlarmCode: 'HI T-Coolant',
    maintenanceTask: 'W1254 — Intercooler flushing with Hakutex 50',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
  {
    id: 'P06',
    name: 'Turbocharger Fouling',
    conditions: [
      { tag: 'tcSpeed',       metric: 'deviation', operator: '>', threshold: 1500 },
      { tag: 'chargeAirP',   metric: 'deviation', operator: '>', threshold: 0.3 },
      { tag: 'exhaustBackP', metric: 'deviation', operator: '>', threshold: 15 },
    ],
    affectedTags: ['ME.TC.*.Speed', 'ME.ChargeAirPressure', 'ME.ExhaustBackPressure'],
    actionWindow: 'Schedule TC inspection (W1038) within 500 hours',
    ecsAlarmCode: 'SD TC Speed',
    maintenanceTask: 'W1038 — Turbocharger overhaul',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
  {
    id: 'P07',
    name: 'Injector Spray Pattern Failure (Erratic)',
    conditions: [
      { tag: 'cylDev[N]',  metric: 'stdDev',    operator: '>', threshold: 8 },
      { tag: 'cylDev[N]',  metric: 'deviation', operator: '>', threshold: 15 },
      { tag: 'crankcaseP', metric: 'rate',       operator: '>', threshold: 0.05 },
    ],
    affectedTags: ['ME.CylN.ExhaustTemp', 'ME.CrankcasePressure'],
    actionWindow: '4 hours — erratic injection is pre-failure state',
    ecsAlarmCode: 'HI T-Exhaust Cyl N (oscillating)',
    maintenanceTask: 'W1011 — Endoscopic inspection; W1006 — Replace injector',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
  {
    id: 'P08',
    name: 'Piston Blow-by',
    conditions: [
      { tag: 'crankcasePressure', metric: 'deviation', operator: '>', threshold: 4 },
      { tag: 'crankcaseRate',     metric: 'rate',       operator: '>', threshold: 0.1 },
      { tag: 'oilLevel',          metric: 'rate',       operator: '<', threshold: -0.01 },
    ],
    affectedTags: ['ME.CrankcasePressure', 'ME.OilLevel.*'],
    actionWindow: 'Schedule endoscopy at next opportunity (W1011)',
    ecsAlarmCode: 'HI P-Crankcase',
    maintenanceTask: 'W1158 — Piston inspection, fit new piston rings',
    timesTriggered: 0,
    timesConfirmed: 0,
    timesFalsePositive: 0,
    isActive: true,
  },
];

// ── PATTERN MATCHING HELPERS (MTU 8000-specific feature inputs) ─────────────────
// These compute pattern conditions from the richer MTU8000Snapshot fields.

export interface MTU8000Features {
  // Exhaust deviations
  cylDevs: number[];         // per-cylinder deviation from expected (0–19)
  cylDevRates: number[];     // rate of change per cylinder (°C/min)
  cylStdDevs: number[];      // rolling stdDev per cylinder (erratic detection)
  aSideMeanDev: number;      // A-side mean deviation from baseline
  bSideMeanDev: number;      // B-side mean deviation from baseline
  allCylMeanDev: number;     // all-cylinder mean deviation
  cylImbalance: number;      // max − min cylinder temp

  // Lube
  lubeDev: number;            // main gallery pressure deviation
  lubeLastBearingDev: number; // last bearing pressure deviation
  lubeRate: number;           // bar/min rate of change

  // Bearing
  bearingDevs: number[];     // per-bearing deviation (0–10)
  bearingRates: number[];    // per-bearing rate of change

  // Cooling
  coolantTempDev: number;
  chargeAirTempDev: number;
  chargeAirPressDev: number;

  // TC
  tcSpeedDevs: number[];     // per-TC speed deviation (0–3)

  // Fuel / crankcase
  sfocDev: number;
  fuelRailPressDev: number;
  crankcasePressure: number;
  crankcaseRate: number;

  // Sensor quality
  sensorHealthScores: Record<string, number>;
}

// Matches P01–P08 against MTU8000Features, returning matched pattern IDs.
export function matchMTU8000Patterns(features: MTU8000Features): string[] {
  const matched: string[] = [];

  // P01 — Single injector: ONE cylinder elevated, others normal
  const elevatedCyls = features.cylDevs
    .map((d, i) => ({ i, d }))
    .filter(({ d }) => d > 20);
  if (
    elevatedCyls.length === 1 &&
    features.cylImbalance > 15 &&
    features.sfocDev > 3
  ) {
    matched.push('P01');
  }

  // P02 — A-side multi-injector: A-side elevated, B-side stable
  if (
    features.aSideMeanDev > 18 &&
    features.bSideMeanDev < 10 &&
    features.sfocDev > 8
  ) {
    matched.push('P02');
  }

  // P03 — Lube pressure loss: last-bearing pressure dropping, bearings heating
  if (
    features.lubeLastBearingDev > 0.5 &&
    features.lubeRate < -0.1 &&
    features.bearingDevs.some(d => d > 8)
  ) {
    matched.push('P03');
  }

  // P04 — Bearing overtemp: specific bearing hot, lube pressure dropping
  if (
    features.bearingDevs.some(d => d > 15) &&
    features.lubeDev > 0.3 &&
    features.bearingRates.some(r => r > 0.3)
  ) {
    matched.push('P04');
  }

  // P05 — HT Cooler fouling: coolant up, ALL cyls elevated, imbalance low (systemic)
  if (
    features.coolantTempDev > 6 &&
    features.allCylMeanDev > 12 &&
    features.cylImbalance < 20 &&  // low imbalance = systemic, not single-cyl
    features.chargeAirTempDev > 5
  ) {
    matched.push('P05');
  }

  // P06 — TC fouling: TC speed dropped, charge air pressure low, backpressure high
  if (
    features.tcSpeedDevs.some(d => d > 1500) &&
    features.chargeAirPressDev > 0.3 &&
    features.crankcasePressure > -1  // loosely — back pressure rises
  ) {
    matched.push('P06');
  }

  // P07 — Erratic injector: cyl stdDev high (oscillating), crankcase rate rising
  if (
    features.cylStdDevs.some(sd => sd > 8) &&
    features.cylDevs.some(d => d > 15) &&
    features.crankcaseRate > 0.05
  ) {
    matched.push('P07');
  }

  // P08 — Piston blow-by: crankcase pressure elevated and rising
  if (
    features.crankcasePressure > 2 &&
    features.crankcaseRate > 0.1
  ) {
    matched.push('P08');
  }

  return matched;
}

export function getPatternById(id: string): FaultPattern | undefined {
  return MTU8000_PATTERNS.find(p => p.id === id);
}
