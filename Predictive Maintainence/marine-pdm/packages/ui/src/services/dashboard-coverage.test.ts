// Guards the rule that was never enforced: a parameter the ECS can ACT on must be visible to the
// operator on the dashboard.
//
// WHY THIS EXISTS. Gauges bind to ALARM_LIMITS (the UI band system) while the safety layer runs on
// MTU8000_LIMITS (the coded ECS thresholds). Nothing connected the two, so a parameter could be fully
// modelled in physics, enforced by applyMTU8000SafetyOverride, and still have no display anywhere.
// Bearing temperature was exactly that: HI T-Bearing at 115 °C and an SS Emergency Stop at 130 °C,
// with no gauge, no trend, no RUL column — an operator watching the dashboard would have seen the
// shutdown and not the parameter that caused it.
//
// The override's trip list is PARSED from its own source rather than retyped here, so adding a new
// safety trip forces a decision in this file instead of silently landing with no display.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SENSOR_META, FORECASTABLE_SENSORS } from './sensor-map';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(here, rel), 'utf8');

const GAUGE_GRID = read('../dashboard/GaugeGrid.tsx');
const OVERRIDE_SRC = read('../../../decision/src/override-mtu8000.ts');

/** Sensor ids the dashboard actually renders an arc gauge for. */
const gaugedSensorIds = new Set(
  [...GAUGE_GRID.matchAll(/sensorId: '([^']+)'/g)].map(m => m[1]!),
);

/**
 * Displayed on the dashboard, but not by a GaugeGrid arc — so they carry no `sensorId` tag to match.
 * Explicit rather than silent: a sensor may only be here if it genuinely has another display.
 */
const DISPLAYED_OUTSIDE_GAUGE_GRID: Record<string, string> = {
  'ME.TCSpeed': 'TurbochargerPanel renders all four TC speeds individually, not as one arc',
  'ME.SprayOilDiff':
    'SprayOilPanel renders all ten B77 channels as deviations from their mean. Not an arc gauge ' +
    'because MTU codes no absolute band for spray oil — only a difference — and because the ECS ' +
    'names the offending channel ("HI T-Splash Oil B7"), which one arc could not show.',
};

describe('dashboard display coverage', () => {
  it('every forecastable sensor is displayed somewhere on the dashboard', () => {
    // A forecastKey means the sensor has a coded alarm band and a projected time-to-alarm. Computing
    // an ETA for something the operator cannot see is the exact shape of the bearing-temp bug.
    const missing = FORECASTABLE_SENSORS
      .map(s => s.sensorId)
      .filter(id => !gaugedSensorIds.has(id) && !(id in DISPLAYED_OUTSIDE_GAUGE_GRID));

    expect(missing).toEqual([]);
  });

  it('every gauge on the dashboard resolves to a SENSOR_META entry', () => {
    // Without one a gauge has no unit/baseline/history wiring for its popup, and the AI diagnosis
    // cannot name it as the sensor under investigation.
    const unbacked = [...gaugedSensorIds].filter(id => !(id in SENSOR_META));

    // ME.CrankcasePressure is the one gauge with no SENSOR_META entry. It reads the snapshot directly
    // and hardcodes its own alarm ticks, which is why it is also still an orphan in sensor-map.test.ts
    // — F08's PRIMARY effect can never be offered as a candidate fault. Recorded, not silent.
    expect(unbacked.sort()).toEqual(['ME.CrankcasePressure']);
  });
});

describe('trend coverage', () => {
  // Parsed rather than imported: TrendChart is a .tsx component whose import chain reaches
  // EngineContext, which constructs the simulator singleton at module load.
  const TREND_CHART = read('../dashboard/TrendChart.tsx');
  const trendedSensorIds = new Set(
    [...TREND_CHART.matchAll(/sensorId: '([^']+)'/g)].map(m => m[1]!),
  );

  it('every gauged sensor also has a trend card', () => {
    // A gauge shows the value now; the trend shows where it is going. Six sensors used to be trended
    // against eleven gauges, so most of the plant could drift with only a number to show for it.
    const gaugedWithMeta = [...gaugedSensorIds].filter(id => id in SENSOR_META);
    const untrended = gaugedWithMeta.filter(id => !trendedSensorIds.has(id));

    expect(untrended).toEqual([]);
  });

  it('every trend card resolves to a SENSOR_META entry', () => {
    // The trend reads history via meta.histKey/baseKey, so an id with no meta would render empty.
    const unbacked = [...trendedSensorIds].filter(id => !(id in SENSOR_META));
    expect(unbacked).toEqual([]);
  });
});

describe('ECS safety trips are visible to the operator', () => {
  // Every MTU8000_LIMITS threshold applyMTU8000SafetyOverride actually compares against, mapped to
  // the UI sensor that must display it. `null` = knowingly undisplayed, with the reason.
  const TRIP_TO_SENSOR: Record<string, string | null> = {
    'lubeOil.bearing_temp_hi':            'ME.BearingTemp',
    'lubeOil.bearing_temp_max':           'ME.BearingTemp',
    'lubeOil.pressure_before_filter_min': 'ME.LubeOilPressure',
    'cooling.coolant_temp_after_engine_max': 'ME.JacketCoolingOutlet',
    'cooling.coolant_temp_ss':            'ME.JacketCoolingOutlet',
    'exhaust.mean_hi':                    'ME.ExhaustTemp',

    // Both were Emergency-class trips with no continuous display until they got their own gauges.
    // Neither is covered by the similarly-named gauge beside it: "LO Pressure" is the main gallery,
    // not the last bearing; "FO Pressure" is the ~8 bar supply, not the ~1770 bar common rail.
    'lubeOil.pressure_last_bearing_min':  'ME.LubeOilPressure.LastBearing',
    'fuel.rail_pressure_min':             'ME.FuelRailPressure',

    // Spray oil (B77.11–B77.20). Both are deviation limits, not absolute ones, so the display is a
    // ten-channel panel rather than a gauge — see DISPLAYED_OUTSIDE_GAUGE_GRID.
    'sprayOil.diff_warn':                 'ME.SprayOilDiff',
    'sprayOil.diff_shutdown':             'ME.SprayOilDiff',
  };

  const tripsInSource = [...new Set(
    [...OVERRIDE_SRC.matchAll(/MTU8000_LIMITS\.([a-zA-Z]+)\.([a-zA-Z_]+)/g)].map(m => `${m[1]}.${m[2]}`),
  )].sort();

  it('every limit the safety override trips on is accounted for here', () => {
    // Fails when a NEW safety trip is added, forcing an explicit display decision rather than letting
    // it inherit the invisibility bearing temperature had.
    const unaccounted = tripsInSource.filter(t => !(t in TRIP_TO_SENSOR));
    expect(unaccounted).toEqual([]);
  });

  it('every accounted trip with a mapped sensor has a dashboard gauge', () => {
    const undisplayed = Object.entries(TRIP_TO_SENSOR)
      .filter(([, sensorId]) => sensorId !== null)
      .filter(([, sensorId]) => !gaugedSensorIds.has(sensorId!) && !(sensorId! in DISPLAYED_OUTSIDE_GAUGE_GRID))
      .map(([trip]) => trip);

    expect(undisplayed).toEqual([]);
  });

  it('bearing temperature specifically is gauged, forecastable and backed by SENSOR_META', () => {
    // The regression this whole file was written for.
    expect(gaugedSensorIds.has('ME.BearingTemp')).toBe(true);
    expect(SENSOR_META['ME.BearingTemp']).toBeDefined();
    expect(SENSOR_META['ME.BearingTemp']!.forecastKey).toBe('bearingTemp');
  });
});
