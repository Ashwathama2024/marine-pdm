// Analytic remaining-useful-life — the ground-truth RUL label for the training set.
//
// WHY ANALYTIC AND NOT ESTIMATED: the degradation model is linear by construction
// (degradation-matrix.ts), and its weights are pinned to the real physics partials by a
// finite-difference test (packages/simulator/tests/degradation-matrix.test.ts). So given the injected
// fault, we can SOLVE for the exact moment a sensor crosses its coded alarm band instead of
// extrapolating a noisy slope. That exact value is the label; the noisy extrapolation
// (forecast.minutesToAlarm) is recorded next to it as the naive baseline a learned model must beat.
//
// THE RELATION, and why this file does the arithmetic itself:
//
//   rootFactorValue = severity × rootMax          (tickFaultsMTU8000, e.g. F05: coolingEffDrop = s·0.25)
//   deviation       = weight × rootFactorValue    (physics partial, e.g. targetCoolantTemp += drop·15)
//                   = weight × severity × rootMax
//
// `severity` already carries the intensity cap — severityAt() returns min(rate·t, intensity/100) and
// tickFaultsMTU8000 uses currentSeverity directly with no further intensity factor.
//
// The matrix ships a predictEffect() helper, but it returns `severity · (intensity/100) · weight`:
// it applies intensity a second time and omits rootMax entirely, so for F05 at full severity it
// returns 15 °C where the physics produces 3.75 °C. It is only referenced by a test that asserts
// linearity rather than magnitude, which is how the error survived. Not calling it here is
// deliberate — see the spawned task to fix it, after which this arithmetic should be replaced.
//
// Verified: F05, weight 15 °C, rootMax 0.25, severity 1.0 → 3.75 °C, matching `(1−ce)·15` at
// coolingEffDrop 0.25.

import { DEGRADATION_MODES, ROOT_FACTORS, GROWTH_RATES } from '@marine-pdm/simulator';
import type { FaultConfig } from '@marine-pdm/simulator';
import { FORECAST_LIMITS } from './forecast';
import { matrixIdsForForecastKey } from './sensor-map';

/** Strip the per-instance suffix: 'F01_cyl_7' → 'F01'. */
export function baseFaultId(id: string): string {
  return id.split('_')[0]!;
}

export interface RulDetail {
  minutes: number | null;
  faultId: string | null;
  /** Severity at which the sensor crosses the band — null when it never does at this intensity. */
  severityAtCross: number | null;
  reason: 'crosses' | 'already-breached' | 'no-fault' | 'not-driven' | 'wrong-direction' | 'capped-below-threshold' | 'no-band';
}

const NONE: RulDetail = { minutes: null, faultId: null, severityAtCross: null, reason: 'no-fault' };

/**
 * Exact minutes until `forecastKey`'s metric crosses its coded alarm band, given the active faults.
 *
 * @param faults        engine.getMTUFaultList() — the ground truth, only ever used for labelling
 * @param forecastKey   a FORECAST_LIMITS key ('exhaust', 'jacket', 'lube', …)
 * @param healthyValue  the fault-free value of that metric at the CURRENT load/rpm (the lagged
 *                      baseline). Using the live reading instead would fold the fault's own effect
 *                      into the starting point and shorten every ETA.
 *
 * Returns the soonest crossing across all active faults. `minutes: 0` means already in the band.
 */
export function analyticRul(faults: FaultConfig[], forecastKey: string, healthyValue: number): RulDetail {
  const lim = FORECAST_LIMITS[forecastKey];
  if (!lim) return { ...NONE, reason: 'no-band' };
  const threshold = lim.dir === 'high' ? lim.hi : lim.lo;
  if (threshold === undefined) return { ...NONE, reason: 'no-band' };

  // No fault → no label. This check MUST come before the already-in-band check below: RUL means
  // "minutes until the injected fault trips this alarm", which does not exist without a fault. Testing
  // in-band first emitted rulTrue_lube = 0 on every healthy idle row, because the MTU limits are rated
  // -point limits and LO pressure at 400 RPM / 0% load genuinely sits under the running minimum — a
  // spurious zero that would teach a regressor that a healthy idling engine is at end of life.
  const active = faults.filter(f => f.active);
  if (active.length === 0) return NONE;

  // With a fault active, a fault-free baseline already inside the band means the alarm is met on the
  // operating point alone, so there is no time left to project.
  const alreadyInBand = lim.dir === 'high' ? healthyValue >= threshold : healthyValue <= threshold;
  if (alreadyInBand) return { minutes: 0, faultId: null, severityAtCross: 0, reason: 'already-breached' };

  const matrixIds = matrixIdsForForecastKey(forecastKey);
  if (matrixIds.length === 0) return { ...NONE, reason: 'not-driven' };

  let best: RulDetail = { ...NONE, reason: 'not-driven' };

  for (const f of active) {
    const mode = DEGRADATION_MODES.find(m => m.id === baseFaultId(f.id));
    if (!mode) continue;

    // Pick by the DECLARED ORDER of matrixSensorIds, not by the largest weight.
    //
    // A UI sensor can map to several matrix effects with different semantics — ME.ExhaustTemp lists
    // exhaustMeanTemp, cylTemps[all], cylTemps[n] and the per-bank means. The recorded series is the
    // 20-cylinder MEAN, so the mean effect is the correct one; taking the largest weight instead picks
    // F01's per-cylinder cylTemps[n] (65 °C vs the mean's 65/20 = 3.25 °C) and overstates the fault's
    // authority over the observed signal by 20x, making rulTrue far too short. SENSOR_META lists the
    // most representative id first for exactly this reason.
    const effect = matrixIds
      .map(id => mode.effects.find(e => e.modeled && e.weight !== 0 && e.sensorId === id))
      .find(Boolean);
    if (!effect) continue;

    const rootMax = ROOT_FACTORS[mode.rootFactor].rootMax;
    const perSeverity = effect.weight * rootMax;          // sensor units per unit severity
    if (perSeverity === 0) continue;

    // Severity at which the accumulated deviation lands exactly on the threshold.
    const severityAtCross = (threshold - healthyValue) / perSeverity;

    if (severityAtCross < 0) {
      // The fault moves this sensor AWAY from the band — it can never trip it.
      if (best.reason === 'not-driven') best = { ...NONE, reason: 'wrong-direction' };
      continue;
    }

    const cap = f.intensity / 100;   // severity cannot exceed this (severityAt's cap)
    if (severityAtCross > cap) {
      if (best.reason === 'not-driven' || best.reason === 'wrong-direction') {
        best = { minutes: null, faultId: f.id, severityAtCross, reason: 'capped-below-threshold' };
      }
      continue;
    }

    const rate = GROWTH_RATES[f.speed];  // severity per second
    const seconds = rate > 0 ? (severityAtCross - f.currentSeverity) / rate : 0;
    const minutes = Math.max(0, seconds / 60);

    if (best.minutes === null || minutes < best.minutes) {
      best = { minutes, faultId: f.id, severityAtCross, reason: 'crosses' };
    }
  }

  return best;
}

/** Convenience: just the number, for the flat CSV column. */
export function analyticRulMinutes(faults: FaultConfig[], forecastKey: string, healthyValue: number): number | null {
  return analyticRul(faults, forecastKey, healthyValue).minutes;
}
