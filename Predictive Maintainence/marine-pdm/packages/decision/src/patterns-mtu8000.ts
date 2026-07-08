// packages/decision/src/patterns-mtu8000.ts
// MTU 8000-specific fault pattern MATCHING LOGIC (P01–P08). The pattern DEFINITIONS themselves
// (ecsAlarmCode, maintenanceTask, name) live in @marine-pdm/knowledge
// (patterns-mtu8000-data.ts / MTU8000_PATTERNS), registered into the shared patternLibrary
// singleton — decision depends on knowledge, not the reverse, so data lives there and this file
// only contains the pure matching function that consumes MTU8000Features and returns matched IDs.
// Look up a matched ID's ecsAlarmCode/maintenanceTask/name via patternLibrary.getPattern(id).
// PDF upgrade spec §8.1.

import type { MTU8000Features } from '@marine-pdm/shared';
export type { MTU8000Features };

// ── PATTERN MATCHING HELPERS (MTU 8000-specific feature inputs) ─────────────────
// MTU8000Features itself lives in @marine-pdm/shared (built by
// packages/features/src/mtu8000-feature-builder.ts) — re-exported here so existing callers can
// keep importing it from this file.

// Matches P01–P08 against MTU8000Features, returning matched pattern IDs.
export function matchMTU8000Patterns(features: MTU8000Features): string[] {
  const matched: string[] = [];

  // P01 — Single injector: ONE cylinder elevated, others normal
  const elevatedCyls = features.cylDevs
    .map((d, i) => ({ i, d }))
    .filter(({ d }) => d > 20);
  if (
    elevatedCyls.length === 1 &&
    features.cylImbalance > 15 &&
    features.sfocDev > 3
  ) {
    matched.push('P01');
  }

  // P02 — A-side multi-injector: A-side elevated, B-side stable
  if (
    features.aSideMeanDev > 18 &&
    features.bSideMeanDev < 10 &&
    features.sfocDev > 8
  ) {
    matched.push('P02');
  }

  // P03 — Lube pressure loss: last-bearing pressure dropping, bearings heating
  if (
    features.lubeLastBearingDev > 0.5 &&
    features.lubeRate < -0.1 &&
    features.bearingDevs.some(d => d > 8)
  ) {
    matched.push('P03');
  }

  // P04 — Bearing overtemp: specific bearing hot, lube pressure dropping
  if (
    features.bearingDevs.some(d => d > 15) &&
    features.lubeDev > 0.3 &&
    features.bearingRates.some(r => r > 0.3)
  ) {
    matched.push('P04');
  }

  // P05 — HT Cooler fouling: coolant up, ALL cyls elevated, imbalance low (systemic)
  if (
    features.coolantTempDev > 6 &&
    features.allCylMeanDev > 12 &&
    features.cylImbalance < 20 &&  // low imbalance = systemic, not single-cyl
    features.chargeAirTempDev > 5
  ) {
    matched.push('P05');
  }

  // P06 — TC fouling: TC speed dropped, charge air pressure low, backpressure high
  if (
    features.tcSpeedDevs.some(d => d > 1500) &&
    features.chargeAirPressDev > 0.3 &&
    features.crankcasePressure > -1  // loosely — back pressure rises
  ) {
    matched.push('P06');
  }

  // P07 — Erratic injector: cyl stdDev high (oscillating), crankcase rate rising
  if (
    features.cylStdDevs.some(sd => sd > 8) &&
    features.cylDevs.some(d => d > 15) &&
    features.crankcaseRate > 0.05
  ) {
    matched.push('P07');
  }

  // P08 — Piston blow-by: crankcase pressure elevated and rising
  if (
    features.crankcasePressure > 2 &&
    features.crankcaseRate > 0.1
  ) {
    matched.push('P08');
  }

  return matched;
}

// All 8 pattern IDs matchMTU8000Patterns() can produce — used by decision-engine.ts to call
// patternLibrary.recordMatch(id, false) on every non-matching id each tick, so a pattern's
// persistence counter correctly decays to 0 the instant it stops matching (recordMatch is only
// invoked for matched ids otherwise, which would leave a stale non-zero counter behind).
export const MTU8000_PATTERN_IDS = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08'] as const;
