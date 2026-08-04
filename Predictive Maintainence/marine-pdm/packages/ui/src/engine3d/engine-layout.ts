// engine3d/engine-layout.ts — procedural geometry for the 20V 8000 M71/M71L.
//
// Every layout number in the 3D view is derived HERE and nowhere else, so the model stays tied to
// the same constants the physics runs on.
//
// DIMENSIONS ARE MEASURED, NOT GUESSED. The MTU 8000 data sheet gives, for the external
// heat-exchanger version, maximum dimensions L x W x H:
//     16V 8000 — 5682 x 2279 x 3410 mm
//     20V 8000 — 6622 x 2279 x 3439 mm
// The 940 mm length difference buys exactly two extra cylinders per bank, which fixes the cylinder
// pitch at 940 / 2 = 470 mm — the one number that sets the whole scale of the model. (An earlier
// revision guessed 1.40 x bore = 371 mm and was 27% short.)
//
// What is still estimated, and flagged inline as ESTIMATE: how the 6622 mm splits between driving
// end, block and turbocharger end, and the vertical budget inside the 3439 mm envelope. Those come
// from proportional reading of the MTU sensor-overview drawings (top view and right-side view).
//
// Frame convention (metres, right-handed, matching three.js):
//   +X = crank axis, x=0 is the DRIVING END face (KS). Free end (KGS) is at +X.
//   +Y = up, y=0 is the crank axis.
//   +Z = B-side.  -Z = A-side.  (CYL_NAMES comment: "A-side = left from driving end".)

import { MTU8000 } from '@marine-pdm/shared';

const MM = 0.001;
const DEG = Math.PI / 180;

export const BORE = MTU8000.BORE_MM * MM;     // 0.265 m
export const STROKE = MTU8000.STROKE_MM * MM; // 0.315 m

/** Half the included V-angle — each bank leans this far off vertical. */
export const HALF_V = (MTU8000.V_ANGLE_DEG / 2) * DEG; // 24°

export const PER_BANK = MTU8000.CYLINDERS / 2; // 10

// ── Published envelope (MTU 8000 data sheet, 20V, external heat exchanger) ────
export const ENGINE_LEN = 6.622;
export const ENGINE_WIDTH = 2.279;
export const ENGINE_HEIGHT = 3.439;

/** Cylinder pitch, derived from the 16V/20V length difference. See header. */
export const BORE_SPACING = (6.622 - 5.682) / 2; // 0.470 m

// ESTIMATE: driving-end housing depth before cylinder 1, read off the top-view drawing.
export const CYL_1_X = 0.755;
export const LAST_CYL_X = CYL_1_X + (PER_BANK - 1) * BORE_SPACING; // 4.985
/** Free-end face of the cylinder block; the turbocharger stack lives beyond this. */
export const BLOCK_END_X = LAST_CYL_X + BORE_SPACING / 2; // 5.220

// ── Vertical budget, summing to the published 3439 mm ────────────────────────
// ESTIMATE, from the right-side-view drawing: deep marine sump below the crank, heads and V-valley
// above it, turbocharger and air-filter stack on top.
export const PAN_BOTTOM_Y = -1.0;
export const HEAD_RISE = 1.05; // head centre, along the bank axis
export const TC_TOP_Y = 2.24;

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

/** Crank-axis station of cylinder `i`. */
export function cylX(i: number): number {
  return CYL_1_X + (i % PER_BANK) * BORE_SPACING;
}

// Liner runs from roughly crank-throw clearance up to the head face. Crank radius is STROKE/2 and a
// typical rod is ~2x stroke, putting piston TDC near 0.79 m from the axis — so a 0.46 m liner
// centred at 0.60 m spans the working length.
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

/** Cylinder head, sat on top of its liner — the row of blocks that dominates the side view. */
export function headTransform(i: number): { position: Vec3; rotation: Vec3 } {
  const bank = cylBank(i);
  const d = bankDir(bank);
  return {
    position: [cylX(i), d[1] * HEAD_RISE, d[2] * HEAD_RISE],
    rotation: [bank === 'A' ? -HALF_V : HALF_V, 0, 0],
  };
}

/** 10 crank throws means 11 main bearings — they straddle the cylinders, half a pitch outboard. */
export const BEARING_1_X = CYL_1_X - BORE_SPACING / 2; // 0.520

/** Transform for main bearing `i` (0-10, index 10 = free end). Torus axis rotated onto +X. */
export function bearingTransform(i: number): { position: Vec3; rotation: Vec3 } {
  return { position: [BEARING_1_X + i * BORE_SPACING, 0, 0], rotation: [0, Math.PI / 2, 0] };
}

/**
 * Transform for turbocharger `i`, in tcSpeeds[] order: 0=A1, 1=A2, 2=B1, 3=B2.
 *
 * All four sit beyond the free-end face in a 2x2 stack, two per bank — the arrangement visible in
 * the top view (two large housings side by side) and in the product photo (four intake filters).
 * The two BASIC units (A2/B2, always running) are the lower pair; the two SWITCHABLE units (A1/B1,
 * cut in at 850 and 1000 rpm) sit above them.
 */
export function tcTransform(i: number): { position: Vec3; rotation: Vec3 } {
  const side = i < 2 ? -1 : 1; // A-side is -Z
  const basic = i % 2 === 1; // indices 1 and 3 are A2 / B2
  return {
    position: [BLOCK_END_X + 0.62, basic ? 0.95 : 1.82, side * 0.62],
    rotation: [0, 0, Math.PI / 2], // impeller axis across the engine
  };
}

/** Span of the cylinder block along the crank axis, used by anything that runs its full length. */
export const BANK_SPAN = LAST_CYL_X - CYL_1_X + BORE_SPACING;
export const BANK_MID_X = (CYL_1_X + LAST_CYL_X) / 2;

/**
 * Exhaust manifold. On the 8000 the hot side is INBOARD — the manifolds run the length of the
 * V-valley and feed aft to the turbochargers, which is why the valley reads as a covered duct in
 * the top view rather than as open vee.
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
