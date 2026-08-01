// Series statistics + forward projection to the coded MTU alarm bands.
//
// Extracted from jarvis-tools.ts (where it was private) because it now has three consumers:
//   1. JARVIS's forecast_metric / get_trend tools
//   2. the sensor-diagnosis evidence payload (services/sensor-evidence.ts)
//   3. the training recorder's observable `minsToAlarm_*` columns (services/training-recorder.ts)
//
// Everything here is deterministic: the caller hands numbers to an LLM rather than asking it to
// estimate a rate or a timeline. The math is unchanged from the original tool implementation.

import { MTU8000_LIMITS } from '@marine-pdm/shared';
import type { SensorHistory } from '../context/EngineContext';

/** Round for LLM/JSON consumption; NaN → null so a bad value is visibly absent, not silently 0. */
export const r = (x: number, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

export interface SeriesStats {
  n: number; first: number; last: number; min: number; max: number; mean: number;
  /** Least-squares slope per sample, centred on x to avoid the ill-conditioned normal equation. */
  slope: number;
}

export function stats(ys: number[]): SeriesStats {
  const n = ys.length;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  const mx = (n - 1) / 2;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (ys[i]! - mean); den += (i - mx) ** 2; }
  return { n, first: ys[0]!, last: ys[n - 1]!, min: Math.min(...ys), max: Math.max(...ys), mean, slope: den ? num / den : 0 };
}

export function downsample(a: number[], max: number): number[] {
  if (a.length <= max) return a;
  const step = a.length / max;
  return Array.from({ length: max }, (_, i) => a[Math.floor(i * step)]!);
}

// ── Coded alarm bands ─────────────────────────────────────────────────────────────
// Each entry pairs a history series with the MTU8000_LIMITS thresholds that govern it. Only metrics
// with a real coded alarm band are forecastable — everything else stays a trend question.
const L = MTU8000_LIMITS;

export type ForecastLimit = {
  key: keyof SensorHistory; unit: string; label: string;
  hi?: number; ss?: number; lo?: number; dir: 'high' | 'low';
};

export const FORECAST_LIMITS: Record<string, ForecastLimit> = {
  exhaust:            { key: 'exhaustTemp',       unit: '°C',   label: 'Mean exhaust temp',      dir: 'high', hi: L.exhaust.mean_hi,                          ss: L.exhaust.critical_max },
  jacket:             { key: 'jacketOutlet',      unit: '°C',   label: 'Jacket / coolant temp',  dir: 'high', hi: L.cooling.coolant_temp_after_engine_max,    ss: L.cooling.coolant_temp_ss },
  chargeAirTemp:      { key: 'chargeAirTemp',     unit: '°C',   label: 'Charge-air temp',        dir: 'high', hi: L.chargeAir.temp_after_intercooler_hi,      ss: L.chargeAir.temp_after_intercooler_max },
  tcSpeed:            { key: 'tcRPM',             unit: 'RPM',  label: 'TC speed (overspeed)',   dir: 'high', hi: L.turbocharger.speed_overspeed_l1,          ss: L.turbocharger.speed_overspeed_l2 },
  lube:               { key: 'lubeOilPressure',   unit: 'bar',  label: 'LO gallery pressure',    dir: 'low',  lo: L.lubeOil.pressure_before_filter_min },
  pistonCoolingPress: { key: 'pistonCoolingPress',unit: 'bar',  label: 'Piston-cooling pressure',dir: 'low',  lo: L.lubeOil.piston_cooling_min },
  // Hottest of the 11 mains. The band is the one the safety override already enforces, so this key
  // makes bearing temperature forecastable (minsToAlarm_*) and labellable (rulTrue_*/rulQuality_*) —
  // it was the only SS-trip parameter with no RUL column, despite F04 being a modelled fault.
  bearingTemp:        { key: 'bearingTemp',       unit: '°C',   label: 'Bearing temp (hottest)', dir: 'high', hi: L.lubeOil.bearing_temp_hi,                  ss: L.lubeOil.bearing_temp_max },
  systemRisk:         { key: 'systemRisk',        unit: '0–100',label: 'System risk',            dir: 'high', hi: 70,                                          ss: 90 },
};
export const FORECAST_METRICS = Object.keys(FORECAST_LIMITS);

/** Recent window used to estimate the current rate — 30 ticks ≈ 30 s at TICK_MS 1000. */
export const SLOPE_TICKS = 30;

/** ETA (minutes) until `current` crosses `threshold`, given slope/min and travel direction. */
export function eta(current: number, threshold: number | undefined, slopePerMin: number, dir: 'high' | 'low'): number | null {
  if (threshold === undefined) return null;
  if (dir === 'high') {
    if (current >= threshold) return 0;
    if (slopePerMin <= 0) return null;         // stable / falling → never (at this rate)
    return (threshold - current) / slopePerMin;
  }
  if (current <= threshold) return 0;
  if (slopePerMin >= 0) return null;
  return (current - threshold) / (-slopePerMin);
}

export function forecastFrom(
  series: number[],
  lim: { unit: string; label: string; hi?: number; ss?: number; lo?: number; dir: 'high' | 'low' },
  horizonMin: number,
): Record<string, unknown> {
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

/**
 * Observable minutes-to-alarm for one forecastable metric — the naive linear-projection baseline the
 * training set records alongside the analytic `rulTrue_*` label. `null` when not projected to cross.
 */
export function minutesToAlarm(series: number[], forecastKey: string): number | null {
  const lim = FORECAST_LIMITS[forecastKey];
  if (!lim || series.length < 3) return null;
  const st = stats(series.slice(-SLOPE_TICKS));
  const target = lim.dir === 'high' ? lim.hi : lim.lo;
  return eta(st.last, target, st.slope * 60, lim.dir);
}
