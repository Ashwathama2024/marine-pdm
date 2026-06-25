import { HARD_LIMITS } from '@marine-pdm/shared';
import type { EngineSnapshot } from '@marine-pdm/shared';

/**
 * Safety override — applied LAST after all other scoring.
 * Maps to Kongsberg K-Chief alarm group 2400 L2/L3/L4 levels.
 * L2 Alarm → risk 85 | L3 Slowdown → risk 95 | L4 Shutdown → risk 100
 */
export function applySafetyOverride(risk: number, snap: EngineSnapshot): number {
  // Lube oil pressure — most safety-critical
  if (snap.lubeOilPressure < HARD_LIMITS.lubePressureShutdown) return 100;   // L4
  if (snap.lubeOilPressure < HARD_LIMITS.lubePressureSlowdown) return Math.max(risk, 95); // L3
  if (snap.lubeOilPressure < HARD_LIMITS.lubePressureMin)      return Math.max(risk, 85); // L2

  // Exhaust temperature
  if (snap.exhaustTemp > HARD_LIMITS.exhaustTempShutdown) return 100;              // L4
  if (snap.exhaustTemp > HARD_LIMITS.exhaustTempSlowdown) return Math.max(risk, 95); // L3
  if (snap.exhaustTemp > HARD_LIMITS.exhaustTempMax)      return Math.max(risk, 85); // L2

  // Jacket cooling water outlet
  if (snap.jacketOutlet > HARD_LIMITS.jacketOutletShutdown) return 100;              // L4
  if (snap.jacketOutlet > HARD_LIMITS.jacketOutletSlowdown) return Math.max(risk, 95); // L3
  if (snap.jacketOutlet > HARD_LIMITS.jacketOutletMax)      return Math.max(risk, 85); // L2

  return risk;
}

export function getCylinderOverrideRisk(cylImbalance: number): number {
  if (cylImbalance > HARD_LIMITS.cylImbalanceSlowdown) return 95;  // L3
  if (cylImbalance > HARD_LIMITS.cylImbalanceMax)      return 80;  // L2
  return 0;
}

export function getActiveHardLimitViolations(snap: EngineSnapshot): string[] {
  const v: string[] = [];

  // Lube oil
  if (snap.lubeOilPressure < HARD_LIMITS.lubePressureShutdown) {
    v.push(`[L4 SHUTDOWN] LO pressure ${snap.lubeOilPressure.toFixed(2)} bar < ${HARD_LIMITS.lubePressureShutdown} bar`);
  } else if (snap.lubeOilPressure < HARD_LIMITS.lubePressureSlowdown) {
    v.push(`[L3 SLOWDOWN] LO pressure ${snap.lubeOilPressure.toFixed(2)} bar < ${HARD_LIMITS.lubePressureSlowdown} bar`);
  } else if (snap.lubeOilPressure < HARD_LIMITS.lubePressureMin) {
    v.push(`[L2 ALARM] LO pressure ${snap.lubeOilPressure.toFixed(2)} bar < ${HARD_LIMITS.lubePressureMin} bar`);
  }

  // Exhaust temp
  if (snap.exhaustTemp > HARD_LIMITS.exhaustTempShutdown) {
    v.push(`[L4 SHUTDOWN] Exhaust ${snap.exhaustTemp.toFixed(1)}°C > ${HARD_LIMITS.exhaustTempShutdown}°C`);
  } else if (snap.exhaustTemp > HARD_LIMITS.exhaustTempSlowdown) {
    v.push(`[L3 SLOWDOWN] Exhaust ${snap.exhaustTemp.toFixed(1)}°C > ${HARD_LIMITS.exhaustTempSlowdown}°C`);
  } else if (snap.exhaustTemp > HARD_LIMITS.exhaustTempMax) {
    v.push(`[L2 ALARM] Exhaust ${snap.exhaustTemp.toFixed(1)}°C > ${HARD_LIMITS.exhaustTempMax}°C`);
  }

  // Jacket outlet
  if (snap.jacketOutlet > HARD_LIMITS.jacketOutletShutdown) {
    v.push(`[L4 SHUTDOWN] Jacket outlet ${snap.jacketOutlet.toFixed(1)}°C > ${HARD_LIMITS.jacketOutletShutdown}°C`);
  } else if (snap.jacketOutlet > HARD_LIMITS.jacketOutletSlowdown) {
    v.push(`[L3 SLOWDOWN] Jacket outlet ${snap.jacketOutlet.toFixed(1)}°C > ${HARD_LIMITS.jacketOutletSlowdown}°C`);
  } else if (snap.jacketOutlet > HARD_LIMITS.jacketOutletMax) {
    v.push(`[L2 ALARM] Jacket outlet ${snap.jacketOutlet.toFixed(1)}°C > ${HARD_LIMITS.jacketOutletMax}°C`);
  }

  return v;
}
