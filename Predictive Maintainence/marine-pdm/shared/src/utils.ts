// shared/utils.ts — Core math utilities used by all packages

import type { EngineSnapshot } from './interfaces';

/**
 * The 11 main-bearing temperatures (B57.1–B57.11), or `[]` if this snapshot has none.
 *
 * `bearingTemps` reaches the UI through EngineSnapshot's index signature rather than a declared
 * field, so every consumer has to widen it by hand. One helper instead of a private copy per package
 * — decision already had its own, and the display layer needed a third.
 */
export function bearingTemps(snap: EngineSnapshot): number[] {
  const bt = snap['bearingTemps'];
  return Array.isArray(bt) ? (bt as number[]) : [];
}

/**
 * The HOTTEST bearing — the correct scalar summary for both the gauge and the RUL label, because
 * the safety override trips on ANY single bearing exceeding the limit. A mean would mask exactly the
 * single-bearing case F04 produces. Returns `fallback` when the snapshot carries no bearing array.
 */
export function bearingTempMax(snap: EngineSnapshot, fallback = 0): number {
  const bt = bearingTemps(snap);
  return bt.length ? Math.max(...bt) : fallback;
}

/**
 * The ten spray-oil channels (B77.11–B77.20), widened off the index signature like bearingTemps.
 *
 * Tolerates a missing snapshot on purpose. The dashboard mounts before the first tick arrives, and
 * a real IPMS feed can drop the array entirely if the EMU is offline — neither is an error worth
 * taking the page down for, and an empty set reads as "nothing to alarm on", which is correct.
 */
export function sprayOilTemps(snap: EngineSnapshot | null | undefined): number[] {
  const st = snap?.['sprayOilTemps'];
  return Array.isArray(st) ? (st as number[]) : [];
}

export interface SprayOilDeviation {
  /** °C the hottest channel sits ABOVE the mean of all ten. 0 when there is no data. */
  dev: number;
  /** 0-based index of that channel, or -1. Add 1 for the ECS name: index 6 → "B7". */
  channel: number;
  /** Mean of the ten, for display. */
  mean: number;
}

/**
 * The quantity the ECS alarms on for spray oil — NOT the raw temperature.
 *
 * MTU codes no absolute band for B77 anywhere in ZNG00028788; it codes T-Splash Oil Difference
 * Lim1 = 4 °C warning and Lim2 = 6 °C shutdown, and the LOP messages name a single channel
 * ("HI T-Splash Oil B7"). A max-minus-min spread could not name the offender, so the quantity is a
 * per-channel deviation from the mean of the set.
 *
 * Lives in shared because three packages need the identical number and none of them may import
 * another: `decision` must work against a real IPMS with no simulator present, `simulator` produces
 * the values, and the display must not be able to disagree with the alarm — the same reasoning that
 * put bearingTempMax here.
 */
export function sprayOilDeviation(
  snapOrTemps: EngineSnapshot | number[] | null | undefined,
): SprayOilDeviation {
  const temps = Array.isArray(snapOrTemps) ? snapOrTemps : sprayOilTemps(snapOrTemps);
  if (temps.length === 0) return { dev: 0, channel: -1, mean: 0 };
  const mean = temps.reduce((s, v) => s + v, 0) / temps.length;
  let channel = 0;
  for (let i = 1; i < temps.length; i++) if (temps[i]! > temps[channel]!) channel = i;
  return { dev: Math.max(0, temps[channel]! - mean), channel, mean };
}

/**
 * Exponential lag filter — smooths signal transitions.
 * alpha=0.08 → slow response (exhaust temp); alpha=0.5 → fast response
 */
export function applyLag(prev: number, target: number, alpha: number): number {
  return prev + alpha * (target - prev);
}

/**
 * Adds uniform random noise centred at zero.
 * magnitude is the ± range (e.g. 1.5 → noise in [-1.5, +1.5])
 */
export function addNoise(value: number, magnitude: number): number {
  return value + (Math.random() - 0.5) * 2 * magnitude;
}

/**
 * Linear regression slope over an array of values.
 * Returns value-change per index (i.e. per tick).
 * Multiply by (60 / TICK_MS * 1000) to convert to per-minute.
 */
export function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const num = values.reduce((s, y, x) => s + (x - xMean) * (y - yMean), 0);
  const den = values.reduce((s, _, x) => s + (x - xMean) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

/**
 * Clamps a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Rolling window: appends value and keeps last `size` entries.
 */
export function pushWindow(window: number[], value: number, size: number): number[] {
  const next = [...window, value];
  return next.length > size ? next.slice(next.length - size) : next;
}

/**
 * Arithmetic mean of an array. Returns 0 for empty arrays.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Sample standard deviation. Returns 0 for arrays with fewer than 2 values.
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
