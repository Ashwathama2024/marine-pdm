// engine3d/engine-layout.ts — procedural geometry for the 20V 8000 M71/M71L.
//
// Every layout number in the 3D view is derived HERE and nowhere else, so the model stays tied to
// the same constants the physics runs on.
//
// SOURCES, in order of authority:
//   1. MTU 8000 data sheet — maximum dimensions L x W x H, external heat-exchanger version:
//          16V 8000 — 5682 x 2279 x 3410 mm
//          20V 8000 — 6622 x 2279 x 3439 mm
//      The 940 mm length difference buys exactly two extra cylinders per bank, which fixes the
//      cylinder pitch at 940 / 2 = 470 mm. That single number sets the scale of everything else.
//   2. MS15082/00E "Sensors and actuators 20V - Overview" (TD0000012614/12618/12620) — the four
//      general-arrangement views. These fix WHICH END IS WHICH, see below.
//   3. Proportional reading of those views for the remaining splits, marked ESTIMATE.
//
// END ORIENTATION — this was wrong in an earlier revision and is worth stating plainly.
// In the top view (TD0000012620) the exhaust-temperature callouts run B4B10 at the left through
// B4B1 at the right, and the turbocharger group (B44.1/2/11/12, B4.30, B41.1, Y26, Y29) sits at the
// RIGHT-hand end — the same end as cylinder 1. Cylinder 1 is the driving end (KS), so:
//
//     DRIVING END (KS)  = cylinder 1, bearing 1, flywheel, ALL FOUR TURBOCHARGERS, exhaust outlet
//     FREE END (KGS)    = cylinder 10, bearing 11, gear train, HP fuel pumps, coolant and raw-water
//                         pumps, coolant cooler, fuel filters
//
// The free-end view (TD0000012618) confirms it: camshaft speed, HP pump A/B, coolant pressure
// before/after cooler and raw-water pressure all appear there, and no turbocharger does.
//
// Frame convention (metres, right-handed, matching three.js):
//   +X runs from the DRIVING END face at x=0 toward the FREE END at x=6.622.
//   +Y = up, y=0 is the crank axis.
//   +Z = B-side.  -Z = A-side.  (CYL_NAMES: "A-side = left from driving end".)

import { MTU8000 } from '@marine-pdm/shared';

const MM = 0.001;
const DEG = Math.PI / 180;

export const BORE = MTU8000.BORE_MM * MM;     // 0.265 m
export const STROKE = MTU8000.STROKE_MM * MM; // 0.315 m

/** Half the included V-angle — each bank leans this far off vertical. */
export const HALF_V = (MTU8000.V_ANGLE_DEG / 2) * DEG; // 24°

export const PER_BANK = MTU8000.CYLINDERS / 2; // 10

// ── Published envelope ───────────────────────────────────────────────────────
export const ENGINE_LEN = 6.622;
export const ENGINE_WIDTH = 2.279;
export const ENGINE_HEIGHT = 3.439;

/** Cylinder pitch, derived from the 16V/20V length difference. See header. */
export const BORE_SPACING = (6.622 - 5.682) / 2; // 0.470 m

// ── Longitudinal budget, summing to 6.622 m ──────────────────────────────────
// ESTIMATE, read proportionally off the top view: the turbocharger/exhaust group at the driving end
// is by far the bulkiest section, the gear-train end is comparatively shallow.
export const TC_ZONE_LEN = 1.4;
export const BLOCK_START_X = TC_ZONE_LEN;
export const BLOCK_LEN = PER_BANK * BORE_SPACING; // 4.700
export const BLOCK_END_X = BLOCK_START_X + BLOCK_LEN; // 6.100
export const FREE_END_X = ENGINE_LEN; // 6.622

/** Cylinder 1 sits half a pitch inside the block face, at the driving end. */
export const CYL_1_X = BLOCK_START_X + BORE_SPACING / 2; // 1.635
export const LAST_CYL_X = CYL_1_X + (PER_BANK - 1) * BORE_SPACING; // 5.865

// ── Vertical budget, summing to the published 3439 mm ────────────────────────
// ESTIMATE, from the left-side view: deep marine sump below the crank, heads and V-valley above it,
// turbocharger and exhaust stack on top at the driving end.
export const PAN_BOTTOM_Y = -1.0;

/**
 * The engine-room deck — where the floor grid is drawn, and what anything standing in the room rests
 * on. Off-engine cabinets are seated with `deckSeatY` rather than given a hand-picked height: every
 * one of them used to float, the LOP at y=2.3 and the MCS at 3.5, hanging in the air above the
 * engine with nothing under them.
 */
export const DECK_Y = -0.95;

/** Centre height for a box of `height` standing on the deck. */
export function deckSeatY(height: number): number {
  return DECK_Y + height / 2;
}
export const HEAD_RISE = 1.05; // head centre, along the bank axis
export const TC_TOP_Y = 2.12;

export type Vec3 = [number, number, number];

/** Unit vector along a bank's cylinder axis. */
export function bankDir(bank: 'A' | 'B'): Vec3 {
  const s = bank === 'A' ? -1 : 1;
  return [0, Math.cos(HALF_V), s * Math.sin(HALF_V)];
}

/** Bank of a cylinder index — 0-9 are A1-A10, 10-19 are B1-B10 (CYL_NAMES order). */
export function cylBank(i: number): 'A' | 'B' {
  return i < PER_BANK ? 'A' : 'B';
}

/** Cylinder number within its bank, 1-10. 1 is the driving end. */
export function cylNumber(i: number): number {
  return (i % PER_BANK) + 1;
}

/** Crank-axis station of cylinder `i`. */
export function cylX(i: number): number {
  return CYL_1_X + (i % PER_BANK) * BORE_SPACING;
}

// Liner runs from crank-throw clearance up to the head face. Crank radius is STROKE/2 and a typical
// rod is ~2x stroke, putting piston TDC near 0.79 m from the axis — so a 0.46 m liner centred at
// 0.60 m spans the working length.
export const CYL_RISE = 0.6;
export const CYL_LEN = 0.46;

/**
 * Transform for cylinder `i` in CYL_NAMES order. `rotation` tilts a Y-up CylinderGeometry onto the
 * bank axis: rotating (0,1,0) about +X by θ gives (0, cosθ, sinθ), so the A-bank (which leans to
 * -Z) needs -HALF_V.
 */
export function cylinderTransform(i: number): { position: Vec3; rotation: Vec3 } {
  const bank = cylBank(i);
  const d = bankDir(bank);
  return {
    position: [cylX(i), d[1] * CYL_RISE, d[2] * CYL_RISE],
    rotation: [bank === 'A' ? -HALF_V : HALF_V, 0, 0],
  };
}

/** Cylinder head — the row of blocks that dominates the side elevation. */
export function headTransform(i: number): { position: Vec3; rotation: Vec3 } {
  const bank = cylBank(i);
  const d = bankDir(bank);
  return {
    position: [cylX(i), d[1] * HEAD_RISE, d[2] * HEAD_RISE],
    rotation: [bank === 'A' ? -HALF_V : HALF_V, 0, 0],
  };
}

/** 10 crank throws means 11 main bearings — bearing 1 at the driving-end block face. */
export const BEARING_1_X = BLOCK_START_X;

/** Transform for main bearing `i` (0-10; 0 = driving end, 10 = free end). */
export function bearingTransform(i: number): { position: Vec3; rotation: Vec3 } {
  return { position: [BEARING_1_X + i * BORE_SPACING, 0, 0], rotation: [0, Math.PI / 2, 0] };
}

/**
 * Transform for turbocharger `i`, in tcSpeeds[] order: 0=A1, 1=A2, 2=B1, 3=B2.
 *
 * All four sit in the driving-end group, two per bank, impeller axis across the engine. The BASIC
 * units (A2/B2, always running) are the lower pair; the SWITCHABLE units (A1/B1, cut in at 850 and
 * 1000 rpm, controlled by solenoids Y26 and Y29) sit above them.
 */
export function tcTransform(i: number): { position: Vec3; rotation: Vec3 } {
  const side = i < 2 ? -1 : 1; // A-side is -Z
  const basic = i % 2 === 1; // indices 1 and 3 are A2 / B2
  return {
    position: [0.72, basic ? 0.95 : 1.82, side * 0.62],
    rotation: [Math.PI / 2, 0, 0], // impeller axis across the engine
  };
}

/** Span of the cylinder block along the crank axis, for anything running its full length. */
export const BANK_SPAN = BLOCK_LEN;
export const BANK_MID_X = (CYL_1_X + LAST_CYL_X) / 2;

/**
 * Exhaust manifold. On the 8000 the hot side is INBOARD — the manifolds run the length of the
 * V-valley and feed FORWARD to the turbochargers at the driving end, which is why the valley reads
 * as a covered duct rather than an open vee in the top view.
 */
export function manifoldTransform(bank: 'A' | 'B'): {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
} {
  const s = bank === 'A' ? -1 : 1;
  return {
    position: [BANK_MID_X, 1.32, s * 0.2],
    rotation: [0, 0, 0],
    size: [BANK_SPAN, 0.2, 0.2],
  };
}

/** Charge-air duct, outboard of each bank — the cold side, and what sets the 2279 mm width. */
export function chargeDuctTransform(bank: 'A' | 'B'): {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
} {
  const s = bank === 'A' ? -1 : 1;
  return {
    position: [BANK_MID_X, 0.5, s * 0.95],
    rotation: [0, 0, 0],
    size: [BANK_SPAN, 0.42, 0.3],
  };
}

/** Camera framing: centre of the engine and a comfortable starting orbit radius. */
export const ENGINE_CENTRE: Vec3 = [ENGINE_LEN / 2, 0.35, 0];
export const ORBIT_RADIUS = 8.5;
