// Fault severity ramp mode — shared because TWO injection paths and one recorder depend on it.
//
// THE BUG THIS FIXES: both injectors created faults with `currentSeverity: intensity / 100`
// ("immediate full effect"). Severity therefore started already pinned at its cap, so the growth loop
// in tickFaultsMTU8000 had nothing left to do and the SLOW / MEDIUM / FAST control was inert — the
// speed was recorded on the FaultConfig but never changed the engine's behaviour.
//
// That is fine for a demo (inject, see the alarm immediately) and fatal for training data: every
// recorded sample sits at full severity, so a model learns to recognise faults that have already
// tripped their alarm. Predicting an alarm 8 minutes out requires samples from the ramp.
//
// Kept here rather than in component state because FaultInjector (F02–F06, F08, F09) and
// Simulator's CylinderInjectorPanel (F01, F07) would otherwise hold independent copies and could
// silently disagree — which would put mixed step/ramp trajectories in one dataset with no way to
// tell them apart afterwards. Same localStorage + memo + pub/sub shape as services/ai-settings.ts.

const STORAGE_KEY = 'pdm_ramp_mode';

/** Default ON: honest physics, and the only mode that produces usable training trajectories. */
const DEFAULT = true;

let cache: boolean | null = null;
const listeners = new Set<() => void>();

export function isRampMode(): boolean {
  if (cache !== null) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw === null ? DEFAULT : raw === 'true';
  } catch {
    cache = DEFAULT;
  }
  return cache;
}

export function setRampMode(on: boolean): void {
  cache = on;
  try { localStorage.setItem(STORAGE_KEY, String(on)); } catch { /* storage may be unavailable */ }
  listeners.forEach(l => l());
}

export function subscribeRampMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Starting severity for a newly injected fault.
 *   ramp on  → 0, so severity climbs at FAULT_GROWTH_RATES[speed] toward the intensity cap
 *              (SLOW ≈ 20 min, MEDIUM ≈ 5.5 min, FAST ≈ 80 s to reach it).
 *   ramp off → the cap, reproducing the previous immediate-effect behaviour for demos.
 */
export function initialSeverity(intensityPct: number): number {
  return isRampMode() ? 0 : intensityPct / 100;
}
