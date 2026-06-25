import type { EngineSnapshot, BaselineSnapshot } from '@marine-pdm/shared';
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
  const expectedFuelRack = store.getExpected('ME.FuelRack', ctx) ?? snap.fuelRack;
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

  return {
    expectedExhaust,
    expectedLube,
    expectedCyls,
    expectedJacket,
    expectedFuelRack,
    expectedScavenge,
    expectedTcRPM,
    expectedSfoc,
    expectedChargeAirTemp,
    expectedFuelOilPressure,
    expectedFuelOilTemp,
    expectedLoFilterDP,
    expectedPistonCoolingPress,
    expectedShaftPower,
  };
}
