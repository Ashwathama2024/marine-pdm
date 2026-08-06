// packages/decision/src/override-mtu8000.ts
// MTU ECS 8000 safety system (SS) override layer.
// Mirrors ECS 8000 SS logic exactly — these supersede AI risk scores.
// PDF upgrade spec §8.2.

import { MTU8000_LIMITS, sprayOilDeviation } from '@marine-pdm/shared';
import type { EngineSnapshot } from '@marine-pdm/shared';

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

  // ── SS (Safety System) triggers — risk = 100 immediately ─────────────────
  // SS P-Oil Last Bearing (B5.3/B5.4)
  if (lubeLastBearing < MTU8000_LIMITS.lubeOil.pressure_last_bearing_min) {
    return {
      risk: 100,
      triggered: `SS P-Oil Last Bearing — ${lubeLastBearing.toFixed(2)} bar < ${MTU8000_LIMITS.lubeOil.pressure_last_bearing_min} bar — Emergency Stop`,
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

  // HI T-Exhaust Mean (B4.30)
  if (exhaustMean > MTU8000_LIMITS.exhaust.mean_hi) {
    return {
      risk: Math.max(risk, 80),
      triggered: `HI T-Exhaust Mean — ${exhaustMean.toFixed(1)}°C > ${MTU8000_LIMITS.exhaust.mean_hi}°C`,
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

  const lubeLastBearing = getField(snap, 'lubeLastBearingPressure', snap.lubeOilPressure);
  if (lubeLastBearing < MTU8000_LIMITS.lubeOil.pressure_last_bearing_min) {
    violations.push(`[SS] P-Oil Last Bearing ${lubeLastBearing.toFixed(2)} bar < ${MTU8000_LIMITS.lubeOil.pressure_last_bearing_min} bar`);
  } else if (snap.load >= 25 && snap.lubeOilPressure < MTU8000_LIMITS.lubeOil.pressure_before_filter_min) {
    // HI LO Pressure alarm only valid at ≥25% load.
    // MTU 8000 physics: main gallery pressure at idle/low-load naturally runs below the
    // 5.5 bar rated HI threshold — this is expected and correct for low-load operation.
    violations.push(`[HI] LO Pressure before filter ${snap.lubeOilPressure.toFixed(2)} bar < ${MTU8000_LIMITS.lubeOil.pressure_before_filter_min} bar`);
  }

  const coolantTemp = getField(snap, 'coolantTempAfterEngine', snap.jacketOutlet);
  if (coolantTemp > MTU8000_LIMITS.cooling.coolant_temp_ss) {
    violations.push(`[SS] T-Coolant ${coolantTemp.toFixed(1)}°C > ${MTU8000_LIMITS.cooling.coolant_temp_ss}°C`);
  } else if (coolantTemp > MTU8000_LIMITS.cooling.coolant_temp_after_engine_max) {
    violations.push(`[HI] T-Coolant ${coolantTemp.toFixed(1)}°C > ${MTU8000_LIMITS.cooling.coolant_temp_after_engine_max}°C`);
  }

  const exhaustMean = getField(snap, 'exhaustMeanTemp', snap.exhaustTemp);
  if (exhaustMean > MTU8000_LIMITS.exhaust.mean_hi) {
    violations.push(`[HI] T-Exhaust Mean ${exhaustMean.toFixed(1)}°C > ${MTU8000_LIMITS.exhaust.mean_hi}°C`);
  }

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
