// Degradation regression — instrumentation + ordinary-least-squares validation of the
// degradation matrix against live engine output. The model is linear
// (effect = severity·intensity·weight), so the recovered slope ≈ the matrix weight, R² ≈ 1.

export const ROOT_KEYS = [
  'injFaultMax', 'coolingEffDrop', 'tcEffDrop', 'lubeFault', 'bearingFaultMax', 'pistonBlowby',
] as const;
export type RootKey = typeof ROOT_KEYS[number];
export type RootVector = Record<RootKey, number>;

// Sensor deviations we log (actual − lagged baseline). Keys map to the matrix sensorIds.
export const DEV_KEYS = [
  'exhaustMeanTemp', 'coolantTempAfterEngine', 'lubeOilPressure', 'lubeLastBearingPressure',
  'bearingTempMax', 'tcSpeed', 'chargeAirPressure', 'sfoc', 'crankcasePressure',
] as const;
export type DevKey = typeof DEV_KEYS[number];

export interface DegradationSample {
  t: number;
  rf: RootVector;
  dev: Record<DevKey, number>;
}

// ── Module-level ring buffer (written by EngineContext, read by the BI page) ───────
const MAX_SAMPLES = 600;
let samples: DegradationSample[] = [];

export function recordDegradationSample(s: DegradationSample): void {
  samples.push(s);
  if (samples.length > MAX_SAMPLES) samples.shift();
}
export function getDegradationSamples(): DegradationSample[] { return samples; }
export function clearDegradationSamples(): void { samples = []; }

// ── Single-variable linear regression (robust; used per sensor × root factor) ──────
export interface LinReg { slope: number; intercept: number; r2: number; n: number; }

export function linregress(x: number[], y: number[]): LinReg | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!; sy += y[i]!; sxx += x[i]! * x[i]!; sxy += x[i]! * y[i]!; syy += y[i]! * y[i]!;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;           // x has no variance
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  let ssRes = 0;
  for (let i = 0; i < n; i++) { const e = y[i]! - (slope * x[i]! + intercept); ssRes += e * e; }
  const r2 = ssTot > 1e-9 ? 1 - ssRes / ssTot : (ssRes < 1e-9 ? 1 : 0);
  return { slope, intercept, r2, n };
}

// ── Multiple OLS (for combined faults) — normal equations + Gaussian elimination ──
export interface OlsResult { coef: number[]; intercept: number; r2: number; n: number; cols: number[]; }

/** Fit y ~ intercept + Σ coef·X[:,col], dropping zero-variance columns. `cols` are the kept indices. */
export function olsFit(X: number[][], y: number[]): OlsResult | null {
  const n = y.length;
  const kAll = X[0]?.length ?? 0;
  if (n < 4 || kAll === 0) return null;

  // keep only columns with variance
  const cols: number[] = [];
  for (let c = 0; c < kAll; c++) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < n; i++) { const v = X[i]![c]!; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mx - mn > 1e-9) cols.push(c);
  }
  if (cols.length === 0) return null;

  const p = cols.length + 1;                            // + intercept
  const A = X.map(row => [1, ...cols.map(c => row[c]!)]);
  const AtA = Array.from({ length: p }, () => new Array(p).fill(0));
  const Aty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Aty[a] += A[i]![a]! * y[i]!;
      for (let b = 0; b < p; b++) AtA[a]![b]! += A[i]![a]! * A[i]![b]!;
    }
  }
  const sol = solveLinear(AtA, Aty);
  if (!sol) return null;

  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0; for (let a = 0; a < p; a++) pred += A[i]![a]! * sol[a]!;
    ssRes += (y[i]! - pred) ** 2; ssTot += (y[i]! - yMean) ** 2;
  }
  const r2 = ssTot > 1e-9 ? 1 - ssRes / ssTot : (ssRes < 1e-9 ? 1 : 0);
  return { intercept: sol[0]!, coef: sol.slice(1), r2, n, cols };
}

function solveLinear(M: number[][], v: number[]): number[] | null {
  const p = v.length;
  const a = M.map((row, i) => [...row, v[i]!]);        // augmented
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    if (Math.abs(a[piv]![col]!) < 1e-12) return null;
    [a[col], a[piv]] = [a[piv]!, a[col]!];
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c <= p; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return a.map((row, i) => row[p]! / row[i]!);
}
