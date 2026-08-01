// Pins the rule that the baseline lag alphas mirror the physics lag alphas.
//
// WHY. The expected value exists to track the sensor through transients so a load or clutch change
// does not read as a fault — which only works if it settles at the SAME rate the sensor does. Three
// tables have to agree per sensor:
//
//   physics.ts    LAG              the sensor's own inertia
//   feature-engine.ts BLAG         stage 1 of the baseline lag
//   EngineContext.tsx BASELINE_LAG stage 2
//
// The rule was real but implicit — carried only in comments like "physics LAG.coolantTemp (was 0.05
// — went stale when physics moved 0.05→0.02)". Nothing enforced it, so it was possible to add
// bearingTemp at 0.03 against a physics alpha of 0.02 purely by judgement. The expected value then
// settled at a different rate from the sensor it is subtracted from, and the residual gap between
// them was charged to the RUL label as error: on a freshly started engine essentially every F04 row
// came back rulQuality SETTLING.
//
// All three tables are module-private consts, so they are parsed from source — the same technique
// dashboard-coverage.test.ts uses on the safety override.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(here, rel), 'utf8');

/** Pull a `const NAME = { key: 0.05, ... }` block into a plain record. */
function parseAlphaTable(src: string, name: string): Record<string, number> {
  const start = src.indexOf(`const ${name} = {`);
  if (start === -1) throw new Error(`${name} not found`);
  const end = src.indexOf('};', start);
  const body = src.slice(start, end);
  const out: Record<string, number> = {};
  for (const m of body.matchAll(/^\s*([a-zA-Z]+):\s*([\d.]+)/gm)) out[m[1]!] = Number(m[2]);
  return out;
}

const PHYSICS = parseAlphaTable(read('../../../simulator/src/physics.ts'), 'LAG');
const BLAG = parseAlphaTable(read('../../../features/src/feature-engine.ts'), 'BLAG');
const BASELINE_LAG = parseAlphaTable(read('../context/EngineContext.tsx'), 'BASELINE_LAG');

/**
 * Baseline key → the physics key for the SAME sensor. The names diverge historically (the baseline
 * side is named for the UI sensor, the physics side for the state field).
 */
const TO_PHYSICS: Record<string, string> = {
  exhaust:            'exhaust',
  lube:               'lube',
  jacket:             'coolantTemp',
  scavenge:           'chargeAirPress',
  tcRPM:              'tcSpeeds',
  sfoc:               'sfoc',
  chargeAirTemp:      'chargeAirTemp',
  fuelOilTemp:        'fuelTemp',
  bearingTemp:        'bearingTemps',
  lubeLastBearing:    'lubeLastBearing',
  fuelRailPressure:   'fuelRailPressure',
};

/**
 * Baseline entries with no physics counterpart: derived or UI-only quantities the simulator does not
 * lag under the same name (loFilterDP is a difference of two pressures, fuelOilPressure and fuelRack
 * are driven directly, shaftPower and pistonCoolingPress are algebraic off other lagged values).
 * Listed so a NEW unmapped key fails rather than silently skipping the check.
 */
const NO_PHYSICS_COUNTERPART = [
  'fuelOilPressure', 'fuelRack', 'loFilterDP', 'pistonCoolingPress', 'shaftPower',
];

describe('baseline lag alphas mirror the physics lag alphas', () => {
  it('every BLAG key is either mapped to a physics alpha or listed as having none', () => {
    const unaccounted = Object.keys(BLAG)
      .filter(k => !(k in TO_PHYSICS) && !NO_PHYSICS_COUNTERPART.includes(k));
    expect(unaccounted).toEqual([]);
  });

  it('BLAG equals the physics alpha for every mapped sensor', () => {
    const mismatches = Object.entries(TO_PHYSICS)
      .filter(([blagKey, physKey]) => BLAG[blagKey] !== undefined && PHYSICS[physKey] !== undefined)
      .filter(([blagKey, physKey]) => BLAG[blagKey] !== PHYSICS[physKey])
      .map(([blagKey, physKey]) => `${blagKey} ${BLAG[blagKey]} != physics ${physKey} ${PHYSICS[physKey]}`);

    expect(mismatches).toEqual([]);
  });

  it('bearing temperature specifically tracks the physics alpha', () => {
    // The regression this file was written for: 0.03 by judgement against a physics alpha of 0.02.
    expect(BLAG.bearingTemp).toBe(PHYSICS.bearingTemps);
    expect(BASELINE_LAG.bearingTemp).toBe(PHYSICS.bearingTemps);
    expect(PHYSICS.bearingTemps).toBe(0.02);
  });

  it('the two baseline stages agree, except where a known mismatch is recorded', () => {
    const shared = Object.keys(BLAG).filter(k => k in BASELINE_LAG);
    const mismatches = shared
      .filter(k => BLAG[k] !== BASELINE_LAG[k])
      .map(k => `${k}: BLAG ${BLAG[k]} vs BASELINE_LAG ${BASELINE_LAG[k]}`);

    // pistonCoolingPress is a pre-existing 0.06/0.05 split (HANDOVER §5.8). Left alone deliberately:
    // stage 2's input is stage 1's output, so changing either moves every piston-cooling deviation in
    // the app. Recorded here so it stays a known quantity rather than being rediscovered.
    expect(mismatches).toEqual(['pistonCoolingPress: BLAG 0.06 vs BASELINE_LAG 0.05']);
  });
});
