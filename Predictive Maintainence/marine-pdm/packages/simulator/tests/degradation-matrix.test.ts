// packages/simulator/tests/degradation-matrix.test.ts
//
// SMOKE TEST — degradation model (Part A1 of phase-completion plan).
// Proves the typed degradation matrix stays in sync with the runtime physics, deterministically:
//   1. Matrix ↔ physics finite-difference: every MODELED weight == the physics partial ∂sensor/∂rootFactor.
//   2. Gap guard: every modeled:false effect has weight 0, and the known gaps are exactly the expected set.
//   3. Combine / superposition: a shared-sensor multi-fault (F03+F05 on bearings) reflects BOTH root factors.
//   4. Time/intensity model: severityAt() ramp + cap, predictEffect() ABSOLUTE magnitude
//      (weight · severity · rootMax) checked against the physics deltas — not merely its linearity.
//
// The finite-difference is the guard against the most likely rot — the matrix drifting from the physics.

import { describe, it, expect } from 'vitest';
import {
  exhaustTemp_MTU8000,
  cylExhaustTemp_MTU8000,
  lubeOilPressure_MTU8000,
  bearingTemp_MTU8000,
  chargeAirPressure_MTU8000,
  lubeOilTemp_MTU8000,
  fuelRailPressure_MTU8000,
  sfoc_MTU8000,
  crankcasePressure_MTU8000,
  exhaustBackPressure_MTU8000,
  tcSpeed_MTU8000,
} from '../src/mtu8000-physics';
import { makeInitialPhysicsState, tickPhysics } from '../src/physics';
import { tickFaultsMTU8000, createFaultConfig, FAULT_MAX_EFFECTS } from '../src/faults-mtu8000';
import {
  DEGRADATION_MODES,
  ROOT_FACTORS,
  getMode,
  severityAt,
  predictEffect,
  type DegradationEffect,
} from '../src/degradation-matrix';

// Rated operating point (matrix weights are the partials evaluated here).
const LOAD = 85;
const RPM = 1150;
const OIL = 98;              // ~rated hot-oil temp
const P_HEALTHY = 6.44;      // ~rated gallery pressure (hot oil, nominal filter ΔP)

/** Secant slope of f over [x0, x0+δ] — the discrete ∂/∂x used to check a matrix weight. */
const slope = (f: (x: number) => number, x0: number, dx: number) => (f(x0 + dx) - f(x0)) / dx;

/** Find one effect on a mode by sensorId (first match). */
const eff = (modeId: string, sensorId: string): DegradationEffect => {
  const e = getMode(modeId)!.effects.find(x => x.sensorId === sensorId);
  if (!e) throw new Error(`no effect ${sensorId} on ${modeId}`);
  return e;
};

/** Assert a physics partial matches a matrix weight within a relative tolerance (default 10%). */
const expectWeight = (actual: number, weight: number, relTol = 0.1) => {
  const tol = Math.max(Math.abs(weight) * relTol, 1e-6);
  expect(Math.abs(actual - weight)).toBeLessThanOrEqual(tol);
};

describe('Degradation matrix ↔ physics — finite-difference (modeled weights == physics partials)', () => {
  // ── F05 HT-cooler fouling: root factor = coolingEff drop (perturb by lowering coolingEff) ──
  it('F05 → lubeOilTemp weight (coolingPenalty = drop·15)', () => {
    const s = slope(ce => lubeOilTemp_MTU8000(LOAD, RPM, 36, ce), 1.0, -0.2) * -1; // d/d(drop) = −d/d(ce)
    expectWeight(s, eff('F05', 'lubeOilTemp').weight); // 15
  });
  it('F05 → exhaustMeanTemp weight (cooling = drop·35)', () => {
    const s = slope(ce => exhaustTemp_MTU8000(LOAD, RPM, ce, 1.0), 1.0, -0.2) * -1;
    expectWeight(s, eff('F05', 'exhaustMeanTemp').weight); // 35
  });
  it('F05 → sfoc weight (coolingPenalty = drop·18)', () => {
    const s = slope(ce => sfoc_MTU8000(LOAD, RPM, {}, ce), 1.0, -0.2) * -1;
    expectWeight(s, eff('F05', 'sfoc').weight); // 18
  });
  it('F05 → bearingTemps[all] weight (via oil rise: ΔlubeOilTemp·0.4)', () => {
    // Compose: coolingEff drop → lubeOilTemp rise → bearing oilHeat. Pressure held healthy.
    const bearingAt = (ce: number) =>
      bearingTemp_MTU8000(LOAD, RPM, lubeOilTemp_MTU8000(LOAD, RPM, 36, ce), P_HEALTHY, 0, 0);
    const s = slope(bearingAt, 1.0, -0.2) * -1;
    expectWeight(s, eff('F05', 'bearingTemps[all]').weight); // 6
  });

  // ── F06 TC fouling: root factor = tcEff drop. ∂/∂drop = −∂/∂tcEff (weights are negative). ──
  it('F06 → tcSpeeds weight (∂tcSpeed/∂drop ≈ −28000)', () => {
    const perDrop = -slope(tc => tcSpeed_MTU8000(RPM, LOAD, tc), 1.0, -0.2);
    expectWeight(perDrop, eff('F06', 'tcSpeeds[i]').weight, 0.02); // −28000
  });
  it('F06 → chargeAirPressure weight (boost·drop ≈ −1.86)', () => {
    const perDrop = -slope(tc => chargeAirPressure_MTU8000(RPM, LOAD, tc), 1.0, -0.2);
    expectWeight(perDrop, eff('F06', 'chargeAirPressure').weight, 0.02); // −1.86 per drop
  });
  it('F06 → exhaustMeanTemp weight (tc = drop·20)', () => {
    const s = slope(tc => exhaustTemp_MTU8000(LOAD, RPM, 1.0, tc), 1.0, -0.2) * -1;
    expectWeight(s, eff('F06', 'exhaustMeanTemp').weight); // 20
  });
  it('F06 → exhaustBackPressure weight (tcFoulEffect = drop·40)', () => {
    const s = slope(tc => exhaustBackPressure_MTU8000(LOAD, RPM, tc), 1.0, -0.2) * -1;
    expectWeight(s, eff('F06', 'exhaustBackPressure').weight); // 40
  });
  it('F06 → sfoc weight (tcPenalty = drop·25)', () => {
    const s = slope(tc => sfoc_MTU8000(LOAD, RPM, {}, 1.0, tc), 1.0, -0.2) * -1;
    expectWeight(s, eff('F06', 'sfoc').weight); // 25
  });

  // ── F03 lube-pressure loss: root factor = lubeFault (0–1) ──
  it('F03 → lubeOilPressure weight (faultDrop = lf·3.8)', () => {
    const s = slope(lf => lubeOilPressure_MTU8000(RPM, LOAD, OIL, 0.15, lf), 0, 0.5);
    expectWeight(s, eff('F03', 'lubeOilPressure').weight, 0.02); // −3.8
  });
  it('F03 → lubeLastBearingPressure weight ((gallery − filterDpTarget)·0.55)', () => {
    const lastB = (lf: number) =>
      lubeOilPressure_MTU8000(RPM, LOAD, OIL, 0.15 + lf * 0.5, lf) * 0.55;
    const s = slope(lastB, 0, 0.5);
    expectWeight(s, eff('F03', 'lubeLastBearingPressure').weight, 0.05); // −2.37
  });
  it('F03 → lubeOilPressureAfterFilter weight (gallery − filterDpTarget)', () => {
    const after = (lf: number) =>
      lubeOilPressure_MTU8000(RPM, LOAD, OIL, 0.15, lf) - (0.15 + lf * 0.5);
    const s = slope(after, 0, 0.5);
    expectWeight(s, eff('F03', 'lubeOilPressureAfterFilter').weight, 0.02); // −4.3
  });
  it('F03 → pistonCoolingPress weight (gallery·0.68 − lf·0.5)', () => {
    const pc = (lf: number) => lubeOilPressure_MTU8000(RPM, LOAD, OIL, 0.15, lf) * 0.68 - lf * 0.5;
    const s = slope(pc, 0, 0.5);
    expectWeight(s, eff('F03', 'pistonCoolingPress').weight, 0.02); // −3.08
  });
  it('F03 → bearingTemps[all] weight (via pressure starvation: pressureDef)', () => {
    // bearing rise comes from lower gallery pressure raising pressureDef, NOT from faultHeat.
    const bearingAt = (lf: number) =>
      bearingTemp_MTU8000(LOAD, RPM, OIL, lubeOilPressure_MTU8000(RPM, LOAD, OIL, 0.15, lf), 10, 0);
    const s = slope(bearingAt, 0, 0.5);
    expectWeight(s, eff('F03', 'bearingTemps[all]').weight, 0.05); // 17.1
  });

  // ── F08 piston blow-by: root factor = pistonBlowby (0–1) ──
  it('F08 → crankcasePressure weight (blowbyEffect = pb·8)', () => {
    const s = slope(pb => crankcasePressure_MTU8000(LOAD, pb), 0, 0.5);
    expectWeight(s, eff('F08', 'crankcasePressure').weight); // 8
  });
  it('F08 → sfoc weight (blowbyPenalty = pb·2)', () => {
    const s = slope(pb => sfoc_MTU8000(LOAD, RPM, {}, 1.0, 1.0, pb), 0, 0.5);
    expectWeight(s, eff('F08', 'sfoc').weight); // 2
  });

  // ── F01/F02/F09 injector: root factor = injFault (0–1, per cylinder) ──
  it('F01 → cylTemps[n] weight (faultDelta = inj·65)', () => {
    const baseMean = exhaustTemp_MTU8000(LOAD, RPM, 1.0, 1.0);
    const s = slope(sev => cylExhaustTemp_MTU8000(baseMean, 0, { 0: sev }, 1.0), 0, 0.5);
    expectWeight(s, eff('F01', 'cylTemps[n]').weight); // 65
  });
  it('F01 → sfoc weight (injFaultPenalty = Σ inj·4.5)', () => {
    const s = slope(sev => sfoc_MTU8000(LOAD, RPM, { 0: sev }), 0, 0.5);
    expectWeight(s, eff('F01', 'sfoc').weight); // 4.5
  });
  it('F01 → exhaustMeanTemp weight == cyl weight / 20 (one cyl in a 20-cyl mean)', () => {
    const cyl = eff('F01', 'cylTemps[n]').weight;
    expectWeight(cyl / 20, eff('F01', 'exhaustMeanTemp').weight, 0.001); // 3.25
  });
  it('F01 → fuelRailPressure weight (faultDrop = count·15, ∂/∂count)', () => {
    const s = slope(count => fuelRailPressure_MTU8000(LOAD, RPM, count), 0, 1);
    expectWeight(s, eff('F01', 'fuelRailPressure').weight, 0.001); // −15
  });

  // ── F04 bearing overtemp: root factor = bearingFault (0–1) — now delivers the spec'd +45°C ──
  it('F04 → bearingTemps[i] weight (faultHeat = bearingFault·45)', () => {
    const s = slope(bf => bearingTemp_MTU8000(LOAD, RPM, OIL, P_HEALTHY, 0, bf), 0, 0.5);
    expectWeight(s, eff('F04', 'bearingTemps[i]').weight); // 45
    expect(eff('F04', 'bearingTemps[i]').weight).toBe(FAULT_MAX_EFFECTS.F04_bearing_temp_rise);
  });
});

describe('Gap guard — modeled:false effects carry weight 0 and are exactly the known gaps', () => {
  it('every modeled:false effect has weight 0', () => {
    for (const m of DEGRADATION_MODES) {
      for (const e of m.effects) {
        if (!e.modeled) expect(e.weight).toBe(0);
      }
    }
  });
  it('the known modeling gaps are exactly {F05→chargeAirTemp, F04→lubeLastBearingPressure, F04→crankcasePressure}', () => {
    const gaps = DEGRADATION_MODES.flatMap(m =>
      m.effects.filter(e => !e.modeled).map(e => `${m.id}:${e.sensorId}`),
    ).sort();
    expect(gaps).toEqual(
      ['F04:crankcasePressure', 'F04:lubeLastBearingPressure', 'F05:chargeAirTemp'].sort(),
    );
  });
});

describe('Combine / superposition — F03 + F05 both drive bearing temperature (item-3 combined fault)', () => {
  it('tickFaultsMTU8000([F03,F05]) sets both root factors', () => {
    const state = makeInitialPhysicsState(RPM, LOAD);
    const faults = [
      createFaultConfig('F03', { intensity: 100, speed: 'FAST' }),
      createFaultConfig('F05', { intensity: 100, speed: 'FAST' }),
    ];
    const { updatedState } = tickFaultsMTU8000(faults, state, 200); // 200s FAST → saturates
    expect(updatedState.lubeFault).toBeGreaterThan(0.99);       // F03 → lubeFault ≈ 1
    expect(updatedState.coolingEff).toBeCloseTo(0.75, 2);        // F05 → coolingEff floor 0.75
  });

  it('bearing rise = lube (pressure) contribution + cooling (oil) contribution, superposed', () => {
    // Root factors at full: lubeFault = 1, coolingEff = 0.75.
    const oilHealthy = lubeOilTemp_MTU8000(LOAD, RPM, 36, 1.0);
    const oilFouled = lubeOilTemp_MTU8000(LOAD, RPM, 36, 0.75);
    const pHealthy = lubeOilPressure_MTU8000(RPM, LOAD, oilHealthy, 0.15, 0);
    const pLube = lubeOilPressure_MTU8000(RPM, LOAD, oilHealthy, 0.65, 1); // filterDpTarget = 0.65 at lf=1

    const b = (oil: number, p: number) => bearingTemp_MTU8000(LOAD, RPM, oil, p, 10, 0);
    const healthy = b(oilHealthy, pHealthy);
    const lubeOnly = b(oilHealthy, pLube);       // F03 alone: pressure starvation
    const coolOnly = b(oilFouled, pHealthy);     // F05 alone: hotter oil
    const combined = b(oilFouled, pLube);        // both

    // Both faults raise the same bearing, and the combined rise is the sum (linear pathways).
    expect(lubeOnly).toBeGreaterThan(healthy + 10);
    expect(coolOnly).toBeGreaterThan(healthy);
    expect(combined).toBeGreaterThan(lubeOnly);
    expect(combined).toBeGreaterThan(coolOnly);
    const sumOfParts = (lubeOnly - healthy) + (coolOnly - healthy);
    expect(Math.abs((combined - healthy) - sumOfParts)).toBeLessThan(1.0);
  });

  it('a settled coolant tick reflects the inline F05 weight (drop·15)', () => {
    // The coolantTempAfterEngine weight lives inline in tickPhysics — validate it through the real tick.
    const settle = (coolingEff: number) => {
      let s = { ...makeInitialPhysicsState(RPM, LOAD), coolingEff };
      for (let i = 0; i < 500; i++) s = tickPhysics(s);
      return s.lagCoolantTemp;
    };
    const delta = settle(0.75) - settle(1.0); // drop of 0.25
    expectWeight(delta / 0.25, getMode('F05')!.effects.find(e => e.sensorId === 'coolantTempAfterEngine')!.weight, 0.05); // 15
  });
});

describe('Time / intensity model — severityAt ramp+cap, predictEffect magnitude', () => {
  it('severity ramps linearly then caps at intensity/100', () => {
    expect(severityAt('MEDIUM', 100, 50)).toBeCloseTo(0.3, 6);  // 0.003·100 = 0.3 < 0.5 (linear, uncapped)
    expect(severityAt('FAST', 1000, 100)).toBe(1.0);            // caps at 1.0
    expect(severityAt('FAST', 1000, 40)).toBeCloseTo(0.4, 6);   // caps at intensity/100
  });

  // ABSOLUTE MAGNITUDE, not just linearity. The previous version of this test asserted only that
  // predictEffect was proportional to severity/intensity — which a formula off by a constant factor
  // (rootMax missing, intensity double-counted) satisfies perfectly. These cases pin the number
  // against the physics partial, so the scale itself cannot drift.
  it('predictEffect(F05) magnitude == the physics deviation at full severity (rootMax applied once)', () => {
    const f05 = getMode('F05')!;
    const drop = FAULT_MAX_EFFECTS.F05_cooling_eff_drop; // 0.25 — coolingEff 1.0 → 0.75 at s=1.0

    // PRIMARY: physics is `targetCoolantTemp += (1−coolingEff)·15` ⇒ 0.25·15 = 3.75 °C.
    expect(predictEffect(f05, eff('F05', 'coolantTempAfterEngine'), 1.0)).toBeCloseTo(3.75, 6);
    // SECONDARY: `exhaustTemp_MTU8000 cooling = (1−ce)·35` ⇒ 0.25·35 = 8.75 °C.
    expect(predictEffect(f05, eff('F05', 'exhaustMeanTemp'), 1.0)).toBeCloseTo(8.75, 6);

    // Same numbers derived from the physics functions rather than hand-arithmetic.
    const exhaustDelta =
      exhaustTemp_MTU8000(LOAD, RPM, 1 - drop, 1.0) - exhaustTemp_MTU8000(LOAD, RPM, 1.0, 1.0);
    expect(predictEffect(f05, eff('F05', 'exhaustMeanTemp'), 1.0)).toBeCloseTo(exhaustDelta, 6);
    const sfocDelta = sfoc_MTU8000(LOAD, RPM, {}, 1 - drop) - sfoc_MTU8000(LOAD, RPM, {}, 1.0);
    expect(predictEffect(f05, eff('F05', 'sfoc'), 1.0)).toBeCloseTo(sfocDelta, 6);

    // Guards the specific regressions: dropping rootMax gives 15/35, re-applying intensity gives 1/4×.
    expect(predictEffect(f05, eff('F05', 'coolantTempAfterEngine'), 1.0)).not.toBeCloseTo(15, 1);
    expect(predictEffect(f05, eff('F05', 'exhaustMeanTemp'), 1.0)).not.toBeCloseTo(35, 1);
  });

  it('predictEffect magnitude matches the real fault tick for every root-factor span', () => {
    // F06 rootMax 0.40 (tcEff 1.0 → 0.60): the non-unity span that catches a missing rootMax.
    const tcDrop = FAULT_MAX_EFFECTS.F06_tc_eff_drop;
    const f06 = getMode('F06')!;
    const tcSpeedDelta = tcSpeed_MTU8000(RPM, LOAD, 1 - tcDrop) - tcSpeed_MTU8000(RPM, LOAD, 1.0);
    expectWeight(predictEffect(f06, eff('F06', 'tcSpeeds[i]'), 1.0), tcSpeedDelta, 0.02);
    expect(predictEffect(f06, eff('F06', 'exhaustBackPressure'), 1.0)).toBeCloseTo(0.4 * 40, 6); // 16 mbar

    // F01 rootMax 1.0: severity maps 1:1 onto injFault, so effect == weight at s=1.0.
    expect(predictEffect(getMode('F01')!, eff('F01', 'cylTemps[n]'), 1.0)).toBeCloseTo(65, 6);

    // The rootMax that predictEffect applies is exactly the excursion tickFaultsMTU8000 produces
    // at saturated severity — this is what makes `weight · severity · rootMax` the right composition.
    const { updatedState } = tickFaultsMTU8000(
      [
        createFaultConfig('F05', { intensity: 100, speed: 'FAST' }),
        createFaultConfig('F06', { intensity: 100, speed: 'FAST', targetTC: 0 }),
      ],
      makeInitialPhysicsState(RPM, LOAD),
      200, // FAST × 200 s → severity saturates at 1.0
    );
    expect(1 - updatedState.coolingEff).toBeCloseTo(ROOT_FACTORS.coolingEff.rootMax, 6); // 0.25
    expect(1 - updatedState.tcEffs[0]).toBeCloseTo(ROOT_FACTORS.tcEff.rootMax, 6);       // 0.40
  });

  it('predictEffect stays linear in severity (intensity enters only via the severity cap)', () => {
    const f05 = getMode('F05')!;
    const e = eff('F05', 'exhaustMeanTemp');
    expect(predictEffect(f05, e, 0.5)).toBeCloseTo(8.75 / 2, 6);
    // Intensity 50 caps severity at 0.5 — it must NOT also scale the effect a second time.
    expect(predictEffect(f05, e, severityAt('FAST', 1000, 50))).toBeCloseTo(8.75 / 2, 6);
    expect(predictEffect(f05, e, 0)).toBe(0);
  });
});
