// packages/knowledge/src/patterns-mtu8000-data.ts
// 8 MTU 8000-specific fault pattern DEFINITIONS (data only) — real ECS 8000 alarm codes and MTU
// maintenance work orders. PDF upgrade spec §8.1.
//
// Lives in `knowledge` (not `decision`) because pattern DATA is knowledge-base content — the same
// reason the generic DEFAULT_PATTERNS live in seed.ts, not in packages/decision. `decision` depends
// on `knowledge`, not the other way around, so the matching LOGIC that consumes these definitions
// (MTU8000Features, matchMTU8000Patterns — packages/decision/src/patterns-mtu8000.ts) stays in
// decision, while the definitions themselves are registered into the shared `patternLibrary`
// singleton here in seed.ts alongside the legacy patterns.
//
// `matchMTU8000Patterns()` does NOT read the `conditions` arrays below — it has its own hardcoded
// per-pattern logic operating on MTU8000Features (richer/differently-shaped than what the generic
// PatternLibrary.evaluateCondition() understands). The `conditions` here exist for documentation /
// display purposes (e.g. a future Pattern Library management view) and must be registered with
// `matchedExternally: true` so PatternLibrary.matchPatterns() skips evaluating them generically —
// see pattern-library.ts.

import type { FaultPattern } from '@marine-pdm/shared';

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
