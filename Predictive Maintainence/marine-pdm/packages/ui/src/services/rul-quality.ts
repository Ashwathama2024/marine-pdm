// Per-label trustworthiness flag for the analytic RUL columns.
//
// THE PROBLEM. `rulTrue_*` means "minutes until the injected fault drives this sensor across its
// alarm band, measured from the fault-free value at this operating point". That definition needs a
// trustworthy fault-free value. The recorder can only supply the LAGGED baseline, which is a filtered
// estimate — and `FeatureEngine.actualAsBaseline()` re-seeds that filter onto the LIVE, possibly
// faulted reading every time rpm drops below RUN_RPM (300). It then climbs back out over tens of
// ticks through a two-stage lag cascade.
//
// Every label computed during that recovery is solved from a wrong starting point, and wrong in a
// systematically DIRECTIONAL way, which is what makes it poison rather than noise. For a `dir:'low'`
// metric such as lube, `threshold − healthyValue` and `perSeverity` are both negative; as a depressed
// baseline recovers upward the numerator grows more negative and the quotient GROWS, so a regressor
// sees RUL increasing while the fault develops. The depressed seed also sits below `lo`, so
// `alreadyInBand` fires and the sequence opens with a spurious 0. Both features were observed live and
// are reproduced in baseline-settling.test.ts.
//
// THE FIX IS NOT TO CORRECT THE LABEL — the honest fault-free value simply is not known during the
// recovery. It is to make every row state whether its own label is trustworthy, so training can filter
// instead of silently averaging poison.
//
// TWO DESIGN POINTS WORTH KEEPING:
//
//  1. Thresholded in MINUTES OF LABEL ERROR, not in sensor units. A sensor-unit epsilon cannot be
//     defended: the same 0.2 bar of baseline error is negligible for a FAST fault and enormous for a
//     SLOW one, and the two-stage cascade makes the settling time vary ~10x across sensors anyway
//     (jacket α=0.02 vs fuelOilPressure α=0.20, each applied twice). Converting through the label's
//     own sensitivity gives a tolerance you can state plainly: "flag while the baseline gap could
//     distort this label by more than X minutes".
//
//  2. STATELESS. Measuring the gap directly against the un-lagged baseline needs no tick history, no
//     module-level singleton and no settling counter. That matters because the recorder is full of
//     module state plus a `lastT` StrictMode guard — a stateful detector would bleed between tests and
//     be corrupted by React's dev double-invoke. Nothing here to corrupt.

import type { BaselineSnapshot } from '@marine-pdm/shared';
import type { RulDetail } from './rul';
import { FORECAST_LIMITS } from './forecast';

/**
 * Per-key label quality. One enum column rather than a boolean plus a separate reason: a bare boolean
 * conflates "the baseline had not settled" with "there is structurally no label here", and would
 * discard the `already-breached` zeros that are genuinely CORRECT (LO pressure at idle really does sit
 * under the rated-point running minimum).
 */
export type RulQuality =
  | 'OK'                 // settled baseline, real crossing — trustworthy
  | 'SETTLING'           // baseline not converged; this label is poison, filter it out
  | 'ALREADY_BREACHED'   // fault-free value already in the band (can be legitimate)
  | 'NO_CROSS'           // fault cannot reach the band at this intensity cap
  | 'WRONG_DIRECTION'    // fault moves this sensor away from the band
  | 'NOT_DRIVEN'         // no modelled effect links any active fault to this sensor
  | 'NO_FAULT'           // healthy row — no RUL is defined
  | 'NO_BAND';           // sensor has no coded alarm band

/**
 * How far the label may be distorted by the baseline gap before the row is flagged.
 *
 * 0.5 min against action windows of 4–8 hours (P01) down to minutes (a FAST ramp) keeps genuine
 * early-warning rows while rejecting the recovery ramp, where the error runs to tens of minutes.
 * Exported so it can be tightened without hunting through the module.
 */
export const LABEL_ERROR_TOLERANCE_MIN = 0.5;

/** Which BaselineSnapshot field carries each forecast key's fault-free value. */
const BASELINE_FIELD: Record<string, keyof BaselineSnapshot> = {
  exhaust: 'expectedExhaust',
  jacket: 'expectedJacket',
  chargeAirTemp: 'expectedChargeAirTemp',
  tcSpeed: 'expectedTcRPM',
  lube: 'expectedLube',
  pistonCoolingPress: 'expectedPistonCoolingPress',
  bearingTemp: 'expectedBearingTemp',
};

/** Forecast keys this module can assess — those with both a coded band and a baseline field. */
export const QUALITY_KEYS = Object.keys(BASELINE_FIELD).filter(k => FORECAST_LIMITS[k] !== undefined);

export interface LabelErrorInput {
  forecastKey: string;
  detail: RulDetail;
  /**
   * The EXACT number handed to analyticRul() as `healthyValue`.
   *
   * Passed explicitly rather than read from a BaselineSnapshot because the lag is a two-stage cascade:
   * FeatureEngine lags the curve (BLAG), and EngineContext lags FeatureEngine's output again
   * (BASELINE_LAG) with the same alphas — lube 0.06 and jacket 0.02 appear in both. Comparing the
   * stage-1 snapshot against `instant` would measure only half the error, and the two stages can sit
   * close to each other while jointly far from the truth, so the detector would report "settled" on
   * rows that are still poisoned. This is the total, end-to-end gap.
   */
  healthyUsed: number;
  /** Un-lagged baseline — the settled truth for this key at the current operating point. */
  instant: BaselineSnapshot;
}

/**
 * Minutes of RUL-label error implied by the current baseline gap.
 *
 *     d(minutes)/d(healthyValue) = −1 / (perSeverity · growthPerSec · 60)
 *
 * so  errorMinutes = |gap / perSeverity| / growthPerSec / 60.
 *
 * `null` when the sensitivity is unknown (no fault, no driving effect, no band) — there is no label to
 * distort in those cases, and the reason mapping handles them.
 */
export function labelErrorMinutes(input: LabelErrorInput): number | null {
  const { forecastKey, detail, healthyUsed, instant } = input;
  const field = BASELINE_FIELD[forecastKey];
  if (!field) return null;
  const { perSeverity, growthPerSec } = detail;
  if (!perSeverity || !growthPerSec) return null;

  const gap = healthyUsed - (instant[field] as number);
  if (!Number.isFinite(gap)) return null;

  return Math.abs(gap / perSeverity) / growthPerSec / 60;
}

const REASON_TO_QUALITY: Record<RulDetail['reason'], RulQuality> = {
  'crosses': 'OK',
  'already-breached': 'ALREADY_BREACHED',
  'no-fault': 'NO_FAULT',
  'not-driven': 'NOT_DRIVEN',
  'wrong-direction': 'WRONG_DIRECTION',
  'capped-below-threshold': 'NO_CROSS',
  'no-band': 'NO_BAND',
};

/**
 * Classify one key's label.
 *
 * SETTLING deliberately outranks ALREADY_BREACHED. The spurious leading zero in the observed sequence
 * came from exactly that path: a poisoned, depressed baseline sat below `lo`, so `alreadyInBand` fired
 * and the label was recorded as a legitimate breach. Checking the gap first keeps the genuine
 * already-breached rows (idle LO pressure) while catching the fabricated ones.
 */
export function classifyRulQuality(
  input: LabelErrorInput,
  tolerance = LABEL_ERROR_TOLERANCE_MIN,
): { quality: RulQuality; errorMinutes: number | null } {
  const errorMinutes = labelErrorMinutes(input);

  if (errorMinutes !== null && errorMinutes > tolerance) {
    return { quality: 'SETTLING', errorMinutes };
  }

  // `already-breached` short-circuits before the driving effect is known, so perSeverity/growthPerSec
  // are null and the gap test above cannot run. Fall back to comparing the two baselines directly:
  // if they disagree at all, the "already in band" verdict was reached from an unsettled value.
  if (input.detail.reason === 'already-breached') {
    const field = BASELINE_FIELD[input.forecastKey];
    const lim = FORECAST_LIMITS[input.forecastKey];
    if (field && lim) {
      const instantV = input.instant[field] as number;
      const instantInBand = lim.dir === 'high'
        ? instantV >= (lim.hi ?? Infinity)
        : instantV <= (lim.lo ?? -Infinity);
      // The settled baseline would NOT have been in the band — so the breach is an artefact.
      if (!instantInBand) return { quality: 'SETTLING', errorMinutes };
    }
  }

  return { quality: REASON_TO_QUALITY[input.detail.reason], errorMinutes };
}
