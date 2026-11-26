// Pins the bearing baseline curve to the bearing physics.
//
// WHY. `analyticRul` solves `severityAtCross = (threshold − healthyValue) / perSeverity`, so a biased
// healthyValue is not noise — it moves the label by a fixed amount in a fixed direction. The
// ME.BearingTemp.Mean curve omitted `oilHeat`, on the stated grounds that it is "zero at a healthy
// rated oil temp (85°C)". 85 is the reference inside `(lubeOilTemp − 85)·0.4`, not the operating
// point: rated oil is 98.2 °C, so the term is +5.28 °C. With the hottest bearing's +5 position bias
// on top, the expected value sat 10.8 °C below a healthy engine's actual reading.
//
// The consequence was not subtle. severityAtCross came to 0.516 against an intensity cap of 0.5, so
// every F04-at-50 % row was labelled NO_CROSS — "this fault can never reach the alarm band" — while
// the sensor was sitting at ~125 °C against a 115 °C HI limit, and minsToAlarm said 0.
//
// rulQuality cannot defend against this: it compares the LAGGED baseline against the INSTANT one, and
// a bias living in the shared curve is present in both, so it cancels. Only a check against the
// physics catches it, which is what this file is.

import { describe, it, expect } from 'vitest';
import {
  bearingTemp_MTU8000, lubeOilTemp_MTU8000, lubeOilPressure_MTU8000,
} from '@marine-pdm/simulator';
import { MTU8000_LIMITS } from '@marine-pdm/shared';
import { baselineStore } from '@marine-pdm/knowledge';

/** The healthy hottest-bearing reading the physics actually produces at an operating point. */
function physicsHottestBearing(load: number, rpm: number) {
  const oilTemp = lubeOilTemp_MTU8000(load, rpm, 36, 1.0);
  const gallery = lubeOilPressure_MTU8000(rpm, load, oilTemp, 0.15, 0);
  const temps = Array.from({ length: 11 }, (_, i) =>
    bearingTemp_MTU8000(load, rpm, oilTemp, gallery, i, 0));
  return { max: Math.max(...temps), oilTemp, gallery };
}

/** What the pipeline uses as the fault-free value: the seed curve plus the hottest bearing's bias. */
function baselineHottestBearing(load: number, rpm: number): number {
  const v = baselineStore.getExpected('ME.BearingTemp.Mean', { load, rpm, coolingEff: 1.0 });
  if (v === null || v === undefined) throw new Error('ME.BearingTemp.Mean missing from the store');
  return v + MTU8000_LIMITS.bearingMaxPositionBias;
}

describe('bearing baseline tracks the bearing physics', () => {
  it('matches the physics EXACTLY at the rated point', () => {
    const { max } = physicsHottestBearing(85, 1150);
    // No tolerated residual any more. The curve now carries every healthy term of
    // bearingTemp_MTU8000 — base, load, rpm, oilHeat AND pressureDef — so the only thing the
    // consumer adds is the hottest bearing's positionBias, which baselineHottestBearing applies.
    expect(max - baselineHottestBearing(85, 1150)).toBeCloseTo(0, 6);
  });

  it('is not the pre-fix curve, which sat 10.8 °C low at rated', () => {
    // Guard against a revert to the version that dropped oilHeat.
    const old = 58 + (85 / 100) * 28 + (1150 / 1150) * 10;
    expect(baselineHottestBearing(85, 1150)).not.toBeCloseTo(old + 5, 1);
  });

  it('expects the hottest bearing near 100 °C at rated, inside the OEM warning', () => {
    // The whole envelope moved in Phase 2 of OEM-CALIBRATION-GAP.md: with the oil recalibrated to
    // 78.3 °C the hottest bearing sits ~100 °C, not the ~112 °C it used to, and T-Bearing Lim1 is
    // 115 °C. A baseline back above 110 would mean the oil temperature has drifted up again.
    const healthy = baselineHottestBearing(85, 1150);
    expect(healthy).toBeGreaterThan(95);
    expect(healthy).toBeLessThan(105);
    expect(healthy).toBeLessThan(MTU8000_LIMITS.lubeOil.bearing_temp_hi);
  });

  it('keeps F04 at full intensity able to reach the HI band', () => {
    // perSeverity for F04 is weight 45 × rootMax 1.0. With 15 °C of headroom to HI instead of the
    // old 3 °C, the crossing now needs ~1/3 severity rather than ~1/15 — a later, but still
    // comfortably reachable, trip. It must stay strictly inside a full-intensity ramp.
    const healthy = baselineHottestBearing(85, 1150);
    const severityAtCross = (MTU8000_LIMITS.lubeOil.bearing_temp_hi - healthy) / 45;

    expect(severityAtCross).toBeGreaterThan(0);
    expect(severityAtCross).toBeLessThan(1.0);
  });

  it('tracks the physics across the operating envelope, not just at rated', () => {
    for (const [load, rpm] of [[0, 400], [40, 800], [60, 1000], [85, 1150], [100, 1150]] as const) {
      const gap = physicsHottestBearing(load, rpm).max - baselineHottestBearing(load, rpm);
      expect(gap, `load ${load} rpm ${rpm}`).toBeCloseTo(0, 6);
    }
  });
});
