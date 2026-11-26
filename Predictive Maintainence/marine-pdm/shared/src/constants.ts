// shared/constants.ts — Tag names, physics limits, alarm thresholds
// Calibrated to: 20-cylinder 4-stroke medium-speed engine
// Idle: 400 RPM / ~4% load; rated: 1150 RPM / 85% load (MTU 8000 Group 1B continuous)
// Exhaust mean at rated: 440°C, LO pressure: 6.82 bar, Charge air: 3.04 bar
import { CYLINDER_COUNT } from './interfaces';
// mtu8000.constants.ts has no imports of its own, so this cannot cycle.
import { MTU8000_LIMITS } from './mtu8000.constants';
// Curve-valued bands read the drawing directly. oem-limits.ts imports nothing, so no cycle.
import { oemCurve, oemScalar } from './oem-limits';
export { CYLINDER_COUNT };

export const TICK_MS = 1000;
export const ENGINE_MCR_KW = 9100; // kW at 100% MCR — MTU 8000 M71L

// 20-cylinder spread (A1-A10 = index 0-9, B1-B10 = index 10-19)
// MTU 8000 M71/M71L real commissioning values at 85% load / 1150 RPM.
// Source: MTU 8000 commissioning records (PDF upgrade spec §2.3)
export const CYL_SPREAD: number[] = [
  // A-side (driving end → free end): A1–A10
  -8, +12, -4, +16, -6, +10, -3, +14, -9, +7,
  // B-side (driving end → free end): B1–B10
  +5, -11, +9, -5, +13, -7, +11, -2, +8, -4,
];

// ── ALARM LEVEL DEFINITIONS ────────────────────────────────────────────────
// L1 PRE-ALARM — operator attention, no automatic action
// L2 ALARM     — audible/visual, must acknowledge
// L3 SLOWDOWN  — automatic slowdown if not overridden
// L4 SHUTDOWN  — automatic shutdown

// ── CURVE-VALUED LIMITS ────────────────────────────────────────────────────
// Most of the MTU 8000's coded limits are NOT scalars. Sheet 2 of ZNG00028788 tabulates thirteen
// of them against engine speed, so "the piston-cooling shutdown" has no single value — it is
// 4.7 bar at 1150 RPM, 3 bar at 800, and 0.2 bar at 300. Writing one of them down as a scalar
// silently picks a speed, which is how several thresholds here drifted away from the manual.
//
// A threshold may therefore be either a plain number or a function of engine RPM. Scalar entries
// behave exactly as before; a curve entry is resolved by the consumer at the speed the engine is
// actually turning. The curves themselves live in `oem-limits.ts`, cited to the drawing — a limit
// written as `rpm => oemCurve(2, rpm)` carries its provenance with it.
export type LimitValue = number | ((rpm: number) => number);

export function resolveLimit(v: LimitValue, rpm: number): number;
export function resolveLimit(v: LimitValue | undefined, rpm: number): number | undefined;
export function resolveLimit(v: LimitValue | undefined, rpm: number): number | undefined {
  return typeof v === 'function' ? v(rpm) : v;
}

/** One sensor's alarm band as authored — entries may be scalars or RPM curves. */
export type AlarmBandSpec = Record<string, LimitValue | undefined>;
/** The same band at one engine speed — every entry a plain number. */
export type ResolvedAlarmBand = Record<string, number | undefined>;

/** Collapse a band to plain numbers at `rpm`. A band of scalars is returned unchanged in value. */
export function resolveAlarmBand(spec: AlarmBandSpec, rpm: number): ResolvedAlarmBand {
  const out: ResolvedAlarmBand = {};
  for (const key of Object.keys(spec)) out[key] = resolveLimit(spec[key], rpm);
  return out;
}

/** A whole limit set with every curve resolved — same keys, every threshold a plain number. */
export type ResolvedLimitSet<T> = { [K in keyof T]: { [P in keyof T[K]]: number } };

/**
 * Resolve every band of a limit set at one engine speed. The gauges use this so that a gauge's
 * painted alarm ticks and the colour of its needle come from the same RPM — reading a curve limit
 * at two different speeds within one gauge would put the tick somewhere the colour does not change.
 */
export function resolveLimitSet<T extends Record<string, Record<string, LimitValue>>>(
  limits: T,
  rpm: number,
): ResolvedLimitSet<T> {
  const out = {} as ResolvedLimitSet<T>;
  for (const band of Object.keys(limits) as Array<keyof T>) {
    out[band] = resolveAlarmBand(limits[band] as AlarmBandSpec, rpm) as ResolvedLimitSet<T>[keyof T];
  }
  return out;
}

export const ALARM_LIMITS = {
  exhaustTemp: {
    physMin: 200,   // °C
    physMax: 600,   // °C
    normalMin: 350,
    normalMax: 540,
    preAlarmHigh: 530,  // L1
    alarmHigh:    545,  // L2
    slowdownHigh: 560,  // L3
    shutdownHigh: 575,  // L4
  },
  cylinderTemp: {
    physMin: 200,
    physMax: 620,
    preAlarmHigh:  540,  // L1
    alarmHigh:     555,  // L2
    slowdownHigh:  570,  // L3
    shutdownHigh:  585,  // L4
  },
  cylImbalance: {
    // MTU 8000 M71L CYL_SPREAD constants produce a natural healthy spread of ~26°C.
    // Limits raised to avoid false L1 alarm at normal operating conditions.
    preAlarmHigh:  30,  // L1 — cyl spread °C (was 25, natural spread ~26°C)
    alarmHigh:     40,  // L2 (was 35)
    slowdownHigh:  50,  // L3 (was 45)
  },
  lubeOilPressure: {
    physMin: 2.5,
    physMax: 9.0,
    alarmHigh:    8.5,  // L2 — overpressure
    preAlarmLow:  5.5,  // L1
    alarmLow:     5.0,  // L2
    slowdownLow:  4.5,  // L3
    shutdownLow:  4.0,  // L4
  },
  jacketOutlet: {
    physMin: 50,
    physMax: 105,
    preAlarmHigh:  87,  // L1
    alarmHigh:     90,  // L2
    slowdownHigh:  93,  // L3
    shutdownHigh:  97,  // L4
  },
  scavengeAir: {
    physMin: 0,
    physMax: 4.5,
    alarmHigh:   3.8,
    alarmLow:    0.8,
  },
  tcRPM: {
    physMin: 0,
    physMax: 42000,
    preAlarmHigh: 40500,   // Overspeed L1 — Yellow alarm (MTU 20V 8000 spec)
    alarmHigh:    41000,   // Overspeed L2 — Power limitation
    shutdownHigh: 42000,
  },
  sfoc: {
    physMin: 155,
    physMax: 240,
    preAlarmHigh: 210,
    alarmHigh:    220,
  },
  rpm: {
    physMin: 0,
    physMax: 1200,   // MTU 8000 rated 1150, max 1200 RPM
    alarmHigh:    1200,
    shutdownHigh: 1210,
  },
  // fuelRack removed — common-rail engine, no mechanical rack. See EngineSnapshot.fuelRack.
  // New sensors
  chargeAirTemp: {
    physMin: 15,
    physMax: 90,
    preAlarmHigh: 72,  // L1 — charge air too hot (fouled cooler)
    alarmHigh:    78,  // L2
    shutdownHigh: 85,  // L4
    alarmLow:     20,  // L2 — too cold (OEM T-Charge Air LL, ZNG00028788)
  },
  fuelOilPressure: {
    physMin: 3.0,
    physMax: 12.0,
    alarmHigh:   10.5,  // L2 — high FO pressure
    preAlarmLow:  5.5,  // L1
    alarmLow:     5.0,  // L2
    shutdownLow:  3.5,  // L4 — fuel starvation
  },
  fuelOilTemp: {
    physMin: 20,
    physMax: 55,
    preAlarmHigh: 45,  // L1 — FO temp high
    alarmHigh:    50,  // L2
    alarmLow:     25,  // L2 — FO too cold (high viscosity)
  },
  loFilterDP: {
    physMin: 0,
    physMax: 2.0,
    preAlarmHigh: 0.8,  // L1 — filter partially blocked
    alarmHigh:    1.2,  // L2 — filter blocked, bypass opening
    shutdownHigh: 1.8,  // L4 — critical filter blockage
  },
  // Piston-cooling oil pressure (B5.2). CURVE-VALUED for the same reason as the last bearing:
  // curves 1 and 2 run from 0.4/0.2 bar at 300 RPM to 5.2/4.7 at rated.
  pistonCoolingPress: {
    physMin: 0,
    physMax: 10.0,
    alarmHigh:    8.5,  // NOT OEM — app overpressure step, no coded upper limit for B5.2
    preAlarmLow:  (rpm: number) => oemCurve(1, rpm),   // L1 — Piston Cooling Lim1, warning
    // NOT OEM: interpolated so the gauge has an amber band between the two coded steps.
    alarmLow:     (rpm: number) => (oemCurve(1, rpm) + oemCurve(2, rpm)) / 2,
    shutdownLow:  (rpm: number) => oemCurve(2, rpm),   // L4 — Lim2, SHUTDOWN
  },
  shaftPower: {
    physMin: 0,
    physMax: 10000,
    alarmHigh:    9500,  // L2 — overload (MTU 8000 M71L max 9100 kW)
  },
  // Main-bearing temperature (B57.1–B57.11), reported as the HOTTEST of the 11 — the safety override
  // trips on ANY single bearing, so a mean would hide the exact case the limit exists to catch.
  //
  // Bands are DERIVED from MTU8000_LIMITS rather than retyped: bearing temp is the one parameter
  // whose ECS thresholds already existed and were enforced (override-mtu8000.ts raises HI T-Bearing
  // and an SS Emergency Stop) while having no display at all, so a hand-copied second set of numbers
  // here is exactly the drift this file should not introduce. L1 sits below the coded HI so the gauge
  // warns before the ECS alarm rather than at the same instant.
  // Last-bearing LO pressure (B5.3/B5.4) — the far end of the main gallery, 0.92 of it.
  //
  // CURVE-VALUED. ZNG00028788 tabulates both of its limits against engine speed (curves 3 and 4),
  // and the spread is large: the shutdown is 5.3 bar at rated but 2.07 bar at 400 RPM. A scalar
  // band taken from the rated point would put a healthy idling engine (3.11 bar) permanently in
  // L4, because sensorSeverity treats shutdownLow as unconditional at any load — which is exactly
  // right for a real shutdown limit, and exactly why the limit itself has to follow the speed.
  //
  // L1 and L4 are the two OEM steps. Only L2 is interpolated between them, and it is marked.
  lubeLastBearingPressure: {
    physMin: 0,
    physMax: 8,
    preAlarmLow:  (rpm: number) => oemCurve(3, rpm),   // L1 — P-Oil last bearing Lim1, warning
    // NOT OEM: MTU codes only the two steps. Midway between them, so the gauge has an amber band.
    alarmLow:     (rpm: number) => (oemCurve(3, rpm) + oemCurve(4, rpm)) / 2,
    shutdownLow:  (rpm: number) => oemCurve(4, rpm),   // L4 — Lim2, SHUTDOWN
  },
  // Common-rail pressure (B48). rail_pressure_min is an SD → Emergency Operation, not a full stop.
  fuelRailPressure: {
    physMin: 1000,
    physMax: 2000,
    preAlarmLow:  1450,  // L1 — idle sits at 1600, rated 1770
    alarmLow:     1300,  // L2
    shutdownLow:  MTU8000_LIMITS.fuel.rail_pressure_min,  // L4 — SD P-Fuel Rail
  },
  // Main-bearing temperature (B57.1–B57.11), reported as the HOTTEST of the 11.
  //
  // NOTE ON THE COMMENTS BELOW: they name the SOURCE of each number, never the number itself.
  // The previous version restated the computed values — "L3 — 122.5 °C", "L4 — 130 °C, SS" — and
  // when `bearing_temp_max` was corrected 130 → 120 both went stale on the spot. Worse, the L3
  // expression silently moved the slowdown from 122.5 to 117.5 °C with nothing recording it. A
  // comment that repeats a derived value is a second source of truth, and this file is where that
  // habit did its damage; see OEM-CALIBRATION-GAP.md §0.
  bearingTemp: {
    physMin: 20,
    physMax: 150,
    normalMin: 60,
    normalMax: 110,
    // L1 — the coded T-Bearing MEAN warning (MDEC 50,03). On a hottest-of-11 observable that is
    // not the limit MTU applies, but it IS a real coded value sitting just below Lim1, so it
    // serves as the lead-in step instead of an invented one. Deliberately conservative.
    preAlarmHigh: MTU8000_LIMITS.lubeOil.bearing_temp_mean_hi,
    // L2 — T-Bearing Lim1, warning (MDEC 49,04).
    alarmHigh:    MTU8000_LIMITS.lubeOil.bearing_temp_hi,
    // L3 — NOT OEM. ZNG00028788 codes no third bearing step; this is an app slowdown placed
    // midway between the coded warning and the coded shutdown, and it moves whenever either does.
    slowdownHigh: (MTU8000_LIMITS.lubeOil.bearing_temp_hi + MTU8000_LIMITS.lubeOil.bearing_temp_max) / 2,
    // L4 — T-Bearing Lim2, SHUTDOWN (MDEC 49,05).
    shutdownHigh: MTU8000_LIMITS.lubeOil.bearing_temp_max,
  },
};

// Safety hard limits — decision engine OVERRIDE layer
export const HARD_LIMITS = {
  lubePressurePreAlarm: 5.5,
  lubePressureMin:      5.0,
  lubePressureSlowdown: 4.5,
  lubePressureShutdown: 4.0,

  exhaustTempPreAlarm:  530,
  exhaustTempMax:       545,
  exhaustTempSlowdown:  560,
  exhaustTempShutdown:  575,

  jacketOutletPreAlarm: 87,
  jacketOutletMax:      90,
  jacketOutletSlowdown: 93,
  jacketOutletShutdown: 97,

  cylImbalanceMax:      35,
  cylImbalanceSlowdown: 45,
};

// Physics coefficients — calibrated to real engine at 885 RPM / 61.37% load
// Verified: exhaustTemp→504°C, LO→7.21 bar, chargeAir→2.79 bar, jacket→77.76°C
export const PHYSICS_COEFFICIENTS = {
  exhaustTemp: {
    base: 350,
    loadFactor: 2.3,
    rpmFactor: 16,
    rpmDivisor: 700,
    lagAlpha: 0.08,
    noiseAmplitude: 1.5,
  },
  lubeOilPressure: {
    base: 5.6,
    rpmFactor: 1.4,
    rpmDivisor: 700,
    loadFactor: 0.004,
    faultFactor: 2.5,
    lagAlpha: 0.05,
    noiseAmplitude: 0.05,
  },
  // fuelRack removed — this was the pre-MTU8000 generic engine's mechanical-rack model
  // (~80 mm at rated) and had no consumers left. See EngineSnapshot.fuelRack.
  scavengeAir: {
    base: 1.0,
    loadFactor: 2.0,
    rpmFactor: 0.45,
    rpmDivisor: 700,
    lagAlpha: 0.10,
    noiseAmplitude: 0.025,
  },
  tcRPM: {
    base: 500,
    loadFactor: 12000,
    rpmFactor: 17300,
    lagAlpha: 0.06,
    noiseAmplitude: 100,
  },
  jacketOutlet: {
    base: 62,
    loadFactor: 0.26,
    lagAlpha: 0.04,
    noiseAmplitude: 0.3,
  },
  sfoc: {
    base: 190,
    loadFactor: 0.38,
    rpmOffset: 700,
    rpmFactor: 0.08,
    coolingFactor: 18,
    lagAlpha: 0.03,
    noiseAmplitude: 0.8,
  },
  chargeAirTemp: {
    base: 29.5,
    rpmFactor: 2.5,
    rpmDivisor: 700,
    loadFactor: 0.18,
    lagAlpha: 0.06,
    noiseAmplitude: 0.4,
  },
  fuelOilPressure: {
    base: 6.0,
    loadFactor: 0.018,
    lagAlpha: 0.08,
    noiseAmplitude: 0.08,
  },
  fuelOilTemp: {
    base: 29.5,
    rpmFactor: 2.5,
    rpmDivisor: 700,
    lagAlpha: 0.04,
    noiseAmplitude: 0.15,
  },
  loFilterDP: {
    base: 0.08,
    rpmFactor: 0.09,
    rpmDivisor: 700,
    faultFactor: 0.8,
    lagAlpha: 0.05,
    noiseAmplitude: 0.008,
  },
  pistonCoolingPress: {
    base: 3.7,
    rpmFactor: 2.1,
    rpmDivisor: 700,
    lagAlpha: 0.05,
    noiseAmplitude: 0.06,
  },
};

// Tag IDs
export const TAG = {
  RPM:                'ME.RPM',
  LOAD:               'ME.Load',
  EXHAUST_TEMP:       'ME.ExhaustTemp',
  LUBE_OIL_PRESSURE:  'ME.LubeOilPressure',
  SCAVENGE_AIR:       'ME.ScavengeAirPressure',
  TC_SPEED:           'ME.TCSpeed',
  JACKET_OUTLET:      'ME.JacketCoolingOutlet',
  SFOC:               'ME.SFOC',
  CHARGE_AIR_TEMP:    'ME.ChargeAirTemp',
  FUEL_OIL_PRESSURE:  'ME.FuelOilPressure',
  FUEL_OIL_TEMP:      'ME.FuelOilTemp',
  LO_FILTER_DP:       'ME.LOFilterDP',
  PISTON_COOLING:     'ME.PistonCoolingPress',
  SHAFT_POWER:        'ME.ShaftPower',
  CYL_IMBALANCE:      'ME.CylImbalance',
  SYSTEM_RISK:        'ME.SystemRisk',
  EXHAUST_RISK:       'ME.ExhaustRisk',
  LUBE_RISK:          'ME.LubeRisk',
  COOLING_RISK:       'ME.CoolingRisk',
  COOLING_EFF:        'ME.CoolingEfficiency',
  DATA_FRESHNESS:     'ME.DataFreshness',
  SENSOR_HEALTH:      'ME.SensorHealthScore',
  cylTemp: (n: number) => `ME.Cyl${n}.ExhaustTemp`,
};
