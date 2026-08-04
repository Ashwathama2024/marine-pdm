import { describe, it, expect } from 'vitest';
import { PatternLibrary } from '@marine-pdm/knowledge';
import type { FeatureSnapshot, EngineSnapshot, FaultPattern } from '@marine-pdm/shared';
import { buildPatternAlerts } from '../src/patterns';

// Regression tests for the alert lifecycle bugs found during the alert-logic audit:
//  1. Confirm/False-Alarm crashed because the UI passed pattern NAME where recordOutcome()
//     expects pattern ID — fixed by adding FaultAlert.patternId.
//  2. timesTriggered incremented every tick a condition held, not once per episode — fixed by
//     gating the increment to the persistence-counter rising edge (prev===0 -> current===1).
//  3. cylPersist/lubePersist condition tags were hardcoded to 0 forever — fixed by threading the
//     pattern's own rolling persistence count into evaluateCondition.

const TEST_PATTERN: FaultPattern = {
  id: 'test_injector', name: 'Test Injector Pattern',
  conditions: [{ tag: 'cylDev', metric: 'deviation', operator: '>', threshold: 20 }],
  affectedTags: ['ME.Cyl1.ExhaustTemp'], actionWindow: '1h',
  timesTriggered: 0, timesConfirmed: 0, timesFalsePositive: 0, isActive: true,
};

function makeLibrary(): PatternLibrary {
  const lib = new PatternLibrary();
  lib.addPattern(TEST_PATTERN);
  return lib;
}

const FAULTED_FEATURES: FeatureSnapshot = {
  exhaustDev: 5, lubeDev: 0, cylDevs: [25, 0, 0], cylImbalance: 25,
  exhaustRate: 1, lubeRate: 0, rollingAvg: 0, stdDev: 0, sfocDev: 0,
};
const HEALTHY_FEATURES: FeatureSnapshot = {
  ...FAULTED_FEATURES, cylDevs: [0, 0, 0], cylImbalance: 0,
};
const SNAP = {} as EngineSnapshot;

describe('PatternLibrary.matchPatterns — episode counting (bug #2)', () => {
  it('increments timesTriggered once per episode, not once per tick', () => {
    const lib = makeLibrary();
    for (let tick = 0; tick < 10; tick++) lib.matchPatterns(FAULTED_FEATURES, SNAP);
    expect(lib.getPattern('test_injector')!.timesTriggered).toBe(1);
  });

  it('starts a new episode (timesTriggered=2) after the condition clears and re-fires', () => {
    const lib = makeLibrary();
    for (let tick = 0; tick < 5; tick++) lib.matchPatterns(FAULTED_FEATURES, SNAP);
    lib.matchPatterns(HEALTHY_FEATURES, SNAP); // condition clears — resets the persistence gate
    for (let tick = 0; tick < 5; tick++) lib.matchPatterns(FAULTED_FEATURES, SNAP);
    expect(lib.getPattern('test_injector')!.timesTriggered).toBe(2);
  });
});

describe('cylPersist/lubePersist condition tags (bug #4)', () => {
  it('reflects real prior-tick persistence instead of a permanent 0', () => {
    const lib = new PatternLibrary();
    lib.addPattern({
      ...TEST_PATTERN, id: 'test_persist',
      conditions: [
        { tag: 'cylDev', metric: 'deviation', operator: '>', threshold: 20 },
        { tag: 'cylPersist', metric: 'persistence', operator: '>=', threshold: 3 },
      ],
    });
    // Ticks 1-3: cylDev condition true, but persistence hasn't reached 3 prior ticks yet.
    expect(lib.matchPatterns(FAULTED_FEATURES, SNAP)).toHaveLength(0); // prev=0
    expect(lib.matchPatterns(FAULTED_FEATURES, SNAP)).toHaveLength(0); // prev=1
    expect(lib.matchPatterns(FAULTED_FEATURES, SNAP)).toHaveLength(0); // prev=2
    // Tick 4: prev=3, now satisfies cylPersist >= 3.
    expect(lib.matchPatterns(FAULTED_FEATURES, SNAP)).toHaveLength(1);
  });
});

describe('buildPatternAlerts — patternId wiring (bug #1)', () => {
  it('sets patternId to the real FaultPattern.id, not the display name', () => {
    const lib = makeLibrary();
    lib.matchPatterns(FAULTED_FEATURES, SNAP);
    const dependencyMapStub = { areCorrelatedTagsMoving: () => false } as any;
    const alerts = buildPatternAlerts(SNAP, FAULTED_FEATURES, lib, dependencyMapStub, 1.0, 1.0);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.patternId).toBe('test_injector');
    expect(alerts[0]!.patternName).toBe('Test Injector Pattern');
  });

  it('recordOutcome(alert.patternId) succeeds without throwing (the actual crash reproduction)', () => {
    const lib = makeLibrary();
    lib.matchPatterns(FAULTED_FEATURES, SNAP);
    const dependencyMapStub = { areCorrelatedTagsMoving: () => false } as any;
    const alerts = buildPatternAlerts(SNAP, FAULTED_FEATURES, lib, dependencyMapStub, 1.0, 1.0);
    const patternId = alerts[0]!.patternId!;

    // This is exactly what AlertBar.tsx / AIDecisionPanel.tsx now call on Confirm click.
    expect(() => lib.recordOutcome(patternId, 'CONFIRMED')).not.toThrow();
    expect(lib.getPattern('test_injector')!.timesConfirmed).toBe(1);

    // Reproduces the ORIGINAL bug for documentation: recording by display name still throws,
    // proving the fix is specifically "use patternId" and not an accidental side effect.
    expect(() => lib.recordOutcome(alerts[0]!.patternName!, 'CONFIRMED')).toThrow();
  });
});
