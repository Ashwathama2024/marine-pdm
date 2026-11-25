// engine3d/FlyCamera.tsx — drives the Stage 3 fly-through.
//
// Deliberately thin. Everything worth reasoning about is in fly-through.ts, which is pure and
// tested; this only reads the clock, samples the plan and writes the result onto the camera.
//
// The request arrives through a REF, not a prop. Scene is memoized so that the per-tick re-render of
// the page above it never reaches the R3F tree, and a prop carrying "fly to this part" would defeat
// that on every selection. The same reason useLiveBridge hands live data down as refs.

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ENGINE_CENTRE } from './engine-layout';
import type { Vec3 } from './engine-layout';
import { finalSample, planFlight, sampleFlight, type FlightPlan } from './fly-through';
import { useReducedMotion } from './useReducedMotion';

/** Set `.current` to a partId to request a flight. FlyCamera clears it once the flight is planned. */
export type FlyRequestRef = React.MutableRefObject<string | null>;

interface OrbitLike {
  target: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number };
  enabled: boolean;
  update: () => void;
}

export function FlyCamera({
  requestRef,
  onFlyingChange,
}: {
  requestRef: FlyRequestRef;
  /** Fired on takeoff and touchdown so the HUD can show where it is going. */
  onFlyingChange?: (plan: FlightPlan | null) => void;
}) {
  const camera = useThree(s => s.camera);
  const controls = useThree(s => s.controls) as unknown as OrbitLike | null;
  const reduced = useReducedMotion();

  const flight = useRef<{ plan: FlightPlan; startedAt: number } | null>(null);
  // OrbitControls' own `enabled` is the thing being toggled, so remember what it was rather than
  // assuming true — otherwise a flight would re-enable controls the caller had switched off.
  const wasEnabled = useRef(true);

  const apply = (position: Vec3, lookAt: Vec3) => {
    camera.position.set(position[0], position[1], position[2]);
    if (controls) {
      controls.target.set(lookAt[0], lookAt[1], lookAt[2]);
      controls.update();
    } else {
      camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    }
  };

  const land = () => {
    if (controls) controls.enabled = wasEnabled.current;
    flight.current = null;
    onFlyingChange?.(null);
  };

  useFrame(() => {
    // ── New request ────────────────────────────────────────────────────────
    const requested = requestRef.current;
    if (requested) {
      requestRef.current = null;

      const from: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const target: Vec3 = controls
        ? [controls.target.x, controls.target.y, controls.target.z]
        : [...ENGINE_CENTRE];
      const plan = planFlight(from, target, requested);

      if (plan) {
        if (reduced) {
          // Reduced motion gets the destination, not the journey — the flight is decorative, the
          // framing is not. useReducedMotion gates every other moving thing in this view too.
          const end = finalSample(plan);
          apply(end.position, end.lookAt);
          land();
        } else {
          if (controls) {
            wasEnabled.current = controls.enabled;
            controls.enabled = false;   // stop the user's drag fighting the tween
          }
          flight.current = { plan, startedAt: performance.now() };
          onFlyingChange?.(plan);
        }
      }
    }

    // ── In flight ──────────────────────────────────────────────────────────
    const f = flight.current;
    if (!f) return;

    const t = (performance.now() - f.startedAt) / f.plan.durationMs;
    const { position, lookAt } = sampleFlight(f.plan, t);
    apply(position, lookAt);

    if (t >= 1) land();
  });

  return null;
}
