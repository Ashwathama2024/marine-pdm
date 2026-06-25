/**
 * Mandatory confidence formula — the ONLY permitted method per spec Section 6.2.
 * Never return a confidence number from any other calculation.
 *
 * @param evidenceCount  0–5: how many independent signals agree
 * @param dataQuality    0–1: freshness × completeness
 * @param patternStrength 0–1: how closely pattern conditions are met
 */
export function computeConfidence(
  evidenceCount: number,
  dataQuality: number,
  patternStrength: number,
): number {
  const raw = (Math.min(5, evidenceCount) / 5) * dataQuality * patternStrength;
  return Math.round(Math.min(0.97, raw) * 100) / 100;
}

export function computeDataQuality(
  dataFreshnessSeconds: number,
  sensorCompleteness: number, // fraction of expected sensors reporting
): number {
  // Freshness: 1.0 if fresh (≤5s), drops linearly to 0 at 30s
  const freshnessScore = Math.max(0, 1 - dataFreshnessSeconds / 30);
  return freshnessScore * Math.min(1, sensorCompleteness);
}
