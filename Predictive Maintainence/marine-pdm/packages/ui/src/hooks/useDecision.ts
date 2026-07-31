import { useMemo, useRef } from 'react';
import type { EngineSnapshot, DecisionOutput, BaselineSnapshot, FeatureSnapshot } from '@marine-pdm/shared';
import { DecisionEngine } from '@marine-pdm/decision';
import { FeatureEngine } from '@marine-pdm/features';
import { patternLibrary, dependencyMap, registry, baselineStore } from '@marine-pdm/knowledge';

// Singletons — created once, persist across re-renders
export const featureEngine = new FeatureEngine(baselineStore, registry);
const decisionEngine = new DecisionEngine(patternLibrary, dependencyMap, baselineStore);

export interface DecisionState {
  output: DecisionOutput | null;
  /** The LAGGED baseline — what every deviation, risk score and alert is measured against. */
  baseline: BaselineSnapshot | null;
  /**
   * The same load/rpm curves with no lag applied. Surfaced only so the training recorder can measure
   * how far the lagged baseline is from converged and flag RUL labels derived while it is not — the
   * live pipeline deliberately keeps using `baseline`. See services/rul-quality.ts.
   */
  instantBaseline: BaselineSnapshot | null;
  /** Generic feature vector — surfaced so the training recorder can derive MTU8000Features from it. */
  features: FeatureSnapshot | null;
  history: number[]; // last 60 systemRisk values
}

export function useDecision(snapshot: EngineSnapshot | null): DecisionState {
  const historyRef = useRef<number[]>([]);
  const lastRef = useRef<{ t: number; state: DecisionState } | null>(null);

  return useMemo(() => {
    if (!snapshot) return { output: null, baseline: null, instantBaseline: null, features: null, history: [] };

    // Return the cached result if this tick was already processed.
    //
    // NOT a performance guard — a correctness one. React StrictMode double-invokes the render phase
    // in dev, so this useMemo factory runs twice per tick, and featureEngine.process() is stateful
    // with no internal timestamp guard: it advances the lagged baseline in place via applyLag() and
    // pushes this.rate / this.exhaustWindow on every call. Running it twice per tick applies the lag
    // filter twice, which is exactly the filter running at DOUBLE RATE — dev tick n lands where prod
    // tick 2n would. It also double-fills the rolling windows (RollingWindow(30) spans 15 real ticks,
    // RateCalculator's deliberately-15-sample window spans 7.5) and pushes systemRisk into
    // historyRef twice, halving the 60-value trend window too.
    //
    // Measured at 6.19 °C on the jacket baseline and 0.177 bar on lube through a load transient —
    // see services/strictmode-double-process.test.ts. Since the baseline IS the reference every
    // deviation is subtracted from, that was a same-sized error in every reported deviation and risk
    // score in dev. Steady state is unaffected (a lag filter's fixed point does not care how often it
    // is applied), which is why it stayed invisible.
    //
    // Timestamp is Date.now() per engine tick at a 1 s cadence, so it is unique per real tick —
    // training-recorder.ts:253 guards itself the same way on the same assumption.
    if (lastRef.current?.t === snapshot.timestamp) return lastRef.current.state;

    // Process once — features, lagged baseline and instant baseline all come from the same call
    const { features, baseline, instantBaseline } = featureEngine.process(snapshot);
    const output = decisionEngine.analyze(snapshot, features, baseline);

    historyRef.current = [...historyRef.current.slice(-59), output.systemRisk];

    const state = { output, baseline, instantBaseline, features, history: [...historyRef.current] };
    lastRef.current = { t: snapshot.timestamp, state };
    return state;
  }, [snapshot]);
}
