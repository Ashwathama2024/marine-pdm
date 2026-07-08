// packages/decision/src/mtu8000-alerts.ts
// Builds real FaultAlerts (ECS code, MTU work order, pattern-specific evidence) from matched
// P01-P08 pattern ids — the ECS-coded counterpart to patterns.ts's buildPatternAlerts() for the
// legacy generic patterns. Kept separate from decision-engine.ts to keep that file focused on
// orchestration rather than per-pattern evidence/risk-score text.

import type { EngineSnapshot, FaultAlert, FaultPattern, MTU8000Features, FaultSource } from '@marine-pdm/shared';
import { classifyFaultSource } from './patterns';
import { computeConfidence } from './confidence';
import type { FeatureSnapshot } from '@marine-pdm/shared';
import type { DependencyMap } from '@marine-pdm/knowledge';

const COMPONENT_NAMES: Record<string, string> = {
  P02: 'A-Side Injectors', P03: 'Lube Oil System', P04: 'Crank Bearing',
  P05: 'Cooling System', P06: 'Turbocharger', P07: 'Fuel Injection System', P08: 'Piston / Rings',
};

function cylinderComponent(cylIndex: number): string {
  const bank = cylIndex < 10 ? 'A' : 'B';
  const num = cylIndex < 10 ? cylIndex + 1 : cylIndex - 9;
  return `Cylinder ${bank}${num} Injector`;
}

function deriveComponent(patternId: string, f: MTU8000Features): string {
  if (patternId === 'P01') {
    const idx = f.cylDevs.findIndex(d => d > 20);
    return idx >= 0 ? cylinderComponent(idx) : 'Cylinder Injector';
  }
  return COMPONENT_NAMES[patternId] ?? 'Engine System';
}

// Heuristic 0-100 severity per pattern, scaled from each pattern's own key deviation(s) relative
// to its match threshold — mirrors the level of rigor patterns.ts's legacy riskScore formula
// already used (features.exhaustDev*2 + features.cylImbalance for every pattern regardless of
// which one matched); this is more per-pattern-tailored but still a pragmatic scaling, not a
// calibrated model like computeRisk() in risk.ts.
function deriveRiskScore(patternId: string, f: MTU8000Features): number {
  const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  switch (patternId) {
    case 'P01': return clamp100(Math.max(...f.cylDevs) * 2 + f.cylImbalance);
    case 'P02': return clamp100(f.aSideMeanDev * 3 + f.sfocDev);
    case 'P03': return clamp100(Math.abs(f.lubeLastBearingDev) * 40 + Math.max(...f.bearingDevs) * 2);
    case 'P04': return clamp100(Math.max(...f.bearingDevs) * 3);
    case 'P05': return clamp100(f.coolantTempDev * 6 + f.allCylMeanDev * 2);
    case 'P06': return clamp100(Math.max(...f.tcSpeedDevs) / 30);
    case 'P07': return clamp100(Math.max(...f.cylStdDevs) * 5 + Math.max(...f.cylDevs));
    case 'P08': return clamp100(f.crankcasePressure * 8 + f.crankcaseRate * 5);
    default: return 50;
  }
}

function buildEvidence(patternId: string, f: MTU8000Features): string[] {
  switch (patternId) {
    case 'P01': {
      const idx = f.cylDevs.findIndex(d => d > 20);
      return [
        `${idx >= 0 ? cylinderComponent(idx) : 'One cylinder'} exhaust +${(f.cylDevs[idx] ?? 0).toFixed(1)}°C above baseline — single-cylinder signature`,
        `Cylinder imbalance ${f.cylImbalance.toFixed(1)}°C spread`,
        `SFOC +${f.sfocDev.toFixed(1)} g/kWh above expected — consistent with degraded injector`,
      ];
    }
    case 'P02':
      return [
        `A-side mean +${f.aSideMeanDev.toFixed(1)}°C vs B-side +${f.bSideMeanDev.toFixed(1)}°C — asymmetric bank signature (systemic to A-side only, not whole-engine)`,
        `SFOC +${f.sfocDev.toFixed(1)} g/kWh above expected`,
      ];
    case 'P03':
      return [
        `Last-bearing pressure deviation +${f.lubeLastBearingDev.toFixed(2)} bar, falling at ${f.lubeRate.toFixed(3)} bar/min`,
        `Bearing temps up to +${Math.max(...f.bearingDevs).toFixed(1)}°C above baseline — pressure-starvation signature`,
      ];
    case 'P04':
      return [
        `Bearing deviation up to +${Math.max(...f.bearingDevs).toFixed(1)}°C above baseline`,
        `Lube pressure +${f.lubeDev.toFixed(2)} bar deviation; bearing temp still rising`,
      ];
    case 'P05':
      return [
        `Coolant temp +${f.coolantTempDev.toFixed(1)}°C above baseline — primary HT-cooler fouling signal`,
        `All-cylinder mean +${f.allCylMeanDev.toFixed(1)}°C, imbalance only ${f.cylImbalance.toFixed(1)}°C — systemic (whole-engine), not single-cylinder`,
        `Charge-air temp +${f.chargeAirTempDev.toFixed(1)}°C above baseline`,
      ];
    case 'P06':
      return [
        `Turbocharger speed deviation up to ${Math.max(...f.tcSpeedDevs).toFixed(0)} RPM off baseline`,
        `Charge-air pressure +${f.chargeAirPressDev.toFixed(2)} bar deviation — reduced boost`,
      ];
    case 'P07':
      return [
        `Cylinder deviation σ up to ${Math.max(...f.cylStdDevs).toFixed(1)}°C — oscillating (erratic) signature, not a steady climb`,
        `Crankcase pressure rising at ${f.crankcaseRate.toFixed(3)} mbar/min — secondary blow-by tell`,
      ];
    case 'P08':
      return [
        `Crankcase pressure ${f.crankcasePressure.toFixed(2)} mbar, rising at ${f.crankcaseRate.toFixed(3)} mbar/min`,
      ];
    default:
      return ['Pattern conditions met'];
  }
}

/** Builds ECS-coded FaultAlerts for every currently-matched P01-P08 pattern this tick. */
export function buildMTU8000Alerts(
  matchedPatterns: FaultPattern[],
  mtuFeatures: MTU8000Features,
  genericFeatures: FeatureSnapshot,
  snap: EngineSnapshot,
  dependencyMap: DependencyMap,
  dataQuality: number,
  sensorHealthScore: number,
): FaultAlert[] {
  return matchedPatterns.map(pattern => {
    const component = deriveComponent(pattern.id, mtuFeatures);
    const faultSource: FaultSource = classifyFaultSource(
      pattern.affectedTags[0] ?? 'ME.ExhaustTemp',
      genericFeatures,
      dependencyMap,
      sensorHealthScore,
    );
    const evidenceCount = Math.min(5, pattern.conditions.length || 3);
    const confidence = computeConfidence(evidenceCount, dataQuality, 1.0);

    return {
      component,
      issue: pattern.name,
      riskScore: deriveRiskScore(pattern.id, mtuFeatures),
      confidence,
      evidence: buildEvidence(pattern.id, mtuFeatures),
      recommendedAction: pattern.actionWindow,
      faultSource,
      patternName: pattern.name,
      patternId: pattern.id,
      ecsAlarmCode: pattern.ecsAlarmCode,
      maintenanceTask: pattern.maintenanceTask,
    };
  });
}
