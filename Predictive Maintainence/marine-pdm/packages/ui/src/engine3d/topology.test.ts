// Coverage guard for the 3D topology, in the spirit of dashboard-coverage.test.ts.
//
// The 3D view is only worth anything if a click resolves to a REAL domain entity, so this pins the
// joins rather than the geometry: every sensor tag must exist in SENSOR_META, every componentId in
// DEGRADATION_COMPONENTS, every cable endpoint in PARTS, and the MTU designations must match the
// OEM numbering the ingestion tag map uses. Drift in any of those makes the panel lie.

import { describe, expect, it } from 'vitest';
import { DEGRADATION_COMPONENTS } from '@marine-pdm/simulator';
import { MTU8000 } from '@marine-pdm/shared';
import { getSensorMeta } from '../services/sensor-map';
import { CABLES, PARTS, getPart, partsIn } from './topology';
import { HALF_V, bearingTransform, cylinderTransform, tcTransform } from './engine-layout';

describe('parts registry', () => {
  it('has a unique id for every part', () => {
    const ids = PARTS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('models all 20 cylinders, 11 main bearings and 4 turbochargers', () => {
    expect(PARTS.filter(p => p.componentId === 'injectors')).toHaveLength(MTU8000.CYLINDERS);
    expect(PARTS.filter(p => p.componentId === 'bearings')).toHaveLength(11);
    expect(PARTS.filter(p => p.componentId === 'turbocharger')).toHaveLength(4);
  });

  it('resolves every declared sensor tag through SENSOR_META', () => {
    for (const part of PARTS) {
      for (const tag of part.sensorTags) {
        expect(getSensorMeta(tag), `${part.id} -> ${tag}`).not.toBeNull();
      }
    }
  });

  it('resolves every componentId to a real degradation component', () => {
    const known = new Set(DEGRADATION_COMPONENTS.map(c => c.id));
    for (const part of PARTS) {
      if (part.componentId) expect(known.has(part.componentId), part.id).toBe(true);
    }
  });

  it('uses the OEM sensor designations from the ingestion tag map', () => {
    // Cylinders are B4.1–B4.20 in CYL_NAMES order, bearings B57.1–B57.11, TC speeds the four
    // B44 codes — matching packages/ingestion/src/tag-map.ts.
    MTU8000.CYL_NAMES.forEach((name, i) => {
      expect(getPart(`cyl.${name}`)?.mtuDesignation).toBe(`B4.${i + 1}`);
    });
    for (let i = 0; i < 11; i++) {
      expect(getPart(`bearing.${i + 1}`)?.mtuDesignation).toBe(`B57.${i + 1}`);
    }
    expect(['tc.A1', 'tc.A2', 'tc.B1', 'tc.B2'].map(id => getPart(id)?.mtuDesignation)).toEqual([
      'B44.1',
      'B44.2',
      'B44.11',
      'B44.12',
    ]);
  });

  it('gives every instance-addressable part the array index it reads from', () => {
    MTU8000.CYL_NAMES.forEach((name, i) => {
      expect(getPart(`cyl.${name}`)?.instanceIndex).toBe(i);
    });
    for (let i = 0; i < 11; i++) expect(getPart(`bearing.${i + 1}`)?.instanceIndex).toBe(i);
    // tcSpeeds[] order is A1, A2, B1, B2.
    expect(['tc.A1', 'tc.A2', 'tc.B1', 'tc.B2'].map(id => getPart(id)?.instanceIndex)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('places every part in a subassembly that the rail can reach', () => {
    for (const part of PARTS) {
      expect(partsIn(part.subassembly).length, part.id).toBeGreaterThan(0);
    }
  });
});

describe('cable registry', () => {
  it('connects only parts that exist', () => {
    for (const c of CABLES) {
      expect(getPart(c.from.partId), `${c.cableNo} from`).not.toBeNull();
      expect(getPart(c.to.partId), `${c.cableNo} to`).not.toBeNull();
    }
  });

  it('never leaves a run without provenance', () => {
    for (const c of CABLES) expect(['seed', 'vessel']).toContain(c.provenance);
  });

  it('marks every currently-shipped run as a placeholder', () => {
    // If this fails, real vessel cabling has landed — update the badge copy in PartDetailPanel and
    // the caveat in APP_MAP, which both still say the routing is invented.
    expect(CABLES.every(c => c.provenance === 'seed')).toBe(true);
  });
});

describe('procedural layout', () => {
  it('splits the cylinders into two banks either side of the crank axis', () => {
    const a = Array.from({ length: 10 }, (_, i) => cylinderTransform(i));
    const b = Array.from({ length: 10 }, (_, i) => cylinderTransform(i + 10));
    expect(a.every(t => t.position[2] < 0)).toBe(true); // A-side is -Z
    expect(b.every(t => t.position[2] > 0)).toBe(true);
  });

  it('sets the bank angle to half the 48° included V', () => {
    const t = cylinderTransform(0);
    const [, y, z] = t.position;
    expect(Math.atan2(Math.abs(z), y)).toBeCloseTo(HALF_V, 6);
    expect((MTU8000.V_ANGLE_DEG / 2) * (Math.PI / 180)).toBeCloseTo(HALF_V, 12);
  });

  it('runs the 11 bearings along the crank axis, straddling the cylinders', () => {
    const xs = Array.from({ length: 11 }, (_, i) => bearingTransform(i));
    expect(xs.every(t => t.position[1] === 0 && t.position[2] === 0)).toBe(true);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i].position[0]).toBeGreaterThan(xs[i - 1].position[0]);
    }
    // First bearing sits ahead of cylinder 1, last one behind cylinder 10.
    expect(xs[0].position[0]).toBeLessThan(cylinderTransform(0).position[0]);
    expect(xs[10].position[0]).toBeGreaterThan(cylinderTransform(9).position[0]);
  });

  it('puts all four turbochargers past the free end, two per side', () => {
    const tcs = [0, 1, 2, 3].map(tcTransform);
    const lastCyl = cylinderTransform(9).position[0];
    expect(tcs.every(t => t.position[0] > lastCyl)).toBe(true);
    expect(tcs.filter(t => t.position[2] < 0)).toHaveLength(2); // A-side
    expect(tcs.filter(t => t.position[2] > 0)).toHaveLength(2); // B-side
  });
});
