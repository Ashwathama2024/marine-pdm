// Pins how live engine data reaches the 3D model. The point of the view is that a fault is visible
// on the part that has it, so these guard two things: that a single hot cylinder lights up ALONE,
// and that no part is wired to a tag that cannot actually drive it.

import { describe, expect, it } from 'vitest';
import { MTU8000, MTU8000_LIMITS } from '@marine-pdm/shared';
import { SENSOR_META } from '../services/sensor-map';
import { partRisk, BEARING_RISK_FLOOR_C } from './part-risk';
import { PARTS, getPart } from './topology';
import type { LiveValues } from './useLiveBridge';

function live(over: Partial<LiveValues> = {}): LiveValues {
  return {
    t: 1,
    cylTemps: new Array(20).fill(440),
    cylRisks: new Array(20).fill(0),
    bearingTemps: new Array(11).fill(90),
    tcSpeeds: [28000, 28000, 28000, 28000],
    rpm: 1150,
    load: 85,
    systemRisk: 0,
    isOperational: true,
    rootFactors: {
      injFaultMax: 0,
      coolingEffDrop: 0,
      tcEffDrop: 0,
      lubeFault: 0,
      bearingFaultMax: 0,
      pistonBlowby: 0,
    },
    devByTag: {},
    tcInfos: ['A1', 'A2', 'B1', 'B2'].map(name => ({
      name,
      status: 'ACTIVE' as const,
      displaySpeed: 28000,
      rawSpeed: 28000,
      deviation: 0,
    })),
    ...over,
  };
}

describe('a stopped engine', () => {
  it('reports no risk anywhere, rather than painting everything healthy', () => {
    const v = live({ isOperational: false, cylRisks: new Array(20).fill(100) });
    for (const p of PARTS) expect(partRisk(p, v), p.id).toBe(0);
  });
});

describe('instance-addressable parts read their own element', () => {
  it('lights up one cylinder alone, not the whole bank', () => {
    const risks = new Array(20).fill(0);
    risks[3] = 80; // A4
    const v = live({ cylRisks: risks });

    expect(partRisk(getPart('cyl.A4')!, v)).toBeCloseTo(0.8, 6);
    expect(partRisk(getPart('head.A4')!, v)).toBeCloseTo(0.8, 6); // head shares A4's index
    expect(partRisk(getPart('cyl.A3')!, v)).toBe(0);
    expect(partRisk(getPart('cyl.A5')!, v)).toBe(0);
    expect(partRisk(getPart('cyl.B4')!, v)).toBe(0);
  });

  it('scales a bearing across its own alarm band, not the engine mean', () => {
    // Full red lands ON the SS shutdown, wherever that limit sits — the span is derived from it
    // rather than typed, after a hardcoded 35 left the ramp saturating at the old 130 °C shutdown
    // and showing a bearing as less than fully critical while the ECS was already stopping.
    const ss = MTU8000_LIMITS.lubeOil.bearing_temp_max;
    const temps = new Array(11).fill(90);
    temps[6] = ss;
    const v = live({ bearingTemps: temps });

    expect(partRisk(getPart('bearing.7')!, v)).toBe(1);
    expect(partRisk(getPart('bearing.6')!, v)).toBe(0); // 90 °C is below the 95 °C floor

    temps[6] = (BEARING_RISK_FLOOR_C + ss) / 2;         // halfway up the band
    expect(partRisk(getPart('bearing.7')!, live({ bearingTemps: temps }))).toBeCloseTo(0.5, 6);

    temps[6] = MTU8000_LIMITS.lubeOil.bearing_temp_hi;  // the HI pre-alarm is already deep in the red
    expect(partRisk(getPart('bearing.7')!, live({ bearingTemps: temps }))).toBeGreaterThan(0.75);
  });

  it('gives each turbocharger its own reading', () => {
    const v = live({ rootFactors: { ...live().rootFactors, tcEffDrop: 0.2 } });
    // tcEff drop is engine-wide, so all four report it — but they report it through their own part.
    expect(partRisk(getPart('tc.A1')!, v)).toBeGreaterThan(0);
    expect(partRisk(getPart('tc.B2')!, v)).toBeGreaterThan(0);
  });

  it('treats a cut-out turbocharger as standby, not as a fault', () => {
    // B1 cuts out below 950 engine rpm. That is normal sequential operation and the dashboard shows
    // it grey, so the 3D part must not glow red just because a root factor is elevated.
    const tcInfos = live().tcInfos.map((t, i) =>
      i === 2 ? { ...t, status: 'STANDBY' as const, displaySpeed: 4200 } : t,
    );
    const v = live({ tcInfos, rootFactors: { ...live().rootFactors, tcEffDrop: 0.4 } });
    expect(partRisk(getPart('tc.B1')!, v)).toBe(0);
    expect(partRisk(getPart('tc.A1')!, v)).toBeGreaterThan(0); // still cut in, still reports
  });

  it('escalates a turbocharger the dashboard has flagged ALARM', () => {
    const tcInfos = live().tcInfos.map((t, i) =>
      i === 0 ? { ...t, status: 'ALARM' as const, deviation: 4000 } : t,
    );
    expect(partRisk(getPart('tc.A1')!, live({ tcInfos }))).toBe(1);
  });
});

describe('parts without an array index', () => {
  it('falls back to the root factor for its component', () => {
    const v = live({ rootFactors: { ...live().rootFactors, coolingEffDrop: 0.25 } });
    expect(partRisk(getPart('cooler.ht')!, v)).toBe(1);
  });

  it('falls back to its tag deviation when no root factor applies', () => {
    const v = live({ devByTag: { 'ME.ChargeAirTemp': 0.6 } });
    expect(partRisk(getPart('cooler.charge.A')!, v)).toBeCloseTo(0.6, 6);
  });

  it('stays neutral for uninstrumented structure', () => {
    const v = live({ devByTag: { 'ME.ExhaustTemp': 1 }, cylRisks: new Array(20).fill(100) });
    for (const id of ['cb.x11', 'mcs', 'lop8', 'meu1', 'gcu6', 'ecu4', 'gear.housing']) {
      expect(partRisk(getPart(id)!, v), id).toBe(0);
    }
  });
});

describe('no part is wired to a signal that cannot drive it', () => {
  it('makes every tag-carrying part respond to its own tag deviating', () => {
    for (const p of PARTS) {
      const tag = p.sensorTags[0];
      if (!tag) continue;
      // Root-factor-backed parts are covered by the case above; this checks the tag path.
      if (p.componentId) continue;
      const v = live({ devByTag: { [tag]: 1 } });
      expect(partRisk(p, v), `${p.id} via ${tag}`).toBeGreaterThan(0);
    }
  });

  it('only references tags the live bridge actually computes', () => {
    const computed = new Set(Object.keys(SENSOR_META));
    for (const p of PARTS) {
      for (const tag of p.sensorTags) {
        expect(computed.has(tag), `${p.id} -> ${tag}`).toBe(true);
      }
    }
  });
});

describe('firing order', () => {
  it('is a permutation of all 20 cylinders, so the wave visits each exactly once', () => {
    const order = [...MTU8000.FIRING_ORDER_CCW];
    expect(order).toHaveLength(MTU8000.CYLINDERS);
    expect(new Set(order).size).toBe(MTU8000.CYLINDERS);
    for (const name of order) expect(MTU8000.CYL_NAMES).toContain(name);
  });

  it('alternates banks, which is what makes the wave read as a V engine', () => {
    // A 20V firing order never fires two adjacent cylinders on the same bank back to back.
    const order = [...MTU8000.FIRING_ORDER_CCW];
    let sameBankRuns = 0;
    for (let i = 1; i < order.length; i++) {
      if (order[i][0] === order[i - 1][0]) sameBankRuns++;
    }
    expect(sameBankRuns).toBe(0);
  });
});
