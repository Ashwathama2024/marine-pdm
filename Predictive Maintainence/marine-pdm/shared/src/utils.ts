// shared/utils.ts — Core math utilities used by all packages

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
