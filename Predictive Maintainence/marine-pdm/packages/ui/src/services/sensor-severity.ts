// services/sensor-severity.ts — how far a sensor is from ITS OWN alarm band, as 0-1.
//
// Extracted because the 3D engine view needed the same judgement the dashboard gauges make, and the
// first cut invented a second rule (symmetric |actual-expected| / expected / 15%). That disagreed
// with the gauges in three ways that were visible on screen:
//
//   1. DIRECTION. A pressure sitting ABOVE its expected value is not a fault — the gauge only
//      penalises drops. The naive absolute deviation lit up lube oil, fuel rail and piston cooling
//      orange whenever they ran high, while the dashboard showed green.
//   2. DEADBAND. The gauge ignores the first 20% of the alarm band as normal sensor scatter. Without
//      it, everything on the engine is permanently slightly tinted.
//   3. SCALE. "15% of expected" is not the alarm band. 15% of 1770 bar rail pressure is 265 bar,
//      more than twice the real 120 bar pre-alarm gap; 15% of 7 bar lube is 1.05, well past the
//      0.8 bar gap. Each sensor has its own band and they are not proportional to magnitude.
//
// This module is now the ONLY place that judgement lives. dashboard/GaugeGrid.tsx used to carry a
// second copy — same tiers, same deadband, same dynamic-band rule, with the per-sensor band literals
// spelled out again at each of its twelve call sites — and it is what this module was extracted from.
// It now calls sensorSeverity and paints the tier. Do not re-inline any of it.

import { ALARM_LIMITS } from '@marine-pdm/shared';

export interface AlarmBand {
  physMin?: number;
  physMax?: number;
  preAlarmHigh?: number;
  alarmHigh?: number;
  slowdownHigh?: number;
  shutdownHigh?: number;
  preAlarmLow?: number;
  alarmLow?: number;
  slowdownLow?: number;
  shutdownLow?: number;
}

/** UI sensor id → its key in ALARM_LIMITS. */
const LIMIT_KEY: Record<string, string> = {
  'ME.ExhaustTemp': 'exhaustTemp',
  'ME.LubeOilPressure': 'lubeOilPressure',
  'ME.ScavengeAirPressure': 'scavengeAir',
  'ME.ChargeAirTemp': 'chargeAirTemp',
  'ME.JacketCoolingOutlet': 'jacketOutlet',
  'ME.FuelOilPressure': 'fuelOilPressure',
  'ME.FuelOilTemp': 'fuelOilTemp',
  'ME.LOFilterDP': 'loFilterDP',
  'ME.PistonCoolingPress': 'pistonCoolingPress',
  'ME.LubeOilPressure.LastBearing': 'lubeLastBearingPressure',
  'ME.FuelRailPressure': 'fuelRailPressure',
  'ME.BearingTemp': 'bearingTemp',
};

/**
 * Deviation from expected to the MTU pre-alarm threshold, per sensor — calibrated at rated load.
 * `dynamic` marks the pressure sensors whose band is recomputed from the live expected value,
 * because the absolute pre-alarm floor is fixed while expected falls with load.
 */
const ALARM_BAND_DEV: Record<string, { rated: number; dynamic?: boolean }> = {
  'ME.ExhaustTemp': { rated: 20 },
  'ME.LubeOilPressure': { rated: 0.8, dynamic: true },
  'ME.ScavengeAirPressure': { rated: 0.5 },
  'ME.ChargeAirTemp': { rated: 12 },
  'ME.JacketCoolingOutlet': { rated: 8 },
  'ME.FuelOilPressure': { rated: 1.5, dynamic: true },
  'ME.FuelOilTemp': { rated: 15 },
  'ME.PistonCoolingPress': { rated: 0.8, dynamic: true },
  'ME.LubeOilPressure.LastBearing': { rated: 0.5 },
  'ME.FuelRailPressure': { rated: 120 },
  'ME.BearingTemp': { rated: 8 },
  // ME.LOFilterDP, ME.SFOC and ME.ShaftPower are deliberately absent: the dashboard colours the
  // first from absolute thresholds only and the second by its own SFOC rule, and the third not at
  // all. Returning 0 for them is honest — better an uncoloured part than a wrong colour.
};

/** The dashboard's tier boundaries, expressed as fractions of the alarm band. */
const DEADBAND = 0.2;
const TIER_WARNING = 0.5;
const TIER_HIGH = 0.8;
const TIER_CRITICAL = 1.25;

/** Severity at each tier, so a 0-1 ramp changes colour exactly where the gauge does. */
const SEV_WARNING = 1 / 3;
const SEV_HIGH = 2 / 3;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * The band actually in force. At partial load expected pressure falls but the absolute pre-alarm
 * floor does not, so the real gap shrinks; using the rated band there would under-report. Mirrors
 * dynamicPressBand in GaugeGrid.
 */
function bandFor(sensorId: string, expected: number, limits: AlarmBand): number | undefined {
  const spec = ALARM_BAND_DEV[sensorId];
  if (!spec) return undefined;
  if (spec.dynamic && limits.preAlarmLow !== undefined) {
    const gap = expected - limits.preAlarmLow;
    if (gap > spec.rated * 0.35) return gap;
  }
  return spec.rated;
}

export function getAlarmBand(sensorId: string): AlarmBand | undefined {
  const key = LIMIT_KEY[sensorId];
  return key ? ((ALARM_LIMITS as Record<string, AlarmBand>)[key] ?? undefined) : undefined;
}

/**
 * 0-1 severity for a sensor reading against its load-adjusted baseline.
 *
 * 0 is "within normal scatter", 1/3 is the point the gauge turns yellow, 2/3 orange, 1 red. Returns
 * 0 for any sensor with no coded band rather than guessing.
 */
export function sensorSeverity(
  sensorId: string,
  value: number,
  expected: number | undefined,
): number {
  const limits = getAlarmBand(sensorId);
  if (!limits) return 0;

  // 1. True ECS shutdown limits — unconditional at any load.
  if (limits.shutdownHigh !== undefined && value >= limits.shutdownHigh) return 1;
  if (limits.shutdownLow !== undefined && value <= limits.shutdownLow) return 1;

  const hasExpected = expected !== undefined && Number.isFinite(expected);

  // 2. Load-aware absolute L1/L2 checks. Only applied when expected is on the safe side of the
  //    limit, otherwise idle operation false-alarms every tick.
  if (hasExpected) {
    const e = expected as number;
    if (limits.alarmHigh !== undefined && e < limits.alarmHigh && value >= limits.alarmHigh) return 1;
    if (limits.slowdownHigh !== undefined && e < limits.slowdownHigh && value >= limits.slowdownHigh) return 1;
    if (limits.preAlarmHigh !== undefined && e < limits.preAlarmHigh && value >= limits.preAlarmHigh) return SEV_HIGH;
    if (limits.alarmLow !== undefined && e > limits.alarmLow && value <= limits.alarmLow) return 1;
    if (limits.slowdownLow !== undefined && e > limits.slowdownLow && value <= limits.slowdownLow) return 1;
    if (limits.preAlarmLow !== undefined && e > limits.preAlarmLow && value <= limits.preAlarmLow) return SEV_HIGH;
  }

  if (!hasExpected) return 0;
  const band = bandFor(sensorId, expected as number, limits);
  if (band === undefined || band <= 0) return 0;

  // 3. Deviation from baseline, direction-aware.
  const hasHigh = limits.preAlarmHigh !== undefined;
  const hasLow = limits.preAlarmLow !== undefined;
  const e = expected as number;
  let dev: number;
  if (hasLow && !hasHigh) dev = Math.max(0, e - value); // pressure: only drops matter
  else if (hasHigh && !hasLow) dev = Math.max(0, value - e); // temperature / ΔP: only rises matter
  else dev = Math.abs(value - e); // both sides alarm

  const effective = Math.max(0, dev - band * DEADBAND);
  const ratio = effective / band;

  // Piecewise so the 0-1 ramp crosses colour at the gauge's own tier boundaries.
  if (ratio <= TIER_WARNING) return (ratio / TIER_WARNING) * SEV_WARNING;
  if (ratio <= TIER_HIGH) {
    return SEV_WARNING + ((ratio - TIER_WARNING) / (TIER_HIGH - TIER_WARNING)) * (SEV_HIGH - SEV_WARNING);
  }
  if (ratio <= TIER_CRITICAL) {
    return SEV_HIGH + ((ratio - TIER_HIGH) / (TIER_CRITICAL - TIER_HIGH)) * (1 - SEV_HIGH);
  }
  return clamp01(1);
}

/** Sensors this module can judge. Anything else scores 0 and should stay uncoloured. */
export function hasCodedBand(sensorId: string): boolean {
  return sensorId in ALARM_BAND_DEV;
}

/** The four bands a gauge paints. Named here because the boundaries are the SEV_* constants above. */
export type SeverityTier = 'normal' | 'warning' | 'high' | 'critical';

// Severity is built by piecewise interpolation, so a reading sitting exactly ON a boundary can come
// back a few ULPs below the constant it should equal. The tolerance is many orders of magnitude
// finer than any real sensor step, so it only decides these exact-boundary cases.
const TIER_EPSILON = 1e-9;

/**
 * Which band a severity falls in. The gauge and the 3D view must agree on where colour changes, so
 * the boundaries live next to the severities that define them rather than at each render site.
 */
export function severityTier(severity: number): SeverityTier {
  if (severity >= 1 - TIER_EPSILON) return 'critical';
  if (severity >= SEV_HIGH - TIER_EPSILON) return 'high';
  if (severity >= SEV_WARNING - TIER_EPSILON) return 'warning';
  return 'normal';
}
