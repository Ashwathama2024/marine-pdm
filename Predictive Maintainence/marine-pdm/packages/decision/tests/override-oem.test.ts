// packages/decision/tests/override-oem.test.ts
//
// Phase 5 exit criteria from OEM-CALIBRATION-GAP.md: no override fires on a healthy engine, and
// every fault can still reach the alarm it is named for.
//
// The first half guards a failure mode this phase created the opportunity for. Correcting the
// thresholds moved several of them MUCH closer to healthy — the last-bearing shutdown went from
// 2.0 bar to 5.3 — and those limits are RPM curves. Comparing a live reading to the rated-point
// value of a curve would fire an Emergency Stop on a perfectly healthy idling engine, so the
// healthy cases below are run at idle and part speed, not only at the cruise point.

import { describe, it, expect } from 'vitest';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { MTU8000_LIMITS, MTU8000_LIMIT_CURVES, oemCurve, oemScalar } from '@marine-pdm/shared';
import {
  lubeOilTemp_MTU8000,
  lubeOilPressure_MTU8000,
  bearingTemp_MTU8000,
  exhaustTemp_MTU8000,
  crankcasePressure_MTU8000,
  sprayOilTemp_MTU8000,
  tcSpeed_MTU8000,
  fuelRailPressure_MTU8000,
  LAST_BEARING_PRESSURE_RATIO,
  PISTON_COOLING_PRESSURE_RATIO,
} from '@marine-pdm/simulator';
import { applyMTU8000SafetyOverride, getMTU8000HardLimitViolations } from '../src/override-mtu8000';

/**
 * A healthy snapshot built from the real physics at an operating point — not hand-typed numbers,
 * so it cannot drift away from what the simulator actually emits.
 */
function healthy(load: number, rpm: number): EngineSnapshot {
  const oilTemp = lubeOilTemp_MTU8000(load, rpm);
  const gallery = lubeOilPressure_MTU8000(rpm, load, oilTemp, 0.15, 0);
  const exhaust = exhaustTemp_MTU8000(load, rpm, 1.0, 1.0);
  const snap: Record<string, unknown> = {
    timestamp: Date.now(), rpm, load,
    exhaustTemp: exhaust, exhaustMeanTemp: exhaust,
    lubeOilPressure: gallery,
    lubeLastBearingPressure: gallery * LAST_BEARING_PRESSURE_RATIO,
    pistonCoolingPress: gallery * PISTON_COOLING_PRESSURE_RATIO,
    lubeOilTemp: oilTemp,
    bearingTemps: Array.from({ length: 11 }, (_, i) =>
      bearingTemp_MTU8000(load, rpm, oilTemp, gallery, i, 0)),
    sprayOilTemps: Array.from({ length: 10 }, (_, t) =>
      sprayOilTemp_MTU8000(load, rpm, oilTemp, t, 0)),
    coolantTempAfterEngine: Math.max(50, 30 + (load / 100) * 55),
    jacketOutlet: Math.max(50, 30 + (load / 100) * 55),
    crankcasePressure: crankcasePressure_MTU8000(load, 0),
    fuelRailPressure: fuelRailPressure_MTU8000(load, rpm, 0),
    tcRPM: tcSpeed_MTU8000(rpm, load, 1.0),
    tcSpeeds: Array.from({ length: 4 }, () => tcSpeed_MTU8000(rpm, load, 1.0)),
  };
  return snap as unknown as EngineSnapshot;
}

// Idle through full power, roughly following the propeller law in between.
const OPERATING_POINTS: Array<[number, number]> = [
  [0, 400], [10, 500], [20, 600], [45, 800], [55, 900], [68, 1000], [85, 1150], [100, 1150],
];

describe('no safety override fires on a healthy engine', () => {
  it.each(OPERATING_POINTS)('at %i %% load / %i RPM', (load, rpm) => {
    const result = applyMTU8000SafetyOverride(10, healthy(load, rpm));
    expect(result.triggered, `fired at ${load}% / ${rpm} RPM`).toBeNull();
    expect(result.risk).toBe(10);   // the incoming risk is passed through untouched
  });

  it.each(OPERATING_POINTS)('reports no hard-limit violation at %i %% / %i RPM', (load, rpm) => {
    expect(getMTU8000HardLimitViolations(healthy(load, rpm))).toEqual([]);
  });

  it('would have fired at idle if the curve limits were read at the rated point', () => {
    // The bug this phase could easily have introduced, pinned so the shape of it is on record.
    // A healthy engine at 400 RPM sits at ~3.11 bar on the last bearing. Against curve 4 AT 400
    // RPM (2.07 bar) that is fine; against curve 4 at RATED (5.3 bar) it is an Emergency Stop.
    const idle = healthy(0, 400);
    const live = idle['lubeLastBearingPressure'] as number;

    expect(live).toBeGreaterThan(MTU8000_LIMIT_CURVES.lastBearingPressSS(400));  // correct: safe
    expect(live).toBeLessThan(MTU8000_LIMITS.lubeOil.pressure_last_bearing_min); // rated scalar: would trip
    expect(applyMTU8000SafetyOverride(0, idle).triggered).toBeNull();
  });
});

describe('the corrected limits are the OEM ones', () => {
  it('reads every trip threshold from ZNG00028788', () => {
    expect(MTU8000_LIMITS.lubeOil.pressure_last_bearing_min).toBe(oemCurve(4, 1150));  // 5.3
    expect(MTU8000_LIMITS.lubeOil.piston_cooling_min).toBe(oemCurve(1, 1150));         // 5.2
    expect(MTU8000_LIMITS.lubeOil.bearing_temp_hi).toBe(oemScalar('bearingTempLim1')); // 115
    expect(MTU8000_LIMITS.lubeOil.bearing_temp_max).toBe(oemScalar('bearingTempLim2'));// 120
    expect(MTU8000_LIMITS.cooling.coolant_temp_ss).toBe(oemScalar('coolantTempLim2')); // 97
    expect(MTU8000_LIMITS.exhaust.mean_hi).toBe(oemCurve(10, 1150));                   // 700
    expect(MTU8000_LIMITS.crankcase.pressure_hi).toBe(oemCurve(9, 1150));              // 27
    expect(MTU8000_LIMITS.cooling.raw_water_pressure_min).toBe(oemCurve(8, 1150));     // 1.8
    expect(MTU8000_LIMITS.fuel.filter_dp_warn).toBe(oemCurve(7, 1150));                // 1.0
    expect(MTU8000_LIMITS.cooling.coolant_pressure_min).toBe(oemCurve(0, 1150));       // 4.1
  });

  it('is not the pre-correction envelope', () => {
    // The five Class B values the gap document recorded, as a revert guard.
    expect(MTU8000_LIMITS.exhaust.mean_hi).not.toBe(460);
    expect(MTU8000_LIMITS.crankcase.pressure_hi).not.toBe(5);
    expect(MTU8000_LIMITS.cooling.raw_water_pressure_min).not.toBe(1.0);
    expect(MTU8000_LIMITS.fuel.filter_dp_warn).not.toBe(0.8);
    expect(MTU8000_LIMITS.lubeOil.pressure_last_bearing_min).not.toBe(2.0);
    expect(MTU8000_LIMITS.lubeOil.piston_cooling_min).not.toBe(4.0);
  });
});

describe('each trip still fires when the fault that owns it is severe', () => {
  // The other half of the audit. A limit moved toward healthy makes a fault MORE detectable; a
  // limit moved away can make it undetectable, which is how F08 nearly ended up.
  const rated = () => healthy(85, 1150);

  it('SS P-Oil Last Bearing fires on an F03-style pressure collapse', () => {
    const snap = rated() as unknown as Record<string, unknown>;
    const oilTemp = lubeOilTemp_MTU8000(85, 1150);
    const gallery = lubeOilPressure_MTU8000(1150, 85, oilTemp, 0.65, 1);   // F03 at full severity
    snap['lubeLastBearingPressure'] = gallery * LAST_BEARING_PRESSURE_RATIO;
    snap['pistonCoolingPress'] = gallery * PISTON_COOLING_PRESSURE_RATIO - 0.5;

    const r = applyMTU8000SafetyOverride(0, snap as unknown as EngineSnapshot);
    expect(r.risk).toBe(100);
    expect(r.triggered).toMatch(/SS P-Oil Last Bearing/);
  });

  it('SS P-Oil Piston Cooling fires when only piston cooling collapses', () => {
    const snap = rated() as unknown as Record<string, unknown>;
    snap['pistonCoolingPress'] = oemCurve(2, 1150) - 0.1;    // just under the shutdown curve
    const r = applyMTU8000SafetyOverride(0, snap as unknown as EngineSnapshot);
    expect(r.risk).toBe(100);
    expect(r.triggered).toMatch(/SS P-Oil Piston Cooling/);
  });

  it('SS T-Bearing fires on an F04-style single-bearing overtemperature', () => {
    const snap = rated() as unknown as Record<string, unknown>;
    const oilTemp = lubeOilTemp_MTU8000(85, 1150);
    const gallery = lubeOilPressure_MTU8000(1150, 85, oilTemp, 0.15, 0);
    const temps = (snap['bearingTemps'] as number[]).slice();
    temps[10] = bearingTemp_MTU8000(85, 1150, oilTemp, gallery, 10, 1);   // F04 at full severity
    snap['bearingTemps'] = temps;

    const r = applyMTU8000SafetyOverride(0, snap as unknown as EngineSnapshot);
    expect(r.risk).toBe(100);
    expect(r.triggered).toMatch(/SS T-Bearing 11/);
  });

  it('SS T-Coolant fires on an F05-style cooler fouling', () => {
    const snap = rated() as unknown as Record<string, unknown>;
    snap['coolantTempAfterEngine'] = oemScalar('coolantTempLim2') + 1;
    const r = applyMTU8000SafetyOverride(0, snap as unknown as EngineSnapshot);
    expect(r.risk).toBe(100);
    expect(r.triggered).toMatch(/SS T-Coolant/);
  });

  it('SS T-Splash Oil fires on a single hot crank throw', () => {
    const snap = rated() as unknown as Record<string, unknown>;
    const oilTemp = lubeOilTemp_MTU8000(85, 1150);
    snap['sprayOilTemps'] = Array.from({ length: 10 }, (_, t) =>
      sprayOilTemp_MTU8000(85, 1150, oilTemp, t, t === 4 ? 1 : 0));
    const r = applyMTU8000SafetyOverride(0, snap as unknown as EngineSnapshot);
    expect(r.risk).toBe(100);
    expect(r.triggered).toMatch(/SS T-Splash Oil B5/);
  });

  it('HI T-Exhaust Mean is NOT reachable by any modelled fault, and that is faithful', () => {
    // Recorded as a decision, not left as a surprise. The OEM limit is 700 °C at rated against a
    // healthy 440 °C; F02 at full severity (ten cylinders at +55 °C) lifts the mean to ~472 °C.
    // MTU catches that fault with its RELATIVE limits — single-cylinder UL curve 12, and the
    // mean's own 20 °C offset step MDEC 51,03 — which in this app is the job of the deviation
    // scoring and patterns P01/P02/P09, not of this absolute override.
    const snap = rated() as unknown as Record<string, unknown>;
    const f02Mean = exhaustTemp_MTU8000(85, 1150, 1.0, 1.0) + (55 * 10) / 20;
    snap['exhaustMeanTemp'] = f02Mean;

    expect(f02Mean).toBeLessThan(MTU8000_LIMITS.exhaust.mean_hi);
    expect(applyMTU8000SafetyOverride(0, snap as unknown as EngineSnapshot).triggered).toBeNull();
    // It does still fire if the mean genuinely reaches the coded limit.
    snap['exhaustMeanTemp'] = MTU8000_LIMITS.exhaust.mean_hi + 1;
    expect(applyMTU8000SafetyOverride(0, snap as unknown as EngineSnapshot).triggered)
      .toMatch(/HI T-Exhaust Mean/);
  });
});
