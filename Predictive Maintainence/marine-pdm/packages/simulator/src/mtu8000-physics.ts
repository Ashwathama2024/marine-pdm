// packages/simulator/src/mtu8000-physics.ts
// All equations calibrated to MTU 8000 M71L at Group 1B load profile.
// Primary operating point: 85% load, 1150 RPM.
//
// ──── CALIBRATED TO THE OEM ALARM ENVELOPE ───────────────────────────────────
// Every rated target below is set so a HEALTHY engine sits on the safe side of the limit MTU codes
// for it, with margin. The limits are drawing ZNG00028788 (`oemCurve` / `oemScalar` in
// @marine-pdm/shared); the physics is fitted to them, never the other way round. Before this
// calibration five healthy rated values sat on the WRONG side of a coded limit — three of them
// past a shutdown — because thresholds had been tuned to fit the simulator instead.
// See OEM-CALIBRATION-GAP.md.
//
// Healthy at rated (85 % load, 1150 RPM) against the OEM limit it has to clear:
//
//   exhaustTemp            440 °C    curve 10 mean warning 700 °C      — 260 °C of margin
//   lubeOilTemp           78.3 °C    T-Oil Lim1 83 / Lim2 85           — 4.7 °C below warning
//   lubeOilPressure       7.16 bar   (no coded gallery limit; drives the two below)
//   lubeLastBearingP      6.59 bar   curve 3 warn 5.8 / curve 4 SS 5.3  — 0.79 bar above warning
//   pistonCoolingPress    6.09 bar   curve 1 warn 5.2 / curve 2 SS 4.7  — 0.89 bar above warning
//   bearingTemp (max)      100 °C    T-Bearing Lim1 115 / Lim2 SS 120   — 15 °C below warning
//   coolantPressure        5.0 bar   curve 0 warn 4.1                   — 0.9 bar above warning
//   exhaustBackPressure  38.3 mbar   50 warn / >70 fuel limitation      — 11.7 mbar below warning
//   chargeAirTemp           63 °C    T-Charge Air UL 75 / LL 20         — inside both
//   fuelTemp                43 °C    T-Fuel Lim1 45 / Lim2 50           — below both
//
// Other validation targets (unchanged):
//   chargeAirPressure_MTU8000(1150,85,1.0)         → ~3.2 bar
//   sfoc_MTU8000(85,1150,{},1.0)                   → ~185 g/kWh
//
// `tests/physics.test.ts` asserts all of this against the OEM data itself, not against this comment.

import { MTU8000, MTU8000_CYL_SPREAD, BSIDE_TEMP_BIAS } from '@marine-pdm/shared';

// ──── LUBE-OIL CIRCUIT PRESSURE RATIOS ───────────────────────────────────────
// The gallery feeds both the main bearings and the piston-cooling nozzles, at different pressures.
// Their RELATIVE order is fixed by the manual, not invented: ZNG00028788 warns on last-bearing
// pressure at 5.8 bar but on piston-cooling pressure at only 5.2 bar (curves 3 and 1 at 1150 RPM),
// so in service the last bearing is the HIGHER of the two. That rules out the old model, which had
// the last bearing at 0.55 of the gallery and piston cooling at 0.68 — the wrong way round, and
// both so far below the gallery that neither could clear its OEM warning at any realistic gallery
// pressure. Chasing it with a bigger pump would have needed ~11.8 bar, which an MTU 8000 does not
// run: the ratios were the error, not the pump.
//
// Physically the last main bearing is the far end of the same drilled gallery and loses only the
// flow-dependent drop along it, while the piston-cooling rail is fed through metering restrictors
// and deliberately runs lower.
//
// Exported because three modules derive these pressures — the steady-state physics, the engine's
// start handover and the start-sequence snapshot — and they had drifted to two different pairs
// (0.55/0.68 here, 0.35/0.6 in both of the others).
// Re-exported from MTU8000.LUBE_CIRCUIT rather than restated: the derived OEM limits in
// shared/mtu8000.constants.ts need the same two numbers (the gallery alarm is curve 3 divided by
// the last-bearing ratio), and shared cannot import the simulator. One definition, two consumers.
export const LAST_BEARING_PRESSURE_RATIO   = MTU8000.LUBE_CIRCUIT.lastBearingRatio;    // B5.3/B5.4
export const PISTON_COOLING_PRESSURE_RATIO = MTU8000.LUBE_CIRCUIT.pistonCoolingRatio;  // B5.2

/** Gallery pressure at the rated point — the reference the bearing starvation term zeroes on. */
export const RATED_GALLERY_PRESSURE_BAR = 7.15;

/** Lube-oil temperature at the rated point — reference for oil-temperature-relative terms. */
export const RATED_LUBE_OIL_TEMP_C = 78;

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

// ──── 3.4 Lube Oil Pressure Model ─────────────────────────────────────────────
// Main gallery pressure driven by the engine-driven pump.
//
// The pump curve is fitted so the two pressures the ECS actually trips on clear their OEM curves AT
// EVERY SPEED, not merely at rated. These limits are RPM-indexed, so a pump curve of the wrong
// SHAPE passes at 1150 and fails at 600; tests/physics.test.ts checks curves 1–4 of ZNG00028788
// sheet 2 at 400, 500, 600, 800 and 1150 RPM.
//
//   Idle  (400 RPM,   0 % load, 59.7 °C oil): 3.38 bar → last bearing 3.11 (OEM warn 2.37 at 400)
//   Rated (1150 RPM, 85 % load, 78.3 °C oil): 7.16 bar → last bearing 6.59 (OEM warn 5.80)
//
// Was `3.5 + rpmN·4.0`, giving 6.43 bar at rated. The LEVEL was not far wrong; what was wrong were
// the downstream ratios above, which put the last bearing at 3.51 bar against a 5.3 bar shutdown.
export function lubeOilPressure_MTU8000(
  rpm: number,
  load: number,
  oilTemp: number  = RATED_LUBE_OIL_TEMP_C,  // °C — B7
  filterDp: number = 0,   // bar — B5.1 minus B5.5
  lubeFault: number = 0,  // 0–1 pump/filter degradation
): number {
  const base       = 1.15 + rpmN(rpm) * 6.85;  // pump curve: 3.53 bar at idle, 8.00 bar at rated
  const loadDrop   = loadN(load) * 0.8;
  // Both viscosity terms are referenced to the RATED oil temperature, so both are zero at the
  // healthy rated point and the gallery there is set by the pump curve alone. They were referenced
  // to 85 °C and 65 °C, which only made sense while the oil ran 98 °C.
  const viscDrop   = Math.max(0, (oilTemp - RATED_LUBE_OIL_TEMP_C) * 0.018);  // hot oil: thinner → lower press
  const coldDrop   = Math.max(0, (58 - oilTemp) * 0.056);  // cold oil: high filter ΔP → lower gallery press
  const faultDrop  = lubeFault * 3.8;   // lubeFault normalised 0–1; max drop 3.8 bar (F03 full)
  return Math.max(0.5, base - loadDrop - viscDrop - coldDrop - filterDp - faultDrop);
}

// ──── 3.5 Bearing Temperature Model ───────────────────────────────────────────
// 11 crankshaft bearings (B57.1–B57.11)
// Bearing 11 (free end = furthest from pump) runs 5 °C hotter.
// Rated (1150 RPM, 85 % load, 78.3 °C oil, 7.16 bar): ~95 °C mean, ~100 °C hottest
//
// ZNG00028788 codes T-Bearing Mean 112 warning, Lim1 115 warning, Lim2 120 SHUTDOWN. The hottest
// bearing at healthy rated now sits 15 °C below Lim1 and the mean 16 °C below the mean warning.
// It used to reach ~112 °C — within 3 °C of the warning on a healthy engine — because it inherited
// the 98 °C oil temperature. Fixing the oil fixed the bearings; `base` then went 58 → 61 so the
// rise across the bearing stays physically sensible (~17 °C above supply at rated) rather than the
// whole curve simply falling with the oil.
export function bearingTemp_MTU8000(
  load: number,
  rpm: number,
  lubeOilTemp: number,
  lubePressure: number,
  bearingIndex: number,     // 0–10 (bearing 1 = driving end)
  bearingFault: number = 0, // 0–1 per-bearing overtemp severity (F04). ONLY ever receives
                            // bearingFaults[i] — F03 lube loss reaches bearings via pressureDef,
                            // F05 cooler fouling via oilHeat (lubeOilTemp), not through this term.
): number {
  const base        = 61;  // recalibrated with the oil temperature: hottest ~100 °C at rated
  const loadHeat    = loadN(load) * 28;
  const rpmHeat     = rpmN(rpm) * 10;
  // Both references are the RATED operating point, so each term is zero on a healthy engine at
  // rated and the bearing temperature there is base + load + rpm + positionBias. They used to be
  // 85 °C and 6.5 bar, neither of which is the rated value of anything after this recalibration.
  const oilHeat     = (lubeOilTemp - RATED_LUBE_OIL_TEMP_C) * 0.4;
  const pressureDef = Math.max(0, (RATED_GALLERY_PRESSURE_BAR - lubePressure)) * 4.5;
  const positionBias = bearingIndex === 10 ? 5 : bearingIndex > 7 ? 3 : 0;
  const faultHeat   = bearingFault * 45;  // F04 spec = +45°C at full severity (reaches SS T-Bearing).
                                          // Was 20, which under-delivered so the SS trip never fired.
                                          // Zero at healthy (fault=0) so rated temps are unchanged.
  return base + loadHeat + rpmHeat + oilHeat + pressureDef + positionBias + faultHeat;
}

// ── 3.5b Spray-Oil Temperature Model ─────────────────────────────────────────
// B77.11–B77.20 (ECS channels B1–B10) — one per crank throw, reading the oil thrown off the con-rod
// big end. See MTU8000_LIMITS.sprayOil for what the ECS does with them.
//
// The whole diagnostic value is in the SPREAD, so the model is built that way: a term common to all
// ten channels (oil supply temperature, load, speed) plus a per-throw term. Only the per-throw term
// can ever raise the difference, so any common offset cancels out of the alarm. That is what made
// these channels safe to add while lubeOilTemp was still running 13 °C hot; the absolute scale has
// since been corrected, and the ten channels now sit near 99 °C at rated rather than 119 °C.
//
// THROW_SCATTER is the fixed manufacturing spread the real ECS removes with its static calibration.
// It is kept deliberately small: T-Splash Oil Difference Lim1 is only 4 °C, so a healthy engine has
// to sit well inside that or the warning is meaningless. Max healthy deviation from the mean is
// 1.1 °C, about a quarter of the warning limit.
const THROW_SCATTER = [0.4, -0.7, 0.9, -0.3, 1.1, -1.0, 0.6, -0.5, 0.8, -1.1];

/**
 * Spray-oil temperature at one crank throw.
 *
 * `throwFault` is the local distress at THIS throw, 0–1 — a hot bearing beside it or blow-by past
 * its pistons. At full severity it adds 25 °C, four times the shutdown difference, so a single bad
 * throw is unmistakable against the ±1.1 °C healthy scatter.
 */
export function sprayOilTemp_MTU8000(
  load: number,
  rpm: number,
  lubeOilTemp: number,
  throwIndex: number,       // 0–9 (throw 1 = driving end, between bearings 1 and 2)
  throwFault: number = 0,   // 0–1 local distress at this throw
): number {
  const base     = lubeOilTemp + 6;          // oil leaving the bearing is hotter than the supply
  const loadHeat = loadN(load) * 14;         // piston-cooling and big-end friction heat
  const rpmHeat  = rpmN(rpm) * 5;
  const scatter  = THROW_SCATTER[throwIndex] ?? 0;
  return base + loadHeat + rpmHeat + scatter + throwFault * 25;
}

// The quantity the ECS alarms on is `sprayOilDeviation` in @marine-pdm/shared, not defined here:
// the display and the safety override both need the identical number, and shared is the only place
// all three packages can reach. See the note on it for why it is a per-channel deviation.

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

// Charge air temperature after the LT-cooled intercooler.
// LT coolant (~36°C, seawater-cooled) + ~12°C cooler approach + load-driven boost heat.
// Rated (85% load, 1150 RPM, LT_COOLANT=36): 48 + 15.3 ≈ 63°C — this is the intended
// physical value; a real intercooler cannot pull charge air down to ~38°C (2°C approach).
export function chargeAirTemp_MTU8000(
  load: number,
  rpm: number,
  coolantTemp: number = 36,  // °C — LT coolant (intercooler water side)
): number {
  const base     = coolantTemp + 12;
  const loadHeat = loadN(load) * 18;
  return base + loadHeat;
  // Rated ~63°C — HI T-Charge Air alarm at 75°C, B9 max 80°C (see MTU8000_LIMITS.chargeAir).
}

// ──── 3.7 Lube Oil Temperature ────────────────────────────────────────────────
// B7. ZNG00028788: T-Oil Lim1 = 83 °C warning (MDEC 72,01, 5 s), Lim2 = 85 °C POWER REDUCTION
// (72,03, 3 s). A healthy engine must therefore run the oil meaningfully below 83 °C — holding it
// there is what the thermostatic oil cooler is for, and an engine whose oil sits above the warning
// is by definition not healthy.
//
// This equation returned 98.2 °C at rated: 13.2 °C past the point the real ECS reduces power, on a
// perfectly healthy engine. It was the root of three of the five Class A violations, because the
// bearing model and the spray-oil model both hang off it. OEM-CALIBRATION-GAP.md §3.1.
//
//   Idle  (400 RPM,   0 % load): 58 + 0    + 1.7 = 59.7 °C  (cool at idle — little heat going in)
//   Rated (1150 RPM, 85 % load): 58 + 15.3 + 5.0 = 78.3 °C  (4.7 °C below T-Oil Lim1)
//   Full  (1150 RPM,100 % load): 58 + 18.0 + 5.0 = 81.0 °C  (still inside Lim1, as it must be)
//
// Even F05 at full severity (coolingEff 0.75, +3.75 °C) reaches only 82.1 °C at rated — below the
// oil warning, which is right: F05's coded alarm is HI T-Coolant, not T-Oil.
export function lubeOilTemp_MTU8000(
  load: number,
  rpm: number,
  coolantTemp: number  = 36,
  coolingEff: number   = 1.0,
): number {
  const base           = 58;  // recalibrated to the OEM envelope (was 63, giving 98.2 °C at rated)
  const loadHeat       = loadN(load) * 18;  // was 32
  const rpmHeat        = rpmN(rpm) * 5;     // was 8
  const coolingPenalty = (1 - coolingEff) * 15;  // unchanged — this is F05's matrix weight
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
  tcEffMean: number = 1.0,     // TC fouling lowers charge density → worse combustion (0 at healthy)
  pistonBlowby: number = 0,    // blow-by loses compression/combustion gas → worse efficiency (0 at healthy)
): number {
  const base            = 180;   // calibrated: 180 + (100-85)×0.333 = 185 at rated point
  const loadPenalty     = (100 - load) * 0.333;
  const rpmPenalty      = (MTU8000.RATED_RPM - rpm) * 0.08;
  const coolingPenalty  = (1 - coolingEff) * 18;
  const tcPenalty       = (1 - tcEffMean) * 25;   // +10 g/kWh at F06 full (tcEff 0.6 → Δ0.4)
  const blowbyPenalty   = pistonBlowby * 2;       // +2 g/kWh at F08 full — matches impact preview
  const injFaultPenalty = Object.values(injectorFaults)
    .reduce((s, v) => s + v * 4.5, 0);
  // New terms are zero at healthy (tcEff=1, blowby=0) → rated SFOC stays 185 g/kWh (test-safe).
  return base + loadPenalty + rpmPenalty + coolingPenalty + tcPenalty + blowbyPenalty + injFaultPenalty;
}

// ── 3.10 Crankcase Pressure ───────────────────────────────────────────────────
// Slight negative pressure normally (ventilation system).
export function crankcasePressure_MTU8000(
  load: number,
  pistonBlowby: number = 0,  // 0–1 degradation factor
): number {
  const base        = -2.0;  // mbar
  const loadEffect  = loadN(load) * 1.5;
  // Matches FAULT_MAX_EFFECTS.F08_blowby_pressure. Grown 8 → 45 in Phase 5 so blow-by can still
  // reach P-Crankcase Lim1 once that limit is the OEM 27 mbar (curve 9) rather than an invented 5.
  const blowbyEffect = pistonBlowby * 45;
  return base + loadEffect + blowbyEffect;
}

// ──── 3.11 Exhaust Back Pressure ─────────────────────────────────────────────
// B41.1 — downstream of the turbochargers. The sensor-location deck names it "Exhaust pressure
// after turbocharger", which is what makes this a back-pressure series and not a port temperature.
//
// ZNG00028788 limits it twice: the per-variant block warns at 50 mbar (MDEC 2D-45, 5 s delay) and
// the main table applies FUEL LIMITATION above 70 mbar (3D-107, no delay). This equation returned
// 99.5 mbar at rated — a healthy engine permanently in fuel limitation.
//
//   Idle  (400 RPM,   4 % load): 8 +  1.0 + 3.1 = 12.1 mbar
//   Rated (1150 RPM, 85 % load): 8 + 21.3 + 9.0 = 38.3 mbar  (11.7 below the 50 mbar warning)
//   Full  (1150 RPM,100 % load): 8 + 25.0 + 9.0 = 42.0 mbar  (still inside the warning)
export function exhaustBackPressure_MTU8000(
  load: number,
  rpm: number,
  tcEff: number = 1.0,
): number {
  const base         = 8;    // mbar at low load (was 20)
  const loadEffect   = loadN(load) * 25;  // was 70
  const rpmEffect    = rpmN(rpm) * 9;     // was 20
  // Scaled with the healthy level (40 → 16) so a fouled turbine still produces the same FRACTIONAL
  // rise as before — about 17 % of the healthy reading at F06's full tcEff drop of 0.4. Keeping 40
  // against a 38 mbar base would have let one fouled TC more than double the back pressure.
  const tcFoulEffect = (1 - tcEff) * 16;  // fouled TC raises back pressure
  return base + loadEffect + rpmEffect + tcFoulEffect;
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

// ──── Coolant Pressure Model ──────────────────────────────────────────────────
// B16.1. ZNG00028788 curve 0 is the P-Coolant Lim1 WARNING floor and it is steep: 0 bar below
// 380 RPM, 1.6 at 800, 3.2 at 1000, 4.1 from 1150 up. The old linear `1.2 + rpmN·0.8` gave 2.0 bar
// at rated — 2.1 bar BELOW the warning, so a healthy engine sat permanently in LO P-Coolant.
//
// Rebuilt as centrifugal pump head, which rises with the SQUARE of speed. That is also the shape
// curve 0 itself has, so the margin stays roughly proportional across the range instead of closing
// at one end. tests/physics.test.ts checks it against curve 0 at six speeds.
//
//    400 RPM: 1.31 bar (OEM floor 0.03)     800 RPM: 2.83 bar (OEM 1.60)
//   1000 RPM: 3.98 bar (OEM 3.20)          1150 RPM: 5.00 bar (OEM 4.10)
export function coolantPressure_MTU8000(
  rpm: number,
  coolingFault: number = 0,
): number {
  const n         = rpmN(rpm);
  const base      = 0.8;
  const rpmBoost  = n * n * 4.2;          // centrifugal head ∝ speed² → 5.0 bar at rated
  // Scaled with the level (0.8 → 2.0) so a cooling fault moves the same fraction of the healthy
  // reading as before. NOTE: nothing passes this argument today — physics.ts calls
  // coolantPressure_MTU8000(rpm) with one argument, so the term is currently dead, and no
  // degradation-matrix effect references coolantPressure. Kept because a coolant-pump fault is the
  // obvious next mode, and flagged here so it is not mistaken for a modelled path.
  const faultDrop = coolingFault * 2.0;
  return Math.max(0.2, base + rpmBoost - faultDrop);
}

// ── Fuel Temperature Model ────────────────────────────────────────────────────
// Calibrated to stay below preAlarmHigh (45°C) at all normal load points.
export function fuelTemp_MTU8000(load: number): number {
  return 30 + loadN(load) * 13;  // 30–43 °C across 0–100% load
}
