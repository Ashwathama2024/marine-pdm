// engine3d/part-risk.ts — how a live snapshot becomes a colour for one part.
//
// Kept out of the React/three layer so it can be tested directly: this is the rule that decides
// whether a given cylinder, bearing or ancillary looks healthy, and it is worth pinning.

import { ROOT_FACTORS } from '@marine-pdm/simulator';
import type { PartDef } from './topology';
import type { LiveValues, RootFactors } from './useLiveBridge';

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Severity 0-1 for whichever of the 6 root factors drives this component. */
export function factorRisk(componentId: string | undefined, rf: RootFactors): number {
  switch (componentId) {
    case 'injectors':
      return clamp01(rf.injFaultMax / ROOT_FACTORS.injFault.rootMax);
    case 'bearings':
      return clamp01(rf.bearingFaultMax / ROOT_FACTORS.bearingFault.rootMax);
    case 'ht_cooler':
      return clamp01(rf.coolingEffDrop / ROOT_FACTORS.coolingEff.rootMax);
    case 'turbocharger':
      return clamp01(rf.tcEffDrop / ROOT_FACTORS.tcEff.rootMax);
    case 'lube_system':
      return clamp01(rf.lubeFault / ROOT_FACTORS.lubeFault.rootMax);
    case 'piston_rings':
      return clamp01(rf.pistonBlowby / ROOT_FACTORS.pistonBlowby.rootMax);
    default:
      return 0;
  }
}

/** Bearing severity opens at 95 °C: HI is 115 and SS 130, but hot oil at rated already sits at 107. */
export const BEARING_RISK_FLOOR_C = 95;
export const BEARING_RISK_SPAN_C = 35;

/**
 * Per-part risk, in priority order:
 *   1. instance-addressable parts read their OWN element of the live arrays, so a single hot
 *      cylinder or bearing lights up alone rather than the whole bank;
 *   2. otherwise the component's root-factor severity, if it maps to one;
 *   3. otherwise the live deviation of whatever tag the part carries.
 * A part with no instrumentation at all (junction boxes, the IPMS cabinet) stays at 0, and a
 * stopped engine is 0 everywhere — the caller dims it rather than painting it healthy-green.
 */
export function partRisk(part: PartDef, v: LiveValues): number {
  if (!v.isOperational) return 0;
  const i = part.instanceIndex;

  if (part.componentId === 'injectors' && i !== undefined) {
    const r = v.cylRisks[i];
    if (typeof r === 'number') return clamp01(r / 100);
  }
  if (part.componentId === 'bearings' && i !== undefined) {
    const t = v.bearingTemps[i];
    if (typeof t === 'number') {
      return clamp01((t - BEARING_RISK_FLOOR_C) / BEARING_RISK_SPAN_C);
    }
  }

  if (part.componentId === 'turbocharger' && i !== undefined) {
    // Mirror the dashboard's own verdict: a cut-out turbo is standby, not a fault, and its ALARM
    // (overspeed or speed deviation) is a real one regardless of what the root factors say.
    const tc = v.tcInfos[i];
    if (tc?.status === 'STANDBY') return 0;
    if (tc?.status === 'ALARM') return 1;
  }

  const factor = factorRisk(part.componentId, v.rootFactors);
  if (factor > 0) return factor;

  const tag = part.sensorTags[0];
  return tag ? clamp01(v.devByTag[tag] ?? 0) : 0;
}
