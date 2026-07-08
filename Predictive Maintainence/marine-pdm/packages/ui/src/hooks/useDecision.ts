import { useMemo, useRef } from 'react';
import type { EngineSnapshot, DecisionOutput, BaselineSnapshot } from '@marine-pdm/shared';
import { DecisionEngine } from '@marine-pdm/decision';
import { FeatureEngine } from '@marine-pdm/features';
import { patternLibrary, dependencyMap, registry, baselineStore } from '@marine-pdm/knowledge';

// Singletons — created once, persist across re-renders
export const featureEngine = new FeatureEngine(baselineStore, registry);
const decisionEngine = new DecisionEngine(patternLibrary, dependencyMap, baselineStore);

export interface DecisionState {
  output: DecisionOutput | null;
  baseline: BaselineSnapshot | null;
  history: number[]; // last 60 systemRisk values
}

export function useDecision(snapshot: EngineSnapshot | null): DecisionState {
  const historyRef = useRef<number[]>([]);

  return useMemo(() => {
    if (!snapshot) return { output: null, baseline: null, history: [] };

    // Process once — both features and baseline come from the same call
    const { features, baseline } = featureEngine.process(snapshot);
    const output = decisionEngine.analyze(snapshot, features, baseline);

    historyRef.current = [...historyRef.current.slice(-59), output.systemRisk];

    return { output, baseline, history: [...historyRef.current] };
  }, [snapshot]);
}
