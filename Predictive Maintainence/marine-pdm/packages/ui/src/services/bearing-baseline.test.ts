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

/** The one term the curve deliberately omits — see the seed comment. */
function pressureDef(gallery: number): number {
  return Math.max(0, 6.5 - gallery) * 4.5;
}

describe('bearing baseline tracks the bearing physics', () => {
  it('matches the physics at the rated point, to within the omitted pressureDef term', () => {
    const { max, gallery } = physicsHottestBearing(85, 1150);
    const gap = max - baselineHottestBearing(85, 1150);

    // pressureDef is ~0.5 °C at rated: the gallery sits just under its 6.5 bar reference.
    expect(gap).toBeCloseTo(pressureDef(gallery), 5);
    expect(Math.abs(gap)).toBeLessThan(1);
  });

  it('is not the pre-fix curve, which sat 10.8 °C low at rated', () => {
    // Guard against a revert: the old equation was 58 + load/100·28 + rpm/1150·10 = 91.8 at rated,
    // and with the +5 bias that is still 5.8 °C under the physics.
    const old = 58 + (85 / 100) * 28 + (1150 / 1150) * 10;
    expect(baselineHottestBearing(85, 1150)).not.toBeCloseTo(old + 5, 1);
    expect(baselineHottestBearing(85, 1150)).toBeGreaterThan(100);
  });

  it('keeps F04 at 50 % intensity able to reach the HI band', () => {
    // The regression in one assertion. perSeverity for F04 is weight 45 × rootMax 1.0.
    const healthy = baselineHottestBearing(85, 1150);
    const severityAtCross = (MTU8000_LIMITS.lubeOil.bearing_temp_hi - healthy) / 45;

    expect(severityAtCross).toBeGreaterThan(0);
    expect(severityAtCross).toBeLessThan(0.5);   // reachable within a 50 % intensity cap
  });

  it('tracks the physics across the operating envelope, not just at rated', () => {
    for (const [load, rpm] of [[0, 400], [40, 800], [60, 1000], [100, 1150]] as const) {
      const { max, gallery } = physicsHottestBearing(load, rpm);
      const gap = max - baselineHottestBearing(load, rpm);
      // The residual is pressureDef and nothing else, at every point.
      expect(gap, `load ${load} rpm ${rpm}`).toBeCloseTo(pressureDef(gallery), 5);
    }
  });
});
