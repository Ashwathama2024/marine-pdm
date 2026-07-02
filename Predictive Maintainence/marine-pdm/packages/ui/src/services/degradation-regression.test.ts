// packages/ui/src/services/degradation-regression.test.ts
//
// SMOKE TEST — regression math (Part A1). The degradation model is linear
// (effect = severity·intensity·weight), so OLS on clean synthetic data must recover the weights
// with R² ≈ 1. These tests pin the estimator itself so a live R²<1 points at the DATA (lag,
// transients), not the solver.

import { describe, it, expect } from 'vitest';
import { linregress, olsFit } from './degradation-regression';

describe('linregress — single-variable OLS', () => {
  it('recovers exact slope + intercept with R² = 1 on a clean line', () => {
    const x = Array.from({ length: 30 }, (_, i) => i / 10);   // 0 … 2.9
    const y = x.map(v => 3.5 * v + 1.2);
    const r = linregress(x, y)!;
    expect(r.slope).toBeCloseTo(3.5, 6);
    expect(r.intercept).toBeCloseTo(1.2, 6);
    expect(r.r2).toBeCloseTo(1, 6);
    expect(r.n).toBe(30);
  });

  it('recovers slope within a few % under small noise, R² still high', () => {
    // Deterministic pseudo-noise (no RNG) so the test never flakes.
    const x = Array.from({ length: 60 }, (_, i) => i * 0.1);
    const y = x.map((v, i) => 2.0 * v + 5 + Math.sin(i) * 0.05);
    const r = linregress(x, y)!;
    expect(r.slope).toBeCloseTo(2.0, 1);
    expect(r.r2).toBeGreaterThan(0.99);
  });

  it('returns null when x has no variance (undefined slope)', () => {
    expect(linregress([2, 2, 2, 2], [1, 2, 3, 4])).toBeNull();
  });

  it('returns null with fewer than 3 points', () => {
    expect(linregress([1, 2], [1, 2])).toBeNull();
  });
});

describe('olsFit — multiple OLS (combined faults)', () => {
  it('recovers two weights + intercept with R² = 1', () => {
    // y = 2·x1 − 3·x2 + 5, x1 and x2 independent.
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 40; i++) {
      const x1 = i * 0.05;
      const x2 = (i % 7) * 0.1;
      X.push([x1, x2]);
      y.push(2 * x1 - 3 * x2 + 5);
    }
    const r = olsFit(X, y)!;
    expect(r.cols).toEqual([0, 1]);
    expect(r.coef[0]).toBeCloseTo(2, 5);
    expect(r.coef[1]).toBeCloseTo(-3, 5);
    expect(r.intercept).toBeCloseTo(5, 5);
    expect(r.r2).toBeCloseTo(1, 6);
  });

  it('drops a zero-variance column and reports the kept indices', () => {
    // Middle column is constant → must be dropped; kept cols = [0, 2].
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 40; i++) {
      const x1 = i * 0.05;
      const x3 = (i % 5) * 0.2;
      X.push([x1, 1.0, x3]);          // col 1 constant
      y.push(4 * x1 + 0.5 * x3 + 2);
    }
    const r = olsFit(X, y)!;
    expect(r.cols).toEqual([0, 2]);
    expect(r.coef[0]).toBeCloseTo(4, 5);
    expect(r.coef[1]).toBeCloseTo(0.5, 5);
    expect(r.intercept).toBeCloseTo(2, 5);
  });

  it('returns null with fewer than 4 rows', () => {
    expect(olsFit([[1, 2], [3, 4], [5, 6]], [1, 2, 3])).toBeNull();
  });
});
