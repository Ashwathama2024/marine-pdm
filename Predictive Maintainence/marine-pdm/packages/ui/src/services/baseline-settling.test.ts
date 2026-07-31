// Reproduces the event that poisons `rulTrue_*` labels, and discriminates between the two candidate
// causes. Lives in the ui package because that is where the RUL label pipeline is assembled and where
// a vitest config with the workspace aliases already exists; the mechanism under test is in features.
//
// THE PROBLEM (label semantics, not arithmetic):
// analyticRul() solves `severityAtCross = (threshold − healthyValue) / perSeverity`, so it needs a
// trustworthy fault-free value. The recorder feeds it the LAGGED baseline, which is a filtered
// estimate. When that filter has not converged, the label is wrong — and wrong directionally, which
// is what makes it poison rather than noise: for a `dir:'low'` metric like lube, both numerator and
// denominator are negative, so as a depressed baseline recovers upward the quotient GROWS and a
// regressor sees RUL increasing while the fault develops.
//
// TWO CANDIDATE CAUSES, discriminated below:
//   (a) the fault set changing        → would implicate a fault-swap detector
//   (b) actualAsBaseline() re-seeding  → would implicate a transient/re-seed detector
// These imply different detectors, so guessing wrong builds one that silently passes poisoned rows.

import { describe, it, expect } from 'vitest';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { FeatureEngine } from '@marine-pdm/features';
import { baselineStore, registry } from '@marine-pdm/knowledge';

const RATED_RPM = 1150;
const RATED_LOAD = 85;

/** Healthy-ish snapshot at the rated point. Absolute values do not matter — every assertion below is
 *  relative (does the baseline chase the sensor, or stay on its load/rpm curve). */
function snap(over: Partial<EngineSnapshot> = {}): EngineSnapshot {
  return {
    timestamp: Date.now(),
    rpm: RATED_RPM,
    load: RATED_LOAD,
    exhaustTemp: 440,
    lubeOilPressure: 6.4,
    fuelRack: 85,
    scavengeAir: 3.2,
    tcRPM: 24000,
    jacketOutlet: 77,
    sfoc: 185,
    cylTemps: Array.from({ length: 20 }, () => 440),
    coolingEff: 1.0,
    chargeAirTemp: 63,
    fuelOilPressure: 8.0,
    fuelOilTemp: 25,
    loFilterDP: 0.15,
    pistonCoolingPress: 4.0,
    shaftPower: 7735,
    ...over,
  } as EngineSnapshot;
}

/** Run the engine to steady state so the two-stage lag has converged before the experiment. */
function settle(fe: FeatureEngine, ticks = 400): number {
  let expectedLube = 0;
  for (let i = 0; i < ticks; i++) expectedLube = fe.process(snap()).baseline.expectedLube;
  return expectedLube;
}

const FAULTED_LUBE = 3.2;   // a deep F03-style lube pressure loss

describe('baseline poisoning — which event actually corrupts the RUL label', () => {
  it('(a) a fault appearing at steady rpm/load does NOT move the baseline', () => {
    const fe = new FeatureEngine(baselineStore, registry);
    const healthyBaseline = settle(fe);

    // The fault only changes the SENSOR. Baseline curves are functions of (load, rpm), which are
    // unchanged, so the fault-free expectation must hold its ground — that is the entire point of a
    // baseline, and it is what lets the deviation surface the fault.
    let baseline = healthyBaseline;
    for (let i = 0; i < 30; i++) {
      baseline = fe.process(snap({ lubeOilPressure: FAULTED_LUBE })).baseline.expectedLube;
    }

    expect(baseline).toBeCloseTo(healthyBaseline, 3);
    // Emphatically NOT chasing the faulted reading.
    expect(Math.abs(baseline - FAULTED_LUBE)).toBeGreaterThan(1.0);
  });

  it('(b) dipping below RUN_RPM with a fault active re-seeds the baseline ONTO the faulted value', () => {
    const fe = new FeatureEngine(baselineStore, registry);
    const healthyBaseline = settle(fe);

    // One tick below 300 rpm (a brief idle dip, a restart, a clutch-out) while the sensor is faulted.
    // feature-engine.ts:82 calls actualAsBaseline(snap) here, and :88 does it AGAIN on the first tick
    // back above 300 via the wasGated flag.
    fe.process(snap({ rpm: 200, lubeOilPressure: FAULTED_LUBE }));
    const afterReseed = fe.process(snap({ lubeOilPressure: FAULTED_LUBE })).baseline.expectedLube;

    // The "fault-free" baseline is now essentially the faulted reading. Not EXACTLY it: the re-seed at
    // :88 is followed by one applyLag step in the same tick, so it lands ~0.06·(instant − faulted)
    // above. Asserting the mechanism rather than the number — it landed on the faulted side.
    expect(Math.abs(afterReseed - FAULTED_LUBE))
      .toBeLessThan(Math.abs(afterReseed - healthyBaseline));
    expect(afterReseed).toBeLessThan(FAULTED_LUBE + 0.3);
    expect(Math.abs(afterReseed - healthyBaseline)).toBeGreaterThan(1.0);
  });

  it('(b cont.) the poisoned baseline then climbs back out, which is the increasing-RUL signature', () => {
    const fe = new FeatureEngine(baselineStore, registry);
    const healthyBaseline = settle(fe);

    fe.process(snap({ rpm: 200, lubeOilPressure: FAULTED_LUBE }));

    const track: number[] = [];
    for (let i = 0; i < 40; i++) {
      track.push(fe.process(snap({ lubeOilPressure: FAULTED_LUBE })).baseline.expectedLube);
    }

    // Starts at the faulted value and recovers monotonically toward the true curve. Every tick on
    // this ramp yields a different `healthyValue`, so every rulTrue_* computed from it is a different
    // wrong answer - and they trend, which is worse than noise.
    expect(track[0]!).toBeLessThan(FAULTED_LUBE + 0.3);           // starts on the faulted value
    for (let i = 1; i < track.length; i++) expect(track[i]!).toBeGreaterThan(track[i - 1]!);
    const final = track[track.length - 1]!;
    expect(final).toBeLessThan(healthyBaseline);                  // not yet converged after 40 ticks
    expect(final).toBeGreaterThan(FAULTED_LUBE);                  // but moving the right way
  });

  it('settling is slow because the lag is a two-stage cascade, not one pole', () => {
    // BLAG (feature-engine) and BASELINE_LAG (EngineContext) hold the SAME alphas for lube (0.06) and
    // jacket (0.02), and stage 2's input is stage 1's output. Two near-identical poles in series settle
    // far slower than one, and the step response is S-shaped rather than exponential. This test pins
    // stage 1 alone; the recorder sees the output of both.
    const fe = new FeatureEngine(baselineStore, registry);
    const healthyBaseline = settle(fe);

    fe.process(snap({ rpm: 200, lubeOilPressure: FAULTED_LUBE }));

    let ticks = 0;
    let value = FAULTED_LUBE;
    const tolerance = 0.05;                                        // bar
    while (Math.abs(value - healthyBaseline) > tolerance && ticks < 500) {
      value = fe.process(snap({ lubeOilPressure: FAULTED_LUBE })).baseline.expectedLube;
      ticks++;
    }

    // Stage 1 alone needs many tens of ticks; the recorder's input needs materially more. Any
    // "wait N ticks after the fault changed" heuristic with a small N would pass poisoned rows.
    expect(ticks).toBeGreaterThan(30);
    expect(ticks).toBeLessThan(500);                               // it does converge
  });
});
