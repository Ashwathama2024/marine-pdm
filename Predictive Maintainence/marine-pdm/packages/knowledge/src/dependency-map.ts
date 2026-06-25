import type { FeatureSnapshot } from '@marine-pdm/shared';

export interface Dependency {
  sensorId: string;
  dependsOn: string[];
  correlationCoefficients: Record<string, number>;
}

export class DependencyMap {
  private deps = new Map<string, Dependency>();

  addDependency(
    sensorId: string,
    dependsOn: string[],
    correlationCoefficients: Record<string, number>,
  ): void {
    this.deps.set(sensorId, { sensorId, dependsOn, correlationCoefficients });
  }

  getCrossCorrelated(sensorId: string): string[] {
    return this.deps.get(sensorId)?.dependsOn ?? [];
  }

  getCorrelationCoefficients(sensorId: string): Record<string, number> {
    return this.deps.get(sensorId)?.correlationCoefficients ?? {};
  }

  /**
   * Returns true if sensors that correlate with `sensorId` are also
   * showing meaningful deviation — indicating an equipment fault rather
   * than an isolated sensor fault.
   */
  areCorrelatedTagsMoving(sensorId: string, features: FeatureSnapshot): boolean {
    const deps = this.deps.get(sensorId);
    if (!deps || deps.dependsOn.length === 0) return false;

    // Check if at least one correlated sensor also shows deviation
    return deps.dependsOn.some(dep => {
      if (dep === 'load' || dep === 'rpm' || dep === 'coolingEff') return false;
      // Map known feature tags
      if (dep === 'ME.ExhaustTemp' || dep === 'exhaustTemp') {
        return Math.abs(features.exhaustDev) > 3;
      }
      if (dep === 'ME.LubeOilPressure') {
        return Math.abs(features.lubeDev) > 0.2;
      }
      // Generic: check if any cylDev is elevated
      if (dep.includes('Cyl')) {
        return features.cylImbalance > 10;
      }
      return false;
    });
  }

  getAll(): Dependency[] {
    return [...this.deps.values()];
  }

  hasDependencies(sensorId: string): boolean {
    return this.deps.has(sensorId);
  }
}
