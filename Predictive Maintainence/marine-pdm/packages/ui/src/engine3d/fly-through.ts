// engine3d/fly-through.ts — Stage 3. Plan a camera flight along the harness to a chosen part.
//
// Pure, and kept out of the R3F tree for the same reason part-risk.ts is: the interesting part is
// geometry, and geometry is worth pinning with tests that do not need a WebGL context. The component
// that flies the camera does nothing but sample this at the current time.
//
// The camera follows the SAME polyline the yellow harness is drawn along (cable-route.ts), held off
// it by a standoff so you watch the cable rather than travel inside the tube, and arrives framed on
// the part at a distance that suits its size.

import * as THREE from 'three';
import type { CableDef, PartDef } from './topology';
import { CABLES, getPart, isNetworkPart } from './topology';
import { cableRouteInto, partRadius, routeLength } from './cable-route';
import type { Vec3 } from './engine-layout';

/** Floor grid height. The flight must never dip below it or the camera ends up under the engine. */
export const FLOOR_Y = -0.95;

/** How far off the cable the camera rides, in metres. Enough to see the run it is following. */
export const STANDOFF = 0.9;

/** Framing distance = this multiple of the part's radius, floored so tiny parts stay readable. */
export const FRAME_RADII = 3.2;
export const MIN_FRAME_DISTANCE = 0.85;

/** Flight time is proportional to path length, clamped so short hops are not instant and long
 *  crossings are not tedious. */
export const MS_PER_METRE = 105;
export const MIN_DURATION_MS = 900;
export const MAX_DURATION_MS = 4200;

export interface FlightPlan {
  /** Control points for the camera curve, starting exactly at the current camera position. */
  points: Vec3[];
  /** Where the camera looks at t=0 — the orbit target it is leaving. */
  lookFrom: Vec3;
  /** Where it looks at t=1 — the centre of the part being visited. */
  lookTo: Vec3;
  durationMs: number;
  targetPartId: string;
  /** The cable being followed, or null when the part has none and a direct arc is used instead. */
  viaCableNo: string | null;
}

export interface FlightSample {
  position: Vec3;
  lookAt: Vec3;
}

const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
// (1-t)·a + t·b, not a + (b-a)·t. The second form is one operation cheaper and is what everyone
// writes, but it does not return b exactly at t=1 — it lands an ulp or so away. That matters here:
// the flight has to finish looking exactly at the part, and the arrival target is handed straight to
// OrbitControls, where a residue leaves the camera fractionally off its own subject forever after.
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  (1 - t) * a[0] + t * b[0],
  (1 - t) * a[1] + t * b[1],
  (1 - t) * a[2] + t * b[2],
];

/** Smoothstep. Eases both ends so the camera neither jerks off nor slams to a stop. */
export function ease(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * Pick the cable worth following to a part.
 *
 * Prefers a run whose far end is an ECS unit or terminal box, because that is the journey worth
 * watching — signal leaving the machine and arriving at the control system. Among those, the longest,
 * since a 20 cm drop makes for a pointless flight. Returns null for a part with no cables at all.
 */
export function chooseCable(partId: string): CableDef | null {
  const touching = CABLES.filter(c => c.from.partId === partId || c.to.partId === partId);
  if (touching.length === 0) return null;

  const score = (c: CableDef): number => {
    const otherId = c.from.partId === partId ? c.to.partId : c.from.partId;
    const other = getPart(otherId);
    const controlSide = other && isNetworkPart(other) ? 1000 : 0;
    const route = cableRouteInto(c, partId);
    return controlSide + (route ? routeLength(route) : 0);
  };

  return touching.reduce((best, c) => (score(c) > score(best) ? c : best), touching[0]!);
}

/** How far back to sit from a part so it fills a sensible share of the frame. */
export function framingDistance(part: PartDef): number {
  return Math.max(MIN_FRAME_DISTANCE, partRadius(part) * FRAME_RADII);
}

/**
 * Where the camera comes to rest: backed off the part along the direction it approached from, so the
 * arrival is a deceleration rather than a swing around to the far side. Pushed outboard in Z and up
 * in Y so the part is seen against open space rather than through the block it sits in.
 */
export function framingPosition(part: PartDef, approachFrom: Vec3): Vec3 {
  const centre = part.position;
  const d = framingDistance(part);

  let dx = approachFrom[0] - centre[0];
  let dy = approachFrom[1] - centre[1];
  let dz = approachFrom[2] - centre[2];
  const len = Math.hypot(dx, dy, dz);

  if (len < 1e-6) {
    // Degenerate: approaching from exactly the part centre. Fall back to a fixed outboard view.
    dx = 0; dy = 0.4; dz = 1;
  } else {
    dx /= len; dy /= len; dz /= len;
  }

  // Bias outboard and upward so we are never looking at the part from inside the casting.
  const bz = centre[2] >= 0 ? 1 : -1;
  dz = dz * 0.55 + bz * 0.55;
  dy = dy * 0.55 + 0.5;

  const n = Math.hypot(dx, dy, dz) || 1;
  return [
    centre[0] + (dx / n) * d,
    Math.max(FLOOR_Y + 0.25, centre[1] + (dy / n) * d),
    centre[2] + (dz / n) * d,
  ];
}

/** Push a route point away from the engine centreline and upward, so the camera rides beside the
 *  cable rather than through it. */
function standoff(p: Vec3): Vec3 {
  const bz = p[2] >= 0 ? 1 : -1;
  return [p[0], Math.max(FLOOR_Y + 0.3, p[1] + STANDOFF * 0.35), p[2] + bz * STANDOFF];
}

/**
 * Plan a flight from where the camera is now to a framed view of `toPartId`, following that part's
 * cable if it has one.
 *
 * Returns null for an unknown part — the caller should simply not start a flight rather than fly to
 * the origin.
 */
export function planFlight(
  fromCamera: Vec3,
  fromTarget: Vec3,
  toPartId: string,
): FlightPlan | null {
  const part = getPart(toPartId);
  if (!part) return null;

  const cable = chooseCable(toPartId);
  const route = cable ? cableRouteInto(cable, toPartId) : null;

  // Follow the harness, offset, dropping the final point: the route ends AT the part centre and the
  // camera must stop short of it. Framing supplies the arrival instead.
  const mid = route && route.length > 1 ? route.slice(0, -1).map(standoff) : [];

  const approachFrom = mid.length ? mid[mid.length - 1]! : fromCamera;
  const arrival = framingPosition(part, approachFrom);

  const points: Vec3[] = dedupe([fromCamera, ...mid, arrival]);
  const durationMs = Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, Math.round(routeLength(points) * MS_PER_METRE)),
  );

  return {
    points,
    lookFrom: fromTarget,
    lookTo: [...part.position],
    durationMs,
    targetPartId: toPartId,
    viaCableNo: cable?.cableNo ?? null,
  };
}

/** Drop points that coincide — CatmullRomCurve3 produces NaNs on a zero-length segment. */
function dedupe(points: Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > 1e-4) out.push(p);
  }
  // A curve needs at least two points; if everything collapsed, nudge so the sample is still valid.
  if (out.length === 1) out.push([out[0]![0], out[0]![1] + 0.01, out[0]![2]]);
  return out;
}

const curveCache = new WeakMap<FlightPlan, THREE.CatmullRomCurve3>();

function curveFor(plan: FlightPlan): THREE.CatmullRomCurve3 {
  let c = curveCache.get(plan);
  if (!c) {
    c = new THREE.CatmullRomCurve3(
      plan.points.map(p => new THREE.Vector3(...p)),
      false,
      'catmullrom',
      0.1,
    );
    curveCache.set(plan, c);
  }
  return c;
}

/**
 * Camera position and look-at target at normalised time `t`.
 *
 * The look-at leads the camera along the curve early on — that is what makes it read as travelling a
 * route rather than sliding sideways — and converges onto the part itself by the end, so the flight
 * finishes composed on the thing that was clicked.
 */
export function sampleFlight(plan: FlightPlan, t: number): FlightSample {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const e = ease(clamped);
  const curve = curveFor(plan);

  const pos = curve.getPoint(e);
  const ahead = curve.getPoint(Math.min(1, e + 0.08));

  // Blend from "looking where we were" through "looking down the cable" to "looking at the part".
  const leaving = lerp3(plan.lookFrom, [ahead.x, ahead.y, ahead.z], ease(Math.min(1, clamped * 2.5)));
  const lookAt = lerp3(leaving, plan.lookTo, ease(Math.max(0, (clamped - 0.55) / 0.45)));

  return { position: [pos.x, pos.y, pos.z], lookAt };
}

/** Convenience for the reduced-motion path: the composed end state, with no journey. */
export function finalSample(plan: FlightPlan): FlightSample {
  return { position: plan.points[plan.points.length - 1]!, lookAt: plan.lookTo };
}

export const __testing = { add, lerp3, standoff, dedupe };
