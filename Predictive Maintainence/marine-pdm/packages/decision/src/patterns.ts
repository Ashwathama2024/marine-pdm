import type { EngineSnapshot, FeatureSnapshot, FaultAlert, FaultSource } from '@marine-pdm/shared';
import type { PatternLibrary, DependencyMap } from '@marine-pdm/knowledge';
import { computeConfidence } from './confidence';

export function classifyFaultSource(
  sensorId: string,
  features: FeatureSnapshot,
  dependencyMap: DependencyMap,
  sensorHealthScore: number,
): FaultSource {
  if (sensorHealthScore < 0.7) return 'SENSOR_SUSPECT';
  if (dependencyMap.areCorrelatedTagsMoving(sensorId, features)) return 'EQUIPMENT';
  return 'ISOLATED';
}

export function buildPatternAlerts(
  snap: EngineSnapshot,
  features: FeatureSnapshot,
  patternLibrary: PatternLibrary,
  dependencyMap: DependencyMap,
  dataQuality: number,
  sensorHealthScore: number,
): FaultAlert[] {
  const matchedPatterns = patternLibrary.matchPatterns(features, snap);
  const alerts: FaultAlert[] = [];

  for (const pattern of matchedPatterns) {
    const faultSource = classifyFaultSource(
      pattern.affectedTags[0] ?? 'ME.ExhaustTemp',
      features,
      dependencyMap,
      sensorHealthScore,
    );

    const evidenceCount = Math.min(5, pattern.conditions.length);
    const patternStrength = 1.0;
    const confidence = computeConfidence(evidenceCount, dataQuality, patternStrength);

    const riskScore = Math.min(
      100,
      Math.round(features.exhaustDev * 2 + features.cylImbalance),
    );

    const evidence = buildEvidence(pattern.name, features, snap);

    alerts.push({
      component: deriveComponent(pattern, features),
      issue: pattern.name,
      riskScore,
      confidence,
      evidence,
      recommendedAction: deriveAction(pattern.name, pattern.actionWindow),
      faultSource,
      patternName: pattern.name,
    });
  }

  return alerts;
}

function deriveComponent(
  pattern: { name: string; affectedTags: string[] },
  features?: FeatureSnapshot,
): string {
  if (pattern.name === 'Injector Degradation') {
    if (features && features.cylDevs.length > 0) {
      const maxDevIdx = features.cylDevs.indexOf(Math.max(...features.cylDevs));
      const bank = maxDevIdx < 10 ? 'A' : 'B';
      const num  = maxDevIdx < 10 ? maxDevIdx + 1 : maxDevIdx - 9;
      return `Cylinder ${bank}${num} Injector`;
    }
    return 'Cylinder Injector';
  }
  if (pattern.name === 'Lube System Failure') return 'Lube Oil System';
  if (pattern.name === 'Cooling Fouling') return 'Cooling System';
  return pattern.affectedTags[0] ?? 'Unknown Component';
}

function deriveAction(patternName: string, actionWindow: string): string {
  if (patternName === 'Injector Degradation') {
    return `Inspect injector within ${actionWindow}. Check fuel index and compression pressure.`;
  }
  if (patternName === 'Lube System Failure') {
    return 'Check lube oil filters and pump immediately. Reduce load if pressure continues falling.';
  }
  if (patternName === 'Cooling Fouling') {
    return `Clean heat exchanger at next port. Monitor all cylinder temps and SFOC trend.`;
  }
  return `Investigate at next opportunity (${actionWindow}).`;
}

function buildEvidence(
  patternName: string,
  features: FeatureSnapshot,
  snap: EngineSnapshot,
): string[] {
  const evidence: string[] = [];

  if (patternName === 'Injector Degradation') {
    const maxDevIdx = features.cylDevs.indexOf(Math.max(...features.cylDevs));
    const bank = maxDevIdx < 10 ? 'A' : 'B';
    const num  = maxDevIdx < 10 ? maxDevIdx + 1 : maxDevIdx - 9;
    evidence.push(
      `Cyl ${bank}${num} exhaust +${features.cylDevs[maxDevIdx]?.toFixed(1)}°C above baseline — injector spray pattern signature`,
    );
    evidence.push(
      `Cylinder imbalance: ${features.cylImbalance.toFixed(1)}°C spread (limit: 35°C)`,
    );
    if (features.sfocDev > 1.5) {
      evidence.push(
        `SFOC +${features.sfocDev.toFixed(1)} g/kWh above expected — consistent with incomplete combustion from degraded injector`,
      );
    }
    if (features.fuelRackDev > 0.3) {
      evidence.push(
        `Fuel rack +${features.fuelRackDev.toFixed(2)} mm above nominal — governor compensating for injector power loss`,
      );
    }
    if (features.exhaustRate > 0) {
      evidence.push(`Rising exhaust rate: ${features.exhaustRate.toFixed(2)}°C/min`);
    }
  } else if (patternName === 'Lube System Failure') {
    evidence.push(
      `Lube pressure deviation: ${features.lubeDev.toFixed(2)} bar (${snap.lubeOilPressure.toFixed(2)} bar actual)`,
    );
    evidence.push(
      `Pressure falling at ${Math.abs(features.lubeRate).toFixed(3)} bar/min`,
    );
  } else if (patternName === 'Cooling Fouling') {
    evidence.push(
      `All cylinders elevated: mean deviation ${(features.cylDevs.reduce((a, b) => a + b, 0) / features.cylDevs.length).toFixed(1)}°C`,
    );
    evidence.push(
      `Cooling efficiency: ${(snap.coolingEff * 100).toFixed(1)}% (nominal 100%)`,
    );
    evidence.push(
      `Jacket outlet: ${snap.jacketOutlet.toFixed(1)}°C`,
    );
  } else {
    evidence.push(`Exhaust deviation: ${features.exhaustDev.toFixed(1)}°C`);
    evidence.push(`Pattern conditions all met`);
  }

  return evidence;
}
