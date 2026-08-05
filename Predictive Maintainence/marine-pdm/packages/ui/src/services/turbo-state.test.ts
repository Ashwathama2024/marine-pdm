// Pins the sequential-turbocharger derivation now shared by the dashboard panel and the 3D view.
//
// The headline fact these guard: the DISPLAYED speed is not snapshot.tcSpeeds[i]. It is tcRPM scaled
// by how many units are cut in. A consumer reading tcSpeeds[i] directly disagrees with the dashboard
// by up to 2x, which is exactly the mismatch this module was extracted to end.

import { describe, expect, it } from 'vitest';
import type { EngineSnapshot } from '@marine-pdm/shared';
import {
  INITIAL_CUTIN,
  REF,
  TC_META,
  deriveTCInfos,
  nextCutInState,
  turboWheelPeriodS,
} from './turbo-state';

function snap(rpm: number, tcRPM: number): EngineSnapshot {
  return { rpm, tcRPM } as unknown as EngineSnapshot;
}

describe('cut-in sequencing', () => {
  it('starts with only the two basic units running', () => {
    expect(INITIAL_CUTIN).toEqual([false, true, false, true]);
    expect(TC_META[1].type).toBe('basic');
    expect(TC_META[3].type).toBe('basic');
  });

  it('stops every unit when the engine stops, basic ones included', () => {
    // No combustion means no exhaust flow; nothing turns a "basic" turbo either.
    expect(nextCutInState([true, true, true, true], 0, 0)).toEqual([false, false, false, false]);
  });

  it('needs BOTH engine rpm and TC speed to cut in the 3rd unit', () => {
    // Engine rpm high enough, but the two running units are not yet at 37 000.
    const tooSlow = nextCutInState(INITIAL_CUTIN, 900, 10000);
    expect(tooSlow[0]).toBe(false);
    // 2 units share the load, so each spins at 2x base: 19 000 x 2 = 38 000 ≥ 37 000.
    const fast = nextCutInState(INITIAL_CUTIN, 900, 19000);
    expect(fast[0]).toBe(true);
  });

  it('holds state inside the dead-band instead of chattering', () => {
    // A1 cuts in at 850 and out below 830. At 840 with no speed condition met, it holds.
    const on = [true, true, false, true];
    expect(nextCutInState(on, 840, 10000)[0]).toBe(true);
    const off = [false, true, false, true];
    expect(nextCutInState(off, 840, 10000)[0]).toBe(false);
  });

  it('cuts the 3rd unit out below its cut-out rpm', () => {
    expect(nextCutInState([true, true, true, true], 820, 30000)[0]).toBe(false);
  });

  it('returns the same array when nothing changed, so React can bail out', () => {
    const prev = [true, true, true, true];
    expect(nextCutInState(prev, 1150, 28000)).toBe(prev);
  });
});

describe('displayed speed is derived, not read from tcSpeeds', () => {
  it('scales each unit by 4 / activeCount', () => {
    const s = snap(1150, 14000);
    // Only the two basic units cut in — each carries double the boost load.
    const two = deriveTCInfos(s, 14000, [false, true, false, true]);
    expect(two[1].displaySpeed).toBeCloseTo(28000, 6);
    expect(two[3].displaySpeed).toBeCloseTo(28000, 6);

    // All four cut in — each runs at the base speed.
    const four = deriveTCInfos(s, 14000, [true, true, true, true]);
    expect(four[0].displaySpeed).toBeCloseTo(14000, 6);

    // Which is the 2x disagreement a consumer reading tcSpeeds[i] would have shown.
    expect(two[1].displaySpeed / four[1].displaySpeed).toBeCloseTo(2, 6);
  });

  it('windmills a cut-out unit at 15% of base rather than stopping it', () => {
    const infos = deriveTCInfos(snap(900, 20000), 20000, [false, true, false, true]);
    expect(infos[0].status).toBe('STANDBY');
    expect(infos[0].displaySpeed).toBeCloseTo(3000, 6);
  });

  it('puts every unit at a dead stop when the engine is stopped', () => {
    const infos = deriveTCInfos(snap(0, 5000), 20000, [true, true, true, true]);
    expect(infos.every(t => t.displaySpeed === 0 && t.status === 'STANDBY')).toBe(true);
  });

  it('raises ALARM on overspeed', () => {
    const infos = deriveTCInfos(snap(1200, REF.overSpeedL1), REF.overSpeedL1, [true, true, true, true]);
    expect(infos[0].status).toBe('ALARM');
  });

  it('raises ALARM when a unit deviates far from expected', () => {
    const infos = deriveTCInfos(snap(1150, 28000), 20000, [true, true, true, true]);
    expect(infos[0].deviation).toBeCloseTo(8000, 6);
    expect(infos[0].status).toBe('ALARM');
  });
});

describe('wheel rotation period', () => {
  it('slows as speed falls and floors at 0.18 s per rev', () => {
    const idle = turboWheelPeriodS(REF.idleRpm, 'ACTIVE');
    const nominal = turboWheelPeriodS(REF.nominalRatedRpm, 'ACTIVE');
    const max = turboWheelPeriodS(99999, 'ACTIVE');
    expect(idle).toBeCloseTo(3.0, 6);
    expect(nominal).toBeLessThan(idle);
    expect(max).toBeCloseTo(0.18, 6);
  });

  it('gives standby units a fixed slow windmill', () => {
    expect(turboWheelPeriodS(0, 'STANDBY')).toBe(8);
    expect(turboWheelPeriodS(30000, 'STANDBY')).toBe(8);
  });

  it('never returns a non-positive period, which would divide by zero in the 3D loop', () => {
    for (const s of [-100, 0, 1, 7000, 28000, 41000, 1e9]) {
      expect(turboWheelPeriodS(s, 'ACTIVE')).toBeGreaterThan(0);
    }
  });
});
