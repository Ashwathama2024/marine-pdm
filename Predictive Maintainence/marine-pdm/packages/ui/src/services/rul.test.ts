// Analytic RUL — the training set's ground-truth label, so it gets hand-worked arithmetic rather than
// snapshot assertions. Every input comes from the real constants (DEGRADATION_MODES weights,
// FAULT_MAX_EFFECTS, FAULT_GROWTH_RATES, MTU8000_LIMITS), so a drift in any of them fails here.

import { describe, it, expect } from 'vitest';
import { MTU8000, MTU8000_LIMITS, oemCurve } from '@marine-pdm/shared';
import { lubeOilPressure_MTU8000, lubeOilTemp_MTU8000 } from '@marine-pdm/simulator';
import { DEGRADATION_MODES, ROOT_FACTORS, GROWTH_RATES, FAULT_MAX_EFFECTS, createFaultConfig } from '@marine-pdm/simulator';
import type { FaultConfig } from '@marine-pdm/simulator';
import { analyticRul, baseFaultId } from './rul';

const fault = (id: string, over: Partial<FaultConfig> = {}): FaultConfig =>
  createFaultConfig(id, { intensity: 80, speed: 'MEDIUM', currentSeverity: 0, ...over });

describe('baseFaultId', () => {
  it('strips the per-instance suffix', () => {
    expect(baseFaultId('F01_cyl_7')).toBe('F01');
    expect(baseFaultId('F05')).toBe('F05');
  });
});

describe('analyticRul — F05 HT-cooler fouling → coolant temp', () => {
  // The constants this case is built on, asserted first so a drift is named rather than inferred
  // from a failed arithmetic expectation further down.
  const weight = DEGRADATION_MODES.find(m => m.id === 'F05')!
    .effects.find(e => e.sensorId === 'coolantTempAfterEngine')!.weight;
  const rootMax = ROOT_FACTORS.coolingEff.rootMax;

  it('rests on the expected weight / rootMax / threshold', () => {
    expect(weight).toBe(15);                                            // °C per Δeff
    expect(rootMax).toBe(FAULT_MAX_EFFECTS.F05_cooling_eff_drop);        // 0.25
    expect(MTU8000_LIMITS.cooling.coolant_temp_after_engine_max).toBe(95);
    expect(GROWTH_RATES.MEDIUM).toBe(0.003);                             // severity/s
  });

  // perSeverity = weight × rootMax = 15 × 0.25 = 3.75 °C per unit severity.
  // healthy 92.5 → margin 2.5 °C → severityAtCross = 2.5 / 3.75 = 0.66667
  // MEDIUM 0.003/s from severity 0 → 222.22 s → 3.7037 min
  it('solves the crossing exactly', () => {
    const r = analyticRul([fault('F05', { intensity: 80 })], 'jacket', 92.5);
    expect(r.reason).toBe('crosses');
    expect(r.faultId).toBe('F05');
    expect(r.severityAtCross).toBeCloseTo(2.5 / 3.75, 10);
    expect(r.minutes).toBeCloseTo((2.5 / 3.75) / 0.003 / 60, 6);
    expect(r.minutes).toBeCloseTo(3.7037, 3);
  });

  it('discounts severity already accumulated', () => {
    // Half way to the crossing severity → half the remaining time.
    const r = analyticRul([fault('F05', { intensity: 80, currentSeverity: (2.5 / 3.75) / 2 })], 'jacket', 92.5);
    expect(r.minutes).toBeCloseTo(3.7037 / 2, 3);
  });

  it('scales with growth rate — SLOW is 3.75x MEDIUM', () => {
    const med = analyticRul([fault('F05', { speed: 'MEDIUM' })], 'jacket', 92.5).minutes!;
    const slow = analyticRul([fault('F05', { speed: 'SLOW' })], 'jacket', 92.5).minutes!;
    expect(slow / med).toBeCloseTo(GROWTH_RATES.MEDIUM / GROWTH_RATES.SLOW, 6);
  });

  it('returns 0 once accumulated severity is already past the crossing', () => {
    // currentSeverity 0.75 > severityAtCross 0.667 → the deviation has already taken it into the band.
    const r = analyticRul([fault('F05', { intensity: 80, currentSeverity: 0.75 })], 'jacket', 92.5);
    expect(r.reason).toBe('crosses');
    expect(r.minutes).toBe(0);
  });

  it('returns 0 when the fault-free baseline is itself inside the band', () => {
    // Degenerate operating point: in alarm with no fault at all, so no fault is credited.
    const r = analyticRul([fault('F05')], 'jacket', 96);   // above the 95 °C alarm before any fault
    expect(r.reason).toBe('already-breached');
    expect(r.minutes).toBe(0);
    expect(r.faultId).toBeNull();
  });

  // ── The never-crosses branch ────────────────────────────────────────────────────
  it('returns null when the intensity cap sits below the crossing severity', () => {
    // severityAtCross 0.6667 > cap 0.60 → the fault saturates before reaching the band.
    const r = analyticRul([fault('F05', { intensity: 60 })], 'jacket', 92.5);
    expect(r.minutes).toBeNull();
    expect(r.reason).toBe('capped-below-threshold');
    expect(r.severityAtCross).toBeCloseTo(2.5 / 3.75, 10);
  });

  it('returns null from a realistic healthy coolant temp — F05 alone cannot reach 95 C', () => {
    // Physically important: 3.75 °C is F05's entire authority over coolant temp at full severity, so
    // from a rated ~88 °C it can never trip HI T-Coolant on its own. rulTrue must say so rather than
    // inventing a horizon.
    const r = analyticRul([fault('F05', { intensity: 100 })], 'jacket', 88);
    expect(r.minutes).toBeNull();
    expect(r.reason).toBe('capped-below-threshold');
  });
});

describe('analyticRul — direction and coverage guards', () => {
  it('rules out a fault that moves the sensor away from the band', () => {
    // F06 TC fouling SLOWS the turbocharger (weight -28000 RPM/Δeff), so it can never cause the
    // overspeed alarm that governs tcSpeed.
    const r = analyticRul([fault('F06', { targetTC: 0 })], 'tcSpeed', 24000);
    expect(r.minutes).toBeNull();
    expect(r.reason).toBe('wrong-direction');
  });

  it('returns no-fault when nothing is injected', () => {
    expect(analyticRul([], 'jacket', 92.5).reason).toBe('no-fault');
  });

  it('returns null (not 0) on a healthy engine whose baseline is outside the rated band', () => {
    // Regression guard. MTU8000_LIMITS are RATED-point limits, so at idle (400 RPM / 0 % load) the
    // healthy LO gallery pressure sits below pressure_before_filter_min. Checking "already in band"
    // before "any fault active" emitted rulTrue_lube = 0 for every healthy idle row, which would
    // teach a regressor that a healthy idling engine has zero life left.
    const idleLube = MTU8000_LIMITS.lubeOil.pressure_before_filter_min - 1;
    const r = analyticRul([], 'lube', idleLube);
    expect(r.minutes).toBeNull();
    expect(r.reason).toBe('no-fault');
  });

  it('ignores inactive faults', () => {
    expect(analyticRul([fault('F05', { active: false })], 'jacket', 92.5).reason).toBe('no-fault');
  });

  it('returns no-band for a metric with no coded alarm band', () => {
    expect(analyticRul([fault('F05')], 'notAMetric', 0).reason).toBe('no-band');
  });

  it('returns not-driven when no active fault touches the metric', () => {
    // F04 is a bearing fault — it has no modelled effect on coolant temp.
    const r = analyticRul([fault('F04', { targetBearing: 3 })], 'jacket', 92.5);
    expect(r.reason).toBe('not-driven');
    expect(r.minutes).toBeNull();
  });

  it('picks the soonest crossing across simultaneous faults', () => {
    const slow = fault('F05', { intensity: 80, speed: 'SLOW' });
    const fast = fault('F05', { intensity: 80, speed: 'FAST' });
    // Same fault id, so only one survives the "most developed" pick — use the list order to prove the
    // minimum is taken rather than the first match.
    const r = analyticRul([slow, fast], 'jacket', 92.5);
    expect(r.minutes).toBeCloseTo((2.5 / 3.75) / GROWTH_RATES.FAST / 60, 6);
  });

  it('handles a per-cylinder fault id via its base mode', () => {
    // The label carries the '_cyl_N' suffix; the mode lookup must not.
    const r = analyticRul([fault('F01_cyl_3', { targetCyls: [3], intensity: 100 })], 'exhaust', 440);
    expect(r.faultId).toBe('F01_cyl_3');
    // Not 'crosses': see the effect-selection test below.
    expect(r.reason).toBe('capped-below-threshold');
  });

  it('measures a fault against the effect matching the OBSERVED series, not its largest weight', () => {
    // ME.ExhaustTemp records the 20-cylinder MEAN. F01's authority over the mean is 65/20 = 3.25 °C,
    // not the 65 °C it applies to the one affected cylinder. Selecting by largest weight would give
    // severityAtCross = 20/65 = 0.31 → a ~1.7 min RUL that the mean signal will never actually reach.
    const meanWeight = DEGRADATION_MODES.find(m => m.id === 'F01')!
      .effects.find(e => e.sensorId === 'exhaustMeanTemp')!.weight;
    expect(meanWeight).toBeCloseTo(65 / 20, 10);

    const r = analyticRul([fault('F01_cyl_3', { targetCyls: [3], intensity: 100 })], 'exhaust', 440);
    // Margin to the alarm over 3.25 °C of authority. Derived from the limit rather than typed:
    // this read `20 / 3.25` while exhaust.mean_hi was an invented 460 °C, and Phase 5 restored it
    // to the OEM 700 °C (curve 10), so the margin is now 260 °C. Either way the point stands —
    // the mean is far past the 1.0 severity cap, so F01 never trips it through the mean series.
    const margin = MTU8000_LIMITS.exhaust.mean_hi - 440;
    expect(r.severityAtCross).toBeCloseTo(margin / 3.25, 6);
    expect(r.minutes).toBeNull();
  });
});

describe('analyticRul — F03 lube pressure loss (the reachable alarm band)', () => {
  // The one single-fault case in this model that can actually trip a forecastable band, so it is
  // the case the browser end-to-end check uses.
  //
  //   severityAtCross = (alarm − healthy) / weight,  weight −3.8 bar/severity (rootMax 1.0)
  //   minutes = severityAtCross / GROWTH_RATE[MEDIUM] / 60
  //
  // Both inputs moved in OEM-CALIBRATION-GAP.md Phase 2/5 — the healthy gallery from 6.44 to
  // 7.16 bar, and the gallery alarm from a flat invented 5.5 bar to curve 3 over the last-bearing
  // takeoff ratio (6.30 at rated). They are now DERIVED here rather than typed, because this
  // block previously hardcoded 6.44, 5.5, 0.24737 and 1.374 in four places and every one of them
  // went stale together.
  const HEALTHY_GALLERY = lubeOilPressure_MTU8000(1150, 85, lubeOilTemp_MTU8000(85, 1150), 0.15, 0);
  const GALLERY_ALARM = MTU8000_LIMITS.lubeOil.pressure_before_filter_min;
  const CROSS = (GALLERY_ALARM - HEALTHY_GALLERY) / -3.8;

  it('rests on the expected weight and threshold', () => {
    const w = DEGRADATION_MODES.find(m => m.id === 'F03')!
      .effects.find(e => e.sensorId === 'lubeOilPressure')!.weight;
    expect(w).toBe(-3.8);
    expect(ROOT_FACTORS.lubeFault.rootMax).toBe(1.0);
    // The alarm is the gallery pressure at which the last bearing reaches its coded warning.
    expect(GALLERY_ALARM).toBeCloseTo(oemCurve(3, 1150) / MTU8000.LUBE_CIRCUIT.lastBearingRatio, 10);
    expect(GALLERY_ALARM).toBeLessThan(HEALTHY_GALLERY);   // healthy clears it, as it must
  });

  it('solves a falling-pressure crossing', () => {
    const r = analyticRul([fault('F03', { intensity: 80 })], 'lube', HEALTHY_GALLERY);
    expect(r.reason).toBe('crosses');
    expect(r.severityAtCross).toBeCloseTo(CROSS, 8);
    expect(r.minutes).toBeCloseTo(CROSS / 0.003 / 60, 3);
  });

  it('is unreachable when intensity caps below the crossing severity', () => {
    // Intensity capped an order below the crossing severity, whatever that severity now is.
    const capPct = Math.floor(CROSS * 100) - 5;
    const r = analyticRul([fault('F03', { intensity: capPct })], 'lube', HEALTHY_GALLERY);
    expect(r.reason).toBe('capped-below-threshold');
    expect(r.minutes).toBeNull();
  });
});
