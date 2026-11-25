import { describe, it, expect } from 'vitest';
import {
  exhaustTemp_MTU8000,
  lubeOilPressure_MTU8000,
  cylExhaustTemp_MTU8000,
  chargeAirPressure_MTU8000,
  sfoc_MTU8000,
  lubeOilTemp_MTU8000,
} from '../src/mtu8000-physics';
import {
  makeInitialPhysicsState,
  tickPhysics,
  snapshotFromState,
} from '../src/physics';
import { SimulatorEngine } from '../src/engine';
import { MTU8000 } from '@marine-pdm/shared';

// MTU 8000 rated operating point.
//
// These are magnitude targets for the equations. Whether a value is SAFE is a separate question,
// answered against the manual in tests/oem-envelope.test.ts — the two are deliberately split so
// that nobody can satisfy a safety check by loosening a magnitude target here.
const LOAD = 85;
const RPM = 1150;

describe('MTU 8000 Physics — validation targets', () => {
  it('exhaustTemp at 85% load, 1150 RPM → 440°C ±5', () => {
    const val = exhaustTemp_MTU8000(LOAD, RPM, 1.0, 1.0);
    expect(val).toBeGreaterThanOrEqual(435);
    expect(val).toBeLessThanOrEqual(445);
  });

  it('lubeOilPressure at the rated point → 7.16 bar ±0.15', () => {
    // Stated at the RATED oil temperature and the nominal filter ΔP, which is how physics.ts
    // actually calls it — the old target quoted 85 °C oil and zero ΔP, neither of which the
    // pipeline uses. Raised from ~6.4 bar because the last-bearing and piston-cooling takeoffs
    // have to clear OEM curves 3 and 1 (5.8 and 5.2 bar at 1150 RPM); see oem-envelope.test.ts.
    const oilTemp = lubeOilTemp_MTU8000(LOAD, RPM);
    const val = lubeOilPressure_MTU8000(RPM, LOAD, oilTemp, 0.15, 0);
    expect(val).toBeGreaterThanOrEqual(7.01);
    expect(val).toBeLessThanOrEqual(7.31);
  });

  it('lubeOilTemp at the rated point → 78.3°C, inside the 83°C T-Oil warning', () => {
    const val = lubeOilTemp_MTU8000(LOAD, RPM);
    expect(val).toBeGreaterThanOrEqual(77.5);
    expect(val).toBeLessThanOrEqual(79.0);
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
  it('cylinder B1 (index 10) rises ≥5°C above its settled pre-fault level once under load', async () => {
    // Drive the engine into a loaded state: quickStart → IDLE, then engage the clutch.
    // CLUTCHING auto-advances to CLUTCHED → LOADED, where load = propeller cube-law and
    // faults are actually processed (faults only tick in CLUTCHED/LOADED).
    const engine = new SimulatorEngine(400, 0);
    engine.quickStart();
    engine.engageClutch();

    const b1: number[] = [];
    let loadedTicks = 0;
    let injected = false;
    let preFault = NaN;

    await new Promise<void>(resolve => {
      engine.subscribe(snap => {
        b1.push(snap.cylTemps[10]); // B1 = index 10

        if (engine.getEngineState() === 'LOADED') loadedTicks++;

        // Let exhaust settle a few loaded ticks, capture the pre-fault level, then inject.
        if (!injected && loadedTicks >= 4) {
          preFault = snap.cylTemps[10];
          engine.injectFault('injector', 10, 0.3);
          injected = true;
        }

        if (b1.length >= 45) {
          engine.unsubscribe();
          resolve();
        }
      });
    });

    expect(injected).toBe(true);
    const last5Avg = b1.slice(-5).reduce((a, b) => a + b, 0) / 5;
    expect(last5Avg).toBeGreaterThan(preFault + 5);
  }, 60_000);
});
