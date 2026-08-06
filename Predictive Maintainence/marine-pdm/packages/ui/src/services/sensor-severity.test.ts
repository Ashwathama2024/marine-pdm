// Pins the severity rule the 3D engine view shares with the dashboard gauges.
//
// Each block below corresponds to one way the 3D view previously disagreed with the dashboard on
// screen. If any of these regress, the two go back to telling the operator different things about
// the same sensor at the same tick.

import { describe, expect, it } from 'vitest';
import { getAlarmBand, hasCodedBand, sensorSeverity, severityTier } from './sensor-severity';

const WARNING = 1 / 3;
const HIGH = 2 / 3;

describe('direction awareness', () => {
  it('does not penalise lube oil pressure sitting ABOVE expected', () => {
    // lubeOilPressure declares preAlarmLow but no preAlarmHigh, so only drops are dangerous. The
    // earlier symmetric rule lit this orange whenever pressure ran high while the gauge read green.
    expect(getAlarmBand('ME.LubeOilPressure')?.preAlarmHigh).toBeUndefined();
    expect(getAlarmBand('ME.LubeOilPressure')?.preAlarmLow).toBeDefined();
    expect(sensorSeverity('ME.LubeOilPressure', 7.5, 7.0)).toBe(0);
    expect(sensorSeverity('ME.LubeOilPressure', 8.4, 7.0)).toBe(0);
  });

  it('does penalise lube oil pressure falling below expected', () => {
    expect(sensorSeverity('ME.LubeOilPressure', 5.95, 7.0)).toBeGreaterThan(0);
  });

  it('does not penalise exhaust temperature BELOW expected', () => {
    expect(sensorSeverity('ME.ExhaustTemp', 250, 300)).toBe(0);
  });

  it('does not penalise bearing temperature below expected', () => {
    expect(sensorSeverity('ME.BearingTemp', 60, 90)).toBe(0);
    expect(sensorSeverity('ME.BearingTemp', 98, 90)).toBeGreaterThan(0);
  });
});

describe('deadband', () => {
  it('ignores the first 20% of the alarm band as normal scatter', () => {
    // Exhaust band is 20 °C, so anything within 4 °C of expected is not interesting.
    expect(sensorSeverity('ME.ExhaustTemp', 304, 300)).toBe(0);
    expect(sensorSeverity('ME.ExhaustTemp', 305, 300)).toBeGreaterThan(0);
  });
});

describe('tier boundaries line up with the gauge', () => {
  // Exhaust: band 20, deadband 4. ratio = (dev - 4) / 20.
  it('crosses to warning at half the alarm band', () => {
    expect(sensorSeverity('ME.ExhaustTemp', 314, 300)).toBeCloseTo(WARNING, 6);
  });

  it('crosses to high at 80% of the alarm band', () => {
    expect(sensorSeverity('ME.ExhaustTemp', 320, 300)).toBeCloseTo(HIGH, 6);
  });

  it('saturates at 125% of the alarm band', () => {
    expect(sensorSeverity('ME.ExhaustTemp', 329, 300)).toBeCloseTo(1, 6);
    expect(sensorSeverity('ME.ExhaustTemp', 400, 300)).toBe(1);
  });

  it('rises monotonically between the tiers', () => {
    let prev = -1;
    for (let v = 300; v <= 340; v += 2) {
      const s = sensorSeverity('ME.ExhaustTemp', v, 300);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('severityTier — the colour GaugeGrid paints', () => {
  // GaugeGrid used to hold its own copy of the whole rule and colour by raw ratio: ≥0.50 yellow,
  // ≥0.80 orange, ≥1.25 red. It now calls sensorSeverity and paints severityTier, so these pin that
  // the translation is exact. A reading landing precisely ON a boundary belongs to the HIGHER tier —
  // piecewise interpolation can leave it a few ULPs short, which is what TIER_EPSILON absorbs.
  const tierOf = (v: number) => severityTier(sensorSeverity('ME.ExhaustTemp', v, 300));

  it('paints green inside the deadband', () => {
    expect(tierOf(300)).toBe('normal');
    expect(tierOf(304)).toBe('normal');
    expect(tierOf(313)).toBe('normal');
  });

  it('turns yellow exactly at half the alarm band', () => {
    expect(tierOf(314)).toBe('warning'); // dev 14, ratio (14-4)/20 = 0.50
    expect(tierOf(319)).toBe('warning');
  });

  it('turns orange exactly at 80% of the alarm band', () => {
    expect(tierOf(320)).toBe('high'); // dev 20, ratio 0.80
    expect(tierOf(328)).toBe('high');
  });

  it('turns red exactly at 125% of the alarm band', () => {
    expect(tierOf(329)).toBe('critical'); // dev 29, ratio 1.25
    expect(tierOf(600)).toBe('critical');
  });

  it('never skips a tier as the reading climbs', () => {
    const order = ['normal', 'warning', 'high', 'critical'];
    let seen = 0;
    for (let v = 300; v <= 340; v += 0.25) {
      const i = order.indexOf(severityTier(sensorSeverity('ME.ExhaustTemp', v, 300)));
      expect(i, `at ${v}`).toBeGreaterThanOrEqual(seen);
      expect(i - seen, `jumped a tier at ${v}`).toBeLessThanOrEqual(1);
      seen = i;
    }
    expect(seen).toBe(3);
  });
});

describe('the pressure band tracks load', () => {
  // GaugeGrid's dynamicPressBand computed this at its call sites and is now deleted, so the rule
  // survives only here: the rated band is calibrated at 100% load, but the pre-alarm floor is
  // absolute, so at high load the real gap from expected down to it is wider than the rated band.
  it('widens the band to the true gap when the engine is loaded', () => {
    // expected 7.0, preAlarmLow 5.5 → gap 1.5, well over the 0.8 rated band. Deadband is 20% of
    // 1.5 = 0.3, so a 1.0 bar drop scores (1.0-0.3)/1.5 = 0.47 — under the warning tier.
    expect(severityTier(sensorSeverity('ME.LubeOilPressure', 6.0, 7.0))).toBe('normal');
    // Against the narrower rated band the same drop would be (1.0-0.16)/0.8 = 1.05 → orange.
    expect(sensorSeverity('ME.LubeOilPressure', 6.0, 7.0)).toBeLessThan(HIGH);
  });

  it('falls back to the rated band at low load, where the gap has closed', () => {
    // FO pressure: rated band 1.5, preAlarmLow 5.5. At expected 5.9 the gap is 0.4 — under 35% of
    // the rated band — so the rated band applies and a 0.39 bar drop is nothing: (0.39-0.30)/1.5.
    // Had the collapsed gap been used as the band it would score (0.39-0.08)/0.4 = 0.78, i.e. orange
    // on a sensor sitting a fifth of a bar off its own baseline. That is the failure mode the 35%
    // floor exists to prevent, so this asserts the tier, not just the number.
    const s = sensorSeverity('ME.FuelOilPressure', 5.51, 5.9);
    expect(s).toBeGreaterThan(0);
    expect(severityTier(s)).toBe('normal');
  });
});

describe('absolute ECS limits fire regardless of baseline', () => {
  it('reports critical at the shutdown threshold', () => {
    expect(sensorSeverity('ME.LubeOilPressure', 3.9, 7.0)).toBe(1);
    expect(sensorSeverity('ME.ExhaustTemp', 580, 300)).toBe(1);
  });

  it('reports high the moment a pre-alarm level is crossed', () => {
    // preAlarmLow is 5.5 bar and expected is on the safe side of it.
    expect(sensorSeverity('ME.LubeOilPressure', 5.4, 7.0)).toBeCloseTo(HIGH, 6);
  });

  it('does not apply a load-inappropriate limit', () => {
    // At idle, expected pressure (5.2) already sits below the fixed preAlarmLow (5.5). Applying that
    // limit would alarm every tick at idle, so it is skipped and a reading tracking its own baseline
    // scores nothing.
    expect(sensorSeverity('ME.LubeOilPressure', 5.15, 5.2)).toBe(0);
  });

  it('still honours a genuine L2 crossing at idle', () => {
    // alarmLow is 5.0 and expected (5.2) is above it, so an actual AT 5.0 is a real alarm even
    // though the engine is lightly loaded. Not a false positive — the limit genuinely applies.
    expect(sensorSeverity('ME.LubeOilPressure', 5.0, 5.2)).toBe(1);
  });
});

describe('the band is per sensor, not a percentage of the reading', () => {
  it('scores the same relative deviation differently on rail pressure and exhaust', () => {
    // 10% off expected. Rail's real pre-alarm gap is 120 bar of a ~1770 bar reading (6.8%), so 10%
    // is deep into alarm; exhaust's is 20 °C of ~440 °C (4.5%), so 10% is also critical — but the
    // old "15% of expected" rule scored BOTH at 0.67 and neither at their true level.
    const rail = sensorSeverity('ME.FuelRailPressure', 1593, 1770);
    const exhaust = sensorSeverity('ME.ExhaustTemp', 484, 440);
    expect(rail).toBe(1);
    expect(exhaust).toBe(1);

    // And a deviation that is small in percentage terms can still be serious: 3 bar off a 1770 bar
    // rail is 0.17%, well inside any percentage rule, and correctly reads as nothing here.
    expect(sensorSeverity('ME.FuelRailPressure', 1767, 1770)).toBe(0);
  });
});

describe('sensors with no coded band', () => {
  it('scores zero rather than guessing', () => {
    // The dashboard colours these from absolute thresholds or its own SFOC rule; an uncoloured part
    // is better than a differently-coloured one.
    for (const id of ['ME.SFOC', 'ME.ShaftPower', 'ME.Nonsense']) {
      expect(hasCodedBand(id), id).toBe(false);
      expect(sensorSeverity(id, 999, 1), id).toBe(0);
    }
  });

  it('still judges LO filter ΔP by its absolute thresholds', () => {
    // It has no deviation band — the dashboard colours it from absolute limits alone — but an ECS
    // threshold crossing is critical regardless of baseline, so it must not silently read healthy.
    expect(hasCodedBand('ME.LOFilterDP')).toBe(false);
    expect(sensorSeverity('ME.LOFilterDP', 999, 1)).toBe(1);
    expect(sensorSeverity('ME.LOFilterDP', 0.2, 0.2)).toBe(0);
  });

  it('scores zero when no baseline is available yet', () => {
    expect(sensorSeverity('ME.ExhaustTemp', 400, undefined)).toBe(0);
    expect(sensorSeverity('ME.ExhaustTemp', 400, NaN)).toBe(0);
  });
});
