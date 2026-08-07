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

// ── The cable duct ───────────────────────────────────────────────────────────
//
// A real engine harness does not run point to point. Sensors drop into a duct that runs the length
// of the block along its side, and the duct goes to the control units. Everything below builds that.
//
// The previous route rose to a spine above the engine and then took ONE straight segment to above
// the destination. Whenever a sensor and its unit sat on opposite sides — which is most of them —
// that segment was a diagonal straight through the casting. In plan view the whole harness fanned
// out of the EMU and crossed the block, which is both impossible to build and unreadable.

/** Duct centreline, outboard of the block but inside the published 2279 mm width. */
export const DUCT_Z = 0.98;

/**
 * Duct height. Deliberately BELOW the cylinder heads (~0.96) rather than above them: a tray over the
 * top dominates the engine's silhouette, and it is not where the ducting sits on the real machine.
 */
export const DUCT_Y = 0.72;

/** Lateral spacing between cables sharing a duct, so a bundle reads as a bundle. */
export const LANE_PITCH = 0.007;

/** Which side of the engine a run uses: its own, or its unit's when it starts on the centreline. */
function ductSide(from: Vec3, to: Vec3): number {
  if (Math.abs(from[2]) > 0.05) return Math.sign(from[2]);
  if (Math.abs(to[2]) > 0.05) return Math.sign(to[2]);
  return 1;
}

/**
 * The polyline a cable follows, end to end.
 *
 * An explicit `waypoints` list is used verbatim. Otherwise the route is synthesised as an orthogonal
 * tray run — out of the part sideways, down the outside of the block to the duct, along the duct,
 * then back in to the unit. Every segment is axis-aligned, so it can never cut a corner through the
 * engine, and the long middle segments of every cable overlap into what reads as one duct per side.
 *
 * `lane` offsets this cable within the duct so a bundle looks like a bundle instead of one tube
 * z-fighting with thirty others.
 *
 * Returns null when either endpoint is missing from the registry rather than inventing a stub, so a
 * broken cable disappears instead of drawing a run to the origin.
 */
export function cableRoute(cable: CableDef, lane = 0): Vec3[] | null {
  const a = getPart(cable.from.partId);
  const b = getPart(cable.to.partId);
  if (!a || !b) return null;

  const from: Vec3 = [...a.position];
  const to: Vec3 = [...b.position];

  if (cable.waypoints?.length) {
    return [from, ...cable.waypoints.map(w => [...w] as Vec3), to];
  }

  const side = ductSide(from, to);
  const z = side * (DUCT_Z + lane * LANE_PITCH);
  const y = DUCT_Y - lane * LANE_PITCH;

  const points: Vec3[] = [
    from,
    [from[0], from[1], z],   // out of the part, sideways clear of the block
    [from[0], y, z],         // down (or up) the outside face to the duct
    [to[0], y, z],           // along the duct to the unit's station
    [to[0], to[1], z],       // back to the unit's height, still outboard
    to,                      // in to the unit
  ];

  // Collapse steps the geometry does not need — a sensor already at duct height should not get a
  // zero-length riser, which would show up as a kink in the tube.
  return points.filter((p, i) => {
    if (i === 0) return true;
    const q = points[i - 1]!;
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-3;
  });
}

/** Route oriented so it ENDS at `partId`, reversing if the cable is declared the other way round. */
export function cableRouteInto(cable: CableDef, partId: string, lane = 0): Vec3[] | null {
  const route = cableRoute(cable, lane);
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
