// Spray-oil temperature (B77.11–B77.20) — the model and the quantity the ECS alarms on.
//
// The design claim under test is that this parameter is DIFFERENTIAL. MTU codes no absolute band
// for it; everything hangs on the spread between the ten channels. That makes two properties
// load-bearing, and both are easy to break with an innocent-looking edit:
//
//   1. anything common to all ten channels must cancel out of the alarm, and
//   2. anything local to one throw must show up in it, hard.
//
// If (1) breaks, the alarm fires on hot oil and cold starts. If (2) breaks, the sensor is decorative.

import { describe, expect, it } from 'vitest';
import { MTU8000, MTU8000_LIMITS, sprayOilDeviation } from '@marine-pdm/shared';
import { sprayOilTemp_MTU8000 } from '../src/mtu8000-physics';
import { makeInitialPhysicsState, tickPhysics, snapshotFromState } from '../src/physics';

const RATED_LOAD = 85;
const RATED_RPM = MTU8000.RATED_RPM;
const THROWS = MTU8000.CRANK_THROWS;

const bank = (load: number, rpm: number, oilTemp: number, faults: Record<number, number> = {}) =>
  Array.from({ length: THROWS }, (_, i) =>
    sprayOilTemp_MTU8000(load, rpm, oilTemp, i, faults[i] ?? 0),
  );

describe('the ten channels', () => {
  it('models one per crank throw, not one per cylinder', () => {
    // A 20V shares each throw between two opposing con-rods, so 20 cylinders sit on 10 throws. An
    // earlier handover recorded these as 20 per-cylinder sensors; the drawing says B77.11–B77.20.
    expect(THROWS).toBe(10);
    expect(MTU8000.CYLINDERS).toBe(2 * THROWS);
  });
});

describe('common-mode inputs must not alarm', () => {
  it('keeps a healthy engine well inside the warning limit at rated', () => {
    const { dev } = sprayOilDeviation(bank(RATED_LOAD, RATED_RPM, 98));
    expect(dev).toBeGreaterThan(0);
    expect(dev).toBeLessThan(MTU8000_LIMITS.sprayOil.diff_warn / 2);
  });

  it('is unchanged by oil temperature, which is the whole point', () => {
    // lubeOilTemp is 13 °C hotter than the OEM limit allows (see OEM-CALIBRATION-GAP.md). If that
    // absolute error could reach this alarm, the calibration defect would be raising spurious
    // bearing-distress warnings. It cannot: the term is common to all ten channels.
    const cold = sprayOilDeviation(bank(RATED_LOAD, RATED_RPM, 60)).dev;
    const hot = sprayOilDeviation(bank(RATED_LOAD, RATED_RPM, 130)).dev;
    expect(hot).toBeCloseTo(cold, 10);
  });

  it('is unchanged by load and speed', () => {
    const idle = sprayOilDeviation(bank(0, 400, 70)).dev;
    const rated = sprayOilDeviation(bank(RATED_LOAD, RATED_RPM, 98)).dev;
    expect(rated).toBeCloseTo(idle, 10);
  });
});

describe('local distress must alarm, and name the right throw', () => {
  it('drives a single throw past the shutdown limit at full severity', () => {
    const { dev, channel } = sprayOilDeviation(bank(RATED_LOAD, RATED_RPM, 98, { 6: 1 }));
    expect(channel).toBe(6);                                    // reported to the operator as "B7"
    expect(dev).toBeGreaterThan(MTU8000_LIMITS.sprayOil.diff_shutdown);
  });

  it('passes through the warning band on the way to shutdown', () => {
    // The usable window is narrow — the OEM limits are only 2 °C apart and a throw fault is worth
    // 25 °C, so warning lands near 0.18 severity and shutdown near 0.27. Worth pinning precisely:
    // if the fault gain grows, the engine skips the warning entirely and goes straight to a trip.
    const at = (sev: number) => sprayOilDeviation(bank(RATED_LOAD, RATED_RPM, 98, { 3: sev })).dev;
    expect(at(0.10)).toBeLessThan(MTU8000_LIMITS.sprayOil.diff_warn);
    expect(at(0.22)).toBeGreaterThan(MTU8000_LIMITS.sprayOil.diff_warn);
    expect(at(0.22)).toBeLessThan(MTU8000_LIMITS.sprayOil.diff_shutdown);
    expect(at(0.40)).toBeGreaterThan(MTU8000_LIMITS.sprayOil.diff_shutdown);
  });

  it('reports zero deviation when every channel is equally hot', () => {
    // Not a fault: the whole crankshaft running warm is what T-Oil and T-Bearing are for.
    const all = Array(THROWS).fill(120);
    expect(sprayOilDeviation(all).dev).toBe(0);
  });

  it('returns a safe empty result when the snapshot carries no channels', () => {
    expect(sprayOilDeviation([])).toEqual({ dev: 0, channel: -1, mean: 0 });
  });
});

describe('coupling through the tick', () => {
  // Assertions about the MODEL read the un-noised lag state. snapshotFromState adds ±0.25 °C of
  // measurement noise per channel, which is a fifth of the healthy deviation — enough to swamp a
  // claim like "blow-by changes nothing". Noise gets its own test below.
  const settle = (faults: Record<number, number>, blowby = 0, ticks = 400) => {
    let s = makeInitialPhysicsState(RATED_RPM, RATED_LOAD);
    s = { ...s, bearingFaults: faults, pistonBlowby: blowby };
    for (let i = 0; i < ticks; i++) s = tickPhysics(s);
    return s;
  };

  it('emits one reading per crank throw', () => {
    expect(snapshotFromState(settle({})).sprayOilTemps).toHaveLength(THROWS);
  });

  it('warms BOTH throws either side of a hot main bearing', () => {
    // Throw t runs between bearings t and t+1, so bearing 5 (index 4) sits between throws 4 and 5.
    // This adjacency is why the sensor detects a bearing at all, and it is not visible in the
    // physics function alone — it is wired in tickPhysics.
    const temps = settle({ 4: 1 }).lagSprayOilTemps;
    const mean = temps.reduce((a, b) => a + b, 0) / THROWS;
    const above = temps.map((t, i) => ({ i, d: t - mean }))
      .filter(x => x.d > 5).map(x => x.i).sort((a, b) => a - b);
    expect(above).toEqual([3, 4]);
  });

  it('does not report blow-by as a bearing fault', () => {
    // Blow-by lifts every throw equally. It is a real fault with its own alarm (crankcase pressure);
    // reporting it here would send an engineer to the wrong bearing.
    const clean = sprayOilDeviation(settle({}, 0).lagSprayOilTemps).dev;
    const blowby = sprayOilDeviation(settle({}, 1).lagSprayOilTemps).dev;
    expect(blowby).toBeCloseTo(clean, 6);
    expect(blowby).toBeLessThan(MTU8000_LIMITS.sprayOil.diff_warn);
  });

  it('keeps measurement noise well under the warning limit', () => {
    // The alarm is a 4 °C deviation on a set of ten, so noise enters it directly. If the amplitude
    // grows past roughly half the limit, a healthy engine starts raising HI T-Splash Oil at random.
    const s = settle({});
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      worst = Math.max(worst, sprayOilDeviation(snapshotFromState(s).sprayOilTemps).dev);
    }
    expect(worst).toBeLessThan(MTU8000_LIMITS.sprayOil.diff_warn / 2);
  });

  it('leads bearing temperature on the same fault', () => {
    // The reason MTU fits these at all: oil in transit responds faster than the bearing casting it
    // came off, so the deviation reaches its warning before T-Bearing reaches its HI. Measured as
    // the tick each one crosses, from a healthy start.
    let s = makeInitialPhysicsState(RATED_RPM, RATED_LOAD);
    s = { ...s, bearingFaults: { 4: 1 } };
    let sprayAt = -1, bearingAt = -1;
    for (let t = 0; t < 600; t++) {
      s = tickPhysics(s);
      if (sprayAt < 0 && sprayOilDeviation(s.lagSprayOilTemps).dev > MTU8000_LIMITS.sprayOil.diff_warn) sprayAt = t;
      if (bearingAt < 0 && Math.max(...s.lagBearingTemps) > MTU8000_LIMITS.lubeOil.bearing_temp_hi) bearingAt = t;
      if (sprayAt >= 0 && bearingAt >= 0) break;
    }
    expect(sprayAt).toBeGreaterThanOrEqual(0);
    expect(bearingAt).toBeGreaterThanOrEqual(0);
    expect(sprayAt).toBeLessThan(bearingAt);
  });
});
