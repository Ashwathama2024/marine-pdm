// shared/tests/oem-limits.test.ts
//
// Pins the transcription of MTU drawing ZNG00028788 against the drawing itself.
//
// This is not a test of behaviour — it is a test that the ground truth has not been edited. Every
// number here was read visually from a 340 dpi raster of the image-only PDF (the text layer is
// control characters, so extraction silently corrupts digits). If one of these fails, either the
// transcription was changed without re-reading the drawing, or someone "fixed" an OEM limit to
// make an alarm stop firing — which is the exact failure OEM-CALIBRATION-GAP.md exists to prevent.
//
// Re-verify with:
//   page = fitz.open(r'...\4e_ Alarm Limit XZ56900100007.pdf')[0 or 1]
//   page.get_pixmap(dpi=340, clip=fitz.Rect(x0, y0, x1, y1)).save('out.png')

import { describe, it, expect } from 'vitest';
import {
  OEM_DRAWING,
  OEM_MATERIAL_NO,
  OEM_CURVES,
  OEM_LIMITS,
  OEM_VARIANTS,
  OEM_VARIANT,
  oemCurve,
  oemLimit,
  oemScalar,
} from '../src/oem-limits';

const RATED_RPM = 1150;

describe('ZNG00028788 — drawing identity', () => {
  it('names the drawing and material number from the title block', () => {
    expect(OEM_DRAWING).toBe('ZNG00028788');
    expect(OEM_MATERIAL_NO).toBe('XZ56900100007');
  });

  it('carries every row of sheet 1', () => {
    // 41 rows on the drawing, counting the four offset continuation rows under T-Exhaust.
    expect(OEM_LIMITS.length).toBe(41);
    expect(new Set(OEM_LIMITS.map(r => r.id)).size).toBe(OEM_LIMITS.length);
    for (const row of OEM_LIMITS) {
      expect(row.drawing).toBe('ZNG00028788');
      expect(row.sheet).toBe(1);
    }
  });
});

// ── Sheet 2 — the value at rated 1150 RPM, which is what the calibration is judged against ──
describe('ZNG00028788 sheet 2 — curve values at rated 1150 RPM', () => {
  const ratedExpectations: Array<[number, number, string]> = [
    [0,  4.1, 'Coolant Pressure Lim1'],
    [1,  5.2, 'Oil Pressure Piston Cooling Lim1'],
    [2,  4.7, 'Oil Pressure Piston Cooling Lim2 (SHUTDOWN)'],
    [3,  5.8, 'Oil Pressure Last Bearing Lim1'],
    [4,  5.3, 'Oil Pressure Last Bearing Lim2 (SHUTDOWN)'],
    [5,  0.8, 'Oil Filter Differential Pressure Lim1'],
    [6,  5,   'Fuel Pressure After Filter Lim1'],
    [7,  1,   'Fuel Filter Differential Pressure Lim1'],
    [8,  1.8, 'Raw Water Pressure After Pump Lim1'],
    [9,  27,  'Crankcase Air Pressure Lim1'],
    [10, 700, 'Exhaust Temp. Mean Lim1'],
  ];

  it.each(ratedExpectations)('curve %i at 1150 RPM is %f (%s)', (id, expected) => {
    expect(oemCurve(id as never, RATED_RPM)).toBeCloseTo(expected, 6);
  });
});

describe('ZNG00028788 sheet 2 — every tabulated point round-trips', () => {
  // Interpolating exactly at a tabulated x must return that point's y, for all 13 curves.
  it('returns the tabulated y at every tabulated x', () => {
    for (const key of Object.keys(OEM_CURVES)) {
      const c = OEM_CURVES[Number(key) as never] as (typeof OEM_CURVES)[0];
      expect(c.x.length).toBe(10);
      expect(c.y.length).toBe(10);
      c.x.forEach((x, i) => {
        expect(oemCurve(c.id, x)).toBeCloseTo(c.y[i], 6);
      });
    }
  });

  it('curve 9 (crankcase) is flat at 27 mbar across the whole speed range', () => {
    for (const rpm of [100, 250, 400, 700, 1000, 1150, 1400, 1500, 2000]) {
      expect(oemCurve(9, rpm)).toBe(27);
    }
  });
});

describe('oemCurve — interpolation and clamping', () => {
  it('interpolates linearly between tabulated points', () => {
    // Curve 0: 3.2 bar at 1000 rpm, 4.1 bar at 1150. Midpoint 1075 → 3.65.
    expect(oemCurve(0, 1075)).toBeCloseTo(3.65, 6);
    // Curve 3: 5 bar at 1000, 5.8 at 1150. A quarter of the way, 1037.5 → 5.2.
    expect(oemCurve(3, 1037.5)).toBeCloseTo(5.2, 6);
  });

  it('clamps below the first point and above the last', () => {
    expect(oemCurve(0, 0)).toBe(0);       // curve 0 starts at 300 rpm, y 0
    expect(oemCurve(0, -500)).toBe(0);
    expect(oemCurve(1, 99999)).toBe(5.2); // curve 1 ends at 1400 rpm, y 5.2
    expect(oemCurve(8, 1200)).toBe(1.8);  // curve 8's last point
    expect(oemCurve(8, 5000)).toBe(1.8);
  });

  it('curves 11 and 12 are indexed by mean exhaust temperature, not RPM', () => {
    expect(OEM_CURVES[11].index).toBe('exhaustMeanC');
    expect(OEM_CURVES[12].index).toBe('exhaustMeanC');
    // At a 440 °C mean the upper bound on any single cylinder is 540 °C
    // (curve 12: 500 at mean 400, 600 at mean 500 → 540 at 440).
    expect(oemCurve(12, 440)).toBeCloseTo(540, 6);
    // and the lower bound 340 °C (curve 11: 300 at 400, 400 at 500).
    expect(oemCurve(11, 440)).toBeCloseTo(340, 6);
  });
});

// ── Sheet 1 — the scalar coded limits ───────────────────────────────────────
describe('ZNG00028788 sheet 1 — scalar limits', () => {
  const scalars: Array<[string, number, string]> = [
    ['coolantTempLim1',              95,   '65,01 warning'],
    ['coolantTempLim2',              97,   '65,03 power reduction'],
    ['chargeAirTempLL',              20,   '66,03 warning'],
    ['chargeAirTempUL',              75,   '66,01 warning'],
    ['oilTempLim1',                  83,   '72,01 warning'],
    ['oilTempLim2',                  85,   '72,03 power reduction'],
    ['bearingTempMean',             112,   '50,03 warning'],
    ['bearingTempDiff',              20,   '49,03 warning'],
    ['bearingTempLim1',             115,   '49,04 warning'],
    ['bearingTempLim2',             120,   '49,05 SHUTDOWN'],
    ['splashOilDiffLim1',             4,   '39 warning'],
    ['splashOilDiffLim2',             6,   '39,01 SHUTDOWN'],
    ['fuelTempLim1',                 45,   '70,01 warning'],
    ['fuelTempLim2',                 50,   '70,03 power reduction'],
    ['railPressDeviation',           50,   '18 fuel limitation — a DEVIATION, not an absolute'],
    ['rawWaterTempBeforeCooler',   32.5,   '143,01 warning'],
    ['rawWaterTempAfterCooler',      47,   '53.00 warning'],
    ['exhaustBackPressureFL',        70,   '3D-107 fuel limitation'],
  ];

  it.each(scalars)('%s is %f (%s)', (id, expected) => {
    expect(oemScalar(id as string)).toBe(expected);
  });

  it('records the action and delay the ECS actually takes', () => {
    expect(oemLimit('bearingTempLim2').action).toBe('shut down');
    expect(oemLimit('bearingTempLim2').delayS).toBe(1.0);
    expect(oemLimit('pistonCoolingPressLim2').action).toBe('shut down');
    expect(oemLimit('pistonCoolingPressLim2').delayS).toBe(2.0);
    expect(oemLimit('lastBearingPressLim2').action).toBe('shut down');
    expect(oemLimit('lastBearingPressLim2').delayS).toBe(1.0);
    expect(oemLimit('oilTempLim2').action).toBe('power reduction');
    expect(oemLimit('exhaustBackPressureFL').action).toBe('fuel limitation');
  });

  it('records which side of the limit alarms', () => {
    // The three pressure shutdowns alarm when the value FALLS BELOW the curve.
    expect(oemLimit('pistonCoolingPressLim2').direction).toBe('below');
    expect(oemLimit('lastBearingPressLim2').direction).toBe('below');
    expect(oemLimit('coolantPressureLim1').direction).toBe('below');
    // Temperatures and the differential pressures alarm on the way up.
    expect(oemLimit('oilTempLim1').direction).toBe('above');
    expect(oemLimit('crankcasePressLim1').direction).toBe('above');
    expect(oemLimit('lubeFilterDpLim1').direction).toBe('above');
  });

  it('carries the MDEC parameter number and sensor for each row', () => {
    expect(oemLimit('pistonCoolingPressLim1').mdecParam).toBe('2D-26');
    expect(oemLimit('pistonCoolingPressLim1').sensor).toBe('B5.2');
    expect(oemLimit('lastBearingPressLim1').mdecParam).toBe('2D-17');
    expect(oemLimit('lastBearingPressLim1').sensor).toBe('B5.3/B5.4');
    expect(oemLimit('oilTempLim1').sensor).toBe('B7');
    expect(oemLimit('splashOilDiffLim1').sensor).toBe('B77.11–B77.20');
  });

  it('throws on an unknown id rather than silently returning undefined', () => {
    expect(() => oemLimit('noSuchLimit')).toThrow(/no OEM limit/);
    expect(() => oemScalar('coolantPressureLim1')).toThrow(/is a curve/);
  });
});

// ── The per-variant block ───────────────────────────────────────────────────
describe('ZNG00028788 sheet 1 — per-variant values', () => {
  it('transcribes all four build-state blocks', () => {
    expect(OEM_VARIANTS['20V8000BM00']).toEqual({
      engineOverspeedShutdown: 1240, etcOverspeedL1: 40700, etcOverspeedL2: 40900, exhaustBackPressureWarn: 50,
    });
    expect(OEM_VARIANTS['20V8000BM01']).toEqual({
      engineOverspeedShutdown: 1323, etcOverspeedL1: 40500, etcOverspeedL2: 41000, exhaustBackPressureWarn: 50,
    });
    expect(OEM_VARIANTS['20V8000M91L']).toEqual({
      engineOverspeedShutdown: 1323, etcOverspeedL1: 40800, etcOverspeedL2: 41000, exhaustBackPressureWarn: 50,
    });
    expect(OEM_VARIANTS['16V8000BM01']).toEqual({
      engineOverspeedShutdown: 1323, etcOverspeedL1: 41300, etcOverspeedL2: 41800, exhaustBackPressureWarn: 55,
    });
  });

  it('the exhaust back-pressure warning is 50 mbar, well below the 70 mbar fuel limitation', () => {
    expect(OEM_VARIANT.exhaustBackPressureWarn).toBe(50);
    expect(oemScalar('exhaustBackPressureFL')).toBe(70);
    expect(OEM_VARIANT.exhaustBackPressureWarn).toBeLessThan(oemScalar('exhaustBackPressureFL'));
  });
});
