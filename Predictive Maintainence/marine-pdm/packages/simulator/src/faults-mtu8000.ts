// packages/simulator/src/faults-mtu8000.ts
// 8 MTU 8000-specific fault scenarios with intensity (0-100%) and progression
// speed (SLOW/MEDIUM/FAST) controls. Replaces the 3 generic faults from v1.0.
// PDF upgrade spec §5.

import { MTU8000_LIMITS } from '@marine-pdm/shared';
import { crankcasePressure_MTU8000 } from './mtu8000-physics';
import type { PhysicsState } from './physics';

export type FaultSpeed = 'SLOW' | 'MEDIUM' | 'FAST';

export interface FaultConfig {
  id: string;         // 'F01'–'F08'
  targetCyls?: number[];  // cylinder indices affected (0–19); F01 = single, F02 = 0–9
  targetBearing?: number; // bearing index for F04 (0–10)
  targetTC?: number;      // TC index for F06 (0–3)
  intensity: number;      // 0–100 (UI slider — limits maximum effect)
  speed: FaultSpeed;
  active: boolean;
  startedAt: number;      // Date.now() timestamp
  currentSeverity: number; // 0–1 (grows over time toward intensity/100)
}

// Growth rates — severity units per second
export const FAULT_GROWTH_RATES: Record<FaultSpeed, number> = {
  SLOW:   0.0008,   // reaches max in ~20 minutes
  MEDIUM: 0.003,    // reaches max in ~5 minutes
  FAST:   0.012,    // reaches max in ~80 seconds
};

// Maximum parameter effect at intensity=100, severity=1.0
export const FAULT_MAX_EFFECTS = {
  F01_injector_temp_delta:  65,   // °C per affected cylinder
  F02_multi_injector_delta: 55,   // °C per A-side cylinder (slightly less — shared fuel)
  F03_lube_pressure_drop:   3.8,  // bar at main gallery
  F04_bearing_temp_rise:    45,   // °C at affected bearing
  F05_cooling_eff_drop:     0.25, // coolingEff: 1.0 → 0.75
  F06_tc_eff_drop:          0.40, // tcEff: 1.0 → 0.60
  F07_spray_erratic_amp:    30,   // °C peak-to-peak oscillation on top of F01
  F07_blowby_coupling:      0.3,  // fraction of severity F07 leaks into pistonBlowby (see note below)
  F08_blowby_pressure:      8,    // mbar crankcase pressure rise
  F09_multi_injector_delta: 55,   // °C per B-side cylinder (mirror of F02)
} as const;

// F07's crankcase term is DELIBERATELY sub-alarm. At coupling 0.3 its ceiling is
// `crankcasePressure(85, 0) + 0.3·8` ≈ 1.68 mbar against a 5 mbar HI limit, so it can never trip
// HI P-Crankcase at any intensity — that is the intent, not a miscalibration. The rest of the system
// reads it as a RATE tell, not an alarm: P07 matches on `crankcaseRate > 0.05` (patterns-mtu8000.ts)
// and only P08 carries `ecsAlarmCode: 'HI P-Crankcase'`. Raising this coupling until F07 trips the
// alarm would collapse the P07/P08 discrimination, which separates on exactly this axis.

// Actual effect = currentSeverity × maxEffect
// Intensity is applied exactly ONCE, as the severity cap: `tickFaultsMTU8000` grows currentSeverity
// toward intensity/100 and then uses it directly (`const s = f.currentSeverity`). Speed controls how
// fast it reaches that cap. Never multiply an effect by intensity/100 again — that squares it.

// ── FAULT DEFINITIONS (metadata for UI and decision engine) ───────────────────
export interface FaultDefinition {
  id: string;
  name: string;
  ecsAlarmCode: string;
  primarySignal: string;
  crossCorrelations: string[];
  ssTrigger: string | null;
  requiresCylSelect: boolean;
  requiresBearingSelect: boolean;
  requiresTCSelect: boolean;
}

export const FAULT_DEFINITIONS: FaultDefinition[] = [
  {
    id: 'F01',
    name: 'Injector Degradation (Single Cylinder)',
    ecsAlarmCode: 'HI T-Exhaust Cyl N',
    primarySignal: 'B4.N rises +65°C max',
    crossCorrelations: ['SFOC +4.5%', 'fuel rail slight drop', 'cyl imbalance rises'],
    ssTrigger: null,
    requiresCylSelect: true,
    requiresBearingSelect: false,
    requiresTCSelect: false,
  },
  {
    id: 'F02',
    name: 'Multi-Cylinder Injector Fault (A-Side)',
    ecsAlarmCode: 'HI T-Exhaust Mean',
    primarySignal: 'All A1–A10 cyls rise',
    crossCorrelations: ['fuel rail pressure drops', 'SFOC rises', 'charge air changes'],
    ssTrigger: 'Possible if >3 cylinders',
    requiresCylSelect: false,
    requiresBearingSelect: false,
    requiresTCSelect: false,
  },
  {
    id: 'F03',
    name: 'Lube Oil Pressure Loss',
    ecsAlarmCode: 'SS P-Oil Last Bearing',
    primarySignal: 'B5.3/B5.4 drops',
    crossCorrelations: ['ALL bearing temps rise', 'B5.1 drops', 'viscosity modelled'],
    ssTrigger: 'B5.3 < 3.2 bar',
    requiresCylSelect: false,
    requiresBearingSelect: false,
    requiresTCSelect: false,
  },
  {
    id: 'F04',
    name: 'Bearing Overtemperature',
    ecsAlarmCode: 'SS T-Bearing N',
    primarySignal: 'B57.N rises',
    crossCorrelations: ['lube pressure drops at bearing', 'lube oil temp upstream rises', 'crankcase pressure increases'],
    ssTrigger: 'B57.N > 120°C',
    requiresCylSelect: false,
    requiresBearingSelect: true,
    requiresTCSelect: false,
  },
  {
    id: 'F05',
    name: 'HT Cooler Fouling',
    ecsAlarmCode: 'HI T-Coolant',
    primarySignal: 'B6.1 rises, ALL exhaust temps rise',
    crossCorrelations: ['lube oil temp rises', 'bearing temps all rise', 'SFOC increases'],
    ssTrigger: 'B6.1 > 100°C',
    requiresCylSelect: false,
    requiresBearingSelect: false,
    requiresTCSelect: false,
  },
  {
    id: 'F06',
    name: 'Turbocharger Fouling (One TC)',
    ecsAlarmCode: 'SD TC Speed',
    primarySignal: 'B44.N speed drops',
    crossCorrelations: ['exhaust back pressure rises (B41.1)', 'that-side cyls run hotter', 'SFOC rises'],
    ssTrigger: null,
    requiresCylSelect: false,
    requiresBearingSelect: false,
    requiresTCSelect: true,
  },
  {
    id: 'F07',
    name: 'Injector Spray Pattern Failure (Erratic)',
    ecsAlarmCode: 'HI T-Exhaust Cyl N (oscillating)',
    primarySignal: 'B4.N erratic spikes, not steady rise',
    crossCorrelations: ['fuel rail shows micro-drops', 'cyl imbalance oscillates', 'crankcase pressure rises'],
    ssTrigger: 'Only if cyl temp > 530°C',
    requiresCylSelect: true,
    requiresBearingSelect: false,
    requiresTCSelect: false,
  },
  {
    id: 'F08',
    name: 'Piston Blow-by',
    ecsAlarmCode: 'HI P-Crankcase',
    primarySignal: 'B50 crankcase pressure rises',
    crossCorrelations: ['lube oil consumption increases', 'slight SFOC rise'],
    ssTrigger: null,
    requiresCylSelect: false,
    requiresBearingSelect: false,
    requiresTCSelect: false,
  },
  {
    id: 'F09',
    name: 'Multi-Cylinder Injector Fault (B-Side)',
    ecsAlarmCode: 'HI T-Exhaust Mean',
    primarySignal: 'All B1–B10 cyls rise',
    crossCorrelations: ['fuel rail pressure drops', 'SFOC rises', 'B-side A/B imbalance grows'],
    ssTrigger: 'Possible if >3 cylinders',
    requiresCylSelect: false,
    requiresBearingSelect: false,
    requiresTCSelect: false,
  },
];

// ── FAULT TICK: advance severity and apply effects to PhysicsState ─────────────
export function tickFaultsMTU8000(
  faults: FaultConfig[],
  state: PhysicsState,
  elapsedSeconds: number = 1,
): { faults: FaultConfig[]; updatedState: PhysicsState } {
  let updatedState: PhysicsState = {
    ...state,
    injFaults: { ...state.injFaults },
    tcEffs: [...state.tcEffs],
    bearingFaults: { ...state.bearingFaults },
  };

  const grown: FaultConfig[] = faults.map(f => {
    if (!f.active) return f;
    const maxSeverity = f.intensity / 100;
    const growthPerSecond = FAULT_GROWTH_RATES[f.speed];
    const newSeverity = Math.min(f.currentSeverity + growthPerSecond * elapsedSeconds, maxSeverity);
    return { ...f, currentSeverity: newSeverity };
  });

  // Reset all fault-influenced state factors then accumulate
  let coolingEffDrop = 0;
  let lubeFaultLevel = 0;
  let pistonBlowbyLevel = 0;

  for (const f of grown) {
    if (!f.active) continue;
    const s = f.currentSeverity;

    switch (f.id.split('_')[0]) {
      case 'F01': {
        // Single cylinder injector degradation
        const cyls = f.targetCyls ?? [];
        for (const ci of cyls) {
          updatedState.injFaults[ci] = Math.max(updatedState.injFaults[ci] ?? 0, s * (FAULT_MAX_EFFECTS.F01_injector_temp_delta / 65));
        }
        break;
      }
      case 'F02': {
        // All A-side cylinders (indices 0–9)
        const delta = s * (FAULT_MAX_EFFECTS.F02_multi_injector_delta / 65);
        for (let ci = 0; ci < 10; ci++) {
          updatedState.injFaults[ci] = Math.max(updatedState.injFaults[ci] ?? 0, delta);
        }
        break;
      }
      case 'F03': {
        // Lube pressure loss — affects main gallery and last bearing
        lubeFaultLevel = Math.max(lubeFaultLevel, s);   // normalised 0–1; drop applied in physics (×3.8)
        break;
      }
      case 'F04': {
        // Bearing overtemperature — targeted bearing
        const bi = f.targetBearing ?? 0;
        updatedState.bearingFaults[bi] = Math.max(updatedState.bearingFaults[bi] ?? 0, s);
        break;
      }
      case 'F05': {
        // HT Cooler fouling — degrades coolingEff (affects ALL thermal tags)
        coolingEffDrop = Math.max(coolingEffDrop, s * FAULT_MAX_EFFECTS.F05_cooling_eff_drop);
        break;
      }
      case 'F06': {
        // TC fouling — reduces TC efficiency for targeted TC
        const ti = f.targetTC ?? 0;
        updatedState.tcEffs[ti] = Math.min(updatedState.tcEffs[ti], 1.0 - s * FAULT_MAX_EFFECTS.F06_tc_eff_drop);
        break;
      }
      case 'F07': {
        // Erratic injector — same as F01 for base delta, oscillation handled at snapshot time
        const cyls = f.targetCyls ?? [];
        for (const ci of cyls) {
          updatedState.injFaults[ci] = Math.max(updatedState.injFaults[ci] ?? 0, s * 0.8);
        }
        // Crankcase pressure rises slightly with erratic spray — sub-alarm by design
        pistonBlowbyLevel = Math.max(pistonBlowbyLevel, s * FAULT_MAX_EFFECTS.F07_blowby_coupling);
        break;
      }
      case 'F08': {
        // Piston blow-by — raises crankcase pressure
        pistonBlowbyLevel = Math.max(pistonBlowbyLevel, s);
        break;
      }
      case 'F09': {
        // All B-side cylinders (indices 10–19) — mirror of F02
        const delta = s * (FAULT_MAX_EFFECTS.F09_multi_injector_delta / 65);
        for (let ci = 10; ci < 20; ci++) {
          updatedState.injFaults[ci] = Math.max(updatedState.injFaults[ci] ?? 0, delta);
        }
        break;
      }
    }
  }

  // Apply accumulated fault levels to state
  updatedState.coolingEff    = Math.max(0.75, 1.0 - coolingEffDrop);
  updatedState.lubeFault     = lubeFaultLevel;
  updatedState.pistonBlowby  = pistonBlowbyLevel;

  return { faults: grown, updatedState };
}

// ── CREATE / RESET helpers ─────────────────────────────────────────────────────
export function createFaultConfig(
  id: string,
  options: Partial<FaultConfig> = {},
): FaultConfig {
  return {
    id,
    targetCyls: undefined,
    targetBearing: undefined,
    targetTC: undefined,
    intensity: 50,
    speed: 'MEDIUM',
    active: true,
    startedAt: Date.now(),
    currentSeverity: 0,
    ...options,
  };
}

export function resetFaultSeverity(fault: FaultConfig): FaultConfig {
  return { ...fault, currentSeverity: 0, active: false };
}

// ── ECS ALARM PREVIEW: which alarms fire at current severity ──────────────────
// Rated load the preview is evaluated at (same operating point the matrix weights use).
const RATED_LOAD_PCT = 85;

// Crankcase is an ABSOLUTE-limit alarm but this preview works in RISES, so the coded limit has to be
// converted into the rise required from the healthy rated value (≈ −0.725 mbar, i.e. 5.725 mbar of
// rise — not 5). Comparing the rise straight to `pressure_hi` ignored that offset and tripped F08
// ~9 intensity points early. Derived from the physics so it can't drift.
const CRANKCASE_HI_RISE =
  MTU8000_LIMITS.crankcase.pressure_hi - crankcasePressure_MTU8000(RATED_LOAD_PCT, 0);

export interface ECSAlarmPreview {
  code: string;
  active: boolean;
  approaching: boolean;  // within 80% of threshold
}

// `severity` is the ONLY intensity-bearing input: it is already capped at intensity/100 by
// `tickFaultsMTU8000`, so it is used as-is against the same maxEffects the physics applies. Callers
// previewing the eventual (saturated) alarm state pass intensity/100 — matching
// `getParameterImpactPreview`, so both previews describe the same operating point.
export function getECSAlarmPreview(
  faultId: string,
  severity: number,        // 0–1 severity (already capped at intensity/100)
): ECSAlarmPreview[] {
  const eff = severity;
  const alarms: ECSAlarmPreview[] = [];

  switch (faultId) {
    case 'F01':
    case 'F07': {
      const delta = eff * FAULT_MAX_EFFECTS.F01_injector_temp_delta;
      alarms.push({ code: 'HI T-Exhaust Cyl N', active: delta >= 40, approaching: delta >= 30 });
      alarms.push({ code: 'HI T-Exhaust Mean', active: delta >= 20, approaching: delta >= 15 });
      // F07 deliberately carries NO crankcase alarm row: its blow-by ceiling (~1.68 mbar) sits far
      // below the 5 mbar HI limit, so listing the code here advertised an alarm that can never fire.
      // The effect is real and is surfaced in getParameterImpactPreview instead.
      break;
    }
    case 'F02': {
      const delta = eff * FAULT_MAX_EFFECTS.F02_multi_injector_delta;
      alarms.push({ code: 'HI T-Exhaust Mean', active: delta >= 20, approaching: delta >= 12 });
      alarms.push({ code: 'HI T-Exhaust A-Side', active: delta >= 30, approaching: delta >= 20 });
      break;
    }
    case 'F03': {
      const drop = eff * FAULT_MAX_EFFECTS.F03_lube_pressure_drop;
      alarms.push({ code: 'LO P-Oil (Before Filter)', active: drop >= 0.8, approaching: drop >= 0.5 });
      alarms.push({ code: 'SS P-Oil Last Bearing', active: drop >= 1.5, approaching: drop >= 1.0 });
      break;
    }
    case 'F04': {
      const rise = eff * FAULT_MAX_EFFECTS.F04_bearing_temp_rise;
      alarms.push({ code: 'HI T-Bearing N', active: rise >= 20, approaching: rise >= 12 });
      alarms.push({ code: 'SS T-Bearing N', active: rise >= 35, approaching: rise >= 25 });
      break;
    }
    case 'F05': {
      const coolDrop = eff * FAULT_MAX_EFFECTS.F05_cooling_eff_drop;
      alarms.push({ code: 'HI T-Coolant', active: coolDrop >= 0.15, approaching: coolDrop >= 0.10 });
      alarms.push({ code: 'SS T-Coolant', active: coolDrop >= 0.22, approaching: coolDrop >= 0.18 });
      alarms.push({ code: 'HI T-Charge Air', active: coolDrop >= 0.12, approaching: coolDrop >= 0.08 });
      break;
    }
    case 'F06': {
      const tcDrop = eff * FAULT_MAX_EFFECTS.F06_tc_eff_drop;
      alarms.push({ code: 'SD TC Speed', active: tcDrop >= 0.15, approaching: tcDrop >= 0.10 });
      alarms.push({ code: 'HI T-Exhaust (affected side)', active: tcDrop >= 0.25, approaching: tcDrop >= 0.15 });
      break;
    }
    case 'F08': {
      const pRise = eff * FAULT_MAX_EFFECTS.F08_blowby_pressure;
      // 0.6 preserves the pre-alarm's original proportion of the trip point (the old pair was 3/5).
      alarms.push({
        code: 'HI P-Crankcase',
        active: pRise >= CRANKCASE_HI_RISE,
        approaching: pRise >= CRANKCASE_HI_RISE * 0.6,
      });
      break;
    }
    case 'F09': {
      const delta = eff * FAULT_MAX_EFFECTS.F09_multi_injector_delta;
      alarms.push({ code: 'HI T-Exhaust Mean', active: delta >= 20, approaching: delta >= 12 });
      alarms.push({ code: 'HI T-Exhaust B-Side', active: delta >= 30, approaching: delta >= 20 });
      break;
    }
  }
  return alarms;
}

// ── PARAMETER IMPACT PREVIEW ──────────────────────────────────────────────────
// Returns human-readable delta strings for the UI table. Takes the raw slider (0–100) rather than a
// live severity by design: it previews the SATURATED effect — where the fault ends up once severity
// has grown to its intensity/100 cap — which is what the operator is choosing when they move the
// slider, not the mid-ramp value. `s = intensity / 100` IS that cap severity, so intensity is still
// applied exactly once here.
export function getParameterImpactPreview(
  faultId: string,
  intensity: number,  // 0–100 slider
): string[] {
  const s = intensity / 100;
  const items: string[] = [];

  switch (faultId) {
    case 'F01':
    case 'F07': {
      const dT = Math.round(s * FAULT_MAX_EFFECTS.F01_injector_temp_delta);
      const dSfoc = (s * 4.5).toFixed(1);
      const dRail = Math.round(s * 15);
      items.push(`B4.N ${dT > 0 ? '+' : ''}${dT} °C`);
      items.push(`SFOC +${dSfoc} g/kWh`);
      items.push(`Rail P -${dRail} bar`);
      if (faultId === 'F07') {
        items.push(`B4.N oscillation ±${Math.round(s * FAULT_MAX_EFFECTS.F07_spray_erratic_amp)} °C`);
        // Sub-alarm by design — shown here precisely because it never reaches the ECS alarm preview.
        const dCrank = s * FAULT_MAX_EFFECTS.F08_blowby_pressure * FAULT_MAX_EFFECTS.F07_blowby_coupling;
        items.push(`B50 +${dCrank.toFixed(1)} mbar (below alarm)`);
      }
      break;
    }
    case 'F02': {
      const dT = Math.round(s * FAULT_MAX_EFFECTS.F02_multi_injector_delta);
      items.push(`B4.A1–A10 avg +${dT} °C`);
      items.push(`SFOC +${(s * 8).toFixed(1)} g/kWh`);
      items.push(`Rail P -${Math.round(s * 150)} bar`);
      break;
    }
    case 'F03': {
      const dP = (s * FAULT_MAX_EFFECTS.F03_lube_pressure_drop).toFixed(1);
      const dBearing = Math.round(s * 15);
      items.push(`B5.1 -${dP} bar`);
      items.push(`B5.3/4 -${(s * 2.0).toFixed(1)} bar`);
      items.push(`B57.x avg +${dBearing} °C`);
      break;
    }
    case 'F04': {
      const dT = Math.round(s * FAULT_MAX_EFFECTS.F04_bearing_temp_rise);
      items.push(`B57.N +${dT} °C`);
      items.push(`B5.1 -${(s * 0.5).toFixed(2)} bar`);
      break;
    }
    case 'F05': {
      const dCoolant = Math.round(s * 20);
      const dExhaust = Math.round(s * 35);
      items.push(`B6.1 +${dCoolant} °C`);
      items.push(`All B4.x +${dExhaust} °C`);
      items.push(`SFOC +${(s * 18).toFixed(1)} g/kWh`);
      break;
    }
    case 'F06': {
      const dTcSpeed = Math.round(s * FAULT_MAX_EFFECTS.F06_tc_eff_drop * 28000);
      const dCaPress = (s * FAULT_MAX_EFFECTS.F06_tc_eff_drop * 2.4).toFixed(2);
      items.push(`B44.N -${dTcSpeed} RPM`);
      items.push(`B10 -${dCaPress} bar`);
      items.push(`B41.1 +${Math.round(s * 40)} mbar`);
      break;
    }
    case 'F08': {
      const dP = (s * FAULT_MAX_EFFECTS.F08_blowby_pressure).toFixed(1);
      items.push(`B50 +${dP} mbar`);
      items.push(`SFOC +${(s * 2).toFixed(1)} g/kWh`);
      break;
    }
    case 'F09': {
      const dT = Math.round(s * FAULT_MAX_EFFECTS.F09_multi_injector_delta);
      items.push(`B4.B1–B10 avg +${dT} °C`);
      items.push(`SFOC +${(s * 8).toFixed(1)} g/kWh`);
      items.push(`Rail P -${Math.round(s * 150)} bar`);
      items.push(`A/B imbalance +${Math.round(s * 30)} °C`);
      break;
    }
  }
  return items;
}
