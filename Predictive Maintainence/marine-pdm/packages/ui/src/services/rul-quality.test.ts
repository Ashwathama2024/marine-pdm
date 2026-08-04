import { describe, it, expect } from 'vitest';
import type { BaselineSnapshot } from '@marine-pdm/shared';
import { createFaultConfig } from '@marine-pdm/simulator';
import { analyticRul } from './rul';
import { classifyRulQuality, labelErrorMinutes, LABEL_ERROR_TOLERANCE_MIN } from './rul-quality';

// A settled baseline at a healthy rated point. Only the fields the quality classifier reads matter;
// the rest are filled so the object satisfies BaselineSnapshot.
function baseline(over: Partial<BaselineSnapshot> = {}): BaselineSnapshot {
  return {
    expectedExhaust: 440,
    expectedLube: 6.4,
    expectedCyls: Array.from({ length: 20 }, () => 440),
    // 92.5 °C, not the rated 77: F05's perSeverity on jacket is only 15 × 0.25 = 3.75 °C, so from 77
    // the 95 °C alarm needs severity 4.8 and analyticRul correctly reports capped-below-threshold.
    // The crossing branch — the one whose trustworthiness this module judges — only exists near the
    // band. Same convention as rul.test.ts.
    expectedJacket: 92.5,
    expectedScavenge: 3.2,
    expectedTcRPM: 24000,
    expectedSfoc: 185,
    expectedChargeAirTemp: 63,
    expectedFuelOilPressure: 8.0,
    expectedFuelOilTemp: 25,
    expectedLoFilterDP: 0.15,
    expectedPistonCoolingPress: 4.0,
    expectedShaftPower: 7735,
    expectedBearingTemp: 96,       // seed ME.BearingTemp.Mean at the rated point
    expectedLubeLastBearing: 3.51, // gallery 6.39 × 0.55 at the rated point
    expectedFuelRailPressure: 1770,
    ...over,
  };
}

const f05 = (speed: 'SLOW' | 'MEDIUM' | 'FAST' = 'MEDIUM', intensity = 100) =>
  [createFaultConfig('F05', { intensity, speed, currentSeverity: 0 })];

describe('labelErrorMinutes — converts a baseline gap into minutes of label error', () => {
  it('is zero when the lagged value already equals the settled truth', () => {
    const instant = baseline();
    const detail = analyticRul(f05(), 'jacket', instant.expectedJacket);
    const err = labelErrorMinutes({
      forecastKey: 'jacket', detail, healthyUsed: instant.expectedJacket, instant,
    });
    expect(err).toBe(0);
  });

  it('scales with the size of the gap', () => {
    const instant = baseline();
    const detail = analyticRul(f05(), 'jacket', instant.expectedJacket);
    const small = labelErrorMinutes({ forecastKey: 'jacket', detail, healthyUsed: 92.0, instant })!;
    const large = labelErrorMinutes({ forecastKey: 'jacket', detail, healthyUsed: 91.0, instant })!;
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  it('the SAME sensor gap costs far more label error on a SLOW fault than a FAST one', () => {
    // This is the whole reason the threshold lives in minutes rather than sensor units. A fixed
    // sensor-unit epsilon would treat these two identically; they are ~15x apart.
    const instant = baseline();
    const gapArgs = { forecastKey: 'jacket', healthyUsed: 92.0, instant };
    const slow = labelErrorMinutes({ ...gapArgs, detail: analyticRul(f05('SLOW'), 'jacket', 92.0) })!;
    const fast = labelErrorMinutes({ ...gapArgs, detail: analyticRul(f05('FAST'), 'jacket', 92.0) })!;
    expect(slow / fast).toBeCloseTo(0.012 / 0.0008, 0);   // FAST rate / SLOW rate
  });

  it('returns null when there is no sensitivity to distort (no fault)', () => {
    const instant = baseline();
    const detail = analyticRul([], 'jacket', instant.expectedJacket);
    expect(labelErrorMinutes({
      forecastKey: 'jacket', detail, healthyUsed: instant.expectedJacket, instant,
    })).toBeNull();
  });
});

describe('classifyRulQuality', () => {
  it('OK on a settled baseline with a real crossing', () => {
    const instant = baseline();
    const detail = analyticRul(f05(), 'jacket', instant.expectedJacket);
    expect(detail.reason).toBe('crosses');
    const { quality } = classifyRulQuality({
      forecastKey: 'jacket', detail, healthyUsed: instant.expectedJacket, instant,
    });
    expect(quality).toBe('OK');
  });

  it('SETTLING once the gap could distort the label past tolerance', () => {
    const instant = baseline();
    // Walk the lagged value away from truth until the implied label error exceeds tolerance.
    let healthyUsed = instant.expectedJacket;
    let quality = 'OK';
    for (let i = 0; i < 40 && quality === 'OK'; i++) {
      healthyUsed -= 0.1;   // away from the band, so the crossing branch stays live
      const detail = analyticRul(f05(), 'jacket', healthyUsed);
      quality = classifyRulQuality({ forecastKey: 'jacket', detail, healthyUsed, instant }).quality;
    }
    expect(quality).toBe('SETTLING');

    const detail = analyticRul(f05(), 'jacket', healthyUsed);
    const err = labelErrorMinutes({ forecastKey: 'jacket', detail, healthyUsed, instant })!;
    expect(err).toBeGreaterThan(LABEL_ERROR_TOLERANCE_MIN);
  });

  it('NO_FAULT on a healthy row — there is no RUL to trust or distrust', () => {
    const instant = baseline();
    const detail = analyticRul([], 'jacket', instant.expectedJacket);
    const { quality } = classifyRulQuality({
      forecastKey: 'jacket', detail, healthyUsed: instant.expectedJacket, instant,
    });
    expect(quality).toBe('NO_FAULT');
  });

  it('keeps a GENUINE already-breached label when the settled baseline is also in the band', () => {
    // LO pressure at idle really does sit under the rated-point running minimum. That zero is correct
    // and must survive, or the filter would discard true labels.
    const instant = baseline({ expectedLube: 1.0 });          // settled truth is itself below `lo`
    const detail = analyticRul(f05(), 'lube', 1.0);
    expect(detail.reason).toBe('already-breached');
    const { quality } = classifyRulQuality({
      forecastKey: 'lube', detail, healthyUsed: 1.0, instant,
    });
    expect(quality).toBe('ALREADY_BREACHED');
  });

  it('re-labels a FABRICATED already-breached as SETTLING', () => {
    // The observed leading zero: a poisoned, depressed baseline dips under `lo` and analyticRul reports
    // a breach, but the settled truth is nowhere near the band. Without this, the spurious zeros are
    // recorded as legitimate breaches and poison the training set at the worst possible point — the
    // start of every ramp.
    const instant = baseline({ expectedLube: 6.4 });          // settled truth is healthy
    const detail = analyticRul(f05(), 'lube', 1.0);           // but the lagged value is depressed
    expect(detail.reason).toBe('already-breached');
    const { quality } = classifyRulQuality({
      forecastKey: 'lube', detail, healthyUsed: 1.0, instant,
    });
    expect(quality).toBe('SETTLING');
  });
});
