// Measures what React StrictMode's double-invoked render phase does to the stateful FeatureEngine.
//
// THE HAZARD: useDecision() calls featureEngine.process(snapshot) inside a useMemo. StrictMode
// double-invokes the render phase in dev, so the factory runs twice per tick — and process() is NOT
// idempotent. It mutates `this.lagged` in place through applyLag() and pushes this.rate /
// this.exhaustWindow, all with no timestamp guard. training-recorder.ts:253 guards exactly this with
// `lastT`; useDecision has no equivalent.
//
// WHY MEASURE RATHER THAN ASSERT: HANDOVER.md §5.6 flags this as pre-existing but explicitly
// never quantified ("it could be perturbing live deviations in dev only"). "Runs twice" is only a bug
// if the magnitude matters, and the fixed point is unaffected — at steady state both converge to the
// same baseline, so nothing is permanently offset and a casual look sees no problem. The distortion
// lives entirely in the TRANSIENT, which is where deviations, rates and risk scores are actually read.
//
// These tests characterise the distortion; they do not assert a fix. If useDecision later gains a
// `lastT` guard, `doubled` becomes identical to `single` and the assertions below must be updated to
// say so — that is the intended signal, not a regression.

import { describe, it, expect } from 'vitest';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { FeatureEngine } from '@marine-pdm/features';
import { baselineStore, registry } from '@marine-pdm/knowledge';

const RATED_RPM = 1150;

function snap(over: Partial<EngineSnapshot> = {}): EngineSnapshot {
  return {
    timestamp: 1_000_000,
    rpm: RATED_RPM,
    load: 85,
    exhaustTemp: 440,
    lubeOilPressure: 6.4,
    fuelRack: 0,
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

/** `invokes` = 1 models production, 2 models StrictMode's double-invoked render. */
function feed(fe: FeatureEngine, s: EngineSnapshot, invokes: 1 | 2) {
  let out = fe.process(s);
  if (invokes === 2) out = fe.process(s);   // same object, same timestamp — exactly what StrictMode does
  return out;
}

function settle(fe: FeatureEngine, invokes: 1 | 2, ticks = 600) {
  for (let i = 0; i < ticks; i++) feed(fe, snap(), invokes);
}

describe('StrictMode double-invoke — impact on the stateful FeatureEngine', () => {
  it('leaves the steady-state fixed point untouched (which is why it hides)', () => {
    const prod = new FeatureEngine(baselineStore, registry);
    const dev = new FeatureEngine(baselineStore, registry);
    settle(prod, 1);
    settle(dev, 2);

    const p = feed(prod, snap(), 1).baseline;
    const d = feed(dev, snap(), 2).baseline;

    // A lag filter's fixed point does not depend on how many times you apply it, so nothing is
    // permanently offset. Any inspection at steady state finds the two indistinguishable.
    //
    // Not exactly equal, for a reason worth recording: jacket's alpha is 0.02, slow enough that even
    // 600 ticks leaves the single-invoke engine ~1e-6 °C short of converged while the double-invoke
    // one (effectively 1200 ticks) is closer in. The residual is unconverged approach, not a
    // fixed-point offset — it shrinks with more ticks rather than persisting.
    expect(d.expectedLube).toBeCloseTo(p.expectedLube, 6);
    expect(Math.abs(d.expectedJacket - p.expectedJacket)).toBeLessThan(1e-4);
  });

  it('runs the lagged baseline at DOUBLE RATE through a transient: dev[n] == prod[2n]', () => {
    const prod = new FeatureEngine(baselineStore, registry);
    const dev = new FeatureEngine(baselineStore, registry);
    settle(prod, 1);
    settle(dev, 2);

    // Step the operating point — this is the transient the lag exists to smooth.
    const step = snap({ load: 40, rpm: 800 });
    const prodTrack: number[] = [];
    const devTrack: number[] = [];
    for (let i = 0; i < 60; i++) {
      prodTrack.push(feed(prod, step, 1).baseline.expectedJacket);
      devTrack.push(feed(dev, step, 2).baseline.expectedJacket);
    }

    // Applying alpha twice per tick is exactly applying it once over twice as many ticks, so the dev
    // curve is the prod curve time-compressed 2x. This is the precise statement of the distortion.
    for (const n of [5, 10, 15, 20, 25]) {
      expect(devTrack[n - 1]!).toBeCloseTo(prodTrack[2 * n - 1]!, 4);
    }
  });

  it('quantifies the peak baseline divergence during that transient', () => {
    const prod = new FeatureEngine(baselineStore, registry);
    const dev = new FeatureEngine(baselineStore, registry);
    settle(prod, 1);
    settle(dev, 2);

    const step = snap({ load: 40, rpm: 800 });
    let peakJacket = 0, peakLube = 0;
    for (let i = 0; i < 120; i++) {
      const p = feed(prod, step, 1).baseline;
      const d = feed(dev, step, 2).baseline;
      peakJacket = Math.max(peakJacket, Math.abs(d.expectedJacket - p.expectedJacket));
      peakLube = Math.max(peakLube, Math.abs(d.expectedLube - p.expectedLube));
    }

    // The baseline IS the reference every deviation is measured against, so a gap here is a gap of the
    // same size in the reported deviation — in dev only. Pinned as measured magnitudes: if a future
    // change moves these, the transient behaviour of the whole risk pipeline moved with it.
    console.log(`[measured] peak dev-vs-prod baseline gap during transient: jacket ${peakJacket.toFixed(3)} °C, lube ${peakLube.toFixed(4)} bar`);

    expect(peakJacket).toBeGreaterThan(0.5);   // °C
    expect(peakJacket).toBeLessThan(12);
    expect(peakLube).toBeGreaterThan(0.01);    // bar
    expect(peakLube).toBeLessThan(2);
  });
});
