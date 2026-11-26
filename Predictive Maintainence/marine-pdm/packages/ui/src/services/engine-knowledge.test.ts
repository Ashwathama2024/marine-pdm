// Guards what the assistant is told about the engine.
//
// ENGINE_KNOWLEDGE is assembled from live constants so most of it cannot drift — but the two things
// that DID drift were the parts assembled with a hand-written formula rather than the real one:
//
//   1. The causal matrix printed the bare `weight` and captioned it "per unit severity·intensity".
//      Both were wrong. The excursion is `weight · rootMax` and intensity enters only as the cap on
//      severity, so the assistant was told F05 raises coolant 15 °C (physics: 3.75) and F06 raises
//      back-pressure 40 mbar (physics: 16) — 4x and 2.5x, on exactly the two modes where rootMax ≠ 1.
//      This is the same omission that made predictEffect() itself wrong, and then /about after it.
//
//   2. The bearing row sampled index 0, the mid-engine bearing, while every consumer that matters —
//      the SS override, the gauge, the RUL label — tracks the HOTTEST of the 11.

import { describe, it, expect } from 'vitest';
import { MTU8000_LIMITS } from '@marine-pdm/shared';
import { ENGINE_KNOWLEDGE } from './engine-knowledge';
import { FORECAST_LIMITS } from './forecast';
import { LABEL_ERROR_TOLERANCE_MIN } from './rul-quality';

describe('ENGINE_KNOWLEDGE — causal magnitudes', () => {
  it('reports F05 and F06 excursions with rootMax applied', () => {
    // The physics values, pinned in simulator/tests/degradation-matrix.test.ts.
    expect(ENGINE_KNOWLEDGE).toContain('coolantTempAfterEngine +3.75°C at full severity');
    // 0.4 (F06 rootMax) × 16 (the Phase 2 tcFoulEffect coefficient) = 6.40 mbar. This read
    // +16.00 while the coefficient was 40 and the healthy back pressure was 99.5 mbar.
    expect(ENGINE_KNOWLEDGE).toContain('exhaustBackPressure +6.40mbar at full severity');
  });

  it('does not present the bare weights as the excursion', () => {
    // The pre-fix strings. Their absence is the regression guard.
    expect(ENGINE_KNOWLEDGE).not.toContain('coolantTempAfterEngine +15°C');
    expect(ENGINE_KNOWLEDGE).not.toContain('exhaustBackPressure +16mbar');
    expect(ENGINE_KNOWLEDGE).not.toContain('per unit severity·intensity');
  });

  it('states that intensity is applied exactly once', () => {
    expect(ENGINE_KNOWLEDGE).toMatch(/never a second multiplier/);
  });

  it('quotes the hottest bearing, not the mid-engine one', () => {
    expect(ENGINE_KNOWLEDGE).toContain('Bearing temp (hottest of 11)');
  });

  it('tells the assistant spray oil is judged as a difference, never as a value', () => {
    // The one parameter with no absolute band anywhere in the MTU limit list. An assistant that
    // reads the raw temperature and compares it to something would invent a threshold and then
    // reason confidently from it — the exact failure mode this file exists to prevent.
    expect(ENGINE_KNOWLEDGE).toContain('B77.11–B77.20');
    expect(ENGINE_KNOWLEDGE).toMatch(/MTU codes no absolute band/i);
    expect(ENGINE_KNOWLEDGE).toMatch(/all ten rising together is not a fault/i);
  });

  it('carries the live spray-oil difference limits, not typed-in ones', () => {
    const so = MTU8000_LIMITS.sprayOil;
    expect(ENGINE_KNOWLEDGE).toContain(`+${so.diff_shutdown}`);
    expect(ENGINE_KNOWLEDGE).toContain(`+${so.diff_warn}`);
  });

  it('does not repeat the retired bearing thresholds', () => {
    // 130 °C was never an MTU number and 100 °C was the HI that fired false. Both appeared here
    // verbatim before the limits were put back on ZNG00028788.
    expect(ENGINE_KNOWLEDGE).not.toMatch(/any bearing > 130/);
    expect(ENGINE_KNOWLEDGE).not.toMatch(/coolant > 100 °C/);
  });
});

describe('ENGINE_KNOWLEDGE — prediction model', () => {
  it('documents every forecastable metric', () => {
    for (const key of Object.keys(FORECAST_LIMITS)) {
      if (key === 'systemRisk') continue;
      expect(ENGINE_KNOWLEDGE, `missing forecast key ${key}`).toContain(`\`${key}\``);
    }
  });

  it('covers the three Emergency-class metrics added to the dashboard', () => {
    for (const key of ['bearingTemp', 'lubeLastBearing', 'fuelRailPressure']) {
      expect(ENGINE_KNOWLEDGE, key).toContain(`\`${key}\``);
    }
  });

  it('distinguishes the observable forecast from the analytic label', () => {
    expect(ENGINE_KNOWLEDGE).toContain('minsToAlarm_*');
    expect(ENGINE_KNOWLEDGE).toContain('rulTrue_*');
    expect(ENGINE_KNOWLEDGE).toMatch(/linear extrapolation/i);
    expect(ENGINE_KNOWLEDGE).toMatch(/Solved exactly, not extrapolated/i);
  });

  it('lists every rulQuality verdict and the tolerance behind it', () => {
    for (const v of ['OK', 'SETTLING', 'ALREADY_BREACHED', 'NO_CROSS', 'WRONG_DIRECTION']) {
      expect(ENGINE_KNOWLEDGE, v).toContain(v);
    }
    expect(ENGINE_KNOWLEDGE).toContain(String(LABEL_ERROR_TOLERANCE_MIN));
  });

  it('discloses that rulQuality is blind to a bias in the baseline curve', () => {
    // The failure that produced NO_CROSS on a bearing sitting past its HI limit. The assistant is
    // told to distrust the label rather than the sensor when the two disagree.
    expect(ENGINE_KNOWLEDGE).toMatch(/blind to a \*bias in the/);
    expect(ENGINE_KNOWLEDGE).toMatch(/suspect the\s+baseline curve, not the quality flag/);
  });
});
