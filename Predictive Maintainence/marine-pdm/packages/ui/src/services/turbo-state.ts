// services/turbo-state.ts — the sequential-turbocharger state the dashboard shows.
//
// Extracted from dashboard/TurbochargerPanel.tsx so the 3D engine view can show the SAME four
// turbochargers rather than a second opinion. This matters more than it looks: the displayed speed
// is NOT snapshot.tcSpeeds[i]. The physics model outputs one 4-TC-equivalent base speed (tcRPM), and
// the panel derives each unit from it —
//
//   activeSpeed  = tcRPM * (4 / activeCount)   ← fewer TCs sharing the boost spin faster
//   standby      = tcRPM * 0.15                ← windmilling with the bypass valve closed
//   engine off   = 0                           ← no exhaust flow, nothing turns, basic units included
//
// so a 3D view reading tcSpeeds[i] directly disagreed with the dashboard by a factor of two whenever
// fewer than four units were cut in.
//
// Cut-in is hysteretic and therefore path-dependent: each consumer advances its own state from the
// same snapshots and converges to the same answer. Two mounted consumers stay in step; one mounted
// during a transition the other missed can lag until the next threshold crossing, which is the same
// behaviour the dashboard already had across page visits.

import type { EngineSnapshot } from '@marine-pdm/shared';

// TC indices in tcSpeeds[]: 0=A1, 1=A2, 2=B1, 3=B2
// A2 (idx 1) and B2 (idx 3) are BASIC — always active, non-switchable
// A1 (idx 0) is 3rd TC (switchable), B1 (idx 2) is 4th TC (switchable)
export const TC_META = [
  { name: 'A1', side: 'A', type: 'switchable', label: '3rd — Switchable', cutInRpm: 850, cutOutRpm: 830 },
  { name: 'A2', side: 'A', type: 'basic', label: '1st — Basic', cutInRpm: 0, cutOutRpm: 0 },
  { name: 'B1', side: 'B', type: 'switchable', label: '4th — Switchable', cutInRpm: 1000, cutOutRpm: 950 },
  { name: 'B2', side: 'B', type: 'basic', label: '2nd — Basic', cutInRpm: 0, cutOutRpm: 0 },
] as const;

// MTU 20V 8000 M71/M91 real-engine thresholds — all values are live physics RPM.
// Physics model is calibrated: idle 7 000 RPM, rated 28 000 RPM, max ~30 000 RPM.
export const REF = {
  cutInTcSpeed: 37000, // TC speed for 3rd/4th cut-in
  cutOut_4to3_rpm: 950, cutOut_4to3_tc: 28000,
  cutOut_3to2_rpm: 830, cutOut_3to2_tc: 26000,
  overSpeedL1: 40500, // Yellow alarm
  overSpeedL2: 41000, // Power limitation
  idleRpm: 7000,
  nominalRatedRpm: 28000,
} as const;

/** No display scaling — physics outputs real-world RPM directly. */
export const SPEED_SCALE = 1.0;
export const PHYS_MAX_DISPLAY = 42000;
/** Flag a TC as deviating when it differs from expected by more than this fraction of the range. */
export const DEVIATION_FRAC = 0.05;

export type TCStatus = 'ACTIVE' | 'STANDBY' | 'ALARM';

/** Basic TCs always on, switchable start off. */
export const INITIAL_CUTIN: boolean[] = TC_META.map(m => m.type === 'basic');

/**
 * Advance hysteresis state using the DUAL cut-in condition from the MTU spec:
 *   Cut-in:  engine RPM ≥ threshold AND active-TC speed ≥ 37 000 RPM
 *   Cut-out: engine RPM < threshold (engine RPM alone — simpler/faster protection)
 *
 * When N TCs share the boost load, each spins at (4/N) × base_speed, where base_speed is the physics
 * model output (calibrated for all-4-TC operation).
 *
 * Processing order matters: decide A1 (3rd) first, then B1 (4th) using A1's new state.
 */
export function nextCutInState(prev: boolean[], engineRpm: number, baseTcSpeed: number): boolean[] {
  const next = [...prev] as boolean[];

  // "Basic" (A2/B2) only means "not solenoid-switched by load" — they are still purely exhaust-gas
  // driven. With the engine stopped there is nothing to spin ANY of the four, basic included.
  if (engineRpm <= 0) {
    if (prev.every(v => v === false)) return prev;
    return [false, false, false, false];
  }

  next[1] = true;
  next[3] = true;

  // ── A1 (3rd TC, index 0) — before its decision only A2 + B2 are active, so each runs at 2× base
  const speed2TC = baseTcSpeed * 2;
  const was_A1 = prev[0]!;
  let new_A1: boolean;
  if (engineRpm < TC_META[0].cutOutRpm) {
    new_A1 = false;
  } else if (engineRpm >= TC_META[0].cutInRpm && speed2TC >= REF.cutInTcSpeed) {
    new_A1 = true;
  } else {
    new_A1 = was_A1; // dead-band → hold
  }
  next[0] = new_A1;

  // ── B1 (4th TC, index 2) — 2 or 3 active before its decision
  const activeBeforeB1 = 2 + (new_A1 ? 1 : 0);
  const speedBeforeB1 = baseTcSpeed * (4 / activeBeforeB1);
  const was_B1 = prev[2]!;
  let new_B1: boolean;
  if (engineRpm < TC_META[2].cutOutRpm) {
    new_B1 = false;
  } else if (engineRpm >= TC_META[2].cutInRpm && speedBeforeB1 >= REF.cutInTcSpeed) {
    new_B1 = true;
  } else {
    new_B1 = was_B1;
  }
  next[2] = new_B1;

  if (next.every((v, i) => v === prev[i])) return prev;
  return next;
}

export function tcStatusFromFlags(
  isActive: boolean,
  displaySpeed: number,
  deviation: number,
): TCStatus {
  if (!isActive) return 'STANDBY';
  const hasDevFault = Math.abs(deviation) > PHYS_MAX_DISPLAY * DEVIATION_FRAC;
  const overSpeed = displaySpeed >= REF.overSpeedL1;
  if (hasDevFault || overSpeed) return 'ALARM';
  return 'ACTIVE';
}

export interface TCInfo {
  name: string;
  status: TCStatus;
  displaySpeed: number;
  rawSpeed: number;
  deviation: number;
}

export function deriveTCInfos(
  snap: EngineSnapshot,
  expectedTcRPM: number,
  cutInState: boolean[],
): TCInfo[] {
  const engineRunning = snap.rpm > 0;
  const baseTcSpeed = snap.tcRPM * SPEED_SCALE; // physics output: 4-TC-equivalent speed
  const activeCount = cutInState.filter(Boolean).length || 2;
  const activeMult = 4 / activeCount;
  const activeSpeed = baseTcSpeed * activeMult;
  const expectedDisp = expectedTcRPM * SPEED_SCALE * activeMult;

  return TC_META.map((meta, i) => {
    // Engine fully stopped → zero exhaust flow → every TC at rest, no exceptions. Also a defensive
    // floor against tcSpeed_MTU8000() carrying a small nonzero base term.
    if (!engineRunning) {
      return { name: meta.name, status: 'STANDBY' as TCStatus, displaySpeed: 0, rawSpeed: 0, deviation: 0 };
    }
    const isActive = cutInState[i]!;
    const displaySpeed = isActive ? activeSpeed : baseTcSpeed * 0.15;
    const deviation = isActive ? activeSpeed - expectedDisp : 0;
    return { name: meta.name, status: tcStatusFromFlags(isActive, displaySpeed, deviation), displaySpeed, rawSpeed: baseTcSpeed, deviation };
  });
}

/**
 * Seconds per revolution for the dashboard's turbo wheel, and now for the 3D turbocharger too, so
 * the two spin at visibly the same rate.
 *   7 000 RPM (idle) → 3.0 s/rev · 28 000 (nominal) → ~1.31 · 41 000 → ~0.26, floored at 0.18.
 * Standby windmills at a fixed 8 s/rev.
 */
export function turboWheelPeriodS(displaySpeed: number, status: TCStatus): number {
  if (status === 'STANDBY') return 8;
  const clamped = Math.max(REF.idleRpm, Math.min(PHYS_MAX_DISPLAY, displaySpeed));
  return Math.max(0.18, 3.0 - ((clamped - REF.idleRpm) / (PHYS_MAX_DISPLAY - REF.idleRpm)) * 2.82);
}
