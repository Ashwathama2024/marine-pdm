// packages/decision/src/override-mtu8000.ts
// MTU ECS 8000 safety system (SS) override layer.
// Mirrors ECS 8000 SS logic exactly — these supersede AI risk scores.
// PDF upgrade spec §8.2.

import { MTU8000_LIMITS, MTU8000_LIMIT_CURVES, sprayOilDeviation } from '@marine-pdm/shared';
import type { EngineSnapshot } from '@marine-pdm/shared';

// Several of these trips are RPM CURVES on ZNG00028788, not fixed numbers (sheet 2). The limit
// that applies is the one at the speed the engine is turning: P-Oil last bearing Lim2 is 5.3 bar
// at 1150 RPM but 2.07 bar at 400. Comparing a live reading to the rated-point scalar would fire
// an Emergency Stop on a healthy idling engine, so every curve limit here is resolved at snap.rpm.
const C = MTU8000_LIMIT_CURVES;

export interface SafetyOverrideResult {
  risk: number;
  triggered: string | null;  // ECS code that fired, or null
}

// Reads MTU 8000 fields from EngineSnapshot's index signature.
// All fields added in U2–U3 are present via snap[key].
function getField(snap: EngineSnapshot, key: string, fallback = 0): number {
  const v = snap[key];
  return typeof v === 'number' ? v : fallback;
}

function getBearingTemps(snap: EngineSnapshot): number[] {
  const bt = snap['bearingTemps'];
  return Array.isArray(bt) ? bt as number[] : [];
}


export function applyMTU8000SafetyOverride(
  risk: number,
  snap: EngineSnapshot,
): SafetyOverrideResult {
  const lubeLastBearing  = getField(snap, 'lubeLastBearingPressure', snap.lubeOilPressure);
  const coolantTemp      = getField(snap, 'coolantTempAfterEngine', snap.jacketOutlet);
  const exhaustMean      = getField(snap, 'exhaustMeanTemp', snap.exhaustTemp);
  const fuelRailPressure = getField(snap, 'fuelRailPressure', 1800);
  const bearingTemps     = getBearingTemps(snap);
  const sprayOil         = sprayOilDeviation(snap);
  const pistonCooling    = getField(snap, 'pistonCoolingPress', Number.POSITIVE_INFINITY);
  const rpm              = snap.rpm;

  // ── SS (Safety System) triggers — risk = 100 immediately ─────────────────
  // SS P-Oil Last Bearing (B5.3/B5.4) — MDEC 2D-29, curve 4, 1.0 s delay.
  const lastBearingSS = C.lastBearingPressSS(rpm);
  if (lubeLastBearing < lastBearingSS) {
    return {
      risk: 100,
      triggered: `SS P-Oil Last Bearing — ${lubeLastBearing.toFixed(2)} bar < ${lastBearingSS.toFixed(2)} bar at ${rpm.toFixed(0)} RPM — Emergency Stop`,
    };
  }

  // SS Oil Pressure Piston Cooling (B5.2) — MDEC 2D-27, curve 2, 2.0 s delay.
  // This trip was absent entirely: piston-cooling pressure had no shutdown check, which is part
  // of why the simulator could sit 0.35 bar below it without anything noticing.
  const pistonCoolingSS = C.pistonCoolingPressSS(rpm);
  if (pistonCooling < pistonCoolingSS) {
    return {
      risk: 100,
      triggered: `SS P-Oil Piston Cooling — ${pistonCooling.toFixed(2)} bar < ${pistonCoolingSS.toFixed(2)} bar at ${rpm.toFixed(0)} RPM — Emergency Stop`,
    };
  }

  // SS T-Bearing (any of B57.1–B57.11)
  for (let i = 0; i < bearingTemps.length; i++) {
    if (bearingTemps[i] > MTU8000_LIMITS.lubeOil.bearing_temp_max) {
      return {
        risk: 100,
        triggered: `SS T-Bearing ${i + 1} — ${bearingTemps[i].toFixed(1)}°C > ${MTU8000_LIMITS.lubeOil.bearing_temp_max}°C — Emergency Stop`,
      };
    }
  }

  // SS T-Coolant (B6.1)
  if (coolantTemp > MTU8000_LIMITS.cooling.coolant_temp_ss) {
    return {
      risk: 100,
      triggered: `SS T-Coolant — ${coolantTemp.toFixed(1)}°C > ${MTU8000_LIMITS.cooling.coolant_temp_ss}°C — Emergency Stop`,
    };
  }

  // SS T-Splash Oil Difference (B77.11–B77.20) — Lim2, shutdown.
  // The ECS names the offending channel by its B1–B10 number, so we do too.
  if (sprayOil.dev > MTU8000_LIMITS.sprayOil.diff_shutdown) {
    return {
      risk: 100,
      triggered: `SS T-Splash Oil B${sprayOil.channel + 1} — ${sprayOil.dev.toFixed(1)}°C above mean > ${MTU8000_LIMITS.sprayOil.diff_shutdown}°C — Emergency Stop`,
    };
  }

  // ── HI triggers — risk floor raised, not 100 ─────────────────────────────
  // HI T-Splash Oil (B77.11–B77.20) — Lim1, warning. This is the earliest bearing-distress signal
  // the engine has: the oil coming off a big end warms before the bearing casting does, so this
  // fires ahead of HI T-Bearing on the same fault.
  if (sprayOil.dev > MTU8000_LIMITS.sprayOil.diff_warn) {
    return {
      risk: Math.max(risk, 75),
      triggered: `HI T-Splash Oil B${sprayOil.channel + 1} — ${sprayOil.dev.toFixed(1)}°C above mean > ${MTU8000_LIMITS.sprayOil.diff_warn}°C`,
    };
  }

  // HI T-Exhaust Mean (B4.1–B4.20 mean) — MDEC 2D-50, curve 10, 10 s delay.
  //
  // This is an ABSOLUTE limit and the OEM sets it high: 700 °C at rated against a healthy 440 °C.
  // It had been coded at 460 °C, 20 °C above healthy, which made it the de-facto detector for any
  // exhaust fault. On the OEM number no modelled fault reaches it — F02 at full severity lifts the
  // mean to ~472 °C — and that is faithful to the real ECS, which catches a single-bank injector
  // fault through the RELATIVE limits instead (single-cylinder UL curve 12, and the mean's own
  // 20 °C offset limit MDEC 51,03). In this app that relative job is done by the deviation-based
  // risk scoring and by patterns P01/P02/P09, not by this override. See the Phase 5 fault audit in
  // OEM-CALIBRATION-GAP.md §8.
  const exhaustMeanHI = C.exhaustMeanHI(rpm);
  if (exhaustMean > exhaustMeanHI) {
    return {
      risk: Math.max(risk, 80),
      triggered: `HI T-Exhaust Mean — ${exhaustMean.toFixed(1)}°C > ${exhaustMeanHI.toFixed(0)}°C at ${rpm.toFixed(0)} RPM`,
    };
  }

  // HI P-Oil Last Bearing (B5.3/B5.4) — MDEC 2D-17, curve 3, 3.0 s delay. The warning step below
  // the shutdown checked above; the app had no such step, only the trip.
  const lastBearingHI = C.lastBearingPressHI(rpm);
  if (lubeLastBearing < lastBearingHI) {
    return {
      risk: Math.max(risk, 80),
      triggered: `LO P-Oil Last Bearing — ${lubeLastBearing.toFixed(2)} bar < ${lastBearingHI.toFixed(2)} bar at ${rpm.toFixed(0)} RPM`,
    };
  }

  // HI P-Oil Piston Cooling (B5.2) — MDEC 2D-26, curve 1, 5.0 s delay.
  const pistonCoolingHI = C.pistonCoolingPressHI(rpm);
  if (pistonCooling < pistonCoolingHI) {
    return {
      risk: Math.max(risk, 80),
      triggered: `LO P-Oil Piston Cooling — ${pistonCooling.toFixed(2)} bar < ${pistonCoolingHI.toFixed(2)} bar at ${rpm.toFixed(0)} RPM`,
    };
  }

  // SD P-Fuel Rail → Emergency Operation (not shutdown, but critical)
  if (fuelRailPressure < MTU8000_LIMITS.fuel.rail_pressure_min) {
    return {
      risk: Math.max(risk, 85),
      triggered: `SD P-Fuel Rail — ${fuelRailPressure.toFixed(0)} bar < ${MTU8000_LIMITS.fuel.rail_pressure_min} bar — Emergency Operation Active`,
    };
  }

  // HI T-Bearing (any B57.x above hi alarm, not yet SS)
  for (let i = 0; i < bearingTemps.length; i++) {
    if (bearingTemps[i] > MTU8000_LIMITS.lubeOil.bearing_temp_hi) {
      return {
        risk: Math.max(risk, 75),
        triggered: `HI T-Bearing ${i + 1} — ${bearingTemps[i].toFixed(1)}°C > ${MTU8000_LIMITS.lubeOil.bearing_temp_hi}°C`,
      };
    }
  }

  return { risk, triggered: null };
}

// Hard limit violation strings for display in alert panel
export function getMTU8000HardLimitViolations(snap: EngineSnapshot): string[] {
  const violations: string[] = [];

  const rpm = snap.rpm;
  const lubeLastBearing = getField(snap, 'lubeLastBearingPressure', snap.lubeOilPressure);
  if (lubeLastBearing < C.lastBearingPressSS(rpm)) {
    violations.push(`[SS] P-Oil Last Bearing ${lubeLastBearing.toFixed(2)} bar < ${C.lastBearingPressSS(rpm).toFixed(2)} bar`);
  } else if (lubeLastBearing < C.lastBearingPressHI(rpm)) {
    violations.push(`[LO] P-Oil Last Bearing ${lubeLastBearing.toFixed(2)} bar < ${C.lastBearingPressHI(rpm).toFixed(2)} bar`);
  } else if (snap.lubeOilPressure < C.galleryPressHI(rpm)) {
    // Main gallery (B5.1). MTU codes no gallery limit, so this threshold is the gallery pressure
    // at which the LAST BEARING would reach its coded warning — curve 3 over the takeoff ratio.
    //
    // The `load >= 25` guard is gone with the flat 5.5 bar it existed to paper over: a fixed
    // floor cannot work on a pressure that runs 3.4 bar at idle and 7.2 at rated, so the alarm
    // was suppressed at low load rather than made correct. Following the curve, it is valid at
    // every speed, and a healthy engine clears it by ~0.8 bar from idle to full power.
    violations.push(`[LO] LO Pressure before filter ${snap.lubeOilPressure.toFixed(2)} bar < ${C.galleryPressHI(rpm).toFixed(2)} bar`);
  }

  const coolantTemp = getField(snap, 'coolantTempAfterEngine', snap.jacketOutlet);
  if (coolantTemp > MTU8000_LIMITS.cooling.coolant_temp_ss) {
    violations.push(`[SS] T-Coolant ${coolantTemp.toFixed(1)}°C > ${MTU8000_LIMITS.cooling.coolant_temp_ss}°C`);
  } else if (coolantTemp > MTU8000_LIMITS.cooling.coolant_temp_after_engine_max) {
    violations.push(`[HI] T-Coolant ${coolantTemp.toFixed(1)}°C > ${MTU8000_LIMITS.cooling.coolant_temp_after_engine_max}°C`);
  }

  const pistonCooling = getField(snap, 'pistonCoolingPress', Number.POSITIVE_INFINITY);
  if (pistonCooling < C.pistonCoolingPressSS(rpm)) {
    violations.push(`[SS] P-Oil Piston Cooling ${pistonCooling.toFixed(2)} bar < ${C.pistonCoolingPressSS(rpm).toFixed(2)} bar`);
  } else if (pistonCooling < C.pistonCoolingPressHI(rpm)) {
    violations.push(`[LO] P-Oil Piston Cooling ${pistonCooling.toFixed(2)} bar < ${C.pistonCoolingPressHI(rpm).toFixed(2)} bar`);
  }

  const exhaustMean = getField(snap, 'exhaustMeanTemp', snap.exhaustTemp);
  if (exhaustMean > C.exhaustMeanHI(rpm)) {
    violations.push(`[HI] T-Exhaust Mean ${exhaustMean.toFixed(1)}°C > ${C.exhaustMeanHI(rpm).toFixed(0)}°C`);
  }

  // No P-Crankcase trip here on purpose. ZNG00028788 codes one (curve 9 warning at 27 mbar, plus a
  // shutdown 10 mbar above it, MDEC 91,05) and MTU8000_LIMITS.crankcase carries both — but
  // crankcase pressure has no dashboard gauge, and dashboard-coverage.test.ts exists to stop a
  // parameter the ECS acts on from being enforced while invisible, which is how bearing
  // temperature came to have a shutdown and no display. F08's HI P-Crankcase already surfaces
  // through the simulator's ECS alarm preview. Give it a gauge first, then add the trip.

  const fuelRailP = getField(snap, 'fuelRailPressure', 1800);
  if (fuelRailP < MTU8000_LIMITS.fuel.rail_pressure_min) {
    violations.push(`[SD] P-Fuel Rail ${fuelRailP.toFixed(0)} bar < ${MTU8000_LIMITS.fuel.rail_pressure_min} bar`);
  }

  const bearingTemps = getBearingTemps(snap);
  for (let i = 0; i < bearingTemps.length; i++) {
    if (bearingTemps[i] > MTU8000_LIMITS.lubeOil.bearing_temp_max) {
      violations.push(`[SS] T-Bearing ${i + 1}: ${bearingTemps[i].toFixed(1)}°C > ${MTU8000_LIMITS.lubeOil.bearing_temp_max}°C`);
    } else if (bearingTemps[i] > MTU8000_LIMITS.lubeOil.bearing_temp_hi) {
      violations.push(`[HI] T-Bearing ${i + 1}: ${bearingTemps[i].toFixed(1)}°C > ${MTU8000_LIMITS.lubeOil.bearing_temp_hi}°C`);
    }
  }

  const sprayOil = sprayOilDeviation(snap);
  if (sprayOil.dev > MTU8000_LIMITS.sprayOil.diff_shutdown) {
    violations.push(`[SS] T-Splash Oil B${sprayOil.channel + 1}: ${sprayOil.dev.toFixed(1)}°C above mean > ${MTU8000_LIMITS.sprayOil.diff_shutdown}°C`);
  } else if (sprayOil.dev > MTU8000_LIMITS.sprayOil.diff_warn) {
    violations.push(`[HI] T-Splash Oil B${sprayOil.channel + 1}: ${sprayOil.dev.toFixed(1)}°C above mean > ${MTU8000_LIMITS.sprayOil.diff_warn}°C`);
  }

  return violations;
}
