// packages/simulator/src/degradation-matrix.ts
//
// STRUCTURED DEGRADATION MODEL — the documented source of truth for:
//   "what degrades how much, at what intensity, over what time,
//    in isolation vs combined, and which attributes are independent vs dependent."
//
// The physics in mtu8000-physics.ts stays the runtime engine; this matrix is the typed
// SPEC extracted from it, used by the BI page + regression validation. Keep in sync with:
//   • FAULT_MAX_EFFECTS / FAULT_GROWTH_RATES  (faults-mtu8000.ts)  — primary magnitudes + time
//   • the calibrated coefficients in mtu8000-physics.ts            — secondary ∂sensor/∂rootFactor
//
// PRINCIPLE (linear → regression-friendly):
//   effect_on_sensor = severity(t) · rootMax · weight
//   severity(t)      = min(FAULT_GROWTH_RATES[speed] · t , intensity/100)
// where `weight` is the partial derivative ∂sensor/∂rootFactor evaluated at the rated point
// (85 % load, 1150 RPM), and `rootMax` is the root-factor's max excursion (FAULT_MAX_EFFECTS).
// Intensity appears ONCE, as the cap on severity(t) — it is never a second multiplier on the
// effect (tickFaultsMTU8000 likewise uses `f.currentSeverity` raw, with no intensity factor).

import { FAULT_MAX_EFFECTS, FAULT_GROWTH_RATES } from './faults-mtu8000';
import type { FaultSpeed } from './faults-mtu8000';

// ── Independent root factors (what a fault DIRECTLY sets on PhysicsState) ──────────
export type RootFactor =
  | 'injFault'      // injFaults[cyl]   0–1   (per cylinder)
  | 'coolingEff'    // drop Δ = 1−coolingEff (HT cooler)
  | 'tcEff'         // drop Δ = 1−tcEff      (per turbocharger)
  | 'lubeFault'     // 0–1
  | 'bearingFault'  // bearingFaults[i] 0–1  (per bearing)
  | 'pistonBlowby'; // 0–1

export interface RootFactorInfo {
  factor: RootFactor;
  label: string;
  rootMax: number;       // physical span of the factor at full severity
  rootUnit: string;
  combine: 'max' | 'add'; // how simultaneous faults sharing this factor combine (current model)
}

// Root-factor span + combine rule (matches tickFaultsMTU8000: shared factors take worst-case max,
// per-instance factors like injFault/bearingFault are max'd per index then superpose via physics).
export const ROOT_FACTORS: Record<RootFactor, RootFactorInfo> = {
  injFault:     { factor: 'injFault',     label: 'Injector severity',     rootMax: 1.0,                                  rootUnit: '0–1', combine: 'max' },
  coolingEff:   { factor: 'coolingEff',   label: 'HT cooling-eff drop',   rootMax: FAULT_MAX_EFFECTS.F05_cooling_eff_drop, rootUnit: 'Δeff', combine: 'max' },
  tcEff:        { factor: 'tcEff',        label: 'TC-eff drop',           rootMax: FAULT_MAX_EFFECTS.F06_tc_eff_drop,    rootUnit: 'Δeff', combine: 'max' },
  lubeFault:    { factor: 'lubeFault',    label: 'Lube degradation',      rootMax: 1.0,                                  rootUnit: '0–1', combine: 'max' },
  bearingFault: { factor: 'bearingFault', label: 'Bearing severity',      rootMax: 1.0,                                  rootUnit: '0–1', combine: 'max' },
  pistonBlowby: { factor: 'pistonBlowby', label: 'Blow-by severity',      rootMax: 1.0,                                  rootUnit: '0–1', combine: 'max' },
};

// ── A single fault's effect on one observable ─────────────────────────────────────
export interface DegradationEffect {
  sensorId: string;                 // snapshot field the observable maps to
  kind: 'PRIMARY' | 'SECONDARY';    // PRIMARY = the sensor the fault is named for; SECONDARY = propagated
  weight: number;                   // ∂sensor / ∂rootFactor at rated point (sensor units per root unit)
  unit: string;
  modeled: boolean;                 // true = physics actually produces it; false = claimed in fault metadata but NOT in the equations (documented gap)
  via?: string;                     // intermediate for 2-hop propagation
  physicsRef: string;               // where the coefficient lives
}

export interface DegradationMode {
  id: string;                       // F01..F09
  name: string;
  ecsAlarmCode: string;
  componentId: string;
  rootFactor: RootFactor;
  scope: string;                    // which root instances (single cyl / A-side / one TC / all)
  effects: DegradationEffect[];
}

export interface DegradationComponent {
  id: string;
  name: string;
  rootFactors: RootFactor[];
  modeIds: string[];
}

// ── Components (top-level objects: engine components as a whole) ───────────────────
export const DEGRADATION_COMPONENTS: DegradationComponent[] = [
  { id: 'injectors',    name: 'Injectors',     rootFactors: ['injFault'],     modeIds: ['F01', 'F02', 'F07', 'F09'] },
  { id: 'bearings',     name: 'Crank Bearings',rootFactors: ['bearingFault'], modeIds: ['F04'] },
  { id: 'ht_cooler',    name: 'HT Cooler',     rootFactors: ['coolingEff'],   modeIds: ['F05'] },
  { id: 'turbocharger', name: 'Turbochargers', rootFactors: ['tcEff'],        modeIds: ['F06'] },
  { id: 'lube_system',  name: 'Lube System',   rootFactors: ['lubeFault'],    modeIds: ['F03'] },
  { id: 'piston_rings', name: 'Pistons / Rings',rootFactors: ['pistonBlowby'],modeIds: ['F08'] },
];

// Reused effect groups ------------------------------------------------------------
// Injector severity (per affected cylinder) → observables.
const injectorEffects = (deltaC: number): DegradationEffect[] => [
  { sensorId: 'cylTemps[n]',     kind: 'PRIMARY',   weight: deltaC,      unit: '°C',   modeled: true,  physicsRef: 'cylExhaustTemp_MTU8000 faultDelta = inj·65' },
  { sensorId: 'exhaustMeanTemp', kind: 'SECONDARY', weight: deltaC / 20, unit: '°C',   modeled: true,  physicsRef: '20-cyl mean of cyl rise' },
  { sensorId: 'cylImbalance',    kind: 'SECONDARY', weight: deltaC,      unit: '°C',   modeled: true,  physicsRef: 'max−min cyl spread' },
  { sensorId: 'sfoc',            kind: 'SECONDARY', weight: 4.5,         unit: 'g/kWh',modeled: true,  physicsRef: 'sfoc_MTU8000 injFaultPenalty = Σ inj·4.5' },
  { sensorId: 'fuelRailPressure',kind: 'SECONDARY', weight: -15,         unit: 'bar',  modeled: true,  via: 'injFaultCount', physicsRef: 'fuelRailPressure_MTU8000 faultDrop = count·15' },
];

// ── Fault modes with extracted weights ────────────────────────────────────────────
export const DEGRADATION_MODES: DegradationMode[] = [
  {
    id: 'F01', name: 'Injector Degradation (Single Cyl)', ecsAlarmCode: 'HI T-Exhaust Cyl N',
    componentId: 'injectors', rootFactor: 'injFault', scope: 'single cylinder',
    effects: injectorEffects(FAULT_MAX_EFFECTS.F01_injector_temp_delta),
  },
  {
    id: 'F02', name: 'Multi-Cyl Injector (A-Side)', ecsAlarmCode: 'HI T-Exhaust Mean',
    componentId: 'injectors', rootFactor: 'injFault', scope: 'cylinders A1–A10',
    effects: [
      ...injectorEffects(FAULT_MAX_EFFECTS.F02_multi_injector_delta),
      { sensorId: 'aSideMeanExhaust', kind: 'SECONDARY', weight: FAULT_MAX_EFFECTS.F02_multi_injector_delta, unit: '°C', modeled: true, physicsRef: 'A-bank mean rise' },
    ],
  },
  {
    id: 'F09', name: 'Multi-Cyl Injector (B-Side)', ecsAlarmCode: 'HI T-Exhaust Mean',
    componentId: 'injectors', rootFactor: 'injFault', scope: 'cylinders B1–B10',
    effects: [
      ...injectorEffects(FAULT_MAX_EFFECTS.F09_multi_injector_delta),
      { sensorId: 'bSideMeanExhaust', kind: 'SECONDARY', weight: FAULT_MAX_EFFECTS.F09_multi_injector_delta, unit: '°C', modeled: true, physicsRef: 'B-bank mean rise' },
    ],
  },
  {
    id: 'F07', name: 'Injector Spray Erratic', ecsAlarmCode: 'HI T-Exhaust Cyl N (osc)',
    componentId: 'injectors', rootFactor: 'injFault', scope: 'single cylinder (oscillating)',
    // DEVIATION (deliberate) — F07 is the one mode whose weights are NOT pure ∂sensor/∂rootFactor:
    // tickFaultsMTU8000 drives its root factors to only a FRACTION of severity (injFaults[ci] = s·0.8,
    // pistonBlowby = s·0.3, vs s·1.0 everywhere else), and it touches pistonBlowby even though its
    // declared rootFactor is injFault. Those sub-unity fractions are folded into the weights below
    // (65·0.8 = 52, 8·0.3 = 2.4) rather than into rootMax, so predictEffect() — which multiplies by
    // ROOT_FACTORS.injFault.rootMax = 1.0 — still returns the right magnitude. Consequence: read these
    // weights as "sensor units per unit of F07 severity", not as the ∂/∂rootFactor the other modes
    // carry, and do NOT hand them to the finite-difference test as bare physics partials.
    effects: [
      { sensorId: 'cylTemps[n]',       kind: 'PRIMARY',   weight: FAULT_MAX_EFFECTS.F01_injector_temp_delta * 0.8, unit: '°C',   modeled: true, physicsRef: 'F07 sets inj = sev·0.8' },
      { sensorId: 'cylTemps[n]',       kind: 'SECONDARY', weight: FAULT_MAX_EFFECTS.F07_spray_erratic_amp,        unit: '°C pk-pk', modeled: true, via: 'oscillation', physicsRef: 'snapshot-time ± oscillation' },
      { sensorId: 'crankcasePressure', kind: 'SECONDARY', weight: FAULT_MAX_EFFECTS.F08_blowby_pressure * FAULT_MAX_EFFECTS.F07_blowby_coupling, unit: 'mbar', modeled: true, via: 'pistonBlowby', physicsRef: 'F07 pistonBlowby = sev·F07_blowby_coupling → crankcase·8; sub-alarm by design' },
      { sensorId: 'sfoc',              kind: 'SECONDARY', weight: 4.5,     unit: 'g/kWh', modeled: true, physicsRef: 'sfoc injFaultPenalty' },
    ],
  },
  {
    id: 'F04', name: 'Bearing Overtemperature', ecsAlarmCode: 'SS T-Bearing N',
    componentId: 'bearings', rootFactor: 'bearingFault', scope: 'single bearing',
    effects: [
      { sensorId: 'bearingTemps[i]', kind: 'PRIMARY',   weight: FAULT_MAX_EFFECTS.F04_bearing_temp_rise, unit: '°C', modeled: true, physicsRef: 'bearingTemp_MTU8000 faultHeat = bearingFaults[i]·45' },
      // crossCorrelations claim lube-pressure drop @ bearing + crankcase rise, but tickFaultsMTU8000
      // only writes bearingFaults[i] → those are NOT produced by the equations.
      { sensorId: 'lubeLastBearingPressure', kind: 'SECONDARY', weight: 0, unit: 'bar', modeled: false, physicsRef: 'claimed in crossCorrelations; not in tick effects' },
      { sensorId: 'crankcasePressure',       kind: 'SECONDARY', weight: 0, unit: 'mbar', modeled: false, physicsRef: 'claimed; not modeled' },
    ],
  },
  {
    id: 'F05', name: 'HT Cooler Fouling', ecsAlarmCode: 'HI T-Coolant',
    componentId: 'ht_cooler', rootFactor: 'coolingEff', scope: 'whole HT circuit (all sensors)',
    effects: [
      { sensorId: 'coolantTempAfterEngine', kind: 'PRIMARY',   weight: 15,  unit: '°C',   modeled: true,  physicsRef: 'targetCoolantTemp += (1−ce)·15' },
      { sensorId: 'exhaustMeanTemp',        kind: 'SECONDARY', weight: 35,  unit: '°C',   modeled: true,  physicsRef: 'exhaustTemp_MTU8000 cooling = (1−ce)·35' },
      { sensorId: 'cylTemps[all]',          kind: 'SECONDARY', weight: 35,  unit: '°C',   modeled: true,  physicsRef: 'all cyls track exhaust mean' },
      { sensorId: 'lubeOilTemp',            kind: 'SECONDARY', weight: 15,  unit: '°C',   modeled: true,  physicsRef: 'lubeOilTemp_MTU8000 coolingPenalty = (1−ce)·15' },
      { sensorId: 'bearingTemps[all]',      kind: 'SECONDARY', weight: 6,   unit: '°C',   modeled: true,  via: 'lubeOilTemp', physicsRef: 'oilHeat 0.4 × ΔlubeOilTemp 15 = 6' },
      { sensorId: 'sfoc',                   kind: 'SECONDARY', weight: 18,  unit: 'g/kWh',modeled: true,  physicsRef: 'sfoc_MTU8000 coolingPenalty = (1−ce)·18' },
      { sensorId: 'chargeAirTemp',          kind: 'SECONDARY', weight: 0,   unit: '°C',   modeled: false, physicsRef: 'N/A by design: charge air is LT-cooled (36°C), unaffected by HT-cooler fouling — claim dropped' },
    ],
  },
  {
    id: 'F06', name: 'Turbocharger Fouling (One TC)', ecsAlarmCode: 'SD TC Speed',
    componentId: 'turbocharger', rootFactor: 'tcEff', scope: 'single turbocharger',
    effects: [
      { sensorId: 'tcSpeeds[i]',         kind: 'PRIMARY',   weight: -28000, unit: 'RPM',  modeled: true,  physicsRef: 'tcSpeed_MTU8000 = (…)·tcEff (~28k at rated)' },
      { sensorId: 'chargeAirPressure',   kind: 'SECONDARY', weight: -1.86,  unit: 'bar',  modeled: true,  physicsRef: 'chargeAirPressure boost·tcEff (boost≈1.86 rated)' },
      { sensorId: 'exhaustMeanTemp',     kind: 'SECONDARY', weight: 20,     unit: '°C',   modeled: true,  physicsRef: 'exhaustTemp_MTU8000 tc = (1−tcEff)·20' },
      { sensorId: 'exhaustBackPressure', kind: 'SECONDARY', weight: 40,     unit: 'mbar', modeled: true,  physicsRef: 'exhaustBackPressure tcFoulEffect = (1−tcEff)·40' },
      { sensorId: 'sfoc',                kind: 'SECONDARY', weight: 25,     unit: 'g/kWh',modeled: true,  physicsRef: 'sfoc_MTU8000 tcPenalty = (1−tcEff)·25' },
    ],
  },
  {
    id: 'F03', name: 'Lube Oil Pressure Loss', ecsAlarmCode: 'SS P-Oil Last Bearing',
    componentId: 'lube_system', rootFactor: 'lubeFault', scope: 'whole lube circuit',
    effects: [
      { sensorId: 'lubeOilPressure',          kind: 'PRIMARY',   weight: -3.8,  unit: 'bar', modeled: true, physicsRef: 'lubeOilPressure_MTU8000 faultDrop = lf·3.8' },
      { sensorId: 'lubeLastBearingPressure',  kind: 'SECONDARY', weight: -2.37, unit: 'bar', modeled: true, physicsRef: 'lastBearing = (gallery − filterDpTarget)·0.55; d/dlf = −(3.8+0.5)·0.55 = −2.37' },
      { sensorId: 'lubeOilPressureAfterFilter',kind: 'SECONDARY',weight: -4.3,  unit: 'bar', modeled: true, physicsRef: 'gallery −3.8·lf minus filterΔP +0.5·lf' },
      { sensorId: 'pistonCoolingPress',       kind: 'SECONDARY', weight: -3.08, unit: 'bar', modeled: true, physicsRef: 'pistonCool = gallery·0.68 − lf·0.5' },
      { sensorId: 'bearingTemps[all]',        kind: 'SECONDARY', weight: 17.1,  unit: '°C',  modeled: true, physicsRef: 'via lube-pressure starvation: pressureDef=(6.5−P)·4.5, dP/dlubeFault=−3.8 ⇒ 17.1°C/unit (NOT faultHeat — that carries bearingFault)' },
      { sensorId: 'filterDifferentialP',      kind: 'SECONDARY', weight: 0.5,   unit: 'bar', modeled: true, physicsRef: 'filterDpTarget = 0.15 + lf·0.5' },
    ],
  },
  {
    id: 'F08', name: 'Piston Blow-by', ecsAlarmCode: 'HI P-Crankcase',
    componentId: 'piston_rings', rootFactor: 'pistonBlowby', scope: 'whole power section',
    effects: [
      { sensorId: 'crankcasePressure', kind: 'PRIMARY',   weight: 8, unit: 'mbar', modeled: true,  physicsRef: 'crankcasePressure_MTU8000 blowbyEffect = pb·8' },
      { sensorId: 'sfoc',              kind: 'SECONDARY', weight: 2, unit: 'g/kWh',modeled: true,  physicsRef: 'sfoc_MTU8000 blowbyPenalty = pistonBlowby·2' },
    ],
  },
];

// ── Time / intensity model ────────────────────────────────────────────────────────
export const GROWTH_RATES = FAULT_GROWTH_RATES;          // severity units per second, per speed
export const INTENSITY_COUPLING = 'linear' as const;     // effect ∝ intensity/100, via the severity cap only

/** Severity at elapsed time for a given speed + intensity cap (the linear ramp). */
export function severityAt(speed: FaultSpeed, elapsedSeconds: number, intensityPct: number): number {
  return Math.min(GROWTH_RATES[speed] * elapsedSeconds, intensityPct / 100);
}

/**
 * Predicted sensor deviation from one of a mode's effects, per affected root instance:
 *
 *     deviation = effect.weight · severity · ROOT_FACTORS[mode.rootFactor].rootMax
 *
 * `severity` is the fault's `currentSeverity` (0–1) — what `severityAt()` returns and what
 * `tickFaultsMTU8000` applies. It ALREADY carries the intensity cap (`min(rate·t, intensity/100)`),
 * so there is deliberately no `intensityPct` parameter: re-applying it here would count it twice.
 *
 * `rootMax` converts severity into the root factor's physical excursion (severity 1.0 moves the
 * factor by `rootMax` — F05 at s=1.0 drops coolingEff by 0.25), which `weight` (= ∂sensor/∂rootFactor)
 * then turns into sensor units. E.g. F05 → coolantTempAfterEngine at s=1.0: 15 · 1.0 · 0.25 = 3.75 °C,
 * matching the physics `targetCoolantTemp += (1−coolingEff)·15`.
 */
export function predictEffect(
  mode: DegradationMode,
  effect: DegradationEffect,
  severity: number,
): number {
  return effect.weight * severity * ROOT_FACTORS[mode.rootFactor].rootMax;
}

/** Lookups. */
export function getMode(id: string): DegradationMode | undefined {
  return DEGRADATION_MODES.find(m => m.id === id);
}
export function getComponent(id: string): DegradationComponent | undefined {
  return DEGRADATION_COMPONENTS.find(c => c.id === id);
}
