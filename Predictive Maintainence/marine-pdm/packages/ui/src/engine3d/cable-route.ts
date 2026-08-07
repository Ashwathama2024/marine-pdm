// engine3d/cable-route.ts — where a harness run physically goes.
//
// Extracted from NetworkLayer's geometry memo so the fly-through camera can follow the SAME polyline
// the harness is drawn along. Two readings of "where does this cable go" would drift, and the drift
// would be invisible until the camera flew through the middle of the block while the yellow tube it
// was supposed to be following ran over the top.
//
// Deliberately free of three.js: plain tuples in, plain tuples out, so it can be tested without
// pulling a renderer into the suite. The consumers construct their own curves from the result.

import type { CableDef, PartDef } from './topology';
import { getPart } from './topology';
import type { Vec3 } from './engine-layout';

/**
 * Height of the harness spine above the crank axis. Looms leave a sensor, rise to this height, run
 * along the engine to their unit and drop in — which is how a real harness is routed and, more
 * practically, keeps the tubes outside the block instead of buried in it. The first cut ran every
 * cable straight from centre to centre through the casting, which is why nothing was visible.
 */
export const SPINE_Y = 1.78;

/**
 * The polyline a cable follows, end to end.
 *
 * An explicit `waypoints` list is used verbatim. Otherwise the default route is synthesised: leave
 * the part, rise clear of it to the spine (pulled slightly inboard so the two banks' looms
 * converge), run along the spine to above the destination, then drop in.
 *
 * Returns null when either endpoint is missing from the registry rather than inventing a stub, so a
 * broken cable disappears instead of drawing a run to the origin.
 */
export function cableRoute(cable: CableDef): Vec3[] | null {
  const a = getPart(cable.from.partId);
  const b = getPart(cable.to.partId);
  if (!a || !b) return null;

  const from: Vec3 = [...a.position];
  const to: Vec3 = [...b.position];

  if (cable.waypoints?.length) {
    return [from, ...cable.waypoints.map(w => [...w] as Vec3), to];
  }

  return [
    from,
    [from[0], SPINE_Y, from[2] * 0.45],
    [to[0], SPINE_Y, to[2] * 0.9],
    to,
  ];
}

/** Route oriented so it ENDS at `partId`, reversing if the cable is declared the other way round. */
export function cableRouteInto(cable: CableDef, partId: string): Vec3[] | null {
  const route = cableRoute(cable);
  if (!route) return null;
  return cable.to.partId === partId ? route : [...route].reverse();
}

/** Straight-line length of a polyline, in metres. */
export function routeLength(points: Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0, z0] = points[i - 1]!;
    const [x1, y1, z1] = points[i]!;
    total += Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  }
  return total;
}

/** The largest half-extent of a part, used to work out how far back to sit to frame it. */
export function partRadius(part: PartDef): number {
  const [sx, sy, sz] = part.size;
  switch (part.kind) {
    case 'sphere':
      return sx;
    case 'cylinder':
      // size is [radius, height, radius]; the height dominates for a long cylinder.
      return Math.max(sx, sy / 2);
    default:
      return Math.max(sx, sy, sz) / 2;
  }
}
