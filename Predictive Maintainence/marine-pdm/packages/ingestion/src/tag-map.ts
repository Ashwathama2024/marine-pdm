// packages/ingestion/src/tag-map.ts
// MTU 8000 M71/M71L — 52-tag OPC-UA mapping for IPMS connection.
// Maps real IPMS NodeIds → MTU8000Snapshot fields.
// PDF upgrade spec §4 and §10.1.
//
// Internal simulator NodeIds use namespace ns=2;s=ME.*
// Real IPMS NodeIds (Kongsberg K-Chief example) shown as comments.
// To connect a real vessel: replace ns=2;s=... with your IPMS NodeIds.
// Use the scale/offset fields for unit conversion (some IPMS report ×10 values).

import { MTU8000, MTU8000_LIMITS } from '@marine-pdm/shared';

export interface TagMapping {
  nodeId: string;         // OPC-UA NodeId (internal simulator or real IPMS)
  field: string;          // MTU8000Snapshot / EngineSnapshot field path
  description: string;    // human-readable label
  mtuDesignation: string; // MTU sensor designation e.g. B4A1 — a label, NOT an address (see nodeId)
  unit: string;
  alarmHi?: number;       // ECS HI alarm threshold
  ssLimit?: number;       // ECS SS (safety system) limit
  scale?: number;         // raw → engineering units: multiply raw by scale (default 1.0)
  offset?: number;        // add offset after scaling (default 0)
}

const CYL_NAMES = MTU8000.CYL_NAMES as unknown as string[];

// ── 4.1 EXHAUST TEMPERATURE SENSORS (B4A1–B4A10 / B4B1–B4B10) ───────────────
// Two OEM documents name these differently and BOTH are in the manual set:
//   - the sensor-location deck (4a/4b, MS15082/00E) labels each physical probe B4 + bank + number,
//     so cylinder B7's probe is B4B7. It is drawn at its position on the engine.
//   - the alarm/limit list (ZNG00028788) writes the range as "B4.1 bis B4.20" in its sensor-ref
//     column, alongside "B57.1- B57.11" for the bearings.
// We follow the location deck, because that is the form stencilled at the sensor an engineer is
// standing in front of, and because engine3d/topology.ts already resolves clicks to it. If a vessel's
// IPMS publishes the flat form it changes nothing here: `mtuDesignation` is a label with no consumer,
// and subscription goes through `nodeId`.
const exhaustTempTags: TagMapping[] = CYL_NAMES.map((name, i) => ({
  nodeId:          `ns=2;s=ME.Cyl${name}.ExhaustTemp`,
  // Real IPMS example (Kongsberg K-Chief): `ns=4;s=MainEngine.T_EXH_${name}`
  field:           `cylTemps.${i}`,       // also maps to cylExhaustTemps[i]
  description:     `Cylinder ${name} exhaust temperature`,
  mtuDesignation:  `B4${name}`,
  unit:            '°C',
  alarmHi:         480,
  ssLimit:         530,
}));

// ── 4.2 EXHAUST MEAN & BACK PRESSURE ────────────────────────────────────────
const exhaustOtherTags: TagMapping[] = [
  {
    nodeId: 'ns=2;s=ME.ExhaustMean',
    // Real IPMS: 'ns=4;s=MainEngine.T_EXH_MEAN'
    field: 'exhaustMeanTemp',
    description: 'Bulk mean exhaust temperature',
    mtuDesignation: 'B4.30',
    unit: '°C',
    alarmHi: 460,
    ssLimit: 510,
  },
  {
    nodeId: 'ns=2;s=ME.ExhaustBackPressure',
    // Real IPMS: 'ns=4;s=MainEngine.P_EXH_BACK'
    field: 'exhaustBackPressure',
    description: 'Exhaust back pressure downstream of TCs',
    mtuDesignation: 'B41.1',
    unit: 'mbar',
    alarmHi: 120,
    ssLimit: 150,
  },
];

// ── 4.3 LUBE OIL PRESSURE ────────────────────────────────────────────────────
const lubeOilPressureTags: TagMapping[] = [
  {
    nodeId: 'ns=2;s=ME.LubeOilPressure',
    // Real IPMS: 'ns=4;s=MainEngine.P_LO_MAIN'
    field: 'lubeOilPressureBeforeFilter',
    description: 'Main lube oil pressure before filter',
    mtuDesignation: 'B5.1',
    unit: 'bar',
    alarmHi: undefined,
    ssLimit: 5.0,
  },
  {
    nodeId: 'ns=2;s=ME.LubeOilPressure.AfterFilter',
    // Real IPMS: 'ns=4;s=MainEngine.P_LO_AFT_FILTER'
    field: 'lubeOilPressureAfterFilter',
    description: 'Lube oil pressure after filter (for DP calc)',
    mtuDesignation: 'B5.5',
    unit: 'bar',
  },
  {
    nodeId: 'ns=2;s=ME.LubeOilPressure.PistonCooling',
    // Real IPMS: 'ns=4;s=MainEngine.P_LO_PISTON'
    field: 'pistonCoolingPress',
    description: 'Piston cooling oil pressure',
    mtuDesignation: 'B5.2',
    unit: 'bar',
    ssLimit: 4.5,
  },
  {
    nodeId: 'ns=2;s=ME.LubeOilPressure.LastBearing',
    // Real IPMS: 'ns=4;s=MainEngine.P_LO_LAST_BEARING'
    field: 'lubeLastBearingPressure',
    description: 'SS trigger — furthest lubrication point',
    mtuDesignation: 'B5.3/B5.4',
    unit: 'bar',
    alarmHi: 3.5,
    ssLimit: 3.2,
  },
  {
    nodeId: 'ns=2;s=ME.LubeOilTemp',
    // Real IPMS: 'ns=4;s=MainEngine.T_LO'
    field: 'lubeOilTemp',
    description: 'Lube oil temperature inlet',
    mtuDesignation: 'B7',
    unit: '°C',
    alarmHi: 110,
    ssLimit: 115,
  },
];

// ── 4.4 BEARING TEMPERATURES (B57.1–B57.11) ──────────────────────────────────
const bearingTempTags: TagMapping[] = Array.from({ length: 11 }, (_, i) => ({
  nodeId:         `ns=2;s=ME.BearingTemp.${i + 1}`,
  // Real IPMS: `ns=4;s=MainEngine.T_BEARING_${i + 1}`
  field:          `bearingTemps.${i}`,
  description:    `Crankshaft bearing ${i + 1} temperature${i === 10 ? ' (free end — runs 5°C hotter)' : ''}`,
  mtuDesignation: `B57.${i + 1}`,
  unit:           '°C',
  alarmHi:        100,
  ssLimit:        120,
}));

// ── 4.5 COOLING SYSTEM ────────────────────────────────────────────────────────
const coolingTags: TagMapping[] = [
  {
    nodeId: 'ns=2;s=ME.CoolantTemp.AfterEngine',
    // Real IPMS: 'ns=4;s=MainEngine.T_CW_OUT'
    field: 'coolantTempAfterEngine',
    description: 'Coolant temp after engine block',
    mtuDesignation: 'B6.1',
    unit: '°C',
    alarmHi: 95,
    ssLimit: 100,
  },
  {
    nodeId: 'ns=2;s=ME.CoolantPressure',
    // Real IPMS: 'ns=4;s=MainEngine.P_CW'
    field: 'coolantPressure',
    description: 'Coolant pump delivery pressure',
    mtuDesignation: 'B16.1',
    unit: 'bar',
    ssLimit: 1.5,
  },
];

// ── 4.6 CHARGE AIR ────────────────────────────────────────────────────────────
const chargeAirTags: TagMapping[] = [
  {
    nodeId: 'ns=2;s=ME.ChargeAirPressure',
    // Real IPMS: 'ns=4;s=MainEngine.P_SCAV'
    field: 'chargeAirPressure',
    description: 'Charge air manifold pressure',
    mtuDesignation: 'B10',
    unit: 'bar',
    ssLimit: 2.0,
  },
  {
    nodeId: 'ns=2;s=ME.ChargeAirTemp',
    // Real IPMS: 'ns=4;s=MainEngine.T_SCAV'
    field: 'chargeAirTemp',
    description: 'Charge air temp after intercooler',
    mtuDesignation: 'B9',
    unit: '°C',
    alarmHi: 50,
    ssLimit: 55,
  },
];

// ── 4.7 TURBOCHARGER SPEEDS (B44.x) ──────────────────────────────────────────
// These carried ssLimit: 8000 — below the ~17.8k the sim idles at and the 28k it reaches at rated, so
// the tag would have read "past its safety limit" permanently on a healthy engine. The ECS codes
// Turbo Overspeed at 40 500 / 41 000 RPM (ZNG00028788), which is what MTU8000_LIMITS already held;
// sourcing from there rather than retyping keeps the two from parting again.
const tcSpeedTags: TagMapping[] = [
  {
    nodeId: 'ns=2;s=ME.TC.A1.Speed',
    // Real IPMS: 'ns=4;s=MainEngine.N_TC_A1'
    field: 'tcSpeeds.0',
    description: 'Turbocharger A1 speed',
    mtuDesignation: 'B44.1',
    unit: 'RPM',
    alarmHi: MTU8000_LIMITS.turbocharger.speed_overspeed_l1,
    ssLimit: MTU8000_LIMITS.turbocharger.speed_overspeed_l2,
  },
  {
    nodeId: 'ns=2;s=ME.TC.A2.Speed',
    // Real IPMS: 'ns=4;s=MainEngine.N_TC_A2'
    field: 'tcSpeeds.1',
    description: 'Turbocharger A2 speed',
    mtuDesignation: 'B44.2',
    unit: 'RPM',
    alarmHi: MTU8000_LIMITS.turbocharger.speed_overspeed_l1,
    ssLimit: MTU8000_LIMITS.turbocharger.speed_overspeed_l2,
  },
  {
    nodeId: 'ns=2;s=ME.TC.B1.Speed',
    // Real IPMS: 'ns=4;s=MainEngine.N_TC_B1'
    field: 'tcSpeeds.2',
    description: 'Turbocharger B1 speed',
    mtuDesignation: 'B44.11',
    unit: 'RPM',
    alarmHi: MTU8000_LIMITS.turbocharger.speed_overspeed_l1,
    ssLimit: MTU8000_LIMITS.turbocharger.speed_overspeed_l2,
  },
  {
    nodeId: 'ns=2;s=ME.TC.B2.Speed',
    // Real IPMS: 'ns=4;s=MainEngine.N_TC_B2'
    field: 'tcSpeeds.3',
    description: 'Turbocharger B2 speed',
    mtuDesignation: 'B44.12',
    unit: 'RPM',
    alarmHi: MTU8000_LIMITS.turbocharger.speed_overspeed_l1,
    ssLimit: MTU8000_LIMITS.turbocharger.speed_overspeed_l2,
  },
];

// ── 4.8 FUEL & MISC ───────────────────────────────────────────────────────────
const fuelAndMiscTags: TagMapping[] = [
  {
    nodeId: 'ns=2;s=ME.FuelRailPressure',
    // Real IPMS: 'ns=4;s=MainEngine.P_FUEL_RAIL'
    field: 'fuelRailPressure',
    description: 'Common rail high-pressure fuel',
    mtuDesignation: 'B48',
    unit: 'bar',
    ssLimit: 1200,
  },
  {
    nodeId: 'ns=2;s=ME.FuelTemp',
    // Real IPMS: 'ns=4;s=MainEngine.T_FUEL'
    field: 'fuelTemp',
    description: 'Fuel temperature',
    mtuDesignation: 'B33',
    unit: '°C',
    alarmHi: 70,
  },
  {
    nodeId: 'ns=2;s=ME.CrankcasePressure',
    // Real IPMS: 'ns=4;s=MainEngine.P_CRANKCASE'
    field: 'crankcasePressure',
    description: 'Crankcase internal pressure (ventilation health)',
    mtuDesignation: 'B50',
    unit: 'mbar',
    alarmHi: 5,
  },
  {
    nodeId: 'ns=2;s=ME.RPM',
    // Real IPMS: 'ns=4;s=MainEngine.N_RPM'
    field: 'rpm',
    description: 'Primary crankshaft speed — governor input',
    mtuDesignation: 'B13.1 (ECU)',
    unit: 'RPM',
    alarmHi: 1200,
  },
  {
    nodeId: 'ns=2;s=ME.RPM.Redundant',
    // Real IPMS: 'ns=4;s=MainEngine.N_RPM_RED'
    field: 'rpmRedundant',
    description: 'Redundant crankshaft speed TD validation',
    mtuDesignation: 'B13.2 (EMU)',
    unit: 'RPM',
  },
  {
    nodeId: 'ns=2;s=ME.Load',
    // Real IPMS: 'ns=4;s=MainEngine.LOAD_PCT'
    field: 'load',
    description: 'Engine load percentage',
    mtuDesignation: 'ECU (calculated)',
    unit: '%',
  },
];

// ── COMBINED 52-TAG MAP ───────────────────────────────────────────────────────
export const TAG_MAP: TagMapping[] = [
  ...exhaustTempTags,
  ...exhaustOtherTags,
  ...lubeOilPressureTags,
  ...bearingTempTags,
  ...coolingTags,
  ...chargeAirTags,
  ...tcSpeedTags,
  ...fuelAndMiscTags,
];

// Fast lookup by NodeId
export const NODE_ID_TO_FIELD = new Map(TAG_MAP.map(t => [t.nodeId, t]));

// All NodeIds to subscribe to
export const ALL_NODE_IDS = TAG_MAP.map(t => t.nodeId);

// ── UNIT CONVERSION HELPER ────────────────────────────────────────────────────
// Some IPMS systems report values ×10 (e.g., °C × 10 = 4400 for 440°C).
// Apply scale and offset from TagMapping before using the value.
export function convertRawValue(raw: number, mapping: TagMapping): number {
  const scaled = raw * (mapping.scale ?? 1.0);
  return scaled + (mapping.offset ?? 0);
}

// ── IPMS INTEGRATION NOTES ────────────────────────────────────────────────────
// To populate TAG_MAP with real IPMS NodeIds:
//
// 1. Export the tag list from your IPMS (Kongsberg K-Chief, Wärtsilä NACOS, or ADEC)
// 2. Replace each ns=2;s=ME.* nodeId with the matching real NodeId
// 3. Add scale/offset where unit conversion is needed:
//    { nodeId: 'ns=4;s=ME.T_EXH_A1', field: 'cylTemps.0', scale: 0.1, offset: 0 }
//    (if IPMS reports tenths of a degree)
//
// Critical sources to pull alarm history from before connecting:
// - LOP alarm log: 2-3 years of AL/SD/SS/HI/LO codes → seed pattern library
// - EMU log: TD (Transmitter Deviation) history → seed sensor failure patterns
// - ECU logs: speed/load data → baseline curve verification
