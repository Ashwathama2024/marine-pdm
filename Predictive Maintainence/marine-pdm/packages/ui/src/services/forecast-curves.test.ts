// services/forecast-curves.test.ts
//
// Phase 6 of OEM-CALIBRATION-GAP.md: the forecast bands are the OEM ones, and the ones MTU
// tabulates against engine speed are resolved at the speed the engine is actually turning.
//
// WHY IT MATTERS FOR THE MODEL, not just for the display. `minsToAlarm_*` is the observable
// baseline a learned model has to beat, and `rulTrue_*` is the label it is trained against. Both
// are distances to a threshold. Resolve that threshold at the wrong speed and every row recorded
// at part load is wrong by the same sign — which a regressor will happily learn.

import { describe, it, expect } from 'vitest';
import { MTU8000, MTU8000_LIMIT_CURVES, oemCurve } from '@marine-pdm/shared';
import { FORECAST_LIMITS, forecastLimit, minutesToAlarm, eta } from './forecast';

const RATED = MTU8000.RATED_RPM;

describe('forecast bands come from ZNG00028788', () => {
  it('resolves the curve-valued ones at rated', () => {
    expect(forecastLimit('exhaust', RATED)!.hi).toBe(oemCurve(10, RATED));              // 700 °C
    expect(forecastLimit('pistonCoolingPress', RATED)!.lo).toBe(oemCurve(1, RATED));    // 5.2 bar
    expect(forecastLimit('pistonCoolingPress', RATED)!.ss).toBe(oemCurve(2, RATED));    // 4.7 bar
    expect(forecastLimit('lubeLastBearing', RATED)!.lo).toBe(oemCurve(3, RATED));       // 5.8 bar
    expect(forecastLimit('lubeLastBearing', RATED)!.ss).toBe(oemCurve(4, RATED));       // 5.3 bar
    expect(forecastLimit('lube', RATED)!.lo).toBe(MTU8000_LIMIT_CURVES.galleryPressHI(RATED));
  });

  it('gives a genuinely different band at idle', () => {
    // The whole point. At 400 RPM the last-bearing warning is 2.37 bar, not 5.8.
    const idle = forecastLimit('lubeLastBearing', 400)!;
    expect(idle.lo).toBeCloseTo(oemCurve(3, 400), 10);
    expect(idle.lo!).toBeLessThan(forecastLimit('lubeLastBearing', RATED)!.lo!);
    expect(idle.lo!).toBeLessThan(3.0);
  });

  it('puts the warning above the shutdown on every falling-pressure band', () => {
    for (const rpm of [400, 600, 800, 1000, 1150]) {
      for (const key of ['lubeLastBearing', 'pistonCoolingPress']) {
        const b = forecastLimit(key, rpm)!;
        expect(b.lo!, `${key} @${rpm}`).toBeGreaterThanOrEqual(b.ss!);
      }
    }
  });

  it('every entry still resolves to numbers, scalar or curve', () => {
    for (const key of Object.keys(FORECAST_LIMITS)) {
      const b = forecastLimit(key, RATED)!;
      for (const field of ['hi', 'lo', 'ss'] as const) {
        const v = b[field];
        if (v !== undefined) expect(Number.isFinite(v), `${key}.${field}`).toBe(true);
      }
      // A band must offer the threshold its own direction uses, or it can never produce an ETA.
      expect(b.dir === 'high' ? b.hi : b.lo, `${key} has no ${b.dir} threshold`).toBeDefined();
    }
  });
});

describe('time-to-alarm uses the band in force at that speed', () => {
  // A last-bearing pressure falling at 0.1 bar/min, sampled as a 30-tick series.
  const falling = (from: number, perTick: number) =>
    Array.from({ length: 30 }, (_, i) => from - i * perTick);

  it('reports more time at idle than at rated for the same reading and slope', () => {
    // 6.0 bar falling. At rated the warning is 5.8 — almost there. At 400 RPM it is 2.37, which
    // is a long way down. A rated-point scalar would have claimed the idling engine was seconds
    // from an alarm it is nowhere near.
    const series = falling(6.0, 0.1 / 60);
    const atRated = minutesToAlarm(series, 'lubeLastBearing', RATED);
    const atIdle = minutesToAlarm(series, 'lubeLastBearing', 400);

    expect(atRated).not.toBeNull();
    expect(atIdle).not.toBeNull();
    expect(atIdle!).toBeGreaterThan(atRated!);
  });

  it('returns 0 when already inside the band and null when moving away from it', () => {
    expect(minutesToAlarm(falling(5.0, 0.1 / 60), 'lubeLastBearing', RATED)).toBe(0);   // below 5.8
    const rising = Array.from({ length: 30 }, (_, i) => 6.0 + i * 0.01);
    expect(minutesToAlarm(rising, 'lubeLastBearing', RATED)).toBeNull();
  });

  it('exposes a time-to-SHUTDOWN for falling pressures, not only for rising temperatures', () => {
    // `forecastFrom` used to drop `ss` whenever dir was 'low', so the one fault class in this
    // model that actually reaches a shutdown — a lube-pressure collapse — reported no ETA to it.
    const b = forecastLimit('lubeLastBearing', RATED)!;
    const etaToWarn = eta(6.0, b.lo, -0.1, 'low');
    const etaToTrip = eta(6.0, b.ss, -0.1, 'low');

    expect(etaToWarn).not.toBeNull();
    expect(etaToTrip).not.toBeNull();
    expect(etaToTrip!).toBeGreaterThan(etaToWarn!);   // the shutdown is always the later event
  });
});
