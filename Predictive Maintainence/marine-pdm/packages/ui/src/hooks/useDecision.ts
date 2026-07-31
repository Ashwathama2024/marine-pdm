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

  return useMemo(() => {
    if (!snapshot) return { output: null, baseline: null, instantBaseline: null, features: null, history: [] };

    // Process once — features, lagged baseline and instant baseline all come from the same call
    const { features, baseline, instantBaseline } = featureEngine.process(snapshot);
    const output = decisionEngine.analyze(snapshot, features, baseline);

    historyRef.current = [...historyRef.current.slice(-59), output.systemRisk];

    return { output, baseline, instantBaseline, features, history: [...historyRef.current] };
  }, [snapshot]);
}
