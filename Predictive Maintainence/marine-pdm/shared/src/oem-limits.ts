// shared/src/oem-limits.ts
//
// ── THE OEM GROUND TRUTH ─────────────────────────────────────────────────────
// Every coded alarm limit of the MTU 8000, transcribed from the released limit list:
//
//     MTU drawing ZNG00028788 — "ALARM/GRENZWERTLISTE / Alarm/Limit val.list"
//     Material no. XZ56900100007, rev j.5, notice PR067960, lifecycle Released, A3, 2 sheets.
//     Sheet 1 = the coded alarm table.  Sheet 2 = the 13 limit curves those entries reference.
//     Header: "Valid for 20V8000BM00, 20V8000BM01, 16V8000BM01".
//     Stamped ONLY FOR TRAINING PURPOSE — see OEM-CALIBRATION-GAP.md §7.5 before any real hull.
//
// The PDF (`4e_ Alarm Limit XZ56900100007.pdf`) is image-only: its text layer is control
// characters 0x01–0x0F, so `pdftotext` returns garbage and silently drops digits. Every value
// below was read VISUALLY from a 340 dpi raster of a clipped region, re-verified 2026-11-25.
// Re-render with PyMuPDF if you need to check one:
//
//     page.get_pixmap(dpi=340, clip=fitz.Rect(x0, y0, x1, y1)).save('out.png')
//
// The manual set now lives at `D:\1 Work\05 Engines\ECS 8K MTU I 2024\` (it moved; the path in
// OEM-CALIBRATION-GAP.md §1.1 is stale).
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
// This is the ONLY place an OEM number is allowed to be written down. Everything else —
// ALARM_LIMITS, MTU8000_LIMITS, the safety overrides, the forecast bands, the physics
// validation targets — must either read from here or carry a comment saying it is NOT an OEM
// value. The calibration defect this file closes happened precisely because invented thresholds
// and manual thresholds were indistinguishable in the source. See OEM-CALIBRATION-GAP.md §1.4.
//
// It lives in `shared`, not `packages/knowledge` as the gap document's Phase 0 proposed: both
// `shared/src/constants.ts` and the decision-layer overrides consume it, and `knowledge` depends
// on `shared`, so the knowledge placement would have been a dependency cycle.

export const OEM_DRAWING = 'ZNG00028788';
export const OEM_MATERIAL_NO = 'XZ56900100007';

/** What the ECS does when a limit is crossed, exactly as the drawing's "action" column words it. */
export type OemAction = 'warning' | 'power reduction' | 'fuel limitation' | 'shut down';

/** Which side of the limit is the alarming side. `↓` = alarm when the value falls below it. */
export type OemDirection = 'above' | 'below' | 'none';

export type OemLimitValue =
  /** A plain number in the row's `unit`. */
  | { kind: 'scalar'; value: number }
  /** "2D (curve n)" — look the limit up in OEM_CURVES by the row's index quantity. */
  | { kind: 'curve'; curve: OemCurveId }
  /** "Offset x" — x applied to the corresponding Lim1 / measured reference, not an absolute. */
  | { kind: 'offset'; value: number }
  /** The drawing leaves the value as "x" (configured per installation). */
  | { kind: 'unspecified' };

export interface OemLimit {
  /** Stable key for code to reference. Not an MTU name. */
  id: string;
  /** The drawing's own "Name of monitored value" text. */
  name: string;
  /** The drawing's "MDEC Parameter No." — the ECS parameter that carries this limit. */
  mdecParam: string;
  limit: OemLimitValue;
  unit: string;
  direction: OemDirection;
  /** The drawing's "delay time in s" — how long the breach must persist before the action. */
  delayS: number | null;
  action: OemAction;
  /** The drawing's "sensor ref. pos." column. `null` where it is blank. */
  sensor: string | null;
  drawing: typeof OEM_DRAWING;
  sheet: 1 | 2;
}

// ── SHEET 1 — the coded alarm table ──────────────────────────────────────────
// Transcribed top to bottom, left column. Every row of the drawing is here, including the ones
// this project does not model yet, so that "is there an OEM limit for X?" is answerable from
// this file alone rather than from the PDF.
export const OEM_LIMITS: readonly OemLimit[] = [
  { id: 'coolantPressureLim1',      name: 'P-Coolant Lim1',                    mdecParam: '2D-16',  limit: { kind: 'curve',  curve: 0 },   unit: 'bar',    direction: 'below', delayS: 5.0,  action: 'warning',         sensor: 'B16.1',        drawing: OEM_DRAWING, sheet: 1 },
  { id: 'coolantPressureLim2',      name: 'P-Coolant Lim2',                    mdecParam: '90,05',  limit: { kind: 'offset', value: 0.5 }, unit: 'bar',    direction: 'below', delayS: 1.0,  action: 'power reduction', sensor: 'B16.1',        drawing: OEM_DRAWING, sheet: 1 },
  { id: 'pistonCoolingPressLim1',   name: 'Oil Pressure Piston Cooling Lim 1', mdecParam: '2D-26',  limit: { kind: 'curve',  curve: 1 },   unit: 'bar',    direction: 'below', delayS: 5.0,  action: 'warning',         sensor: 'B5.2',         drawing: OEM_DRAWING, sheet: 1 },
  { id: 'pistonCoolingPressLim2',   name: 'Oil Pressure Piston Cooling Lim 2', mdecParam: '2D-27',  limit: { kind: 'curve',  curve: 2 },   unit: 'bar',    direction: 'below', delayS: 2.0,  action: 'shut down',       sensor: 'B5.2',         drawing: OEM_DRAWING, sheet: 1 },
  { id: 'lastBearingPressLim1',     name: 'P-Oil last bearing Lim 1',          mdecParam: '2D-17',  limit: { kind: 'curve',  curve: 3 },   unit: 'bar',    direction: 'below', delayS: 3.0,  action: 'warning',         sensor: 'B5.3/B5.4',    drawing: OEM_DRAWING, sheet: 1 },
  { id: 'lastBearingPressLim2',     name: 'P-Oil last bearing Lim 2',          mdecParam: '2D-29',  limit: { kind: 'curve',  curve: 4 },   unit: 'bar',    direction: 'below', delayS: 1.0,  action: 'shut down',       sensor: 'B5.3/B5.4',    drawing: OEM_DRAWING, sheet: 1 },
  { id: 'lubeFilterDpLim1',         name: 'P-Lube Oil Filter Difference',      mdecParam: '2D-53',  limit: { kind: 'curve',  curve: 5 },   unit: 'bar',    direction: 'above', delayS: 3.0,  action: 'warning',         sensor: 'B5.1/B5.5',    drawing: OEM_DRAWING, sheet: 1 },
  { id: 'fuelPressAfterFilterLim1', name: 'P-Fuel after Filter Lim 1',         mdecParam: '2D-15',  limit: { kind: 'curve',  curve: 6 },   unit: 'bar',    direction: 'below', delayS: 5.0,  action: 'warning',         sensor: 'B34.2',        drawing: OEM_DRAWING, sheet: 1 },
  { id: 'fuelFilterDpLim1',         name: 'P-Fuel Difference Lim 1',           mdecParam: '2D-28',  limit: { kind: 'curve',  curve: 7 },   unit: 'bar',    direction: 'above', delayS: 10.0, action: 'warning',         sensor: 'B34.1/B34.2',  drawing: OEM_DRAWING, sheet: 1 },
  { id: 'rawWaterPressLim1',        name: 'P-Raw Water after Pump Lim 1',      mdecParam: '2D-47',  limit: { kind: 'curve',  curve: 8 },   unit: 'bar',    direction: 'below', delayS: 10.0, action: 'warning',         sensor: 'B21',          drawing: OEM_DRAWING, sheet: 1 },
  // * only external sea water pump.
  { id: 'rawWaterPressLim2',        name: 'P-Raw Water after Pump Lim 2*',     mdecParam: '233.02', limit: { kind: 'offset', value: -0.1 },unit: 'bar',    direction: 'below', delayS: 3.0,  action: 'fuel limitation', sensor: 'B21',          drawing: OEM_DRAWING, sheet: 1 },
  { id: 'crankcasePressLim1',       name: 'P-Crankcase Lim 1',                 mdecParam: '2D-18',  limit: { kind: 'curve',  curve: 9 },   unit: 'mbar',   direction: 'above', delayS: 5.0,  action: 'warning',         sensor: 'B50',          drawing: OEM_DRAWING, sheet: 1 },
  { id: 'crankcasePressLim2',       name: 'P-Crankcase Lim 2',                 mdecParam: '91,05',  limit: { kind: 'offset', value: 10 },  unit: 'mbar',   direction: 'above', delayS: 1.0,  action: 'shut down',       sensor: 'B50',          drawing: OEM_DRAWING, sheet: 1 },
  // A 50 bar DEVIATION from the rail setpoint, not an absolute rail pressure band.
  { id: 'railPressDeviation',       name: 'Deviation Limit P-Rail',            mdecParam: '18',     limit: { kind: 'scalar', value: 50 },  unit: 'bar',    direction: 'none',  delayS: 20.0, action: 'fuel limitation', sensor: 'B48',          drawing: OEM_DRAWING, sheet: 1 },
  { id: 'coolantTempLim1',          name: 'T-Coolant Lim 1',                   mdecParam: '65,01',  limit: { kind: 'scalar', value: 95 },  unit: '°C',     direction: 'above', delayS: 5.0,  action: 'warning',         sensor: 'B6.1/B6.2',    drawing: OEM_DRAWING, sheet: 1 },
  { id: 'coolantTempLim2',          name: 'T-Coolant Lim 2',                   mdecParam: '65,03',  limit: { kind: 'scalar', value: 97 },  unit: '°C',     direction: 'above', delayS: 3.0,  action: 'power reduction', sensor: 'B6.1/B6.2',    drawing: OEM_DRAWING, sheet: 1 },
  { id: 'chargeAirTempLL',          name: 'T-Charge Air LL',                   mdecParam: '66,03',  limit: { kind: 'scalar', value: 20 },  unit: '°C',     direction: 'below', delayS: 5.0,  action: 'warning',         sensor: 'B9',           drawing: OEM_DRAWING, sheet: 1 },
  { id: 'chargeAirTempUL',          name: 'T-Charge Air UL',                   mdecParam: '66,01',  limit: { kind: 'scalar', value: 75 },  unit: '°C',     direction: 'above', delayS: 5.0,  action: 'warning',         sensor: 'B9',           drawing: OEM_DRAWING, sheet: 1 },
  { id: 'oilTempLim1',              name: 'T-Oil Lim 1',                       mdecParam: '72,01',  limit: { kind: 'scalar', value: 83 },  unit: '°C',     direction: 'above', delayS: 5.0,  action: 'warning',         sensor: 'B7',           drawing: OEM_DRAWING, sheet: 1 },
  { id: 'oilTempLim2',              name: 'T-Oil Lim 2',                       mdecParam: '72,03',  limit: { kind: 'scalar', value: 85 },  unit: '°C',     direction: 'above', delayS: 3.0,  action: 'power reduction', sensor: 'B7',           drawing: OEM_DRAWING, sheet: 1 },
  { id: 'bearingTempMean',          name: 'T-Bearing Mean',                    mdecParam: '50,03',  limit: { kind: 'scalar', value: 112 }, unit: '°C',     direction: 'above', delayS: 3.0,  action: 'warning',         sensor: 'B57.1–B57.11', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'bearingTempDiff',          name: 'T-Bearing Diff',                    mdecParam: '49,03',  limit: { kind: 'scalar', value: 20 },  unit: '°C',     direction: 'none',  delayS: 3.0,  action: 'warning',         sensor: 'B57.1–B57.11', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'bearingTempLim1',          name: 'T-Bearing Lim 1',                   mdecParam: '49,04',  limit: { kind: 'scalar', value: 115 }, unit: '°C',     direction: 'above', delayS: 3.0,  action: 'warning',         sensor: 'B57.1–B57.11', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'bearingTempLim2',          name: 'T-Bearing Lim 2',                   mdecParam: '49,05',  limit: { kind: 'scalar', value: 120 }, unit: '°C',     direction: 'above', delayS: 1.0,  action: 'shut down',       sensor: 'B57.1–B57.11', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'splashOilDiffLim1',        name: 'T-Splash Oil Difference Lim 1',     mdecParam: '39',     limit: { kind: 'scalar', value: 4 },   unit: '°C',     direction: 'above', delayS: 3.0,  action: 'warning',         sensor: 'B77.11–B77.20',drawing: OEM_DRAWING, sheet: 1 },
  { id: 'splashOilDiffLim2',        name: 'T-Splash Oil Difference Lim 2',     mdecParam: '39,01',  limit: { kind: 'scalar', value: 6 },   unit: '°C',     direction: 'above', delayS: 1.0,  action: 'shut down',       sensor: 'B77.11–B77.20',drawing: OEM_DRAWING, sheet: 1 },
  { id: 'exhaustMeanLim1',          name: 'T-Exhaust Mean',                    mdecParam: '2D-50',  limit: { kind: 'curve',  curve: 10 },  unit: '°C',     direction: 'above', delayS: 10.0, action: 'warning',         sensor: 'B4.1 bis B4.20', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'exhaustMeanOffset',        name: 'T-Exhaust Mean (offset)',           mdecParam: '51,03',  limit: { kind: 'offset', value: 20 },  unit: '°C',     direction: 'above', delayS: 10.0, action: 'warning',         sensor: 'B4.1 bis B4.20', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'singleExhaustLL',          name: 'Single T-Exhaust LL',               mdecParam: '2D-51',  limit: { kind: 'curve',  curve: 11 },  unit: '°C',     direction: 'below', delayS: 10.0, action: 'warning',         sensor: 'B4.1 bis B4.20', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'singleExhaustLLOffset',    name: 'Single T-Exhaust LL (offset)',      mdecParam: '52',     limit: { kind: 'offset', value: 10 },  unit: '°C',     direction: 'below', delayS: 10.0, action: 'power reduction', sensor: 'B4.1 bis B4.20', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'singleExhaustUL',          name: 'Single T-Exhaust UL',               mdecParam: '2D-52',  limit: { kind: 'curve',  curve: 12 },  unit: '°C',     direction: 'above', delayS: 10.0, action: 'warning',         sensor: 'B4.1 bis B4.20', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'singleExhaustULOffset',    name: 'Single T-Exhaust UL (offset)',      mdecParam: '52,01',  limit: { kind: 'offset', value: 10 },  unit: '°C',     direction: 'above', delayS: 10.0, action: 'power reduction', sensor: 'B4.1 bis B4.20', drawing: OEM_DRAWING, sheet: 1 },
  { id: 'fuelTempLim1',             name: 'T-Fuel Lim 1',                      mdecParam: '70,01',  limit: { kind: 'scalar', value: 45 },  unit: '°C',     direction: 'above', delayS: 3.0,  action: 'warning',         sensor: 'B33',          drawing: OEM_DRAWING, sheet: 1 },
  { id: 'fuelTempLim2',             name: 'T-Fuel Lim 2',                      mdecParam: '70,03',  limit: { kind: 'scalar', value: 50 },  unit: '°C',     direction: 'above', delayS: 3.0,  action: 'power reduction', sensor: 'B33',          drawing: OEM_DRAWING, sheet: 1 },
  { id: 'leakageFuelLevelLim1',     name: 'Leakage Fuel Level High Lim 1',     mdecParam: '62,02',  limit: { kind: 'unspecified' },        unit: 'digits', direction: 'above', delayS: 15.0, action: 'warning',         sensor: 'F46.1/F46.2',  drawing: OEM_DRAWING, sheet: 1 },
  { id: 'rawWaterTempBeforeCooler',     name: 'T-Raw Water before Cooler',     mdecParam: '143,01', limit: { kind: 'scalar', value: 32.5 },unit: '°C',     direction: 'above', delayS: 0.0,  action: 'warning',         sensor: 'B008.2',       drawing: OEM_DRAWING, sheet: 1 },
  { id: 'rawWaterTempBeforeCoolerFL',   name: 'T-Raw Water before Cooler',     mdecParam: '2D-58',  limit: { kind: 'scalar', value: 33 },  unit: '°C',     direction: 'above', delayS: 0.0,  action: 'fuel limitation', sensor: 'B008.2',       drawing: OEM_DRAWING, sheet: 1 },
  { id: 'rawWaterTempAfterCooler',      name: 'T-Raw Water after Cooler',      mdecParam: '53.00',  limit: { kind: 'scalar', value: 47 },  unit: '°C',     direction: 'above', delayS: 0.0,  action: 'warning',         sensor: 'B008',         drawing: OEM_DRAWING, sheet: 1 },
  { id: 'rawWaterTempAfterCoolerFL',    name: 'T-Raw Water after Cooler',      mdecParam: '2D-59',  limit: { kind: 'scalar', value: 48 },  unit: '°C',     direction: 'above', delayS: 0.0,  action: 'fuel limitation', sensor: 'B008',         drawing: OEM_DRAWING, sheet: 1 },
  // The main table's back-pressure row. The per-variant blocks carry a LOWER, earlier warning at
  // 50 mbar (2D-45) — see OEM_VARIANTS. Both apply: 50 warns, >70 limits fuel.
  { id: 'exhaustBackPressureFL',    name: 'Exhaust Gas Back Pressure',         mdecParam: '3D-107', limit: { kind: 'scalar', value: 70 },  unit: 'mbar',   direction: 'above', delayS: 0.0,  action: 'fuel limitation', sensor: null,           drawing: OEM_DRAWING, sheet: 1 },
  { id: 'emergencyStopLocal',       name: 'Emergency Stop - Local',            mdecParam: '—',      limit: { kind: 'unspecified' },        unit: '',       direction: 'none',  delayS: null, action: 'shut down',       sensor: null,           drawing: OEM_DRAWING, sheet: 1 },
] as const;

/** Look a sheet-1 row up by its id. Throws rather than returning undefined — a missing id is a bug. */
export function oemLimit(id: string): OemLimit {
  const row = OEM_LIMITS.find(r => r.id === id);
  if (!row) throw new Error(`oemLimit: no OEM limit "${id}" on drawing ${OEM_DRAWING}`);
  return row;
}

/** The scalar value of a sheet-1 row. Throws if the row is a curve/offset — use oemCurve for those. */
export function oemScalar(id: string): number {
  const row = oemLimit(id);
  if (row.limit.kind !== 'scalar') {
    throw new Error(`oemLimit "${id}" is a ${row.limit.kind}, not a scalar — use oemCurve()`);
  }
  return row.limit.value;
}

// ── SHEET 2 — the limit curves ───────────────────────────────────────────────
export type OemCurveId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface OemCurve {
  id: OemCurveId;
  /** The drawing's own curve caption. */
  name: string;
  /** What the x axis is indexed by. Curves 0–10 are engine RPM; 11–12 are the MEAN exhaust temp. */
  index: 'rpm' | 'exhaustMeanC';
  unit: string;
  x: readonly number[];
  y: readonly number[];
  drawing: typeof OEM_DRAWING;
  sheet: 2;
}

// Header: "Curve value for 20V8000BM00, 20V8000BM01, 16V8000BM01".
// Sheet 2 also carries exception curve sets for 20V8000 M91L, 16V8000 M91L and 16V8000 M71L —
// but NONE for the 20V8000 M71L this project models. MTU wrote out an exception for every other
// M-designation on the sheet, so the absence of one for the 20V M71L is positive evidence that it
// takes the main block below. (OEM-CALIBRATION-GAP.md §7.2.)
export const OEM_CURVES: { readonly [K in OemCurveId]: OemCurve } = {
  0:  { id: 0,  name: 'Coolant Pressure Lim1',                   index: 'rpm',          unit: 'bar',
        x: [300, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500],
        y: [0,   0,   0.2, 0.6, 1.6, 2.4, 3.2,  4.1,  4.1,  4.1], drawing: OEM_DRAWING, sheet: 2 },
  1:  { id: 1,  name: 'Oil Pressure Piston Cooling Lim1',        index: 'rpm',          unit: 'bar',
        x: [0, 300, 400, 500, 600, 800, 900, 1000, 1150, 1400],
        y: [0, 0.4, 0.7, 1.1, 1.5, 3.5, 4.5, 5.2,  5.2,  5.2], drawing: OEM_DRAWING, sheet: 2 },
  2:  { id: 2,  name: 'Oil Pressure Piston Cooling Lim2',        index: 'rpm',          unit: 'bar',
        x: [0, 300, 400, 500, 600, 800, 900, 1000, 1150, 1400],
        y: [0, 0.2, 0.4, 0.7, 1,   3,   4,   4.7,  4.7,  4.7], drawing: OEM_DRAWING, sheet: 2 },
  3:  { id: 3,  name: 'Oil Pressure Last Bearing Lim1',          index: 'rpm',          unit: 'bar',
        x: [0, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500],
        y: [0, 2.3, 2.7, 3,   4,   4.5, 5,    5.8,  5.8,  5.8], drawing: OEM_DRAWING, sheet: 2 },
  4:  { id: 4,  name: 'Oil Pressure Last Bearing Lim2',          index: 'rpm',          unit: 'bar',
        x: [100, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500],
        y: [0,   2,   2.4, 2.5, 3.5, 4,   4.5,  5.3,  5.3,  5.3], drawing: OEM_DRAWING, sheet: 2 },
  5:  { id: 5,  name: 'Oil Filter Differential Pressure Lim1',   index: 'rpm',          unit: 'bar',
        x: [300, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500],
        y: [0.3, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7,  0.8,  0.9,  1], drawing: OEM_DRAWING, sheet: 2 },
  6:  { id: 6,  name: 'Fuel Pressure After Filter Lim1',         index: 'rpm',          unit: 'bar',
        x: [300, 380, 500, 600, 800, 900, 1000, 1200, 1400, 1500],
        y: [0,   4.5, 4.7, 4.7, 4.7, 5,   5,    5,    5,    5], drawing: OEM_DRAWING, sheet: 2 },
  7:  { id: 7,  name: 'Fuel Filter Differential Pressure Lim1',  index: 'rpm',          unit: 'bar',
        x: [100, 300, 400, 500, 600, 700, 800, 900, 1150, 1500],
        y: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1,   1,   1,    1], drawing: OEM_DRAWING, sheet: 2 },
  8:  { id: 8,  name: 'Raw Water Pressure After Pump Lim1',      index: 'rpm',          unit: 'bar',
        x: [100, 380, 500, 600, 800, 900, 1000, 1100, 1150, 1200],
        y: [0.2, 0.2, 0.3, 0.5, 0.8, 1.2, 1.4,  1.6,  1.8,  1.8], drawing: OEM_DRAWING, sheet: 2 },
  // Flat at 27 mbar across the whole speed range — the drawing prints 27 at all ten points.
  9:  { id: 9,  name: 'Crankcase Air Pressure Lim1',             index: 'rpm',          unit: 'mbar',
        x: [100, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500],
        y: [27,  27,  27,  27,  27,  27,  27,   27,   27,   27], drawing: OEM_DRAWING, sheet: 2 },
  10: { id: 10, name: 'Exhaust Temp. (Mean Value) Lim1',         index: 'rpm',          unit: '°C',
        x: [100, 300, 500, 600, 800, 900, 1000, 1100, 1150, 1200],
        y: [400, 600, 640, 640, 640, 660, 700,  700,  700,  700], drawing: OEM_DRAWING, sheet: 2 },
  // Curves 11 and 12 are indexed by the MEAN exhaust temperature, not by RPM — they bound how far
  // one cylinder may sit from the engine's own mean, which is why the app's relative cylinder
  // logic can be right while its absolute exhaust scale is a separate question.
  11: { id: 11, name: 'Single Cylinder Exhaust Temperature (LL)', index: 'exhaustMeanC', unit: '°C',
        x: [100, 200, 300, 400, 500, 600, 650, 670, 680, 700],
        y: [10,  100, 200, 300, 400, 500, 550, 570, 580, 600], drawing: OEM_DRAWING, sheet: 2 },
  12: { id: 12, name: 'Single Cylinder Exhaust Temperature (UL)', index: 'exhaustMeanC', unit: '°C',
        x: [100, 200, 300, 400, 500, 600, 650, 670, 680, 700],
        y: [200, 300, 400, 500, 600, 670, 700, 715, 720, 720], drawing: OEM_DRAWING, sheet: 2 },
};

/**
 * Evaluate an OEM limit curve by linear interpolation between its tabulated points.
 *
 * Outside the tabulated range the curve is CLAMPED to its end value, which matches how the ECS
 * applies these tables: every curve's last points are already flat, and below the first point the
 * engine is not in a state the limit governs.
 *
 * @param id curve number as printed on sheet 2
 * @param x  engine RPM for curves 0–10, mean exhaust temperature in °C for curves 11–12
 */
export function oemCurve(id: OemCurveId, x: number): number {
  const { x: xs, y: ys } = OEM_CURVES[id];
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  for (let i = 1; i <= last; i++) {
    if (x <= xs[i]) {
      const span = xs[i] - xs[i - 1];
      const t = span === 0 ? 0 : (x - xs[i - 1]) / span;
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[last];
}

// ── The per-variant block (sheet 1, right column) ────────────────────────────
// These four values differ by build state. OEM-CALIBRATION-GAP.md §7.1 — which build state this
// vessel is — is still open; the app matches BM01 on ETC overspeed. No Class A parameter depends
// on the answer, so it does not gate the calibration.
export interface OemVariant {
  engineOverspeedShutdown: number;   // rpm — sensor B13.1
  etcOverspeedL1: number;            // rpm — warning,         B44.11/B44.12, B44.1/B44.2
  etcOverspeedL2: number;            // rpm — power reduction, B44.11/B44.12, B44.1/B44.2
  exhaustBackPressureWarn: number;   // mbar — MDEC 2D-45, 5.0 s delay, warning, B41.1
}

export const OEM_VARIANTS: Readonly<Record<string, OemVariant>> = {
  '20V8000BM00': { engineOverspeedShutdown: 1240, etcOverspeedL1: 40700, etcOverspeedL2: 40900, exhaustBackPressureWarn: 50 },
  '20V8000BM01': { engineOverspeedShutdown: 1323, etcOverspeedL1: 40500, etcOverspeedL2: 41000, exhaustBackPressureWarn: 50 },
  '20V8000M91L': { engineOverspeedShutdown: 1323, etcOverspeedL1: 40800, etcOverspeedL2: 41000, exhaustBackPressureWarn: 50 },
  '16V8000BM01': { engineOverspeedShutdown: 1323, etcOverspeedL1: 41300, etcOverspeedL2: 41800, exhaustBackPressureWarn: 55 },
};

/** The build state this project models. See OEM-CALIBRATION-GAP.md §7.1 — not yet confirmed. */
export const OEM_TARGET_VARIANT = '20V8000BM01';
export const OEM_VARIANT = OEM_VARIANTS[OEM_TARGET_VARIANT];
