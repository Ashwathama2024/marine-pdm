// engine3d/engine-layout.ts — procedural geometry for the 20V 8000 M71/M71L.
//
// Every layout number in the 3D view is derived HERE and nowhere else, so the model stays tied to
// the same constants the physics runs on. Where MTU does not publish a dimension (bore spacing,
// cylinder rise, turbocharger stand-off) the value is a stated ratio, flagged inline — those are the
// only invented numbers in the scene and they are the ones the reference photographs will correct.
//
// Frame convention (metres, right-handed, matching three.js):
//   +X = crank axis, x=0 is the DRIVING END face (KS). Free end (KGS) is at +X.
//   +Y = up.
//   +Z = B-side.  -Z = A-side.  (CYL_NAMES comment: "A-side = left from driving end".)

import { MTU8000 } from '@marine-pdm/shared';

const MM = 0.001;
const DEG = Math.PI / 180;

export const BORE = MTU8000.BORE_MM * MM;    // 0.265 m
export const STROKE = MTU8000.STROKE_MM * MM; // 0.315 m

/** Half the included V-angle — each bank leans this far off vertical. */
export const HALF_V = (MTU8000.V_ANGLE_DEG / 2) * DEG; // 24°

export const PER_BANK = MTU8000.CYLINDERS / 2; // 10

// RATIO (not published): 1.40 × bore is the standard cylinder pitch for a medium-speed V-block.
// At 265 mm bore that is 371 mm, putting the 10-throw crank at 3.34 m and the whole engine at
// ~5.0 m overall — which matches the published 20V 8000 length. Tune against photographs.
export const BORE_SPACING = BORE * 1.4;

/** Centre of cylinder 1, measured back from the driving-end face. */
export const CYL_1_X = 0.62;

// RATIO (not published): distance from crank axis to cylinder mid-height, along the bank axis.
export const CYL_RISE = 0.6;
export const CYL_LEN = 0.46;

/** Crank centreline of the last cylinder, then the free-end housing. */
export const LAST_CYL_X = CYL_1_X + (PER_BANK - 1) * BORE_SPACING;
export const FREE_END_X = LAST_CYL_X + 0.55;

/** Overall bounding length used to frame the camera. */
export const ENGINE_LEN = FREE_END_X + 1.4;

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

/**
 * Transform for cylinder `i` in CYL_NAMES order. `rotation` tilts a Y-up CylinderGeometry onto the
 * bank axis: rotating (0,1,0) about +X by θ gives (0, cosθ, sinθ), so the A-bank (which leans to
 * -Z) needs -HALF_V.
 */
export function cylinderTransform(i: number): { position: Vec3; rotation: Vec3 } {
  const bank = cylBank(i);
  const n = i % PER_BANK; // 0 = driving end, 9 = free end
  const d = bankDir(bank);
  return {
    position: [CYL_1_X + n * BORE_SPACING, d[1] * CYL_RISE, d[2] * CYL_RISE],
    rotation: [bank === 'A' ? -HALF_V : HALF_V, 0, 0],
  };
}

/** 10 crank throws means 11 main bearings — they straddle the cylinders, half a pitch outboard. */
export const BEARING_1_X = CYL_1_X - BORE_SPACING / 2;

/** Transform for main bearing `i` (0-10, index 10 = free end). Torus axis rotated onto +X. */
export function bearingTransform(i: number): { position: Vec3; rotation: Vec3 } {
  return { position: [BEARING_1_X + i * BORE_SPACING, 0, 0], rotation: [0, Math.PI / 2, 0] };
}

/**
 * Transform for turbocharger `i`, in tcSpeeds[] order: 0=A1, 1=A2, 2=B1, 3=B2.
 * All four sit at the free end in a 2x2 stack — the two BASIC units (A2/B2, always running) inboard
 * and low, the two SWITCHABLE units (A1/B1, cut in at 850/1000 rpm) outboard and high.
 */
export function tcTransform(i: number): { position: Vec3; rotation: Vec3 } {
  const side = i < 2 ? -1 : 1; // A-side is -Z
  const basic = i % 2 === 1;   // indices 1 and 3 are A2 / B2
  return {
    position: [FREE_END_X + 0.55, basic ? 0.62 : 1.28, side * 0.62],
    rotation: [0, 0, Math.PI / 2], // impeller axis across the engine
  };
}

/** Exhaust manifold running the length of one bank, outboard of the heads. */
export function manifoldTransform(bank: 'A' | 'B'): {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
} {
  const d = bankDir(bank);
  const r = 1.02; // outboard of CYL_RISE + half CYL_LEN
  return {
    position: [(CYL_1_X + LAST_CYL_X) / 2, d[1] * r, d[2] * r],
    rotation: [bank === 'A' ? -HALF_V : HALF_V, 0, 0],
    size: [0.18, LAST_CYL_X - CYL_1_X + BORE, 0.18],
  };
}

/** The crankcase slab everything hangs off. */
export const CRANKCASE = {
  position: [FREE_END_X / 2, -0.34, 0] as Vec3,
  size: [FREE_END_X + 0.3, 0.72, 1.12] as Vec3,
};

/** Camera framing: centre of the engine and a comfortable starting orbit radius. */
export const ENGINE_CENTRE: Vec3 = [ENGINE_LEN / 2 - 0.4, 0.45, 0];
export const ORBIT_RADIUS = 6.2;
