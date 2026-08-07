// Stage 3 fly-through — the geometry, pinned without a renderer.
//
// The camera cannot be looked at in this environment: the Browser pane never composites, so R3F
// leaves its canvas at 300x150 and requestAnimationFrame never fires (HANDOVER.md section 6). That
// makes these assertions the only thing standing between a flight that works and one that ends up
// inside the crankcase, so they check the properties a screenshot would have caught by eye:
// it starts where the camera already is, it stays above the floor, and it finishes composed on the
// part that was clicked.

import { describe, expect, it } from 'vitest';
import {
  FLOOR_Y,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  chooseCable,
  ease,
  finalSample,
  framingDistance,
  planFlight,
  sampleFlight,
} from './fly-through';
import { cableRoute, cableRouteInto, routeLength } from './cable-route';
import { CABLES, PARTS, getPart, isNetworkPart } from './topology';

const CAM: [number, number, number] = [3.3, 2.6, 8.5];
const TARGET: [number, number, number] = [3.311, 0.35, 0];

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('cable routing is shared with what is drawn', () => {
  it('routes every registered cable', () => {
    // A null route means an endpoint is missing from PARTS, which would also mean the harness layer
    // silently skips drawing it.
    const unroutable = CABLES.filter(c => cableRoute(c) === null).map(c => c.cableNo);
    expect(unroutable).toEqual([]);
  });

  it('orients a route to end at the part being visited, whichever way it was declared', () => {
    const cable = CABLES.find(c => c.from.partId !== c.to.partId)!;
    const into = cableRouteInto(cable, cable.to.partId)!;
    const back = cableRouteInto(cable, cable.from.partId)!;

    expect(into[into.length - 1]).toEqual(getPart(cable.to.partId)!.position);
    expect(back[back.length - 1]).toEqual(getPart(cable.from.partId)!.position);
    expect(routeLength(into)).toBeCloseTo(routeLength(back), 9);
  });
});

describe('choosing what to follow', () => {
  it('prefers the run that reaches the control system', () => {
    // Cylinder A4's exhaust probe lands on an EMU. That journey — sensor to control unit — is the
    // one worth watching; a short local hop is not.
    const cable = chooseCable('head.A4');
    expect(cable).not.toBeNull();
    const otherId = cable!.from.partId === 'head.A4' ? cable!.to.partId : cable!.from.partId;
    expect(isNetworkPart(getPart(otherId)!)).toBe(true);
  });

  it('returns null for a part with no cables rather than inventing one', () => {
    const uncabled = PARTS.find(p => chooseCable(p.id) === null);
    expect(uncabled, 'expected at least one uncabled part to exercise the fallback').toBeDefined();
  });

  it('records how much of the engine actually has a cable to follow', () => {
    // Not all of it, and that is worth stating rather than discovering. 42 of 90 parts now have a
    // real run — the twenty cylinder heads on X5.1, the eleven crankshaft bearings and the A-side
    // turbochargers on X5.3, the B-side pair on the ECU's X2, and the units themselves. Everything
    // else still takes a direct framing arc. Both paths are exercised above.
    //
    // A FLOOR, not an equality: reading more of the connector sheets (EMU I X5.2, ECU-4 X3/X4 for
    // the twenty injection valves) raises this, and that should not fail the suite.
    const followCable = PARTS.filter(p => chooseCable(p.id) !== null).length;
    expect(followCable).toBeGreaterThanOrEqual(42);
    expect(followCable).toBeLessThan(PARTS.length);
  });
});

describe('every part in the registry can be flown to', () => {
  it('plans a valid flight for all of them, cabled or not', () => {
    const broken: string[] = [];
    for (const part of PARTS) {
      const plan = planFlight(CAM, TARGET, part.id);
      if (!plan) { broken.push(`${part.id}: no plan`); continue; }
      if (plan.points.length < 2) broken.push(`${part.id}: degenerate path`);
      if (plan.points.some(p => p.some(n => !Number.isFinite(n)))) broken.push(`${part.id}: NaN`);
    }
    expect(broken).toEqual([]);
  });

  it('never dips the camera below the floor grid', () => {
    // The grid sits at FLOOR_Y. A path below it puts the camera under the engine looking at the
    // underside of the sump, which reads as a broken scene.
    const offenders: string[] = [];
    for (const part of PARTS) {
      const plan = planFlight(CAM, TARGET, part.id)!;
      for (let i = 0; i <= 40; i++) {
        if (sampleFlight(plan, i / 40).position[1] < FLOOR_Y) {
          offenders.push(`${part.id} at t=${(i / 40).toFixed(2)}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never comes to rest inside the part it is looking at', () => {
    const inside: string[] = [];
    for (const part of PARTS) {
      const plan = planFlight(CAM, TARGET, part.id)!;
      const end = finalSample(plan);
      if (dist(end.position, part.position) < framingDistance(part) * 0.75) inside.push(part.id);
    }
    expect(inside).toEqual([]);
  });
});

describe('the flight itself', () => {
  const plan = planFlight(CAM, TARGET, 'head.A4')!;

  it('starts exactly where the camera already is, with no jump', () => {
    const start = sampleFlight(plan, 0);
    expect(dist(start.position, CAM)).toBeLessThan(1e-6);
    expect(start.lookAt).toEqual(TARGET);
  });

  it('finishes composed on the part that was clicked', () => {
    const end = sampleFlight(plan, 1);
    expect(end.lookAt).toEqual(getPart('head.A4')!.position);
    expect(dist(end.position, finalSample(plan).position)).toBeLessThan(1e-6);
  });

  it('clamps outside 0..1 instead of extrapolating off the end of the curve', () => {
    expect(sampleFlight(plan, -3)).toEqual(sampleFlight(plan, 0));
    expect(sampleFlight(plan, 4)).toEqual(sampleFlight(plan, 1));
  });

  it('moves continuously — no teleport between adjacent frames', () => {
    // A CatmullRom through duplicated control points produces NaN or a sudden jump; both show up as
    // one oversized step. At 60fps a 900ms flight is ~54 frames, so sample finer than that.
    let worst = 0;
    let prev = sampleFlight(plan, 0).position;
    for (let i = 1; i <= 120; i++) {
      const p = sampleFlight(plan, i / 120).position;
      worst = Math.max(worst, dist(p, prev));
      prev = p;
    }
    const total = dist(CAM, finalSample(plan).position);
    expect(worst).toBeLessThan(Math.max(0.6, total * 0.25));
  });

  it('eases in and out rather than moving linearly', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
    // Mid-flight speed must exceed the speed at the ends — that is what "eased" means.
    const speedAt = (t: number) =>
      dist(sampleFlight(plan, t + 0.01).position, sampleFlight(plan, t).position);
    expect(speedAt(0.5)).toBeGreaterThan(speedAt(0.0));
    expect(speedAt(0.5)).toBeGreaterThan(speedAt(0.99));
  });

  it('looks down the route before locking onto the part', () => {
    // Early on the camera should NOT already be staring at the destination, or the flight reads as a
    // slide rather than a journey along the harness.
    const target = getPart('head.A4')!.position;
    expect(dist(sampleFlight(plan, 0.25).lookAt, target)).toBeGreaterThan(0.2);
    expect(dist(sampleFlight(plan, 1).lookAt, target)).toBeLessThan(1e-9);
  });
});

describe('duration', () => {
  it('scales with distance travelled, within bounds', () => {
    for (const part of PARTS) {
      const plan = planFlight(CAM, TARGET, part.id)!;
      expect(plan.durationMs).toBeGreaterThanOrEqual(MIN_DURATION_MS);
      expect(plan.durationMs).toBeLessThanOrEqual(MAX_DURATION_MS);
    }
  });

  it('gives a longer flight to a further part', () => {
    const near = planFlight(CAM, TARGET, 'head.A4')!;
    const far = planFlight([0, 12, 20], TARGET, 'head.A4')!;
    expect(far.durationMs).toBeGreaterThan(near.durationMs);
  });
});

describe('unknown targets', () => {
  it('returns null rather than flying to the origin', () => {
    expect(planFlight(CAM, TARGET, 'no.such.part')).toBeNull();
  });
});
