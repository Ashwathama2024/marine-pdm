// Drift guard for SENSOR_META's two join keys.
//
// `matrixSensorIds` and `forecastKey` are hand-maintained strings that join onto data owned by other
// packages. Nothing at compile time catches a typo or a rename on the far side — the reverse lookup
// simply returns no candidate faults, so the AI diagnosis quietly loses its causal evidence and
// rulTrue_* quietly becomes null. These assertions turn that into a test failure.

import { describe, it, expect } from 'vitest';
import { DEGRADATION_MODES } from '@marine-pdm/simulator';
import { SENSOR_META, FORECASTABLE_SENSORS, matrixIdsForForecastKey, sensorLabel } from './sensor-map';
import { FORECAST_LIMITS } from './forecast';

const ALL_MATRIX_IDS = new Set(DEGRADATION_MODES.flatMap(m => m.effects.map(e => e.sensorId)));

describe('SENSOR_META ↔ DEGRADATION_MODES', () => {
  it('every matrixSensorId exists in the degradation matrix', () => {
    const unknown: string[] = [];
    for (const [sensorId, meta] of Object.entries(SENSOR_META)) {
      for (const id of meta.matrixSensorIds) {
        if (!ALL_MATRIX_IDS.has(id)) unknown.push(`${sensorId} → "${id}"`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('every modelled matrix sensorId with a non-zero weight is observed by some UI sensor', () => {
    // The other direction: a physics effect no UI sensor claims can never appear as a candidate fault
    // for anything, so a real cross-correlation would be invisible to the diagnosis.
    const claimed = new Set(Object.values(SENSOR_META).flatMap(m => m.matrixSensorIds));
    const orphans = [...new Set(
      DEGRADATION_MODES.flatMap(m => m.effects)
        .filter(e => e.modeled && e.weight !== 0)
        .map(e => e.sensorId),
    )].filter(id => !claimed.has(id));

    // Known and accepted: none of these has a gauge of its own on the dashboard, so no UI sensor can
    // claim them. They are still visible to the AI diagnosis — MATRIX_READERS in sensor-evidence.ts
    // resolves each one straight off the snapshot for the "MUST also move" cross-correlation lines —
    // they just cannot be the sensor UNDER diagnosis. Listed explicitly so a NEW orphan fails this
    // test rather than joining a silent pile.
    //
    // crankcasePressure is the consequential one: it is F08 piston blow-by's PRIMARY effect, so F08
    // can never surface as a candidate fault for a gauge, and rulTrue has no metric to project it
    // onto. It DOES have a dashboard gauge, but no SENSOR_META entry to back it — which is why it is
    // still listed here. Adding one would close both gaps.
    //
    // bearingTemps[i] / bearingTemps[all] were on this list until ME.BearingTemp was added. They were
    // the worst case in it: unlike the rest, bearing temperature is enforced by
    // applyMTU8000SafetyOverride (HI T-Bearing 115 °C, SS Emergency Stop 120 °C), so F04 could trip a
    // shutdown with no gauge, no trend and no RUL column anywhere in the UI.
    expect(orphans.sort()).toEqual(
      ['crankcasePressure', 'cylImbalance', 'exhaustBackPressure', 'lubeOilTemp'].sort(),
    );
  });
});

describe('SENSOR_META ↔ FORECAST_LIMITS', () => {
  it('every forecastKey resolves to a coded alarm band', () => {
    for (const { sensorId, forecastKey } of FORECASTABLE_SENSORS) {
      expect(FORECAST_LIMITS[forecastKey], `${sensorId} → "${forecastKey}"`).toBeDefined();
    }
  });

  it('the forecast limit points at the same history series as the sensor', () => {
    for (const { sensorId, forecastKey } of FORECASTABLE_SENSORS) {
      expect(FORECAST_LIMITS[forecastKey]!.key, sensorId).toBe(SENSOR_META[sensorId]!.histKey);
    }
  });

  it('records exactly which forecastable sensors have a modelled fault driver', () => {
    // A forecastable sensor with no modelled driver can only ever produce rulTrue_* = null, so the
    // split is worth pinning rather than discovering later in a dataset full of empty columns.
    //
    // ME.ChargeAirTemp is the expected exception and it is correct: charge air is LT-cooled from a
    // constant 36 °C circuit, so F05 HT-cooler fouling does NOT propagate to it. The matrix records
    // that honestly as `modeled: false, weight: 0` with physicsRef 'N/A by design'. See the root
    // CLAUDE.md gotcha #12 — do not "fix" this by lowering the charge-air physics to match.
    const undriven = FORECASTABLE_SENSORS
      .filter(({ forecastKey }) => {
        const ids = matrixIdsForForecastKey(forecastKey);
        return !DEGRADATION_MODES.some(m =>
          m.effects.some(e => e.modeled && e.weight !== 0 && ids.includes(e.sensorId)));
      })
      .map(f => f.sensorId);

    expect(undriven).toEqual(['ME.ChargeAirTemp']);
  });
});

describe('sensorLabel', () => {
  it('splits the tag into words', () => {
    expect(sensorLabel('ME.ExhaustTemp')).toBe('Exhaust Temp');
    expect(sensorLabel('ME.LOFilterDP')).toBe('L O Filter D P');   // acronyms split — matches prior behaviour
  });
});
