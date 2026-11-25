// packages/simulator/src/physics.ts
// State management and lag computation for the MTU 8000 M71/M71L simulator.
// Target equations are provided by mtu8000-physics.ts (upgraded from generic v1.0).

import { CYLINDER_COUNT, addNoise, applyLag } from '@marine-pdm/shared';
import {
  exhaustTemp_MTU8000,
  cylExhaustTemp_MTU8000,
  lubeOilPressure_MTU8000,
  bearingTemp_MTU8000,
  chargeAirPressure_MTU8000,
  chargeAirTemp_MTU8000,
  lubeOilTemp_MTU8000,
  fuelRailPressure_MTU8000,
  sfoc_MTU8000,
  crankcasePressure_MTU8000,
  exhaustBackPressure_MTU8000,
  tcSpeed_MTU8000,
  coolantPressure_MTU8000,
  fuelTemp_MTU8000,
  sprayOilTemp_MTU8000,
  LAST_BEARING_PRESSURE_RATIO,
  PISTON_COOLING_PRESSURE_RATIO,
} from './mtu8000-physics';

const BEARING_COUNT = 11;
const THROW_COUNT = 10;  // 20V: two con-rods share one throw, so 10 throws under 11 bearings
const TC_COUNT = 4;  // A1, A2, B1, B2

// Lag alphas — per-sensor thermal/hydraulic response speed
// Calibrated to match MTU 8000 idle data: RPM 0.15, exhaust 0.04, LO press 0.06,
// coolant 0.02, LO temp 0.025, bearings 0.02, fuel rail 0.12, charge air 0.08
const LAG = {
  exhaust:         0.08,    // loaded exhaust — engine.ts overrides with 0.04 for idle no-load path
  lube:            0.06,    // was 0.05
  sfoc:            0.03,
  cyls:            0.08,
  chargeAirTemp:   0.06,
  chargeAirPress:  0.08,    // was 0.10
  bearingTemps:    0.02,    // was 0.03 — large thermal mass
  // Spray oil responds FASTER than the bearing metal it comes off: it is a thin film in transit,
  // not a heat-soaked casting. That lead is the point of the sensor — it is why MTU watches it.
  sprayOilTemps:   0.05,
  crankcasePressure: 0.15,
  tcSpeeds:        0.08,
  lubeOilTemp:     0.025,   // was 0.04
  coolantTemp:     0.02,    // was 0.05 — very slow jacket water rise at idle
  coolantPressure: 0.08,
  fuelRailPressure: 0.12,   // was 0.20
  fuelTemp:        0.04,
  exhaustBackP:    0.10,
  lubeLastBearing: 0.05,
};

// Noise amplitudes per sensor
const NOISE = {
  exhaust: 1.5,
  lube: 0.05,
  sfoc: 0.8,
  cyls: 1.5,
  chargeAirTemp: 0.4,
  chargeAirPress: 0.025,
  bearingTemp: 0.3,
  sprayOilTemp: 0.25,
  crankcasePressure: 0.2,
  tcSpeed: 100,
  lubeOilTemp: 0.5,
  coolantTemp: 0.3,
  coolantPressure: 0.02,
  fuelRailPressure: 5,
  fuelTemp: 0.2,
  exhaustBackP: 1,
  lubeLastBearing: 0.03,
};

// ── PHYSICS STATE ──────────────────────────────────────────────────────────────
export interface PhysicsState {
  // Control inputs
  rpm: number;
  load: number;

  // Fault parameters (set by faults engine each tick)
  coolingEff: number;       // 1.0 = clean, 0.75 = degraded
  lubeFault: number;        // 0–1 pump/filter degradation
  pistonBlowby: number;     // 0–1 blow-by severity
  injFaults: Record<number, number>;  // cylinder index → severity 0–1

  // TC efficiency per turbocharger (A1=0, A2=1, B1=2, B2=3)
  tcEffs: number[];  // [4] — each 0–1

  // Bearing fault (bearing index → severity 0–1)
  bearingFaults: Record<number, number>;

  // Lagged sensor values — core
  lagExhaust: number;
  lagLube: number;        // before-filter lube pressure
  lagSfoc: number;
  lagCyls: number[];      // [CYLINDER_COUNT]

  // Lagged — charge air
  lagChargeAirTemp: number;
  lagChargeAirPress: number;

  // Lagged — bearings (U3)
  lagBearingTemps: number[];
  lagSprayOilTemps: number[];   // [10] — B77.11–B77.20, one per crank throw  // [11]

  // Lagged — crankcase (U3)
  lagCrankcasePressure: number;

  // Lagged — turbocharger speeds (U3)
  lagTcSpeeds: number[];  // [4]

  // Lagged — lube oil sub-pressures (U3)
  lagLubeOilTemp: number;
  lagLubeAfterFilter: number;
  lagLubeLastBearing: number;
  lagPistonCoolingPress: number;

  // Lagged — cooling (U3)
  lagCoolantTemp: number;
  lagCoolantPressure: number;

  // Lagged — fuel (U3)
  lagFuelRailPressure: number;
  lagFuelTemp: number;

  // Lagged — exhaust back pressure (U3)
  lagExhaustBackP: number;
}

// ── INITIAL STATE ──────────────────────────────────────────────────────────────
// All lagged values are initialised at their RATED STEADY-STATE targets so the
// simulator starts in a settled condition and the dashboard shows NORMAL on first tick.
export function makeInitialPhysicsState(rpm = 1000, load = 85): PhysicsState {
  const coolingEff = 1.0;
  const lubeFault  = 0;
  const tcEffs     = [1.0, 1.0, 1.0, 1.0];
  const injFaults  = {};

  // Lube oil temperature at rated steady state (78.3°C at 85%/1150 — inside T-Oil Lim1 83)
  const lubeOilT = lubeOilTemp_MTU8000(load, rpm);

  // Lube pressures: use hot-oil values (includes viscosity penalty + normal filter ΔP)
  // so there's no large deviation on tick 1.
  const lubePre   = lubeOilPressure_MTU8000(rpm, load, lubeOilT, 0.15);  // ~7.16 bar at rated
  const lubePost  = Math.max(0.5, lubePre - 0.15);                        // after-filter ≈ lubePost
  const lubeLastB = lubePre * LAST_BEARING_PRESSURE_RATIO;                // ~6.59 bar at rated

  // Piston cooling at steady state — the lower of the two gallery takeoffs.
  const pistonCool = Math.max(0.5, lubePre * PISTON_COOLING_PRESSURE_RATIO);  // ~6.09 bar at rated

  // HT coolant (jacket water) at rated steady state — NOT the LT circuit temperature
  const coolantT = 30 + (load / 100) * 55;  // 76.75°C at 85% load
  const coolantP = coolantPressure_MTU8000(rpm);

  // Charge air cooler uses the LT circuit (constant ~36°C intercooler water)
  const LT_COOLANT = 36;
  const caPress = chargeAirPressure_MTU8000(rpm, load);
  const caTemp  = chargeAirTemp_MTU8000(load, rpm, LT_COOLANT);

  const baseExh  = exhaustTemp_MTU8000(load, rpm, coolingEff);
  const fuelRail = fuelRailPressure_MTU8000(load, rpm);
  const fuelT    = fuelTemp_MTU8000(load);
  const crankcase = crankcasePressure_MTU8000(load);
  const exhBackP  = exhaustBackPressure_MTU8000(load, rpm);
  const tcSpd     = tcSpeed_MTU8000(rpm, load);

  const bearingTemps = Array.from({ length: BEARING_COUNT }, (_, i) =>
    bearingTemp_MTU8000(load, rpm, lubeOilT, lubePre, i),
  );

  return {
    rpm, load,
    coolingEff, lubeFault, pistonBlowby: 0,
    injFaults, tcEffs,
    bearingFaults: {},

    lagExhaust: baseExh,
    lagLube: lubePre,
    lagSfoc: sfoc_MTU8000(load, rpm, injFaults, coolingEff),
    lagCyls: Array.from({ length: CYLINDER_COUNT }, (_, i) =>
      cylExhaustTemp_MTU8000(baseExh, i, injFaults),
    ),

    lagChargeAirTemp: caTemp,
    lagChargeAirPress: caPress,

    lagBearingTemps: bearingTemps,
    lagSprayOilTemps: Array.from({ length: THROW_COUNT }, (_, i) =>
      sprayOilTemp_MTU8000(load, rpm, lubeOilT, i),
    ),
    lagCrankcasePressure: crankcase,
    lagTcSpeeds: Array(TC_COUNT).fill(tcSpd),

    lagLubeOilTemp: lubeOilT,
    lagLubeAfterFilter: lubePost,
    lagLubeLastBearing: lubeLastB,
    lagPistonCoolingPress: pistonCool,

    lagCoolantTemp: coolantT,
    lagCoolantPressure: coolantP,

    lagFuelRailPressure: fuelRail,
    lagFuelTemp: fuelT,

    lagExhaustBackP: exhBackP,
  };
}

// ── TICK: ADVANCE LAGGED STATE BY ONE TICK ─────────────────────────────────────
export function tickPhysics(state: PhysicsState): PhysicsState {
  const { rpm, load, coolingEff, lubeFault, injFaults, tcEffs, pistonBlowby, bearingFaults } = state;

  // Mean TC efficiency (affects charge air and exhaust)
  const tcEffMean = tcEffs.reduce((s, v) => s + v, 0) / TC_COUNT;

  // ── Core sensors ──
  const targetExhaust = exhaustTemp_MTU8000(load, rpm, coolingEff, tcEffMean);
  const newLagExhaust = applyLag(state.lagExhaust, targetExhaust, LAG.exhaust);

  const filterDp = Math.max(0, state.lagLube - state.lagLubeAfterFilter);
  const targetLube = lubeOilPressure_MTU8000(rpm, load, state.lagLubeOilTemp, filterDp, lubeFault);
  const newLagLube = applyLag(state.lagLube, targetLube, LAG.lube);

  // Cylinder temps
  const injFaultCount = Object.keys(injFaults).length;
  const newLagCyls = state.lagCyls.map((prev, i) => {
    const target = cylExhaustTemp_MTU8000(newLagExhaust, i, injFaults);
    return applyLag(prev, target, LAG.cyls);
  });

  const targetSfoc = sfoc_MTU8000(load, rpm, injFaults, coolingEff, tcEffMean, pistonBlowby);
  const newLagSfoc = applyLag(state.lagSfoc, targetSfoc, LAG.sfoc);

  // ── Charge air ──
  const targetCaPress = chargeAirPressure_MTU8000(rpm, load, tcEffMean);
  const newLagCaPress = applyLag(state.lagChargeAirPress, targetCaPress, LAG.chargeAirPress);

  // Charge air cooler uses the LT (low-temperature) circuit — NOT the HT jacket water.
  // LT coolant is sea-water cooled and stays roughly constant at ~36°C regardless of engine load.
  // Passing lagCoolantTemp (HT jacket ~77°C) here was incorrect and produced ~99°C charge air.
  const LT_COOLANT = 36; // °C — LT circuit intercooler water inlet (constant)
  const targetCaTemp = chargeAirTemp_MTU8000(load, rpm, LT_COOLANT);
  const newLagCaTemp = applyLag(state.lagChargeAirTemp, targetCaTemp, LAG.chargeAirTemp);

  // ── Lube oil sub-system ──
  const targetLubeOilTemp = lubeOilTemp_MTU8000(load, rpm, state.lagCoolantTemp, coolingEff);
  const newLagLubeOilTemp = applyLag(state.lagLubeOilTemp, targetLubeOilTemp, LAG.lubeOilTemp);

  // After-filter: main pressure minus the filter ΔP (0.15 bar nominal, rises with fault).
  // Tracks the main gallery directly (same hydraulic circuit, no independent inertia) so the
  // filter ΔP stays at its true value through pressure ramps instead of inflating transiently.
  const filterDpTarget = 0.15 + lubeFault * 0.5;
  const newLagLubeAfter = Math.max(0.5, newLagLube - filterDpTarget);

  // Last bearing (B5.3/B5.4): the far end of the same gallery, so it loses only the flow-dependent
  // drop along it. ZNG00028788 warns HERE at a higher pressure than at piston cooling (curve 3 =
  // 5.8 bar vs curve 1 = 5.2 at 1150 RPM), which is what fixes the order of these two ratios.
  const targetLubeLastB = lubeOilPressure_MTU8000(rpm, load, newLagLubeOilTemp, filterDpTarget, lubeFault)
                          * LAST_BEARING_PRESSURE_RATIO;
  const newLagLubeLastB = applyLag(state.lagLubeLastBearing, targetLubeLastB, LAG.lubeLastBearing);

  // Piston cooling (B5.2): fed through metering restrictors, so below both the gallery and the last
  // bearing. The extra lubeFault term is the restrictor loss growing as the circuit degrades.
  const targetPistonCool = Math.max(0.5, newLagLube * PISTON_COOLING_PRESSURE_RATIO - lubeFault * 0.5);
  const newLagPistonCool = applyLag(state.lagPistonCoolingPress, targetPistonCool, LAG.lube);

  // ── Bearing temperatures (11 bearings) ──
  const newLagBearingTemps = state.lagBearingTemps.map((prev, i) => {
    const bearingFault = bearingFaults[i] ?? 0;
    const target = bearingTemp_MTU8000(load, rpm, newLagLubeOilTemp, newLagLube, i, bearingFault);
    return applyLag(prev, target, LAG.bearingTemps);
  });

  // ── Spray-oil temperatures (10 crank throws) ──
  // Throw t runs between main bearings t and t+1, so a bearing running hot warms the oil coming off
  // BOTH throws either side of it. That coupling is the whole reason these sensors exist: F04 shows
  // up here, on two adjacent channels, before the bearing casting itself has heated through.
  // Blow-by is common to every throw, so it lifts all ten equally and cancels out of the difference
  // — correctly, since blow-by is not a bearing fault and must not be reported as one.
  const newLagSprayOilTemps = state.lagSprayOilTemps.map((prev, t) => {
    const throwFault = Math.max(bearingFaults[t] ?? 0, bearingFaults[t + 1] ?? 0);
    const target = sprayOilTemp_MTU8000(load, rpm, newLagLubeOilTemp, t, throwFault);
    return applyLag(prev, target + pistonBlowby * 4, LAG.sprayOilTemps);
  });

  // ── Crankcase pressure ──
  const targetCrankcase = crankcasePressure_MTU8000(load, pistonBlowby);
  const newLagCrankcase = applyLag(state.lagCrankcasePressure, targetCrankcase, LAG.crankcasePressure);

  // ── TC speeds (4 turbochargers: A1=0, A2=1, B1=2, B2=3) ──
  // Physics calibrated: 7 000 RPM idle, 28 000 RPM at rated 85%/1150 RPM.
  const newLagTcSpeeds = state.lagTcSpeeds.map((prev, i) => {
    const target = tcSpeed_MTU8000(rpm, load, tcEffs[i] ?? 1.0);
    return applyLag(prev, target, LAG.tcSpeeds);
  });

  // ── Cooling ──
  // Coolant temp after engine: floor at 50°C (idle heat input keeps jacket warm even at no load)
  const targetCoolantTemp = Math.max(50, 30 + (load / 100) * 55 + (1 - coolingEff) * 15);
  const newLagCoolantTemp = applyLag(state.lagCoolantTemp, targetCoolantTemp, LAG.coolantTemp);

  const targetCoolantP = coolantPressure_MTU8000(rpm);
  const newLagCoolantP = applyLag(state.lagCoolantPressure, targetCoolantP, LAG.coolantPressure);

  // ── Fuel system ──
  const targetFuelRail = fuelRailPressure_MTU8000(load, rpm, injFaultCount);
  const newLagFuelRail = applyLag(state.lagFuelRailPressure, targetFuelRail, LAG.fuelRailPressure);

  const targetFuelTemp = fuelTemp_MTU8000(load);
  const newLagFuelTemp = applyLag(state.lagFuelTemp, targetFuelTemp, LAG.fuelTemp);

  // ── Exhaust back pressure ──
  const targetExhBackP = exhaustBackPressure_MTU8000(load, rpm, tcEffMean);
  const newLagExhBackP = applyLag(state.lagExhaustBackP, targetExhBackP, LAG.exhaustBackP);

  return {
    ...state,
    lagExhaust: newLagExhaust,
    lagLube: newLagLube,
    lagSfoc: newLagSfoc,
    lagCyls: newLagCyls,
    lagChargeAirTemp: newLagCaTemp,
    lagChargeAirPress: newLagCaPress,
    lagBearingTemps: newLagBearingTemps,
    lagSprayOilTemps: newLagSprayOilTemps,
    lagCrankcasePressure: newLagCrankcase,
    lagTcSpeeds: newLagTcSpeeds,
    lagLubeOilTemp: newLagLubeOilTemp,
    lagLubeAfterFilter: newLagLubeAfter,
    lagLubeLastBearing: newLagLubeLastB,
    lagPistonCoolingPress: newLagPistonCool,
    lagCoolantTemp: newLagCoolantTemp,
    lagCoolantPressure: newLagCoolantP,
    lagFuelRailPressure: newLagFuelRail,
    lagFuelTemp: newLagFuelTemp,
    lagExhaustBackP: newLagExhBackP,
  };
}

// ── SNAPSHOT: APPLY NOISE AND RETURN ALL SENSOR VALUES ────────────────────────
export interface PhysicsSnapshot {
  // Core (legacy EngineSnapshot-compatible names preserved)
  exhaustTemp: number;
  lubeOilPressure: number;
  sfoc: number;
  cylTemps: number[];
  coolingEff: number;
  chargeAirTemp: number;
  // New MTU 8000 fields
  chargeAirPressure: number;
  bearingTemps: number[];
  sprayOilTemps: number[];
  crankcasePressure: number;
  tcSpeeds: number[];
  lubeOilTemp: number;
  lubeOilPressureAfterFilter: number;
  lubeLastBearingPressure: number;
  pistonCoolingPress: number;
  coolantTempAfterEngine: number;
  coolantPressure: number;
  fuelRailPressure: number;
  fuelTemp: number;
  exhaustBackPressure: number;
  // Derived
  aSideMeanExhaust: number;
  bSideMeanExhaust: number;
  cylImbalance: number;
  filterDifferentialP: number;
}

export function snapshotFromState(state: PhysicsState): PhysicsSnapshot {
  const cylTemps = state.lagCyls.map(v => addNoise(v, NOISE.cyls));

  // A-side = indices 0–9, B-side = indices 10–19
  const aSideMean = cylTemps.slice(0, 10).reduce((s, v) => s + v, 0) / 10;
  const bSideMean = cylTemps.slice(10, 20).reduce((s, v) => s + v, 0) / 10;
  const cylImbalance = Math.max(...cylTemps) - Math.min(...cylTemps);

  const lubeBeforeFilter = addNoise(state.lagLube, NOISE.lube);
  const lubeAfterFilter  = addNoise(state.lagLubeAfterFilter, NOISE.lube);

  return {
    exhaustTemp: addNoise(state.lagExhaust, NOISE.exhaust),
    lubeOilPressure: lubeBeforeFilter,
    sfoc: addNoise(state.lagSfoc, NOISE.sfoc),
    cylTemps,
    coolingEff: state.coolingEff,
    chargeAirTemp: addNoise(state.lagChargeAirTemp, NOISE.chargeAirTemp),
    chargeAirPressure: addNoise(state.lagChargeAirPress, NOISE.chargeAirPress),
    bearingTemps: state.lagBearingTemps.map(v => addNoise(v, NOISE.bearingTemp)),
    // Noise must stay well under the 4 °C difference warning or the alarm chatters at healthy.
    sprayOilTemps: state.lagSprayOilTemps.map(v => addNoise(v, NOISE.sprayOilTemp)),
    crankcasePressure: addNoise(state.lagCrankcasePressure, NOISE.crankcasePressure),
    tcSpeeds: state.lagTcSpeeds.map(v => addNoise(v, NOISE.tcSpeed)),
    lubeOilTemp: addNoise(state.lagLubeOilTemp, NOISE.lubeOilTemp),
    lubeOilPressureAfterFilter: lubeAfterFilter,
    lubeLastBearingPressure: addNoise(state.lagLubeLastBearing, NOISE.lubeLastBearing),
    pistonCoolingPress: addNoise(state.lagPistonCoolingPress, NOISE.lube),
    coolantTempAfterEngine: addNoise(state.lagCoolantTemp, NOISE.coolantTemp),
    coolantPressure: addNoise(state.lagCoolantPressure, NOISE.coolantPressure),
    fuelRailPressure: addNoise(state.lagFuelRailPressure, NOISE.fuelRailPressure),
    fuelTemp: addNoise(state.lagFuelTemp, NOISE.fuelTemp),
    exhaustBackPressure: addNoise(state.lagExhaustBackP, NOISE.exhaustBackP),
    aSideMeanExhaust: aSideMean,
    bSideMeanExhaust: bSideMean,
    cylImbalance,
    filterDifferentialP: Math.max(0, lubeBeforeFilter - lubeAfterFilter),
  };
}
