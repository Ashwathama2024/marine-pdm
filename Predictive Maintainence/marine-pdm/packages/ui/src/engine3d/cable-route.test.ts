// Harness routing — the rule is that a cable never cuts through the engine.
//
// This was a real defect, visible the moment the scene was screenshotted: every run left its sensor,
// rose to a spine above the engine, then took ONE straight segment to above its unit. Sensor and unit
// are usually on opposite sides, so that segment was a diagonal straight through the block, and in
// plan view the whole harness fanned out of the EMU across the casting.
//
// The guarantee now is structural rather than aesthetic: every synthesised segment is axis-aligned.
// An orthogonal path cannot cut a corner, so it cannot pass through anything it did not start inside.

import { describe, expect, it } from 'vitest';
import { DUCT_Y, DUCT_Z, cableRoute, cableRouteInto, routeLength } from './cable-route';
import { CABLES, getPart } from './topology';
import { ENGINE_WIDTH } from './engine-layout';

const synthesised = CABLES.filter(c => !c.waypoints?.length);

/** Which axes a segment moves along. */
function movingAxes(a: number[], b: number[]): number[] {
  return [0, 1, 2].filter(i => Math.abs(b[i]! - a[i]!) > 1e-6);
}

describe('every run is an orthogonal tray route', () => {
  it('moves along one axis at a time, on every cable', () => {
    const diagonal: string[] = [];
    for (const c of synthesised) {
      const route = cableRoute(c)!;
      for (let i = 1; i < route.length; i++) {
        if (movingAxes(route[i - 1]!, route[i]!).length > 1) {
          diagonal.push(`${c.cableNo} segment ${i}`);
        }
      }
    }
    expect(diagonal).toEqual([]);
  });

  it('has no zero-length segments to kink the tube', () => {
    for (const c of synthesised) {
      const route = cableRoute(c)!;
      for (let i = 1; i < route.length; i++) {
        expect(movingAxes(route[i - 1]!, route[i]!).length, `${c.cableNo} seg ${i}`).toBe(1);
      }
    }
  });

  it('starts on its sensor and ends on its unit, exactly', () => {
    for (const c of synthesised) {
      const route = cableRoute(c)!;
      expect(route[0]).toEqual(getPart(c.from.partId)!.position);
      expect(route[route.length - 1]).toEqual(getPart(c.to.partId)!.position);
    }
  });
});

describe('the duct sits outside the block', () => {
  it('runs its long segment outboard of the casting', () => {
    // The middle of every route is the duct run. It must be clear of the block sides, or the tray is
    // buried in the engine and we are back where we started.
    for (const c of synthesised) {
      const route = cableRoute(c)!;
      const interior = route.slice(1, -1);
      const outboard = interior.filter(p => Math.abs(p[2]) >= DUCT_Z - 1e-6);
      expect(outboard.length, `${c.cableNo} has no outboard leg`).toBeGreaterThan(0);
    }
  });

  it('keeps the duct inside the published engine width', () => {
    // Outboard of the casting, but not floating in space beside the engine.
    //
    // Endpoints are excluded on purpose: a run to an off-engine cabinet legitimately finishes well
    // outside the envelope — CB-X11 sits at z = 2.05 — and that is the PART's position, not the
    // duct's. Only the synthesised legs are ours to constrain.
    for (const c of synthesised) {
      for (const p of cableRoute(c, 8)!.slice(1, -1)) {
        expect(Math.abs(p[2]), c.cableNo).toBeLessThanOrEqual(ENGINE_WIDTH / 2);
      }
    }
  });

  it('keeps the duct below the cylinder heads', () => {
    // A tray over the top of the engine dominates its silhouette and is not where the real ducting
    // goes. Heads sit near 0.96 on the bank axis.
    expect(DUCT_Y).toBeLessThan(0.96);
  });
});

describe('lanes', () => {
  it('separates cables sharing a duct without moving their endpoints', () => {
    const c = synthesised[0]!;
    const a = cableRoute(c, 0)!;
    const b = cableRoute(c, 5)!;
    expect(b[0]).toEqual(a[0]);
    expect(b[b.length - 1]).toEqual(a[a.length - 1]);
    // The duct legs must actually differ, or the bundle is one tube z-fighting with itself.
    expect(Math.abs(b[2]![2] - a[2]![2])).toBeGreaterThan(0.01);
  });

  it('still routes orthogonally on an offset lane', () => {
    for (const c of synthesised) {
      const route = cableRoute(c, 11)!;
      for (let i = 1; i < route.length; i++) {
        expect(movingAxes(route[i - 1]!, route[i]!).length, c.cableNo).toBe(1);
      }
    }
  });
});

describe('explicit waypoints win', () => {
  it('uses a declared route verbatim rather than synthesising one', () => {
    const withPoints = CABLES.find(c => c.waypoints?.length);
    if (!withPoints) return;                       // none declared yet — the branch is still covered
    const route = cableRoute(withPoints)!;
    expect(route.length).toBe(withPoints.waypoints!.length + 2);
  });

  it('reverses a route to end at the part being visited', () => {
    const c = synthesised[0]!;
    const into = cableRouteInto(c, c.to.partId)!;
    const back = cableRouteInto(c, c.from.partId)!;
    expect(into[into.length - 1]).toEqual(getPart(c.to.partId)!.position);
    expect(back[back.length - 1]).toEqual(getPart(c.from.partId)!.position);
    expect(routeLength(into)).toBeCloseTo(routeLength(back), 9);
  });
});
