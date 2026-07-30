// Single source of truth for "everything about a UI sensor id".
//
// This table was previously SENSOR_META inside pages/Dashboard.tsx, covering only display concerns
// (unit / decimals / which snapshot + history key to read). It moved here and grew two fields because
// three separate subsystems now need to resolve the same sensor id:
//
//   • the gauges + popups          → unit, decimals, snapKey, baselineKey, histKey, baseKey
//   • the AI diagnosis payload     → forecastKey (coded alarm band) + matrixSensorIds (∂ weights)
//   • the training recorder        → forecastKey, for the observable minsToAlarm_* columns
//
// `matrixSensorIds` is the join onto DEGRADATION_MODES[].effects[].sensorId, which is what makes a
// reverse lookup possible: given a deviating sensor, which faults F01–F09 can physically move it, and
// with what ∂sensor/∂rootFactor weight. Those ids follow the MTU8000Snapshot naming (physics-side),
// NOT the 'ME.*' tag naming (UI-side) — hence the mapping. See simulator/degradation-matrix.ts.

import type { EngineSnapshot, BaselineSnapshot } from '@marine-pdm/shared';
import type { SensorHistory } from '../context/EngineContext';

type SnapKey = keyof EngineSnapshot;
type BaseKey = keyof BaselineSnapshot;

export interface SensorMeta {
  unit: string;
  decimals: number;
  histKey: keyof SensorHistory;
  baseKey: keyof SensorHistory;
  snapKey: SnapKey;
  baselineKey: BaseKey;
  /** FORECAST_LIMITS key — present only where the sensor has a coded MTU alarm band. */
  forecastKey?: string;
  /** DEGRADATION_MODES effect sensorIds this UI sensor observes. */
  matrixSensorIds: string[];
}

export const SENSOR_META: Record<string, SensorMeta> = {
  'ME.ExhaustTemp': {
    unit: '°C', decimals: 1, histKey: 'exhaustTemp', baseKey: 'baseExhaust',
    snapKey: 'exhaustTemp', baselineKey: 'expectedExhaust',
    forecastKey: 'exhaust',
    matrixSensorIds: ['exhaustMeanTemp', 'cylTemps[all]', 'cylTemps[n]', 'aSideMeanExhaust', 'bSideMeanExhaust'],
  },
  'ME.LubeOilPressure': {
    unit: 'bar', decimals: 2, histKey: 'lubeOilPressure', baseKey: 'baseLube',
    snapKey: 'lubeOilPressure', baselineKey: 'expectedLube',
    forecastKey: 'lube',
    matrixSensorIds: ['lubeOilPressure', 'lubeOilPressureAfterFilter', 'lubeLastBearingPressure'],
  },
  'ME.FuelRack': {
    unit: 'mm', decimals: 1, histKey: 'fuelRack', baseKey: 'baseFuelRack',
    snapKey: 'fuelRack', baselineKey: 'expectedFuelRack',
    matrixSensorIds: ['fuelRailPressure'],
  },
  'ME.ScavengeAirPressure': {
    unit: 'bar', decimals: 2, histKey: 'scavengeAir', baseKey: 'baseScavenge',
    snapKey: 'scavengeAir', baselineKey: 'expectedScavenge',
    matrixSensorIds: ['chargeAirPressure'],
  },
  'ME.TCSpeed': {
    unit: 'RPM', decimals: 0, histKey: 'tcRPM', baseKey: 'baseTcRPM',
    snapKey: 'tcRPM', baselineKey: 'expectedTcRPM',
    forecastKey: 'tcSpeed', matrixSensorIds: ['tcSpeeds[i]'],
  },
  'ME.JacketCoolingOutlet': {
    unit: '°C', decimals: 1, histKey: 'jacketOutlet', baseKey: 'baseJacket',
    snapKey: 'jacketOutlet', baselineKey: 'expectedJacket',
    forecastKey: 'jacket', matrixSensorIds: ['coolantTempAfterEngine'],
  },
  'ME.SFOC': {
    unit: 'g/kWh', decimals: 1, histKey: 'sfoc', baseKey: 'baseSfoc',
    snapKey: 'sfoc', baselineKey: 'expectedSfoc',
    matrixSensorIds: ['sfoc'],
  },
  'ME.ChargeAirTemp': {
    unit: '°C', decimals: 1, histKey: 'chargeAirTemp', baseKey: 'baseChargeAirTemp',
    snapKey: 'chargeAirTemp', baselineKey: 'expectedChargeAirTemp',
    forecastKey: 'chargeAirTemp', matrixSensorIds: ['chargeAirTemp'],
  },
  'ME.FuelOilPressure': {
    unit: 'bar', decimals: 2, histKey: 'fuelOilPressure', baseKey: 'baseFuelOilPressure',
    snapKey: 'fuelOilPressure', baselineKey: 'expectedFuelOilPressure',
    matrixSensorIds: ['fuelRailPressure'],
  },
  'ME.FuelOilTemp': {
    unit: '°C', decimals: 1, histKey: 'fuelOilTemp', baseKey: 'baseFuelOilTemp',
    snapKey: 'fuelOilTemp', baselineKey: 'expectedFuelOilTemp',
    matrixSensorIds: [],   // no modelled degradation effect drives fuel temp

  },
  'ME.LOFilterDP': {
    unit: 'bar', decimals: 3, histKey: 'loFilterDP', baseKey: 'baseLoFilterDP',
    snapKey: 'loFilterDP', baselineKey: 'expectedLoFilterDP',
    matrixSensorIds: ['filterDifferentialP'],
  },
  'ME.PistonCoolingPress': {
    unit: 'bar', decimals: 2, histKey: 'pistonCoolingPress', baseKey: 'basePistonCoolingPress',
    snapKey: 'pistonCoolingPress', baselineKey: 'expectedPistonCoolingPress',
    forecastKey: 'pistonCoolingPress', matrixSensorIds: ['pistonCoolingPress'],
  },
  'ME.ShaftPower': {
    unit: 'kW', decimals: 0, histKey: 'shaftPower', baseKey: 'baseShaftPower',
    snapKey: 'shaftPower', baselineKey: 'expectedShaftPower',
    matrixSensorIds: [],
  },
};

export function getSensorMeta(sensorId: string): SensorMeta | null {
  return SENSOR_META[sensorId] ?? null;
}

/** Every UI sensor that has a coded alarm band, as forecastKey → its matrix sensorIds. */
export const FORECASTABLE_SENSORS: Array<{ sensorId: string; forecastKey: string; matrixSensorIds: string[] }> =
  Object.entries(SENSOR_META)
    .filter(([, m]) => !!m.forecastKey)
    .map(([sensorId, m]) => ({ sensorId, forecastKey: m.forecastKey!, matrixSensorIds: m.matrixSensorIds }));

/** Matrix sensorIds observed by a given forecastKey — the join RUL needs. */
export function matrixIdsForForecastKey(forecastKey: string): string[] {
  return FORECASTABLE_SENSORS.find(f => f.forecastKey === forecastKey)?.matrixSensorIds ?? [];
}

/** Human label from a tag id — 'ME.ExhaustTemp' → 'Exhaust Temp'. */
export function sensorLabel(sensorId: string): string {
  return sensorId.replace('ME.', '').replace(/([A-Z])/g, ' $1').trim();
}
