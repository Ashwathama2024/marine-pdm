import type { SensorRegistry } from './sensor-registry';
import type { BaselineStore } from './baseline-store';
import type { DependencyMap } from './dependency-map';
import type { PatternLibrary } from './pattern-library';
import type { SensorDefinition, BaselineCurve } from '@marine-pdm/shared';
import { MTU8000_PATTERNS } from './patterns-mtu8000-data';

// Sensor definitions calibrated to Kongsberg K-Chief 600/2400 alarm group
// Engine: MTU 8000 20V M71L, 4-stroke medium-speed, rated 1150 RPM / 85% load / 9100 kW
const PRIMARY_SENSORS: SensorDefinition[] = [
  {
    id: 'ME.RPM', displayName: 'Main Engine RPM', unit: 'RPM',
    minPhysical: 0, maxPhysical: 1200,
    alarmHigh: 1200,   // L2 overspeed alarm — MTU 8000 rated 1150 RPM
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.Load', displayName: 'Engine Load', unit: '%',
    minPhysical: 0, maxPhysical: 110,
    alarmHigh: 100,
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.ExhaustTemp', displayName: 'Mean Exhaust Temp', unit: '°C',
    minPhysical: 200, maxPhysical: 600,
    alarmHigh: 560,    // L2 Exhaust HIGH ALARM
    alarmLow:  300,    // L2 Exhaust LOW ALARM (cold fault)
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.LubeOilPressure', displayName: 'Lube Oil Pressure', unit: 'bar',
    minPhysical: 1.5, maxPhysical: 9.0,
    alarmHigh: 8.5,    // L2 LO pressure HIGH (PRV fault)
    alarmLow:  5.0,    // L2 LO pressure LOW ALARM
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.FuelRack', displayName: 'Fuel Rack Position', unit: 'mm',
    minPhysical: 0, maxPhysical: 115,
    alarmHigh: 100,    // L2 fuel rack max alarm
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.ScavengeAirPressure', displayName: 'Scavenge Air Pressure', unit: 'bar',
    minPhysical: 0, maxPhysical: 4.5,
    alarmHigh: 3.5,    // L2 scavenge HIGH
    alarmLow:  0.5,    // L2 scavenge LOW (TC fault at high load)
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.TCSpeed', displayName: 'Turbocharger Speed', unit: 'RPM',
    minPhysical: 0, maxPhysical: 42000,
    alarmHigh: 41000,  // Overspeed L2 — Power limitation (MTU 20V 8000 spec)
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.JacketCoolingOutlet', displayName: 'Jacket Cooling Water Outlet', unit: '°C',
    minPhysical: 50, maxPhysical: 102,
    alarmHigh: 90,     // L2 jacket HIGH ALARM
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.SFOC', displayName: 'Specific Fuel Oil Consumption', unit: 'g/kWh',
    minPhysical: 155, maxPhysical: 240,
    alarmHigh: 218,    // L2 efficiency degradation alarm
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.ChargeAirTemp', displayName: 'Charge Air Temperature', unit: '°C',
    minPhysical: 15, maxPhysical: 90,
    alarmHigh: 78,     // L2 charge air HIGH (fouled cooler)
    alarmLow:  25,     // L2 charge air LOW (overcooling)
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.FuelOilPressure', displayName: 'Fuel Oil Pressure', unit: 'bar',
    minPhysical: 3.0, maxPhysical: 12.0,
    alarmHigh: 10.5,   // L2 FO pressure HIGH
    alarmLow:  5.0,    // L2 FO pressure LOW
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.FuelOilTemp', displayName: 'Fuel Oil Temperature', unit: '°C',
    minPhysical: 20, maxPhysical: 55,
    alarmHigh: 50,     // L2 FO temp HIGH
    alarmLow:  25,     // L2 FO temp LOW (high viscosity)
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.LOFilterDP', displayName: 'LO Filter Differential Pressure', unit: 'bar',
    minPhysical: 0, maxPhysical: 2.0,
    alarmHigh: 1.2,    // L2 filter blocked
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.PistonCoolingPress', displayName: 'Piston Cooling Pressure', unit: 'bar',
    minPhysical: 2.0, maxPhysical: 10.0,
    alarmHigh: 8.5,    // L2 overpressure
    alarmLow:  4.0,    // L2 low pressure
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
  {
    id: 'ME.ShaftPower', displayName: 'Shaft Power', unit: 'kW',
    minPhysical: 0, maxPhysical: 10000,
    alarmHigh: 9500,   // L2 overload — MTU 8000 M71L max 9100 kW
    status: 'ACTIVE', observationDaysRequired: 0,
    addedBy: 'system', addedDate: new Date().toISOString(),
  },
];

// All equations mirror mtu8000-physics.ts exactly — verified at rated point 1150 RPM / 85% load.
// Validation: exhaust→440°C, LO→6.82 bar, chargeAir→3.04 bar, jacket→76.75°C, SFOC→185 g/kWh.
const PRIMARY_BASELINES: BaselineCurve[] = [
  {
    sensorId: 'ME.ExhaustTemp',
    // Piecewise: declutched/no-load (load≈0) uses the no-load curve (280 + rpm/1150·55, mirrors
    // exhaustTemp_noLoad); under load uses the loaded curve (276 + load·160 + rpm·28 → 440°C rated).
    // Keeps deviation ≈0 across the full operating range, including RPM-up-without-load.
    equation: 'load < 2 ? 280 + rpm / 1150 * 55 : 276 + load / 100 * 160 + rpm / 1150 * 28',
    coefficients: { base: 276, loadFactor: 160, rpmFactor: 28, rpmDivisor: 1150, noLoadBase: 280, noLoadRpmFactor: 55 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (no-load 280→335°C; loaded rated 1150/85% → 440°C)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.LubeOilPressure',
    // Accounts for pump curve, load demand, oil viscosity at operating temp, and normal filter ΔP.
    // oilTemp ≈ 70 + (load/100)*32 + (rpm/1150)*8  →  viscDrop = max(0, (oilTemp-85)*0.018)
    // Simplified to: loadFactor 1.13 = 0.8 (demand) + 0.33 (avg viscosity slope) + 0.15 (filter ΔP const).
    // Validates: rated 1150/85% → ~6.4 bar (physics output with hot oil + filter).
    equation: '3.5 + rpm / 1150 * 4.0 - load / 100 * 1.13 - 0.15',
    coefficients: { base: 3.5, rpmFactor: 4.0, loadFactor: 1.13, filterDP: 0.15 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (rated → ~6.4 bar incl. viscosity + filter ΔP)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.LubeOilPressure.LastBearing',
    // The main gallery curve above, scaled by the 0.55 the physics applies at the furthest
    // lubrication point (`targetLubeLastB = lubeOilPressure_MTU8000(...) * 0.55`). Written out rather
    // than referenced because a BaselineDefinition is a standalone mathjs string — so if the gallery
    // equation is retuned, this one must be retuned with it.
    //
    // Validates against the coded limit's own note: idle 400 RPM / 0 % load → 2.61 bar, matching the
    // "idle 400 RPM gives ~2.67 bar" recalibration recorded on pressure_last_bearing_min (SS 2.0 bar).
    // Rated 1150 / 85 % → 3.51 bar.
    equation: '(3.5 + rpm / 1150 * 4.0 - load / 100 * 1.13 - 0.15) * 0.55',
    coefficients: { base: 3.5, rpmFactor: 4.0, loadFactor: 1.13, filterDP: 0.15, lastBearingRatio: 0.55 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (physics.ts targetLubeLastB = gallery × 0.55)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.FuelRack',
    equation: '0',
    coefficients: {},
    dependsOn: [],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L — common-rail engine, no mechanical fuel rack',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.ScavengeAirPressure',
    // Mirrors chargeAirPressure_MTU8000 exactly: 1.35 + rpm·1.46 + load·0.47.
    // RPM-driven (TC windmills with engine speed) so boost rises with RPM even at no load.
    equation: '1.35 + rpm / 1150 * 1.46 + load / 100 * 0.47',
    coefficients: { base: 1.35, rpmFactor: 1.46, loadFactor: 0.47, rpmDivisor: 1150 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (no-load 1150 → 2.81 bar; rated → 3.21 bar)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.TCSpeed',
    equation: '500 + rpm / 1150 * 17300 + load / 100 * 12000',
    coefficients: { base: 500, rpmFactor: 17300, rpmDivisor: 1150, loadFactor: 12000 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 20V 8000 M71/M91 spec (idle 7 000 RPM, rated 28 000 RPM)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.JacketCoolingOutlet',
    // 50°C thermostat floor (mirrors physics.ts max(50, 30 + load·55)) — jacket water is held warm
    // at idle/no-load by the thermostat, so it does not fall to 30°C when declutched.
    equation: 'max(50, 30 + load / 100 * 55)',
    coefficients: { base: 30, loadFactor: 55, floor: 50 },
    dependsOn: ['load'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (no-load floor 50°C; rated → 76.75°C)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.SFOC',
    equation: '180 + (100 - load) * 0.333 + (1150 - rpm) * 0.08',
    coefficients: { base: 180, loadFactor: 0.333, rpmFactor: 0.08, rpmDivisor: 1150 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 185 g/kWh)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.ChargeAirTemp',
    equation: '48 + load / 100 * 18',
    coefficients: { base: 48, loadFactor: 18 },
    dependsOn: ['load'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 63.3°C)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.FuelOilPressure',
    equation: '6.0 + load / 100 * 1.8',
    coefficients: { base: 6.0, loadFactor: 1.8 },
    dependsOn: ['load'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 7.53 bar supply)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.FuelOilTemp',
    equation: '30 + load / 100 * 13',
    coefficients: { base: 30, loadFactor: 13 },
    dependsOn: ['load'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 41°C)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.LOFilterDP',
    equation: '0.15',
    coefficients: { healthy: 0.15 },
    dependsOn: [],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (healthy filter = 0.15 bar constant)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.PistonCoolingPress',
    // 68% of corrected main gallery pressure (matches physics: newLagLube * 0.68).
    // Uses same corrected LO baseline (incl. viscosity + filter ΔP) so deviation stays near zero.
    // Validates: rated 1150/85% → ~4.35 bar (physics output with hot oil).
    equation: '(3.5 + rpm / 1150 * 4.0 - load / 100 * 1.13 - 0.15) * 0.68',
    coefficients: { lubeFraction: 0.68 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (~68% of corrected LO gallery pressure, rated → ~4.35 bar)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.ShaftPower',
    equation: '9100 * load / 100',
    coefficients: { mcrKw: 9100 },
    dependsOn: ['load'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L — 9100 kW max (M71L rating)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.BearingTemp.Mean',
    // Healthy (fault=0) terms of bearingTemp_MTU8000, shared across all 11 bearings — the same
    // simplification the per-cylinder baselines use in reusing one expectedExhaust for 20 cylinders.
    //
    // NOW INCLUDES oilHeat, previously dropped. The old comment justified omitting it as "zero at a
    // healthy rated oil temp (85°C)", but 85 is the REFERENCE in `(lubeOilTemp − 85)·0.4`, not the
    // operating point: lubeOilTemp_MTU8000 returns 98.2 °C at rated, so oilHeat is +5.28 °C there,
    // not 0. The curve read 91.8 °C at rated against its own source note of "~96 °C".
    //
    // The resulting 10.8 °C shortfall against the true hottest bearing was invisible while nothing
    // displayed or labelled bearing temperature, and rulQuality cannot catch it either — that flag
    // compares the LAGGED baseline against the INSTANT one, and a bias in the shared curve cancels
    // out of both. It surfaced only once analyticRul divided by it: severityAtCross came out 0.516
    // against an intensity cap of 0.5, so F04 at 50 % was labelled NO_CROSS ("cannot reach the
    // band") while the sensor sat at ~125 °C, well past the 115 °C HI. Restored, it is 0.276.
    //
    // Folded algebraically so the curve stays a pure function of load/rpm:
    //   oilHeat = (63 + load/100·32 + rpm/1150·8 − 85)·0.4 = load/100·12.8 + rpm/1150·3.2 − 8.8
    //   base 58 − 8.8 = 49.2 ·  load 28 + 12.8 = 40.8 ·  rpm 10 + 3.2 = 13.2
    //
    // pressureDef stays omitted: 0.5 °C at rated, though ~8 °C at idle where the gallery sits
    // furthest below its 6.5 bar reference. No alarm band applies at idle, so that residual costs a
    // small display deviation there and nothing in the RUL labels. positionBias is not in this curve
    // either — it is per-bearing, and the consumer adds it (see BEARING_MAX_POSITION_BIAS).
    equation: '49.2 + load / 100 * 40.8 + rpm / 1150 * 13.2',
    coefficients: { base: 49.2, loadFactor: 40.8, rpmFactor: 13.2, rpmDivisor: 1150 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 97.1°C incl. oilHeat; idle → 53.8°C)',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.FuelRailPressure',
    // Mirrors fuelRailPressure_MTU8000's healthy (no injector faults) terms exactly.
    equation: '1600 + load / 100 * 200',
    coefficients: { base: 1600, loadFactor: 200 },
    dependsOn: ['load'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'MTU 8000 M71L Physics Model v3 (idle 1600 bar → rated 1770 bar)',
    addedDate: new Date().toISOString(), isActive: true,
  },
];

// The 3 generic patterns (injector_degradation / lube_system_failure / cooling_fouling) that used
// to be seeded here have been retired — MTU8000_PATTERNS (P01-P08, imported below) are the real,
// ECS-coded replacements patterns-mtu8000-data.ts's own header comment always said they should be
// ("replacing v1.0 generic 3-pattern library"); registering both would produce two competing alerts
// (one generic, one ECS-coded) for the same physical fault. The generic PatternLibrary.matchPatterns()
// path itself is untouched and still fully functional for any custom pattern added later via
// knowledge-api.ts's addPattern endpoint.

export function seedKnowledgeBase(
  registry: SensorRegistry,
  baselineStore: BaselineStore,
  dependencyMap: DependencyMap,
  patternLibrary: PatternLibrary,
): void {
  // Load primary sensors (ACTIVE, bypass observation gate)
  for (const s of PRIMARY_SENSORS) {
    registry.loadSensor(s);
  }

  // Load baselines
  for (const b of PRIMARY_BASELINES) {
    baselineStore.addCurve(b);
  }

  // Load dependency map
  dependencyMap.addDependency('ME.ExhaustTemp', ['load', 'rpm', 'coolingEff'], { load: 0.96, rpm: 0.88 });
  dependencyMap.addDependency('ME.JacketCoolingOutlet', ['load', 'ME.ExhaustTemp'], { load: 0.91, 'ME.ExhaustTemp': 0.85 });
  dependencyMap.addDependency('ME.TCSpeed', ['load', 'rpm'], { load: 0.97, rpm: 0.93 });
  dependencyMap.addDependency('ME.SFOC', ['load', 'ME.JacketCoolingOutlet'], { load: -0.82, 'ME.JacketCoolingOutlet': 0.71 });
  dependencyMap.addDependency('ME.LubeOilPressure', ['rpm'], { rpm: 0.78 });

  // Load the real MTU 8000 fault patterns (P01-P08, ECS-coded). matchedExternally: true tells
  // PatternLibrary.matchPatterns() to skip generic per-tag evaluation for these — they're matched
  // by decision-engine.ts calling matchMTU8000Patterns() directly and reporting the result via
  // patternLibrary.recordMatch(), which drives the same timesTriggered/persistence bookkeeping.
  for (const p of MTU8000_PATTERNS) {
    patternLibrary.addPattern({ ...p, matchedExternally: true });
  }
}
