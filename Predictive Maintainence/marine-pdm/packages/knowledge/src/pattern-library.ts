import type { FaultPattern, FeatureSnapshot, EngineSnapshot } from '@marine-pdm/shared';

export type OutcomeType = 'CONFIRMED' | 'FALSE_POSITIVE';

export interface PatternMatch {
  pattern: FaultPattern;
  conditionsMet: number;
  totalConditions: number;
}

export class PatternLibrary {
  private patterns = new Map<string, FaultPattern>();
  // Track current persistence counters per pattern (ticks conditions have been met)
  private persistenceCounters = new Map<string, number>();

  addPattern(pattern: FaultPattern): void {
    if (!pattern.id || !pattern.name) {
      throw new Error('Pattern requires id and name');
    }
    if (pattern.conditions.length === 0) {
      throw new Error(`Pattern '${pattern.id}' must have at least one condition`);
    }
    this.patterns.set(pattern.id, { ...pattern });
    this.persistenceCounters.set(pattern.id, 0);
  }

  matchPatterns(features: FeatureSnapshot, snap: EngineSnapshot): FaultPattern[] {
    const matched: FaultPattern[] = [];

    for (const pattern of this.patterns.values()) {
      if (!pattern.isActive) continue;

      const allMet = pattern.conditions.every(cond =>
        this.evaluateCondition(cond, features, snap),
      );

      // Update persistence counter
      const prev = this.persistenceCounters.get(pattern.id) ?? 0;
      const current = allMet ? prev + 1 : 0;
      this.persistenceCounters.set(pattern.id, current);

      if (allMet) {
        this.patterns.set(pattern.id, {
          ...pattern,
          timesTriggered: pattern.timesTriggered + 1,
        });
        matched.push({ ...pattern, timesTriggered: pattern.timesTriggered + 1 });
      }
    }

    return matched;
  }

  recordOutcome(patternId: string, outcome: OutcomeType): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) throw new Error(`Pattern '${patternId}' not found`);

    const updated =
      outcome === 'CONFIRMED'
        ? { ...pattern, timesConfirmed: pattern.timesConfirmed + 1 }
        : { ...pattern, timesFalsePositive: pattern.timesFalsePositive + 1 };

    this.patterns.set(patternId, updated);
  }

  getSuggestedThresholdAdjustment(patternId: string): string | null {
    const pattern = this.patterns.get(patternId);
    if (!pattern || pattern.timesTriggered === 0) return null;

    const fpRate = pattern.timesFalsePositive / pattern.timesTriggered;
    const missRate =
      pattern.timesTriggered > 0
        ? 1 - pattern.timesConfirmed / pattern.timesTriggered
        : 0;

    if (fpRate > 0.3) {
      return `High false-positive rate (${Math.round(fpRate * 100)}%). Consider raising condition thresholds to reduce sensitivity.`;
    }
    if (missRate > 0.2 && pattern.timesConfirmed > 2) {
      return `Possible under-detection (${Math.round(missRate * 100)}% unconfirmed). Consider lowering condition thresholds.`;
    }
    return null;
  }

  getPersistenceCount(patternId: string): number {
    return this.persistenceCounters.get(patternId) ?? 0;
  }

  getPattern(id: string): FaultPattern | undefined {
    return this.patterns.get(id);
  }

  getAll(): FaultPattern[] {
    return [...this.patterns.values()];
  }

  private evaluateCondition(
    cond: FaultPattern['conditions'][0],
    features: FeatureSnapshot,
    snap: EngineSnapshot,
  ): boolean {
    let value: number | null = null;

    // Map tag names to feature values
    switch (cond.tag) {
      case 'cylDev':
        value = Math.max(...features.cylDevs);
        break;
      case 'cylRate':
        value = features.exhaustRate; // proxy for cylinder rate
        break;
      case 'cylImbalance':
        value = features.cylImbalance;
        break;
      case 'cylPersist':
        // Persistence is evaluated outside in matchPatterns; always return 0 here
        // Actual persistence matching is done by the decision engine
        value = 0;
        break;
      case 'lubeDev':
        value = features.lubeDev;
        break;
      case 'lubeRate':
        value = features.lubeRate;
        break;
      case 'lubePersist':
        value = 0;
        break;
      case 'cylsAllRising':
        // True if all cylinders are above threshold
        value = Math.min(...features.cylDevs);
        break;
      case 'jacketDev':
        value = snap.jacketOutlet - 80; // rough expected baseline
        break;
      case 'sfocRising':
        value = features.exhaustDev; // proxy
        break;
      case 'coolingEff':
        value = snap.coolingEff - 1.0; // negative when degraded
        break;
      default:
        return false;
    }

    if (value === null) return false;

    switch (cond.operator) {
      case '>':  return value > cond.threshold;
      case '<':  return value < cond.threshold;
      case '>=': return value >= cond.threshold;
      case '<=': return value <= cond.threshold;
      default:   return false;
    }
  }
}
