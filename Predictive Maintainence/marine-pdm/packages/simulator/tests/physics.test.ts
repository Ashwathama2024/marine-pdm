import { describe, it, expect } from 'vitest';
import {
  exhaustTemp_MTU8000,
  lubeOilPressure_MTU8000,
  cylExhaustTemp_MTU8000,
  chargeAirPressure_MTU8000,
  sfoc_MTU8000,
} from '../src/mtu8000-physics';
import {
  makeInitialPhysicsState,
  tickPhysics,
  snapshotFromState,
} from '../src/physics';
import { SimulatorEngine } from '../src/engine';
import { MTU8000 } from '@marine-pdm/shared';

// MTU 8000 rated operating point from PDF §3 validation targets
const LOAD = 85;
const RPM = 1150;

describe('MTU 8000 Physics — validation targets (PDF §3)', () => {
  it('exhaustTemp at 85% load, 1150 RPM → 440°C ±5', () => {
    const val = exhaustTemp_MTU8000(LOAD, RPM, 1.0, 1.0);
    expect(val).toBeGreaterThanOrEqual(435);
    expect(val).toBeLessThanOrEqual(445);
  });

  it('lubeOilPressure at 1150 RPM, 85% load → 6.7 bar ±0.3', () => {
    const val = lubeOilPressure_MTU8000(RPM, LOAD, 85, 0, 0);
    expect(val).toBeGreaterThanOrEqual(6.4);
    expect(val).toBeLessThanOrEqual(7.0);
  });

  it('chargeAirPressure at 1150 RPM, 85% load → 3.2 bar ±0.2', () => {
    const val = chargeAirPressure_MTU8000(RPM, LOAD, 1.0);
    expect(val).toBeGreaterThanOrEqual(3.0);
    expect(val).toBeLessThanOrEqual(3.4);
  });

  it('sfoc at 85% load, 1150 RPM → 185 g/kWh ±5', () => {
    const val = sfoc_MTU8000(LOAD, RPM, {}, 1.0);
    expect(val).toBeGreaterThanOrEqual(180);
    expect(val).toBeLessThanOrEqual(190);
  });

  it('produces 20 cylinder exhaust temps (A1–B10)', () => {
    const baseMean = exhaustTemp_MTU8000(LOAD, RPM, 1.0, 1.0);
    const cyls = MTU8000.CYL_NAMES.map((_, i) =>
      cylExhaustTemp_MTU8000(baseMean, i, {}, 0),
    );
    expect(cyls).toHaveLength(20);
    cyls.forEach(t => expect(t).toBeGreaterThan(350));
  });

  it('B-side cylinders (index 10–19) run hotter than A-side (BSIDE_TEMP_BIAS)', () => {
    const baseMean = exhaustTemp_MTU8000(LOAD, RPM, 1.0, 1.0);
    const aSide = MTU8000.CYL_NAMES.slice(0, 10).map((_, i) =>
      cylExhaustTemp_MTU8000(baseMean, i, {}, 0),
    );
    const bSide = MTU8000.CYL_NAMES.slice(10).map((_, i) =>
      cylExhaustTemp_MTU8000(baseMean, i + 10, {}, 0),
    );
    const aMean = aSide.reduce((a, b) => a + b, 0) / 10;
    const bMean = bSide.reduce((a, b) => a + b, 0) / 10;
    expect(bMean).toBeGreaterThan(aMean + 2); // at least 2°C hotter (BSIDE_TEMP_BIAS=4)
  });
});

describe('Lag model — signal smoothing', () => {
  it('signal takes more than 5 ticks to settle after load step-change', () => {
    const state = makeInitialPhysicsState(RPM, LOAD);
    const snap0 = snapshotFromState(state);
    const baseExh = snap0.exhaustTemp;

    let s = { ...state, load: 100 };
    let settled = false;
    let ticksToSettle = 0;
    const targetExh = exhaustTemp_MTU8000(100, RPM, 1.0, 1.0);

    for (let i = 0; i < 100; i++) {
      s = tickPhysics(s);
      ticksToSettle = i + 1;
      if (Math.abs(snapshotFromState(s).exhaustTemp - targetExh) < 1.0) {
        settled = true;
        break;
      }
    }
    expect(baseExh).toBeLessThan(targetExh - 5);
    expect(settled).toBe(true);
    expect(ticksToSettle).toBeGreaterThan(5);
  });
});

describe('Injector fault — progressive temperature rise', () => {
  it('cylinder B1 (index 10) temp rises ≥5°C over 30 ticks with injector fault', async () => {
    const engine = new SimulatorEngine(RPM, LOAD);
    engine.quickStart(); // put engine in LOADED state so faults are processed
    const snapshots: number[] = [];

    await new Promise<void>(resolve => {
      engine.subscribe(snap => {
        snapshots.push(snap.cylTemps[10]); // B1 = index 10
        if (snapshots.length === 1) {
          engine.injectFault('injector', 10, 0.1);
        }
        if (snapshots.length >= 30) {
          engine.unsubscribe();
          resolve();
        }
      });
    });

    const first5Avg = snapshots.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const last5Avg = snapshots.slice(-5).reduce((a, b) => a + b, 0) / 5;
    expect(last5Avg).toBeGreaterThan(first5Avg + 5);
  }, 40_000);
});
