// services/training-calibration.test.ts
//
// Phase 7 of OEM-CALIBRATION-GAP.md: rows recorded against the pre-OEM envelope are DELETED, not
// migrated and not merely filtered.
//
// Why deletion is the right call, pinned here because it is a destructive rule and deserves to be
// deliberate: `analyticRul()` solves `(threshold − healthy) / perSeverity`, and before the
// recalibration all three terms were wrong — baselines mirroring a physics that violated five OEM
// limits, thresholds that were in places invented, weights that were partials of the old
// equations. The labels are biased, not noisy. And nothing in a row's content gives that away:
// `rulQuality_*` compares the lagged baseline against the instant one, so an error in the curve
// itself sits in both and cancels, and the row reports OK (ui/CLAUDE.md gotcha 7).

import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION,
  MIN_TRUSTED_SCHEMA_VERSION,
  CALIBRATION_REVISION,
  isTrustedRun,
} from './training-store';

describe('schema and calibration versioning', () => {
  it('rows written now are trusted by the purge rule', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(MIN_TRUSTED_SCHEMA_VERSION);
    expect(isTrustedRun({ schemaVersion: SCHEMA_VERSION })).toBe(true);
  });

  it('bumped past the last pre-recalibration schema', () => {
    // v1-v3 are the captures taken against the pre-OEM envelope.
    expect(MIN_TRUSTED_SCHEMA_VERSION).toBeGreaterThan(3);
  });

  it('names the calibration the labels were solved against', () => {
    expect(CALIBRATION_REVISION).toMatch(/zng00028788/i);
  });
});

describe('isTrustedRun — the rule purgeStaleCalibration deletes on', () => {
  it('rejects every pre-recalibration schema version', () => {
    for (const v of [1, 2, 3]) {
      expect(isTrustedRun({ schemaVersion: v }), `v${v}`).toBe(false);
    }
  });

  it('accepts the current version and anything later', () => {
    expect(isTrustedRun({ schemaVersion: MIN_TRUSTED_SCHEMA_VERSION })).toBe(true);
    expect(isTrustedRun({ schemaVersion: MIN_TRUSTED_SCHEMA_VERSION + 1 })).toBe(true);
  });

  it('rejects a missing or unparseable version rather than assuming the best', () => {
    // Fails toward deleting a questionable run, not toward keeping one that poisons a training
    // set. A pre-v1 row carries no version at all.
    expect(isTrustedRun({ schemaVersion: undefined as unknown as number })).toBe(false);
    expect(isTrustedRun({ schemaVersion: NaN })).toBe(false);
    expect(isTrustedRun({ schemaVersion: 'four' as unknown as number })).toBe(false);
  });
});
