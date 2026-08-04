import type { EngineSnapshot, BaselineSnapshot } from '@marine-pdm/shared';
import { bearingTempMax, MTU8000_LIMITS } from '@marine-pdm/shared';
import type { BaselineStore } from '@marine-pdm/knowledge';
import type { SensorRegistry } from '@marine-pdm/knowledge';

export interface DeviationResult {
  exhaustDev: number;
  lubeDev: number;
  cylDevs: number[];
}

export function computeDeviations(
  snap: EngineSnapshot,
  baseline: BaselineSnapshot,
  registry: SensorRegistry,
): DeviationResult {
  // Only compute deviations for ACTIVE sensors
  const exhaustActive = registry.isActive('ME.ExhaustTemp');
  const lubeActive = registry.isActive('ME.LubeOilPressure');

  const exhaustDev = exhaustActive
    ? snap.exhaustTemp - baseline.expectedExhaust
    : 0;

  const lubeDev = lubeActive
    ? snap.lubeOilPressure - baseline.expectedLube
    : 0;

  const cylDevs = snap.cylTemps.map((temp, i) => {
    const sensorId = `ME.Cyl${i + 1}.ExhaustTemp`;
    const active = registry.isActive('ME.ExhaustTemp') || registry.isActive(sensorId);
    return active ? temp - baseline.expectedCyls[i] : 0;
  });

  return { exhaustDev, lubeDev, cylDevs };
}

export function computeBaselineSnapshot(
  snap: EngineSnapshot,
  store: BaselineStore,
): BaselineSnapshot {
  const ctx = { load: snap.load, rpm: snap.rpm, coolingEff: snap.coolingEff };

  const expectedExhaust = store.getExpected('ME.ExhaustTemp', ctx) ?? snap.exhaustTemp;
  const expectedLube = store.getExpected('ME.LubeOilPressure', ctx) ?? snap.lubeOilPressure;
  const expectedJacket = store.getExpected('ME.JacketCoolingOutlet', ctx) ?? snap.jacketOutlet;
  const expectedScavenge = store.getExpected('ME.ScavengeAirPressure', ctx) ?? snap.scavengeAir;
  const expectedTcRPM = store.getExpected('ME.TCSpeed', ctx) ?? snap.tcRPM;
  const expectedSfoc = store.getExpected('ME.SFOC', ctx) ?? snap.sfoc;

  // Per-cylinder expected = mean exhaust + spread (approximated as expectedExhaust)
  const expectedCyls = snap.cylTemps.map(() => expectedExhaust);

  const expectedChargeAirTemp = store.getExpected('ME.ChargeAirTemp', ctx) ?? snap.chargeAirTemp;
  const expectedFuelOilPressure = store.getExpected('ME.FuelOilPressure', ctx) ?? snap.fuelOilPressure;
  const expectedFuelOilTemp = store.getExpected('ME.FuelOilTemp', ctx) ?? snap.fuelOilTemp;
  const expectedLoFilterDP = store.getExpected('ME.LOFilterDP', ctx) ?? snap.loFilterDP;
  const expectedPistonCoolingPress = store.getExpected('ME.PistonCoolingPress', ctx) ?? snap.pistonCoolingPress;
  const expectedShaftPower = store.getExpected('ME.ShaftPower', ctx) ?? snap.shaftPower;
  // Bearings share ONE fault-free curve across all 11 (the seed equation's oilHeat/pressureDef/
  // faultHeat terms are zero at healthy oil temp and pressure), mirroring how expectedCyls reuses
  // expectedExhaust. Falls back to the hottest live bearing so a snapshot without bearingTemps —
  // the plain EngineSnapshot used by several tests — yields deviation 0 rather than NaN.
  // The seed curve is the per-bearing mean; every consumer of expectedBearingTemp compares it against
  // the HOTTEST of the 11, so the hottest bearing's position bias belongs here. Without it the
  // expected value is a permanent 5 °C below a healthy engine's reading — a standing deviation on the
  // gauge and a standing contribution to P04's bearing score.
  const expectedBearingTemp = (store.getExpected('ME.BearingTemp.Mean', ctx) ?? bearingTempMax(snap))
    + MTU8000_LIMITS.bearingMaxPositionBias;
  // Both reach the UI through EngineSnapshot's index signature, so they need the same widen-and-fall-
  // back treatment: a snapshot without them yields deviation 0 rather than NaN.
  const liveNum = (k: string, fallback: number) =>
    typeof snap[k] === 'number' ? (snap[k] as number) : fallback;
  const expectedLubeLastBearing =
    store.getExpected('ME.LubeOilPressure.LastBearing', ctx) ?? liveNum('lubeLastBearingPressure', expectedLube);
  const expectedFuelRailPressure =
    store.getExpected('ME.FuelRailPressure', ctx) ?? liveNum('fuelRailPressure', 0);

  return {
    expectedExhaust,
    expectedLube,
    expectedCyls,
    expectedJacket,
    expectedScavenge,
    expectedTcRPM,
    expectedSfoc,
    expectedChargeAirTemp,
    expectedFuelOilPressure,
    expectedFuelOilTemp,
    expectedLoFilterDP,
    expectedPistonCoolingPress,
    expectedShaftPower,
    expectedBearingTemp,
    expectedLubeLastBearing,
    expectedFuelRailPressure,
  };
}
