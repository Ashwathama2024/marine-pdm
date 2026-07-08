import type { FaultPattern, FeatureSnapshot, EngineSnapshot } from '@marine-pdm/shared';

export type OutcomeType = 'CONFIRMED' | 'FALSE_POSITIVE';

export interface PatternMatch {
  pattern: FaultPattern;
  conditionsMet: number;
  totalConditions: number;
}

const PERSIST_TAGS = new Set(['cylPersist', 'lubePersist']);

export class PatternLibrary {
  private patterns = new Map<string, FaultPattern>();
  // Ticks the FULL condition set (core + any persist-tag gates) has been met — public-facing via
  // getPersistenceCount(), and what gates timesTriggered to one increment per episode.
  private persistenceCounters = new Map<string, number>();
  // Ticks the CORE (non-persist-tag) conditions alone have been met — kept separate so a
  // cylPersist/lubePersist condition can reference "how long have the real symptoms held" without
  // referencing its own gated outcome. A persist-tag condition checking allMet-streak instead of
  // core-streak would be circular: allMet requires the persist condition to already be true, which
  // requires allMet-streak to already be >0, which never happens — a permanent fixed point at 0.
  private corePersistenceCounters = new Map<string, number>();

  addPattern(pattern: FaultPattern): void {
    if (!pattern.id || !pattern.name) {
      throw new Error('Pattern requires id and name');
    }
    if (pattern.conditions.length === 0) {
      throw new Error(`Pattern '${pattern.id}' must have at least one condition`);
    }
    this.patterns.set(pattern.id, { ...pattern });
    this.persistenceCounters.set(pattern.id, 0);
    this.corePersistenceCounters.set(pattern.id, 0);
  }

  matchPatterns(features: FeatureSnapshot, snap: EngineSnapshot): FaultPattern[] {
    const matched: FaultPattern[] = [];

    for (const pattern of this.patterns.values()) {
      if (!pattern.isActive || pattern.matchedExternally) continue;

      const coreConditions = pattern.conditions.filter(c => !PERSIST_TAGS.has(c.tag));
      const persistConditions = pattern.conditions.filter(c => PERSIST_TAGS.has(c.tag));

      // Core persistence: ticks the non-persist-tag conditions alone held BEFORE this tick.
      // Persist-tag conditions read THIS value (never their own gated result — see class comment).
      const prevCore = this.corePersistenceCounters.get(pattern.id) ?? 0;
      const coreMet = coreConditions.every(cond => this.evaluateCondition(cond, features, snap, prevCore));
      this.corePersistenceCounters.set(pattern.id, coreMet ? prevCore + 1 : 0);

      const persistMet = persistConditions.every(cond => this.evaluateCondition(cond, features, snap, prevCore));
      const allMet = coreMet && persistMet;

      const result = this.recordMatch(pattern.id, allMet);
      if (result) matched.push(result);
    }

    return matched;
  }

  /**
   * Records that `patternId`'s match state is `allMet` this tick, using the same episode/rising-
   * edge bookkeeping matchPatterns() itself uses. This is the hook for matchers that determine
   * allMet by means other than PatternLibrary's own generic per-tag evaluator — e.g.
   * matchMTU8000Patterns()'s hand-written per-pattern logic in packages/decision. Call this for
   * EVERY externally-matched pattern id each tick (matched or not), so a pattern's persistence
   * counter correctly decays to 0 the instant it stops matching, exactly like the generic path.
   * Returns the updated pattern if it should be surfaced as "currently matched" this tick, else null.
   */
  recordMatch(patternId: string, allMet: boolean): FaultPattern | null {
    const pattern = this.patterns.get(patternId);
    if (!pattern || !pattern.isActive) return null;

    const prev = this.persistenceCounters.get(patternId) ?? 0;
    const current = allMet ? prev + 1 : 0;
    this.persistenceCounters.set(patternId, current);

    if (!allMet) return null;

    // Count a NEW episode only (rising edge: prev===0 -> current===1), not every tick the
    // condition continues to hold — otherwise a fault sustained for N seconds would inflate
    // timesTriggered by N instead of 1, corrupting the false-positive/miss-rate math in
    // getSuggestedThresholdAdjustment() below.
    if (current === 1) {
      const updated = { ...pattern, timesTriggered: pattern.timesTriggered + 1 };
      this.patterns.set(patternId, updated);
      return { ...updated };
    }
    return { ...pattern };
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
    persistTicks: number,
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
      case 'lubePersist':
        // How many consecutive PRIOR ticks this pattern's CORE (non-persist-tag) conditions
        // already held — passed in as persistTicks (see matchPatterns' corePersistenceCounters).
        // Deliberately not the pattern's own gated allMet-streak: a persist-tag condition can't
        // reference its own outcome without creating a fixed point that's permanently stuck at 0.
        value = persistTicks;
        break;
      case 'lubeDev':
        value = features.lubeDev;
        break;
      case 'lubeRate':
        value = features.lubeRate;
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
