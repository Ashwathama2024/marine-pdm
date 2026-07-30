// packages/simulator/tests/alarm-preview.test.ts
//
// REGRESSION GUARD — the ECS alarm preview vs the physics it claims to predict.
//
// This preview is what the operator reads in the Simulator fault injector before injecting, so a
// drift here is silently user-visible: it either advertises alarms that cannot fire, or reports the
// wrong intensity at which one will. Three failure modes have already happened once and are pinned
// below against the REAL physics rather than against hand-typed numbers:
//
//   1. Intensity double-counting — `eff = severity · (intensity/100)` squared the slider, because
//      severity is ALREADY capped at intensity/100 by tickFaultsMTU8000. Guarded by asserting the
//      saturated severity from the real tick is exactly intensity/100 (the one place it is applied).
//   2. Delta-vs-absolute — F08 compared a crankcase RISE straight to the ABSOLUTE 5 mbar limit,
//      ignoring the ≈ −0.725 mbar healthy value, so it tripped ~9 intensity points early.
//   3. Unreachable codes — F07 listed HI P-Crankcase, which its 0.3 blow-by coupling can never
//      reach. That effect is real but sub-alarm, so it belongs in the impact preview, not here.

import { describe, it, expect } from 'vitest';
import { MTU8000_LIMITS } from '@marine-pdm/shared';
import { crankcasePressure_MTU8000 } from '../src/mtu8000-physics';
import { makeInitialPhysicsState } from '../src/physics';
import {
  getECSAlarmPreview,
  getParameterImpactPreview,
  tickFaultsMTU8000,
  createFaultConfig,
  FAULT_MAX_EFFECTS,
} from '../src/faults-mtu8000';
import type { FaultConfig, PhysicsState } from '../src/index';

const RATED_LOAD = 85;
const RATED_RPM = 1150;

/** Run the REAL fault tick well past saturation (FAST = 0.012/s → capped in ~84 s). */
function settle(faultId: string, intensity: number): { fault: FaultConfig; state: PhysicsState } {
  let faults = [createFaultConfig(faultId, { intensity, speed: 'FAST', targetCyls: [3] })];
  let state = makeInitialPhysicsState(RATED_RPM, RATED_LOAD);
  for (let i = 0; i < 300; i++) {
    const r = tickFaultsMTU8000(faults, state, 1);
    faults = r.faults;
    state = r.updatedState;
  }
  return { fault: faults[0]!, state };
}

/** Smallest severity in [0,1] at which `pred` holds, to 1e-4 resolution. */
function crossing(pred: (s: number) => boolean): number | null {
  for (let i = 0; i <= 10_000; i++) {
    const s = i / 10_000;
    if (pred(s)) return s;
  }
  return null;
}

const crankRow = (faultId: string, s: number) =>
  getECSAlarmPreview(faultId, s).find(a => a.code === 'HI P-Crankcase');

describe('ECS alarm preview — intensity is applied exactly once', () => {
  it('the real tick saturates severity at exactly intensity/100', () => {
    // The severity cap is the ONE place intensity enters. If a second (intensity/100) factor ever
    // reappears downstream, the preview and the physics stop agreeing — see the F05 check below.
    for (const intensity of [25, 50, 75, 100]) {
      expect(settle('F05', intensity).fault.currentSeverity).toBeCloseTo(intensity / 100, 6);
    }
  });

  it('F05 preview effect equals the coolingEff drop the physics actually applies', () => {
    for (const intensity of [25, 50, 75, 100]) {
      const { state } = settle('F05', intensity);
      const physicsDrop = 1.0 - state.coolingEff;
      // The preview's F05 term is `eff · F05_cooling_eff_drop` evaluated at the saturated severity.
      const previewDrop = (intensity / 100) * FAULT_MAX_EFFECTS.F05_cooling_eff_drop;
      expect(previewDrop).toBeCloseTo(physicsDrop, 6);
    }
  });
});

describe('ECS alarm preview — crankcase is an absolute-limit alarm', () => {
  it('F08 trips HI P-Crankcase at the same severity the physics crosses the coded limit', () => {
    const previewCross = crossing(s => crankRow('F08', s)!.active);
    const physicsCross = crossing(
      s => crankcasePressure_MTU8000(RATED_LOAD, s) >= MTU8000_LIMITS.crankcase.pressure_hi,
    );

    expect(previewCross).not.toBeNull();
    expect(physicsCross).not.toBeNull();
    expect(previewCross!).toBeCloseTo(physicsCross!, 4);

    // Pin the absolute value too: −0.725 + 8s ≥ 5 → s ≥ 0.7156, NOT the 0.625 the old `>= 5` gave.
    expect(physicsCross!).toBeCloseTo(0.7156, 3);
    expect(previewCross!).toBeGreaterThan(0.65);
  });

  it('F08 blow-by actually reaches the limit at full severity (the alarm is live, not dead)', () => {
    const { state } = settle('F08', 100);
    const peak = crankcasePressure_MTU8000(RATED_LOAD, state.pistonBlowby);
    expect(peak).toBeGreaterThan(MTU8000_LIMITS.crankcase.pressure_hi);
    expect(crankRow('F08', 1.0)!.active).toBe(true);
  });
});

describe('ECS alarm preview — F07 crankcase is sub-alarm by design', () => {
  it('F07 cannot reach HI P-Crankcase at ANY intensity, per the real physics', () => {
    for (const intensity of [25, 50, 75, 100]) {
      const { state } = settle('F07', intensity);
      const peak = crankcasePressure_MTU8000(RATED_LOAD, state.pistonBlowby);
      expect(peak).toBeLessThan(MTU8000_LIMITS.crankcase.pressure_hi);
    }
  });

  it('so the preview must NOT advertise HI P-Crankcase for F07', () => {
    // Listing an unreachable code implied that raising intensity would eventually trip it.
    for (const s of [0.25, 0.5, 0.75, 1.0]) {
      expect(getECSAlarmPreview('F07', s).map(a => a.code)).not.toContain('HI P-Crankcase');
    }
  });

  it('the effect is surfaced in the impact preview instead, at the modeled magnitude', () => {
    const expected = FAULT_MAX_EFFECTS.F08_blowby_pressure * FAULT_MAX_EFFECTS.F07_blowby_coupling;
    const crank = getParameterImpactPreview('F07', 100).find(i => i.startsWith('B50'));
    expect(crank).toBeDefined();
    expect(crank).toContain(expected.toFixed(1));

    // ...and it matches what the tick actually puts on the root factor.
    const { state } = settle('F07', 100);
    expect(state.pistonBlowby * FAULT_MAX_EFFECTS.F08_blowby_pressure).toBeCloseTo(expected, 6);
  });

  it('F01 — which has no blow-by term at all — never lists a crankcase row either', () => {
    expect(getECSAlarmPreview('F01', 1.0).map(a => a.code)).not.toContain('HI P-Crankcase');
  });
});
