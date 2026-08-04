// engine3d/palette.ts — colours for the 3D view.
//
// The app's existing --risk-normal is teal (#00D4AA). The 3D view uses a distinct phosphor green so
// the wireframe reads as a schematic overlay rather than as "every reading is normal", and so the
// risk ramp below still has somewhere to travel. Warning/high/critical reuse the app's exact tokens
// so a hot cylinder is the same orange here as on the dashboard.

import { Color } from 'three';

export const GREEN = '#39FF9E';
export const FILL = '#050D0A';
export const BACKDROP = '#02070C';

const NORMAL = new Color(GREEN);
const WARNING = new Color('#F59E0B');
const HIGH = new Color('#F97316');
const CRITICAL = new Color('#EF4444');

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Writes the colour for a 0-1 risk into `target` (mutating, so the frame loop allocates nothing).
 * Ramps green → amber → orange → red across the same thirds the risk badge uses.
 */
export function riskColor(target: Color, risk: number): Color {
  const r = clamp01(risk);
  if (r < 1 / 3) return target.copy(NORMAL).lerp(WARNING, r * 3);
  if (r < 2 / 3) return target.copy(WARNING).lerp(HIGH, (r - 1 / 3) * 3);
  return target.copy(HIGH).lerp(CRITICAL, (r - 2 / 3) * 3);
}
