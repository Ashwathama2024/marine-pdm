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
  // ME.FuelRack removed — a fuel rack is mechanical-governor hardware and this is a common-rail
  // engine, so the tag could only ever read 0. It was registered as an ACTIVE sensor with an
  // alarmHigh of 100 mm that nothing could reach. See EngineSnapshot.fuelRack in shared/interfaces.ts.
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
    // Mirrors lubeOilPressure_MTU8000 EXACTLY at every load/rpm, viscosity term included:
    //   pump curve  1.15 + rpm/1150·6.85
    //   load demand −load/100·0.8
    //   viscosity   −max(0, (oilTemp − 78)·0.018) with oilTemp = 58 + load/100·18 + rpm/1150·5
    //   filter ΔP   −0.15  (folded into the leading constant: 1.15 − 0.15 = 1.0)
    // coldDrop is identically zero — lubeOilTemp_MTU8000's base is 58, which is its own threshold.
    //
    // The old curve folded viscosity into an averaged loadFactor of 1.13 because the term was large
    // (the oil ran 98 °C against an 85 °C reference). With the oil recalibrated to 78.3 °C at rated
    // the term is at most 0.054 bar, so writing it out exactly costs nothing and removes the
    // approximation — which matters because analyticRul DIVIDES by this baseline.
    // Rated 1150 / 85 % → 7.1646 bar. Idle 400 / 0 % → 3.383 bar.
    equation: '1.0 + rpm / 1150 * 6.85 - load / 100 * 0.8 - max(0, (load / 100 * 18 + rpm / 1150 * 5 - 20) * 0.018)',
    coefficients: { base: 1.15, rpmFactor: 6.85, loadFactor: 0.8, filterDP: 0.15, viscSlope: 0.018, viscRefC: 78 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'mtu8000-physics.ts lubeOilPressure_MTU8000 (rated → 7.16 bar); level set by MTU ZNG00028788 curves 1–4',
    addedDate: new Date().toISOString(), isActive: true,
  },
  {
    sensorId: 'ME.LubeOilPressure.LastBearing',
    // The gallery curve above × LAST_BEARING_PRESSURE_RATIO (0.92), which is what the physics
    // applies at the furthest lubrication point. Written out rather than referenced because a
    // BaselineDefinition is a standalone mathjs string — retune the gallery and you must retune
    // this with it.
    //
    // The ratio was 0.55, which put the healthy last bearing at 3.51 bar against ZNG00028788's
    // 5.3 bar SHUTDOWN (curve 4) — the engine would not have been running. Curve 3 warns at 5.8 bar
    // and curve 1 warns on piston cooling at only 5.2, so the last bearing is the HIGHER of the two
    // takeoffs; see the ratio constants in mtu8000-physics.ts.
    // Rated 1150 / 85 % → 6.591 bar. Idle 400 / 0 % → 3.112 bar (OEM curve 3 floor there is 2.37).
    equation: '(1.0 + rpm / 1150 * 6.85 - load / 100 * 0.8 - max(0, (load / 100 * 18 + rpm / 1150 * 5 - 20) * 0.018)) * 0.92',
    coefficients: { base: 1.15, rpmFactor: 6.85, loadFactor: 0.8, filterDP: 0.15, lastBearingRatio: 0.92 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'mtu8000-physics.ts targetLubeLastB = gallery × LAST_BEARING_PRESSURE_RATIO; clears MTU ZNG00028788 curves 3/4',
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
    // The gallery curve × PISTON_COOLING_PRESSURE_RATIO (0.85), matching physics.ts
    // `newLagLube * PISTON_COOLING_PRESSURE_RATIO`. The lubeFault term the physics subtracts on top
    // is a FAULT term and is correctly absent from a healthy baseline.
    //
    // Was 0.68 of a lower gallery, giving ~4.35 bar at rated — below ZNG00028788 curve 2, the
    // 4.7 bar SHUTDOWN (MDEC 2D-27, 2 s). Rated 1150 / 85 % → 6.090 bar, against a 5.2 bar warning.
    equation: '(1.0 + rpm / 1150 * 6.85 - load / 100 * 0.8 - max(0, (load / 100 * 18 + rpm / 1150 * 5 - 20) * 0.018)) * 0.85',
    coefficients: { lubeFraction: 0.85 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'mtu8000-physics.ts targetPistonCool = gallery × PISTON_COOLING_PRESSURE_RATIO; clears MTU ZNG00028788 curves 1/2',
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
    // Includes oilHeat AND pressureDef, so the curve now reproduces every healthy term of
    // bearingTemp_MTU8000 exactly, at every operating point rather than only near rated.
    //
    // History worth keeping: oilHeat was once omitted on the grounds that it is "zero at a healthy
    // rated oil temp (85 °C)" — but 85 was the REFERENCE in `(lubeOilTemp − 85)·0.4`, not the
    // operating point, and the oil then ran 98.2 °C, so the term was +5.28 °C. The resulting
    // 10.8 °C shortfall against the hottest bearing was invisible to rulQuality (it compares the
    // LAGGED baseline against the INSTANT one, and a bias in the shared curve cancels out of both)
    // and surfaced only once analyticRul divided by it: F04 at 50 % was labelled NO_CROSS while the
    // sensor sat past the HI limit. Both references are now the rated point, so each term is zero
    // at rated by construction and cannot drift that way again.
    //
    // pressureDef is now included too. It was dropped as "0.5 °C at rated, ~8 °C at idle", but with
    // the corrected gallery it reaches ~17 °C at idle — a healthy low-speed engine genuinely does
    // run warmer bearings on lower oil pressure, so this belongs in the HEALTHY expectation, not in
    // the deviation. Folding it in is what lets bearing-baseline.test.ts assert an exact match
    // instead of a tolerated residual.
    //
    // Folded algebraically so the curve stays a pure function of load/rpm:
    //   oilHeat  = (58 + load/100·18 + rpm/1150·5 − 78)·0.4 = load/100·7.2 + rpm/1150·2 − 8
    //   base 61 − 8 = 53  ·  load 28 + 7.2 = 35.2  ·  rpm 10 + 2 = 12
    //   pressureDef = max(0, 7.15 − gallery)·4.5, gallery as in ME.LubeOilPressure above
    //
    // positionBias is deliberately NOT here — it is per-bearing, and whoever reduces the 11 to a
    // max adds MTU8000_LIMITS.bearingMaxPositionBias (+5 °C) back. See ui/CLAUDE.md gotcha 6.
    // Rated 1150 / 85 % → 94.92 °C (hottest = 99.92 with the bias). Idle 400 / 0 % → 74.12 °C.
    equation: '53 + load / 100 * 35.2 + rpm / 1150 * 12 + max(0, 7.15 - (1.0 + rpm / 1150 * 6.85 - load / 100 * 0.8 - max(0, (load / 100 * 18 + rpm / 1150 * 5 - 20) * 0.018))) * 4.5',
    coefficients: { base: 53, loadFactor: 35.2, rpmFactor: 12, rpmDivisor: 1150, pressureDefRefBar: 7.15, pressureDefSlope: 4.5 },
    dependsOn: ['load', 'rpm'],
    validLoadMin: 0, validLoadMax: 100,
    source: 'mtu8000-physics.ts bearingTemp_MTU8000 healthy terms (rated → 94.92°C; idle → 74.12°C); limits MTU ZNG00028788 T-Bearing',
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
