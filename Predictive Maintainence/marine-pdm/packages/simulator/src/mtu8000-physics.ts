// packages/simulator/src/mtu8000-physics.ts
// All equations calibrated to MTU 8000 M71L at Group 1B load profile.
// Primary operating point: 85% load, 1150 RPM.
// Validation targets (PDF §3):
//   exhaustTemp_MTU8000(85,1150,1.0,1.0)          → ~440 °C
//   lubeOilPressure_MTU8000(1150,85,85,0,0)        → ~6.7 bar
//   chargeAirPressure_MTU8000(1150,85,1.0)         → ~3.2 bar
//   sfoc_MTU8000(85,1150,{},1.0)                   → ~185 g/kWh

import { MTU8000, MTU8000_CYL_SPREAD, BSIDE_TEMP_BIAS } from '@marine-pdm/shared';

// Normalise helpers (0.0–1.0 relative to rated)
const loadN = (load: number) => load / 100;
const rpmN  = (rpm: number)  => rpm / MTU8000.RATED_RPM;  // 0–1 rel to 1150

// ── 3.2 Exhaust Temperature Model ─────────────────────────────────────────────
// At 85% load, 1150 RPM, healthy: ~440 °C mean exhaust
export function exhaustTemp_MTU8000(
  load: number,
  rpm: number,
  coolingEff: number = 1.0,  // 1.0 = clean, 0.75 = degraded HT cooler
  tcEff: number = 1.0,       // 1.0 = healthy TC, drops with fouling
): number {
  const base    = 276;   // calibrated: 276 + 0.85×160 + 1.0×28 = 440 at rated point
  const loadC   = loadN(load) * 160;
  const rpmC    = rpmN(rpm) * 28;
  const cooling = (1 - coolingEff) * 35;  // degraded cooling raises temp
  const tc      = (1 - tcEff) * 20;       // degraded TC raises exhaust
  return base + loadC + rpmC + cooling + tc;
}

// ── 3.3 Individual Cylinder Temperature ───────────────────────────────────────
export function cylExhaustTemp_MTU8000(
  baseMeanExhaust: number,
  cylIndex: number,                          // 0–19 (A1=0, B10=19)
  injectorFaults: Record<number, number>,    // severity 0–1 per cylinder index
  cylSoakFactor: number = 1.0,               // >1.0 if adjacent cyl also faulted
): number {
  const spread    = MTU8000_CYL_SPREAD[cylIndex];
  const biasSide  = cylIndex >= 10 ? BSIDE_TEMP_BIAS : 0;
  const faultDelta = (injectorFaults[cylIndex] ?? 0) * 65 * cylSoakFactor;
  return baseMeanExhaust + spread + biasSide + faultDelta;
}

// ── 3.4 Lube Oil Pressure Model ───────────────────────────────────────────────
// Main gallery pressure driven by engine-driven pump.
// Idle (400 RPM, 0% load, 65°C oil): 4.5–5.0 bar
// Rated (1150 RPM, 85% load, 85°C oil): ~6.7 bar
export function lubeOilPressure_MTU8000(
  rpm: number,
  load: number,
  oilTemp: number  = 85,  // °C — B7
  filterDp: number = 0,   // bar — B5.1 minus B5.5
  lubeFault: number = 0,  // 0–1 pump/filter degradation
): number {
  const base       = 3.5 + rpmN(rpm) * 4.0;  // pump curve: 3.5 bar idle, 7.5 bar rated
  const loadDrop   = loadN(load) * 0.8;
  const viscDrop   = Math.max(0, (oilTemp - 85) * 0.018);  // hot oil: lower viscosity → lower press
  const coldDrop   = Math.max(0, (65 - oilTemp) * 0.056);  // cold oil: high filter ΔP → lower gallery press
  const faultDrop  = lubeFault * 3.5;
  return Math.max(0.5, base - loadDrop - viscDrop - coldDrop - filterDp - faultDrop);
}

// ── 3.5 Bearing Temperature Model ────────────────────────────────────────────
// 11 crankshaft bearings (B57.1–B57.11)
// Bearing 11 (free end = furthest from pump) runs 5 °C hotter.
// Idle (400 RPM, 0% load, 65°C oil, 4.9 bar): 60–70°C
// Rated (1150 RPM, 85% load, 98°C oil, 6.7 bar): ~97–102°C
export function bearingTemp_MTU8000(
  load: number,
  rpm: number,
  lubeOilTemp: number,
  lubePressure: number,
  bearingIndex: number,  // 0–10 (bearing 1 = driving end)
  lubeFault: number = 0,
): number {
  const base        = 58;  // recalibrated: idle target 60-70°C at 400 RPM / no load
  const loadHeat    = loadN(load) * 28;
  const rpmHeat     = rpmN(rpm) * 10;
  const oilHeat     = (lubeOilTemp - 85) * 0.4;
  const pressureDef = Math.max(0, (6.5 - lubePressure)) * 4.5;
  const positionBias = bearingIndex === 10 ? 5 : bearingIndex > 7 ? 3 : 0;
  const faultHeat   = lubeFault * 20;
  return base + loadHeat + rpmHeat + oilHeat + pressureDef + positionBias + faultHeat;
}

// ── 3.6 Charge Air Pressure & Temperature ─────────────────────────────────────
// Sequential turbocharging: 2 TCs per side, cut in/out by Y27.1/.2
// Idle (400 RPM, 0% load): 1.35 + 0.348×1.46 ≈ 1.86 bar abs (~0.85 bar gauge)
// Rated (1150 RPM, 85% load): 1.35 + 1.46 + 0.85×0.47 ≈ 3.21 bar abs
export function chargeAirPressure_MTU8000(
  rpm: number,
  load: number,
  tcEff: number = 1.0,
): number {
  const boost = rpmN(rpm) * 1.46 + loadN(load) * 0.47;
  return 1.35 + boost * tcEff;
}

// Target: at 85%, 1150 RPM → ~3.2 bar
export function chargeAirTemp_MTU8000(
  load: number,
  rpm: number,
  coolantTemp: number = 36,  // °C — LT coolant (intercooler water side)
): number {
  const base     = coolantTemp + 12;
  const loadHeat = loadN(load) * 18;
  return base + loadHeat;
  // Target: < 55 °C — HI T-Charge Air alarm at 50 °C
}

// ── 3.7 Lube Oil Temperature ──────────────────────────────────────────────────
// Idle (400 RPM, 0% load): 63 + 0 + 2.78 ≈ 65.8°C  (below operating range 70–78°C — normal at idle)
// Rated (1150 RPM, 85% load): 63 + 27.2 + 8 ≈ 98°C  (normal range 85–105°C)
export function lubeOilTemp_MTU8000(
  load: number,
  rpm: number,
  coolantTemp: number  = 36,
  coolingEff: number   = 1.0,
): number {
  const base           = 63;  // recalibrated: was 70 (gave 105°C at rated, formula comment said ~98°C)
  const loadHeat       = loadN(load) * 32;
  const rpmHeat        = rpmN(rpm) * 8;
  const coolingPenalty = (1 - coolingEff) * 15;
  return base + loadHeat + rpmHeat + coolingPenalty;
}

// ── 3.8 Fuel Rail Pressure ────────────────────────────────────────────────────
// HP pump at idle speed builds to 1600 bar; rises to 1800 bar at 100% load.
// Idle (400 RPM, 0% load): 1600 bar stabilised
// Rated (1150 RPM, 85% load): 1770 bar
export function fuelRailPressure_MTU8000(
  load: number,
  rpm: number,
  injectorFaultCount: number = 0,
): number {
  const nominal   = 1600;  // bar at idle (HP pump minimum output)
  const loadMod   = loadN(load) * 200;  // 1600 → 1800 bar across 0–100% load
  const faultDrop = injectorFaultCount * 15;
  return nominal + loadMod - faultDrop;
}

// ── 3.9 SFOC Model ────────────────────────────────────────────────────────────
// MTU 8000 M71L nominal SFOC at 85% load: ~185 g/kWh
export function sfoc_MTU8000(
  load: number,
  rpm: number,
  injectorFaults: Record<number, number>,
  coolingEff: number = 1.0,
): number {
  const base            = 180;   // calibrated: 180 + (100-85)×0.333 = 185 at rated point
  const loadPenalty     = (100 - load) * 0.333;
  const rpmPenalty      = (MTU8000.RATED_RPM - rpm) * 0.08;
  const coolingPenalty  = (1 - coolingEff) * 18;
  const injFaultPenalty = Object.values(injectorFaults)
    .reduce((s, v) => s + v * 4.5, 0);
  return base + loadPenalty + rpmPenalty + coolingPenalty + injFaultPenalty;
}

// ── 3.10 Crankcase Pressure ───────────────────────────────────────────────────
// Slight negative pressure normally (ventilation system).
export function crankcasePressure_MTU8000(
  load: number,
  pistonBlowby: number = 0,  // 0–1 degradation factor
): number {
  const base        = -2.0;  // mbar
  const loadEffect  = loadN(load) * 1.5;
  const blowbyEffect = pistonBlowby * 8;
  return base + loadEffect + blowbyEffect;
}

// ── 3.11 Exhaust Back Pressure ───────────────────────────────────────────────
// B41.1 — downstream of turbochargers.
// Rises with load/RPM and if TC is fouled (reduced flow).
export function exhaustBackPressure_MTU8000(
  load: number,
  rpm: number,
  tcEff: number = 1.0,
): number {
  const base         = 20;   // mbar at low load
  const loadEffect   = loadN(load) * 70;
  const rpmEffect    = rpmN(rpm) * 20;
  const tcFoulEffect = (1 - tcEff) * 40;  // fouled TC raises back pressure
  return base + loadEffect + rpmEffect + tcFoulEffect;
  // At 85%, 1150 RPM healthy: ~90 mbar; normal <120 mbar alarm at 150 mbar
}

// ── TC Speed Model ────────────────────────────────────────────────────────────
// Sequential TC: 2 per side (A1,A2,B1,B2) — ECU-4 controls Y27.1/Y27.2 solenoids.
// Calibration targets (MTU 20V 8000 M71/M91 spec):
//   tcSpeed_MTU8000(400,  4,  1.0) →  7 000 RPM  (idle — basic TCs windmill)
//   tcSpeed_MTU8000(1150, 85, 1.0) → 28 000 RPM  (rated nominal, 4 TCs active)
// Overspeed thresholds: L1 = 40 500 RPM (yellow alarm), L2 = 41 000 RPM (power limit).
// Cut-in (2→3 TCs): engine >850 RPM AND TC speed >37 000 RPM.
// Cut-out (3→2):    engine <830 RPM OR TC speed <26 000 RPM.
export function tcSpeed_MTU8000(
  rpm: number,
  load: number,
  tcEff: number = 1.0,
): number {
  const base   =   500;
  const rpmC   = rpmN(rpm)  * 17300;  // contributes 17 300 at full RPM
  const loadC  = loadN(load) * 12000;  // contributes 12 000 at 100% load
  return (base + rpmC + loadC) * tcEff;
  // Validation:
  //   idle  (400 / 4 %) : 500 + 6 022 + 480  =  7 002 RPM ≈ 7 000 ✓
  //   rated (1150 / 85%): 500 + 17 300 + 10 200 = 28 000 RPM ✓
  //   full  (1150 /100%): 500 + 17 300 + 12 000 = 29 800 RPM (well below L1 40 500)
}

// ── Coolant Pressure Model ────────────────────────────────────────────────────
export function coolantPressure_MTU8000(
  rpm: number,
  coolingFault: number = 0,
): number {
  const base      = 1.2;
  const rpmBoost  = rpmN(rpm) * 0.8;
  const faultDrop = coolingFault * 0.8;
  return Math.max(0.2, base + rpmBoost - faultDrop);
}

// ── Fuel Temperature Model ────────────────────────────────────────────────────
// Calibrated to stay below preAlarmHigh (45°C) at all normal load points.
export function fuelTemp_MTU8000(load: number): number {
  return 30 + loadN(load) * 13;  // 30–43 °C across 0–100% load
}
