import type { EngineSnapshot, FeatureSnapshot, BaselineSnapshot } from '@marine-pdm/shared';
import { applyLag, bearingTempMax } from '@marine-pdm/shared';
import type { BaselineStore, SensorRegistry } from '@marine-pdm/knowledge';
import { computeDeviations, computeBaselineSnapshot } from './deviation';
import { RateCalculator } from './rate';
import { RollingWindow } from './window';
import { computeImbalance } from './imbalance';

// Engine is "running / combusting" above this RPM. Below it (pre-op, cranking, final coast-down)
// the load/rpm baselines are not physically meaningful, so deviations are forced to zero to avoid
// pre-op false alarms (e.g. ambient 25°C exhaust vs a 280°C no-load baseline).
const RUN_RPM = 300;

// Per-sensor baseline lag — mirrors the thermal/hydraulic inertia in physics.ts so the EXPECTED
// value tracks the sensor through load / clutch transitions (deviation ≈ 0 in transients), while a
// genuine fault — where the sensor diverges from its fault-free load/rpm baseline — still surfaces
// (the lagged baseline converges to the fault-free target, never chases the faulted sensor).
// Exhaust is special-cased to 0.04 (no-load) / 0.08 (loaded), matching the engine's exhaust lag.
const BLAG = {
  lube:               0.06,
  scavenge:           0.08,
  tcRPM:              0.08,
  jacket:             0.02,
  sfoc:               0.03,
  chargeAirTemp:      0.06,
  fuelOilPressure:    0.20,
  fuelOilTemp:        0.04,
  loFilterDP:         0.05,
  pistonCoolingPress: 0.06,
  shaftPower:         0.10,
  fuelRack:           0.08,
  // Bearings are a thermal mass heated through the oil film, so they settle on the slow side —
  // between jacket (0.02) and fuelOilTemp (0.04). Additive: no existing alpha is touched.
  bearingTemp:        0.03,
};

// Build a baseline equal to the live sensor values → all deviations read zero.
// Used while the engine is not combusting (rpm < RUN_RPM), where comparison is meaningless.
function actualAsBaseline(snap: EngineSnapshot): BaselineSnapshot {
  return {
    expectedExhaust:            snap.exhaustTemp,
    expectedLube:               snap.lubeOilPressure,
    expectedCyls:               snap.cylTemps.map(t => t),
    expectedJacket:             snap.jacketOutlet,
    expectedFuelRack:           snap.fuelRack,
    expectedScavenge:           snap.scavengeAir,
    expectedTcRPM:              snap.tcRPM,
    expectedSfoc:               snap.sfoc,
    expectedChargeAirTemp:      snap.chargeAirTemp,
    expectedFuelOilPressure:    snap.fuelOilPressure,
    expectedFuelOilTemp:        snap.fuelOilTemp,
    expectedLoFilterDP:         snap.loFilterDP,
    expectedPistonCoolingPress: snap.pistonCoolingPress,
    expectedShaftPower:         snap.shaftPower,
    expectedBearingTemp:        bearingTempMax(snap),
  };
}

export class FeatureEngine {
  private rate = new RateCalculator(15);
  private exhaustWindow = new RollingWindow(30);
  private store: BaselineStore;
  private registry: SensorRegistry;
  private lagged: BaselineSnapshot | null = null;
  private wasGated = true;  // engine starts pre-op (gated); re-seed baseline on first running tick

  constructor(store: BaselineStore, registry: SensorRegistry) {
    this.store = store;
    this.registry = registry;
  }

  /**
   * `baseline` is the LAGGED expectation — the one every deviation, risk score and alert is computed
   * against. `instantBaseline` is the same load/rpm curve evaluation with no filtering applied.
   *
   * Returning `instantBaseline` is purely additive and changes no existing behaviour; it exists so a
   * consumer can measure how far the lag is from converged. That matters because the lagged value is
   * re-seeded onto the LIVE (possibly faulted) reading by actualAsBaseline() below whenever rpm drops
   * under RUN_RPM, and it then takes tens of ticks to climb back out. Anything that treats the lagged
   * baseline as "the fault-free value" — the analytic RUL label does exactly that — is wrong for the
   * whole of that recovery, and wrong directionally. See services/baseline-settling.test.ts.
   */
  process(snap: EngineSnapshot): {
    features: FeatureSnapshot;
    baseline: BaselineSnapshot;
    instantBaseline: BaselineSnapshot;
  } {
    // 1. Instant physics baseline at the current operating point (load/rpm ratio).
    const instant = computeBaselineSnapshot(snap, this.store);

    // Seed the lagged baseline on the first tick.
    if (!this.lagged) this.lagged = actualAsBaseline(snap);

    // 2. Thermally-lag the expected values toward the instant baseline so they track the sensor's
    //    own inertia through transients. Below running RPM, suppress monitoring entirely.
    let baseline: BaselineSnapshot;
    if (snap.rpm < RUN_RPM) {
      // Not combusting — prime the lagged baseline to the ACTUAL sensor values and report zero
      // deviation. (quickStart jumps the sensors discontinuously from ambient to idle steady-state,
      // so we must not carry an ambient seed into the running phase.)
      this.lagged = actualAsBaseline(snap);
      this.wasGated = true;
      baseline = this.lagged;
    } else {
      // First running tick after the pre-op gate: re-seed expected == actual (deviation 0) so the
      // post-jump idle steady-state is the reference, then both lag toward the same fault-free target.
      if (this.wasGated) { this.lagged = actualAsBaseline(snap); this.wasGated = false; }
      const lb = this.lagged;
      const exhaustAlpha = snap.load < 2 ? 0.04 : 0.08;  // mirror engine no-load/loaded exhaust lag
      lb.expectedExhaust            = applyLag(lb.expectedExhaust,            instant.expectedExhaust,            exhaustAlpha);
      lb.expectedLube               = applyLag(lb.expectedLube,               instant.expectedLube,               BLAG.lube);
      lb.expectedJacket             = applyLag(lb.expectedJacket,             instant.expectedJacket,             BLAG.jacket);
      lb.expectedScavenge           = applyLag(lb.expectedScavenge,           instant.expectedScavenge,           BLAG.scavenge);
      lb.expectedTcRPM              = applyLag(lb.expectedTcRPM,              instant.expectedTcRPM,              BLAG.tcRPM);
      lb.expectedSfoc               = applyLag(lb.expectedSfoc,               instant.expectedSfoc,               BLAG.sfoc);
      lb.expectedChargeAirTemp      = applyLag(lb.expectedChargeAirTemp,      instant.expectedChargeAirTemp,      BLAG.chargeAirTemp);
      lb.expectedFuelOilPressure    = applyLag(lb.expectedFuelOilPressure,    instant.expectedFuelOilPressure,    BLAG.fuelOilPressure);
      lb.expectedFuelOilTemp        = applyLag(lb.expectedFuelOilTemp,        instant.expectedFuelOilTemp,        BLAG.fuelOilTemp);
      lb.expectedLoFilterDP         = applyLag(lb.expectedLoFilterDP,         instant.expectedLoFilterDP,         BLAG.loFilterDP);
      lb.expectedPistonCoolingPress = applyLag(lb.expectedPistonCoolingPress, instant.expectedPistonCoolingPress, BLAG.pistonCoolingPress);
      lb.expectedShaftPower         = applyLag(lb.expectedShaftPower,         instant.expectedShaftPower,         BLAG.shaftPower);
      lb.expectedFuelRack           = applyLag(lb.expectedFuelRack,           instant.expectedFuelRack,           BLAG.fuelRack);
      lb.expectedBearingTemp        = applyLag(lb.expectedBearingTemp,        instant.expectedBearingTemp,        BLAG.bearingTemp);
      // Per-cylinder expected mirrors the lagged mean exhaust (computeBaselineSnapshot sets all = mean).
      lb.expectedCyls = instant.expectedCyls.map(() => lb.expectedExhaust);
      baseline = lb;
    }

    // 3. Deviations against the (lagged) baseline.
    const { exhaustDev, lubeDev, cylDevs } = computeDeviations(snap, baseline, this.registry);

    // 4. Push into rate and rolling window calculators.
    this.rate.push(snap.exhaustTemp, snap.lubeOilPressure);
    this.exhaustWindow.push(snap.exhaustTemp);

    // 5. Cylinder imbalance (from actual temps, not deviations).
    const { imbalance } = computeImbalance(snap.cylTemps);

    const sfocDev     = snap.sfoc     - baseline.expectedSfoc;
    const fuelRackDev = snap.fuelRack - baseline.expectedFuelRack;

    const features: FeatureSnapshot = {
      exhaustDev,
      lubeDev,
      cylDevs,
      cylImbalance: imbalance,
      exhaustRate: this.rate.getExhaustRate(),
      lubeRate: this.rate.getLubeRate(),
      rollingAvg: this.exhaustWindow.getMean(),
      stdDev: this.exhaustWindow.getStdDev(),
      sfocDev,
      fuelRackDev,
    };

    return { features, baseline, instantBaseline: instant };
  }

  reset(): void {
    this.rate.reset();
    this.exhaustWindow.reset();
    this.lagged = null;
    this.wasGated = true;
  }
}
