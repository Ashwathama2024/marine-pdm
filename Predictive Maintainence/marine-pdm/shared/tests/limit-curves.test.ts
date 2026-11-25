// shared/tests/limit-curves.test.ts
//
// The limit model has to carry RPM-indexed curves, because most of the MTU 8000's coded limits are
// curves (ZNG00028788 sheet 2) and writing one down as a scalar silently picks an engine speed.
// These tests pin both halves of that: a curve entry resolves to the right point, and a band of
// plain numbers behaves exactly as it did before curves existed.

import { describe, it, expect } from 'vitest';
import {
  ALARM_LIMITS,
  resolveLimit,
  resolveAlarmBand,
  resolveLimitSet,
  oemCurve,
} from '../src/index';
import type { LimitValue } from '../src/index';

describe('resolveLimit', () => {
  it('passes a scalar through unchanged at any speed', () => {
    expect(resolveLimit(5.5, 400)).toBe(5.5);
    expect(resolveLimit(5.5, 1150)).toBe(5.5);
    expect(resolveLimit(5.5, 1500)).toBe(5.5);
  });

  it('evaluates a curve at the speed given', () => {
    const pistonCoolingShutdown: LimitValue = (rpm: number) => oemCurve(2, rpm);
    expect(resolveLimit(pistonCoolingShutdown, 1150)).toBe(4.7);
    expect(resolveLimit(pistonCoolingShutdown, 800)).toBe(3);
    expect(resolveLimit(pistonCoolingShutdown, 400)).toBe(0.4);
  });

  it('propagates undefined, so an absent threshold stays absent', () => {
    expect(resolveLimit(undefined, 1150)).toBeUndefined();
  });
});

describe('resolveAlarmBand', () => {
  it('resolves a mixed band of scalars and curves', () => {
    const band = {
      physMin: 2.0,
      physMax: 10.0,
      preAlarmLow: (rpm: number) => oemCurve(1, rpm),   // piston cooling Lim1, warning
      shutdownLow: (rpm: number) => oemCurve(2, rpm),   // piston cooling Lim2, SHUTDOWN
    };

    const rated = resolveAlarmBand(band, 1150);
    expect(rated.physMin).toBe(2.0);
    expect(rated.physMax).toBe(10.0);
    expect(rated.preAlarmLow).toBe(5.2);
    expect(rated.shutdownLow).toBe(4.7);

    // The same band at manoeuvring speed is a genuinely different band — which is the whole point.
    const slow = resolveAlarmBand(band, 600);
    expect(slow.preAlarmLow).toBe(1.5);
    expect(slow.shutdownLow).toBe(1);

    // and the shutdown always sits below the warning, at every speed on the curve
    for (const rpm of [300, 400, 500, 600, 800, 900, 1000, 1150, 1400]) {
      const b = resolveAlarmBand(band, rpm);
      expect(b.shutdownLow!, `rpm ${rpm}`).toBeLessThanOrEqual(b.preAlarmLow!);
    }
  });
});

describe('resolveLimitSet — the real ALARM_LIMITS', () => {
  it('leaves a set of scalar bands value-identical at every speed', () => {
    // Nothing in ALARM_LIMITS is a curve yet; this is the backward-compatibility guarantee the
    // mechanism had to keep. When Phase 5 points entries at curves, this test narrows to the
    // entries that are still scalars rather than being deleted.
    const atIdle = resolveLimitSet(ALARM_LIMITS, 400);
    const atRated = resolveLimitSet(ALARM_LIMITS, 1150);

    for (const band of Object.keys(ALARM_LIMITS) as Array<keyof typeof ALARM_LIMITS>) {
      const authored = ALARM_LIMITS[band] as Record<string, LimitValue>;
      for (const key of Object.keys(authored)) {
        if (typeof authored[key] === 'function') continue;   // curve entries vary by design
        expect(
          (atRated[band] as Record<string, number>)[key],
          `${String(band)}.${key} at rated`,
        ).toBe(authored[key]);
        expect(
          (atIdle[band] as Record<string, number>)[key],
          `${String(band)}.${key} at idle`,
        ).toBe(authored[key]);
      }
    }
  });

  it('keeps every band key, so no consumer loses a threshold', () => {
    const resolved = resolveLimitSet(ALARM_LIMITS, 1150);
    expect(Object.keys(resolved).sort()).toEqual(Object.keys(ALARM_LIMITS).sort());
    for (const band of Object.keys(ALARM_LIMITS) as Array<keyof typeof ALARM_LIMITS>) {
      expect(Object.keys(resolved[band]).sort()).toEqual(Object.keys(ALARM_LIMITS[band]).sort());
    }
  });
});
