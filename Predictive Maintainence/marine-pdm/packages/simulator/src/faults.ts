import { clamp } from '@marine-pdm/shared';
import type { PhysicsState } from './physics';

export type FaultType = 'injector' | 'lube' | 'cooling';

export interface ActiveFault {
  type: FaultType;
  cylIndex?: number;     // for injector faults
  severity: number;      // 0.0–1.0
  growthRate: number;    // severity units per tick
  maxSeverity: number;
}

// Growth rates and max effects from the spec (Section 4.3)
const FAULT_PARAMS: Record<FaultType, { growthRate: number; maxSeverity: number }> = {
  injector: { growthRate: 0.003, maxSeverity: 1.0 }, // → +45°C at 1.0
  lube:     { growthRate: 0.002, maxSeverity: 1.0 }, // → −1.8 bar at 1.0
  cooling:  { growthRate: 0.0015, maxSeverity: 1.0 }, // → coolingEff 0.75 min
};

export function createFault(
  type: FaultType,
  cylIndex?: number,
  initialSeverity = 0.05,
): ActiveFault {
  const params = FAULT_PARAMS[type];
  return {
    type,
    cylIndex,
    severity: initialSeverity,
    growthRate: params.growthRate,
    maxSeverity: params.maxSeverity,
  };
}

export function tickFaults(
  faults: ActiveFault[],
  state: PhysicsState,
): { faults: ActiveFault[]; updatedState: PhysicsState } {
  let updatedState = { ...state, injFaults: { ...state.injFaults } };
  const grown = faults.map(f => ({
    ...f,
    severity: clamp(f.severity + f.growthRate, 0, f.maxSeverity),
  }));

  let lubeFault = 0;
  let coolingDeg = 0; // accumulated degradation to coolingEff

  for (const f of grown) {
    if (f.type === 'injector' && f.cylIndex !== undefined) {
      updatedState.injFaults[f.cylIndex] = f.severity;
    } else if (f.type === 'lube') {
      lubeFault = Math.max(lubeFault, f.severity);
    } else if (f.type === 'cooling') {
      coolingDeg = Math.max(coolingDeg, f.severity);
    }
  }

  updatedState.lubeFault = lubeFault;
  // coolingEff degrades from 1.0 down to 0.75 as severity reaches 1.0
  updatedState.coolingEff = clamp(1.0 - coolingDeg * 0.25, 0.75, 1.0);

  return { faults: grown, updatedState };
}

export function removeFault(
  faults: ActiveFault[],
  type: FaultType,
  cylIndex?: number,
): ActiveFault[] {
  return faults.filter(f => {
    if (f.type !== type) return true;
    if (type === 'injector') return f.cylIndex !== cylIndex;
    return false;
  });
}
