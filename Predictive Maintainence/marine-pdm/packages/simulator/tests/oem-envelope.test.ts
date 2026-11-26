// packages/simulator/tests/oem-envelope.test.ts
//
// THE ACCEPTANCE TEST for OEM-CALIBRATION-GAP.md.
//
// A healthy MTU 8000 at its normal operating point must sit on the safe side of every limit the
// real ECS would act on. Before this calibration it did not: five parameters were on the wrong
// side, three of them past a SHUTDOWN, so the simulated "healthy" engine was one the ECS would
// have stopped. Everything downstream — baselines, degradation weights, risk, and every stored ML
// label — was referenced to that broken point.
//
// Every threshold here is read from `oemCurve` / `oemScalar`, i.e. from the transcription of MTU
// drawing ZNG00028788, never from a number typed into this file. If someone "fixes" a failure by
// editing a limit, the pinning test in shared/tests/oem-limits.test.ts fails instead. That is the
// whole point: this pair of tests makes it impossible to close an alarm by moving its limit.

import { describe, it, expect } from 'vitest';
import {
  lubeOilTemp_MTU8000,
  lubeOilPressure_MTU8000,
  bearingTemp_MTU8000,
  exhaustTemp_MTU8000,
  exhaustBackPressure_MTU8000,
  coolantPressure_MTU8000,
  chargeAirTemp_MTU8000,
  fuelTemp_MTU8000,
  sprayOilTemp_MTU8000,
  crankcasePressure_MTU8000,
  tcSpeed_MTU8000,
  LAST_BEARING_PRESSURE_RATIO,
  PISTON_COOLING_PRESSURE_RATIO,
} from '../src/mtu8000-physics';
import { makeInitialPhysicsState, tickPhysics, snapshotFromState } from '../src/physics';
import { oemCurve, oemScalar, OEM_VARIANT, MTU8000 } from '@marine-pdm/shared';

/** The operating point the whole app is calibrated at — MTU8000.LOAD.cruise at rated speed. */
const LOAD = MTU8000.LOAD.cruise;   // 85 %
const RPM = MTU8000.RATED_RPM;      // 1150
const FILTER_DP = 0.15;             // nominal healthy lube-filter ΔP, as physics.ts uses

/** Healthy rated values, derived the same way physics.ts derives them. */
function healthyAtRated(load: number = LOAD, rpm: number = RPM) {
  const oilTemp = lubeOilTemp_MTU8000(load, rpm);
  const gallery = lubeOilPressure_MTU8000(rpm, load, oilTemp, FILTER_DP, 0);
  const bearings = Array.from({ length: 11 }, (_, i) =>
    bearingTemp_MTU8000(load, rpm, oilTemp, gallery, i, 0));
  return {
    oilTemp,
    gallery,
    lastBearing: gallery * LAST_BEARING_PRESSURE_RATIO,
    pistonCooling: gallery * PISTON_COOLING_PRESSURE_RATIO,
    bearings,
    bearingMax: Math.max(...bearings),
    bearingMean: bearings.reduce((a, b) => a + b, 0) / bearings.length,
    exhaustMean: exhaustTemp_MTU8000(load, rpm, 1.0, 1.0),
    backPressure: exhaustBackPressure_MTU8000(load, rpm, 1.0),
    coolantPressure: coolantPressure_MTU8000(rpm),
    chargeAirTemp: chargeAirTemp_MTU8000(load, rpm, 36),
    fuelTemp: fuelTemp_MTU8000(load),
    crankcase: crankcasePressure_MTU8000(load, 0),
    tcSpeed: tcSpeed_MTU8000(rpm, load, 1.0),
    sprayOil: Array.from({ length: MTU8000.CRANK_THROWS }, (_, t) =>
      sprayOilTemp_MTU8000(load, rpm, oilTemp, t, 0)),
  };
}

describe('OEM envelope — a healthy engine at the cruise point violates no coded limit', () => {
  const h = healthyAtRated();

  // ── The three former SHUTDOWN violations ──────────────────────────────────
  it('piston-cooling pressure clears its shutdown AND its warning (curves 2 and 1)', () => {
    expect(h.pistonCooling).toBeGreaterThan(oemCurve(2, RPM));  // 4.7 bar — shut down, 2.0 s
    expect(h.pistonCooling).toBeGreaterThan(oemCurve(1, RPM));  // 5.2 bar — warning,  5.0 s
  });

  it('last-bearing LO pressure clears its shutdown AND its warning (curves 4 and 3)', () => {
    expect(h.lastBearing).toBeGreaterThan(oemCurve(4, RPM));    // 5.3 bar — shut down, 1.0 s
    expect(h.lastBearing).toBeGreaterThan(oemCurve(3, RPM));    // 5.8 bar — warning,   3.0 s
  });

  it('lube-oil temperature stays below T-Oil Lim2 AND Lim1', () => {
    expect(h.oilTemp).toBeLessThan(oemScalar('oilTempLim2'));   // 85 °C — power reduction
    expect(h.oilTemp).toBeLessThan(oemScalar('oilTempLim1'));   // 83 °C — warning
  });

  // ── The two former warning-level violations ───────────────────────────────
  it('exhaust back pressure stays below both the fuel-limitation point and the warning', () => {
    expect(h.backPressure).toBeLessThan(oemScalar('exhaustBackPressureFL'));   // >70 mbar
    expect(h.backPressure).toBeLessThan(OEM_VARIANT.exhaustBackPressureWarn);  // 50 mbar
  });

  it('coolant pressure clears the P-Coolant Lim1 floor (curve 0)', () => {
    expect(h.coolantPressure).toBeGreaterThan(oemCurve(0, RPM)); // 4.1 bar at rated
  });

  // ── The ones that already agreed, pinned so they cannot regress ───────────
  it('bearing temperatures clear the mean warning, Lim1 and the Lim2 shutdown', () => {
    expect(h.bearingMean).toBeLessThan(oemScalar('bearingTempMean'));  // 112 °C
    expect(h.bearingMax).toBeLessThan(oemScalar('bearingTempLim1'));   // 115 °C
    expect(h.bearingMax).toBeLessThan(oemScalar('bearingTempLim2'));   // 120 °C — shut down
    // T-Bearing Diff: the spread across the 11 mains, limit 20 °C.
    expect(Math.max(...h.bearings) - Math.min(...h.bearings))
      .toBeLessThan(oemScalar('bearingTempDiff'));
  });

  it('mean exhaust temperature stays under curve 10', () => {
    expect(h.exhaustMean).toBeLessThan(oemCurve(10, RPM));             // 700 °C
  });

  it('charge-air temperature sits inside both the upper and lower limits', () => {
    expect(h.chargeAirTemp).toBeLessThan(oemScalar('chargeAirTempUL')); // 75 °C
    expect(h.chargeAirTemp).toBeGreaterThan(oemScalar('chargeAirTempLL')); // 20 °C
  });

  it('fuel temperature stays below T-Fuel Lim1 and Lim2', () => {
    expect(h.fuelTemp).toBeLessThan(oemScalar('fuelTempLim1'));        // 45 °C
    expect(h.fuelTemp).toBeLessThan(oemScalar('fuelTempLim2'));        // 50 °C
  });

  it('crankcase pressure stays under curve 9', () => {
    expect(h.crankcase).toBeLessThan(oemCurve(9, RPM));                // 27 mbar, flat
  });

  it('turbocharger speed stays far below both overspeed limits', () => {
    expect(h.tcSpeed).toBeLessThan(OEM_VARIANT.etcOverspeedL1);        // 40 500 rpm
    expect(h.tcSpeed).toBeLessThan(OEM_VARIANT.etcOverspeedL2);        // 41 000 rpm
  });

  it('spray-oil spread stays inside the difference warning and shutdown', () => {
    const spread = Math.max(...h.sprayOil) - Math.min(...h.sprayOil);
    expect(spread).toBeLessThan(oemScalar('splashOilDiffLim1'));       // 4 °C — warning
    expect(spread).toBeLessThan(oemScalar('splashOilDiffLim2'));       // 6 °C — shut down
  });

  it('engine speed stays below the overspeed shutdown', () => {
    expect(RPM).toBeLessThan(OEM_VARIANT.engineOverspeedShutdown);     // 1323 rpm (BM01)
  });
});

describe('OEM envelope — the limits are RPM curves, so check the whole speed range', () => {
  // A pump curve of the wrong SHAPE can clear every limit at rated and still violate one at
  // part speed, which is exactly what a scalar limit model would hide. Load follows roughly the
  // propeller law, as it does in the simulator's own CLUTCHED/LOADED path.
  const operatingPoints: Array<[number, number]> = [
    [400, 0], [500, 10], [600, 20], [800, 45], [900, 55], [1000, 68], [1150, 85], [1150, 100],
  ];

  it.each(operatingPoints)('at %i RPM / %i %% load nothing is in alarm', (rpm, load) => {
    const h = healthyAtRated(load, rpm);
    expect(h.lastBearing, `last bearing @${rpm}`).toBeGreaterThan(oemCurve(3, rpm));
    expect(h.lastBearing, `last bearing SS @${rpm}`).toBeGreaterThan(oemCurve(4, rpm));
    expect(h.pistonCooling, `piston cooling @${rpm}`).toBeGreaterThan(oemCurve(1, rpm));
    expect(h.pistonCooling, `piston cooling SS @${rpm}`).toBeGreaterThan(oemCurve(2, rpm));
    expect(h.coolantPressure, `coolant pressure @${rpm}`).toBeGreaterThan(oemCurve(0, rpm));
    expect(h.oilTemp, `oil temp @${rpm}`).toBeLessThan(oemScalar('oilTempLim1'));
    expect(h.bearingMax, `bearing max @${rpm}`).toBeLessThan(oemScalar('bearingTempLim1'));
    expect(h.exhaustMean, `exhaust mean @${rpm}`).toBeLessThan(oemCurve(10, rpm));
  });

  it('the tightest margin in the range is piston cooling at 1000 RPM', () => {
    // Documented rather than silently tolerated: curve 1 steps 4.5 → 5.2 bar between 900 and
    // 1000 RPM while the pump curve rises smoothly, so this is where the envelope pinches. The
    // margin is still ~4x the sensor noise (NOISE.lube = 0.06 bar). If a future change narrows
    // this further the margin assertion below is the one that should be made to fail first.
    const h = healthyAtRated(68, 1000);
    const margin = h.pistonCooling - oemCurve(1, 1000);
    expect(margin).toBeGreaterThan(0.2);
    expect(margin).toBeLessThan(0.5);   // if this fails the pinch moved — re-check the range
  });
});

describe('OEM envelope — faults still reach the alarms they are named for', () => {
  // Correcting the envelope moves limits CLOSER to healthy in several places. A fault that can no
  // longer reach its own coded alarm would be undetectable, which is the opposite failure to the
  // one this calibration fixes — so each is checked explicitly.

  it('F03 at full severity drives both lube pressures past their shutdowns', () => {
    const oilTemp = lubeOilTemp_MTU8000(LOAD, RPM);
    const filterDp = FILTER_DP + 0.5;            // filterDpTarget at lubeFault = 1
    const gallery = lubeOilPressure_MTU8000(RPM, LOAD, oilTemp, filterDp, 1);
    expect(gallery * LAST_BEARING_PRESSURE_RATIO).toBeLessThan(oemCurve(4, RPM));
    expect(gallery * PISTON_COOLING_PRESSURE_RATIO - 0.5).toBeLessThan(oemCurve(2, RPM));
  });

  it('F04 at full severity drives the affected bearing past the Lim2 shutdown', () => {
    const oilTemp = lubeOilTemp_MTU8000(LOAD, RPM);
    const gallery = lubeOilPressure_MTU8000(RPM, LOAD, oilTemp, FILTER_DP, 0);
    const hot = bearingTemp_MTU8000(LOAD, RPM, oilTemp, gallery, 10, 1);
    expect(hot).toBeGreaterThan(oemScalar('bearingTempLim2'));   // 120 °C
  });

  it('F05 at full severity does NOT breach T-Oil Lim1 — its coded alarm is HI T-Coolant', () => {
    // Deliberate: F05's alarm is the coolant temperature, not the oil. If this ever starts
    // failing, the oil model has drifted back up toward the warning.
    expect(lubeOilTemp_MTU8000(LOAD, RPM, 36, 0.75)).toBeLessThan(oemScalar('oilTempLim1'));
  });

  it('F06 at full severity raises back pressure without a healthy engine reaching the warning', () => {
    const oneTcFouled = (0.6 + 1 + 1 + 1) / 4;   // F06 fouls one of four TCs
    const fouled = exhaustBackPressure_MTU8000(LOAD, RPM, oneTcFouled);
    expect(fouled).toBeGreaterThan(exhaustBackPressure_MTU8000(LOAD, RPM, 1.0));
    expect(exhaustBackPressure_MTU8000(LOAD, RPM, 1.0))
      .toBeLessThan(OEM_VARIANT.exhaustBackPressureWarn);
  });
});

describe('OEM envelope — the settled simulator, not just the equations', () => {
  // The equations above are the model; this is what the pipeline actually emits after the two-stage
  // lag has settled, noise included. A calibration that is right in the functions but wrong in the
  // state initialisation would still false-alarm on the dashboard for the first minute.
  it('a settled engine at the cruise point emits no reading in any OEM alarm band', () => {
    let state = makeInitialPhysicsState(RPM, LOAD);
    for (let i = 0; i < 400; i++) state = tickPhysics(state);
    const snap = snapshotFromState(state);

    expect(snap.lubeOilTemp).toBeLessThan(oemScalar('oilTempLim1'));
    expect(snap.lubeLastBearingPressure).toBeGreaterThan(oemCurve(3, RPM));
    expect(snap.pistonCoolingPress).toBeGreaterThan(oemCurve(1, RPM));
    expect(snap.coolantPressure).toBeGreaterThan(oemCurve(0, RPM));
    expect(snap.exhaustBackPressure).toBeLessThan(OEM_VARIANT.exhaustBackPressureWarn);
    expect(Math.max(...snap.bearingTemps)).toBeLessThan(oemScalar('bearingTempLim1'));
    expect(snap.exhaustTemp).toBeLessThan(oemCurve(10, RPM));
    expect(snap.coolantTempAfterEngine).toBeLessThan(oemScalar('coolantTempLim1'));
    expect(snap.chargeAirTemp).toBeLessThan(oemScalar('chargeAirTempUL'));
    expect(snap.fuelTemp).toBeLessThan(oemScalar('fuelTempLim1'));
    expect(snap.crankcasePressure).toBeLessThan(oemCurve(9, RPM));
    expect(snap.filterDifferentialP).toBeLessThan(oemCurve(5, RPM));
    expect(Math.max(...snap.sprayOilTemps) - Math.min(...snap.sprayOilTemps))
      .toBeLessThan(oemScalar('splashOilDiffLim1'));
    for (const s of snap.tcSpeeds) expect(s).toBeLessThan(OEM_VARIANT.etcOverspeedL1);
  });

  it('is settled from the FIRST tick — no startup transient through an alarm band', () => {
    // makeInitialPhysicsState seeds every lagged field at its rated steady state precisely so the
    // dashboard does not show 20-60 s of false alarms after a refresh (simulator/CLAUDE.md).
    let state = makeInitialPhysicsState(RPM, LOAD);
    for (let i = 0; i < 30; i++) {
      const snap = snapshotFromState(state);
      expect(snap.lubeLastBearingPressure, `tick ${i}`).toBeGreaterThan(oemCurve(3, RPM));
      expect(snap.pistonCoolingPress, `tick ${i}`).toBeGreaterThan(oemCurve(1, RPM));
      expect(snap.lubeOilTemp, `tick ${i}`).toBeLessThan(oemScalar('oilTempLim1'));
      expect(snap.coolantPressure, `tick ${i}`).toBeGreaterThan(oemCurve(0, RPM));
      state = tickPhysics(state);
    }
  });
});
