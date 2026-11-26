// packages/simulator/src/mtu8000-start-physics.ts
// Phase-specific physics for MTU 8000 pre-operational and warm-up states.
// Pre-op phases (ENGINE_OFF → CRANKING) bypass the lag system and compute
// sensor values directly. Op-phase helpers return RPM/load setpoints that
// feed the existing tickPhysics() lag system.

import { MTU8000, addNoise } from '@marine-pdm/shared';
import type { EngineSnapshot } from '@marine-pdm/shared';
import {
  LAST_BEARING_PRESSURE_RATIO,
  PISTON_COOLING_PRESSURE_RATIO,
} from './mtu8000-physics';

const AMBIENT = 25;   // °C ambient
const TC_COUNT = 4;
const CYL_COUNT = 20;
const BEARING_COUNT = 11;

// Running state for pre-operational phases (ENGINE_OFF → CRANKING).
// Updated each tick by advanceStartState(); read by startStateToSnapshot().
export interface StartPhysicsState {
  rpm: number;
  lubePress: number;         // bar
  coolantTemp: number;       // °C
  exhaustMean: number;       // °C
  cylTemps: number[];        // [20] °C
  bearingTemps: number[];    // [11] °C
  tcSpeeds: number[];        // [4] RPM
  fuelRailPress: number;     // bar
}

export function makeInitialStartState(): StartPhysicsState {
  return {
    rpm: 0,
    lubePress: 0,
    coolantTemp: AMBIENT,
    exhaustMean: AMBIENT,
    cylTemps: Array(CYL_COUNT).fill(AMBIENT),
    bearingTemps: Array(BEARING_COUNT).fill(AMBIENT),
    tcSpeeds: Array(TC_COUNT).fill(0),
    fuelRailPress: 0,
  };
}

// Advance start state by one engine tick.
// phase: current EngineState for ENGINE_OFF..CRANKING
// coolantTempIL6: preheater-driven coolant temp from InterlockSystem
// primingActive: whether priming pump is running
export function advanceStartState(
  prev: StartPhysicsState,
  phase: string,
  elapsedS: number,
  coolantTempIL6: number,
  primingActive: boolean,
): StartPhysicsState {
  const s: StartPhysicsState = {
    ...prev,
    cylTemps:    [...prev.cylTemps],
    bearingTemps:[...prev.bearingTemps],
    tcSpeeds:    [...prev.tcSpeeds],
  };

  switch (phase) {
    case 'ENGINE_OFF': {
      // Everything static at ambient — no movement, no heat source
      s.rpm          = 0;
      s.lubePress    = 0;
      s.fuelRailPress = 0;
      s.exhaustMean  = AMBIENT;
      s.coolantTemp  = AMBIENT;
      for (let i = 0; i < CYL_COUNT; i++)    s.cylTemps[i]    = AMBIENT;
      for (let i = 0; i < BEARING_COUNT; i++) s.bearingTemps[i] = AMBIENT;
      for (let i = 0; i < TC_COUNT; i++)      s.tcSpeeds[i]    = 0;
      break;
    }

    case 'STANDBY': {
      s.rpm = 0;
      s.fuelRailPress = 0;
      s.exhaustMean = AMBIENT;

      // Priming pump builds lube from 0 → 1.0 bar (tau ≈ 30 s)
      const lubeTarget = primingActive ? 1.0 : 0;
      s.lubePress += (1 / 30) * (lubeTarget - s.lubePress) * elapsedS;

      // Preheater drives coolant to IL-6 setpoint; bearing temps follow slowly
      s.coolantTemp += (1 / 240) * (coolantTempIL6 - s.coolantTemp) * elapsedS;
      const bearingTarget = s.coolantTemp + 3;
      for (let i = 0; i < BEARING_COUNT; i++) {
        s.bearingTemps[i] += (1 / 300) * (bearingTarget - s.bearingTemps[i]) * elapsedS;
      }

      for (let i = 0; i < CYL_COUNT; i++) s.cylTemps[i] = AMBIENT;
      for (let i = 0; i < TC_COUNT; i++)  s.tcSpeeds[i] = 0;
      break;
    }

    case 'SAFETY_TURNING': {
      // Barring gear turns engine at 20–40 RPM, no fuel, no combustion
      const rpmTarget = 30;
      s.rpm += (1 / 8) * (rpmTarget - s.rpm) * elapsedS;

      // Engine-driven lube pump starts building
      const lubeTarget = 1.5 + (s.rpm / 30) * 0.5;
      s.lubePress += (1 / 20) * (lubeTarget - s.lubePress) * elapsedS;

      s.fuelRailPress = 0;
      s.exhaustMean = AMBIENT;
      s.coolantTemp = prev.coolantTemp;   // no heat source, no change

      for (let i = 0; i < CYL_COUNT; i++) s.cylTemps[i] = AMBIENT;
      for (let i = 0; i < TC_COUNT; i++)  s.tcSpeeds[i] = 0;
      break;
    }

    case 'CRANKING': {
      // Start air motor drives RPM 0 → ~280 RPM (fires self at ~120, reaches governed idle at 280)
      const rpmTarget = 280;
      s.rpm += (1 / 15) * (rpmTarget - s.rpm) * elapsedS;

      // Fuel injection starts above 60 RPM; fuel rail builds toward 1200 bar
      if (s.rpm > 60) {
        const railTarget = 800 + (s.rpm / 280) * 400;
        s.fuelRailPress += (1 / 8) * (railTarget - s.fuelRailPress) * elapsedS;
      }

      // Lube builds with engine speed (pump curve)
      const lubeTarget = 1.5 + (s.rpm / 280) * 3.0;
      s.lubePress += (1 / 10) * (lubeTarget - s.lubePress) * elapsedS;

      // TCs begin to spin when fuel starts (tau ≈ 20 s)
      const tcTarget = s.rpm > 60 ? 3000 + (s.rpm / 280) * 5000 : 0;
      for (let i = 0; i < TC_COUNT; i++) {
        s.tcSpeeds[i] += (1 / 20) * (tcTarget - s.tcSpeeds[i]) * elapsedS;
      }

      // Exhaust rises with combustion (150 °C by full crank)
      const exhaustTarget = s.fuelRailPress > 400 ? 150 : AMBIENT;
      s.exhaustMean += (1 / 20) * (exhaustTarget - s.exhaustMean) * elapsedS;
      for (let i = 0; i < CYL_COUNT; i++) {
        const cylTarget = exhaustTarget + (Math.random() - 0.5) * 8;
        s.cylTemps[i] += (1 / 20) * (cylTarget - s.cylTemps[i]) * elapsedS;
      }

      // Coolant barely moves in the few seconds of cranking
      s.coolantTemp += 0.005 * elapsedS;
      break;
    }
  }

  return s;
}

// Build a full EngineSnapshot from the pre-op start state for dashboard display.
export function startStateToSnapshot(s: StartPhysicsState, timestamp: number): EngineSnapshot {
  const rpm     = addNoise(s.rpm, s.rpm > 0 ? 1.5 : 0);
  const lube    = Math.max(0, addNoise(s.lubePress, 0.02));
  const coolant = addNoise(s.coolantTemp, 0.2);
  const exhaust = addNoise(s.exhaustMean, s.exhaustMean > AMBIENT ? 1.5 : 0.2);
  const cylTemps = s.cylTemps.map(v => addNoise(v, 0.3));

  const aSide = cylTemps.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const bSide = cylTemps.slice(10).reduce((a, b) => a + b, 0) / 10;

  const rail = Math.max(0, addNoise(s.fuelRailPress, s.fuelRailPress > 0 ? 5 : 0));

  return {
    timestamp,
    rpm, load: 0, rpmPrimary: rpm, rpmRedundant: addNoise(rpm, 1.5),
    exhaustTemp: exhaust,
    exhaustMeanTemp: exhaust,
    exhaustBackPressure: 0,
    lubeOilPressure: lube,
    lubeOilPressureBeforeFilter: lube,
    lubeOilPressureAfterFilter: Math.max(0, lube - 0.1),
    lubeOilPressurePistonCooling: lube * PISTON_COOLING_PRESSURE_RATIO,
    lubeLastBearingPressure: lube * LAST_BEARING_PRESSURE_RATIO,
    lubeOilTemp: addNoise(s.coolantTemp + 2, 0.4),
    fuelRack: 0,
    scavengeAir: 1.013,
    chargeAirPressure: 1.013,
    chargeAirTemp: addNoise(AMBIENT, 0.3),
    tcRPM: addNoise(s.tcSpeeds[0] ?? 0, s.tcSpeeds[0] > 0 ? 80 : 0),
    tcSpeeds: s.tcSpeeds.map(v => addNoise(v, v > 0 ? 80 : 0)),
    jacketOutlet: coolant,
    coolantTempAfterEngine: coolant,
    coolantPressure: addNoise(s.rpm > 0 ? 0.4 : 0, 0.01),
    sfoc: 0,
    cylTemps,
    coolingEff: 1.0,
    bearingTemps: s.bearingTemps.map(v => addNoise(v, 0.3)),
    // Spray oil sits at the standing oil temperature before the engine fires — nothing is being
    // thrown off a big end yet. Emitted here rather than left undefined so the field is present at
    // every engine state, as EngineSnapshot declares: the panel and the SS T-Splash Oil check both
    // read it unconditionally, and an absent array made the panel vanish during PRE-START.
    sprayOilTemps: Array.from({ length: MTU8000.CRANK_THROWS }, () =>
      addNoise(s.coolantTemp + 2, 0.25),
    ),
    crankcasePressure: addNoise(-0.5, 0.1),
    fuelRailPressure: rail,
    fuelOilPressure: addNoise(rail > 0 ? 3.5 : 0, 0.05),
    fuelTemp: addNoise(AMBIENT, 0.3),
    fuelOilTemp: addNoise(AMBIENT, 0.3),
    loFilterDP: 0,
    filterDifferentialP: 0,
    pistonCoolingPress: lube * PISTON_COOLING_PRESSURE_RATIO,
    shaftPower: 0,
    aSideMeanExhaust: aSide,
    bSideMeanExhaust: bSide,
    cylImbalance: Math.max(...cylTemps) - Math.min(...cylTemps),
  };
}

// ── Operational phase helpers ─────────────────────────────────────────────────
// These return RPM/load setpoints for the existing tickPhysics() lag system.
// The engine sets this.state.rpm / this.state.load to the returned values.

export interface PhaseSetpoints {
  rpm: number;
  load: number;
  // When true, use exhaustTemp_noLoad() override instead of normal formula
  noLoadExhaust: boolean;
}

// No-load exhaust temp equation (different from loaded — less heat rejection at zero load)
// At 1150 RPM no-load: 280 + 55 = 335 °C  (versus loaded ~440 °C)
export function exhaustTemp_noLoad(rpm: number, coolingEff = 1.0): number {
  const base = 280;
  const rpmEffect = (rpm / 1150) * 55;
  const coolingPenalty = (1 - coolingEff) * 20;
  return base + rpmEffect + coolingPenalty;
}

// Clutch engagement RPM dip: gaussian dip centred at t=2s, magnitude 60 RPM, duration ~6s
export function clutchRpmDip(t_s: number, rpmSetpoint: number): number {
  if (t_s < 0 || t_s > 6) return rpmSetpoint;
  const dip = 60 * Math.exp(-Math.pow(t_s - 2, 2) / 2);
  return rpmSetpoint - dip;
}
