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
import {
  BLOCK_END_X,
  BORE,
  BORE_SPACING,
  ENGINE_HEIGHT,
  ENGINE_LEN,
  ENGINE_WIDTH,
  HALF_V,
  bearingTransform,
  cylinderTransform,
  tcTransform,
} from './engine-layout';

describe('parts registry', () => {
  it('has a unique id for every part', () => {
    const ids = PARTS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('models all 20 cylinders, 20 heads, 11 main bearings and 4 turbochargers', () => {
    expect(PARTS.filter(p => p.id.startsWith('cyl.'))).toHaveLength(MTU8000.CYLINDERS);
    expect(PARTS.filter(p => p.id.startsWith('head.'))).toHaveLength(MTU8000.CYLINDERS);
    expect(PARTS.filter(p => p.componentId === 'bearings')).toHaveLength(11);
    expect(PARTS.filter(p => p.componentId === 'turbocharger')).toHaveLength(4);
  });

  it('gives each head the same tag and index as the cylinder beneath it', () => {
    MTU8000.CYL_NAMES.forEach((name, i) => {
      const cyl = getPart(`cyl.${name}`);
      const head = getPart(`head.${name}`);
      expect(head?.instanceIndex).toBe(cyl?.instanceIndex);
      expect(head?.mtuDesignation).toBe(cyl?.mtuDesignation);
      expect(head?.instanceIndex).toBe(i);
    });
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

describe('published dimensions', () => {
  it('matches the MTU 8000 data sheet envelope for the 20V', () => {
    expect(ENGINE_LEN).toBeCloseTo(6.622, 6);
    expect(ENGINE_WIDTH).toBeCloseTo(2.279, 6);
    expect(ENGINE_HEIGHT).toBeCloseTo(3.439, 6);
  });

  it('derives the cylinder pitch from the 16V/20V length difference', () => {
    // 6622 - 5682 = 940 mm buys two extra cylinders per bank, so the pitch is 470 mm. This is the
    // number the whole model scales from — if it moves, every position moves with it.
    expect(BORE_SPACING).toBeCloseTo(0.47, 6);
    expect(BORE_SPACING).toBeGreaterThan(BORE); // pitch must clear the bore
  });

  it('fits the cylinder block inside the published length', () => {
    expect(BLOCK_END_X).toBeLessThan(ENGINE_LEN);
    // The turbocharger stack and its coolers live in what is left beyond the block.
    expect(ENGINE_LEN - BLOCK_END_X).toBeGreaterThan(1.0);
  });
});

describe('assembled model fits the published envelope', () => {
  /** Half-extents of a part's geometry before rotation, per geometry kind. */
  function halfExtents(p: (typeof PARTS)[number]): [number, number, number] {
    const [a, b] = p.size;
    switch (p.kind) {
      case 'cylinder':
      case 'capsule':
        return [a, b / 2, a];
      case 'sphere':
        return [a, a, a];
      case 'torus':
        return [a + b, a + b, b]; // ring in XY, tube thickness along Z
      case 'box':
      default:
        return [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    }
  }

  function rot(v: number[], r: [number, number, number]): number[] {
    let [x, y, z] = v;
    const [rx, ry, rz] = r;
    // Single-axis rotations only in this registry, so sequential application is exact.
    let c = Math.cos(rx), s = Math.sin(rx);
    [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(ry); s = Math.sin(ry);
    [x, z] = [x * c + z * s, -x * s + z * c];
    c = Math.cos(rz); s = Math.sin(rz);
    [x, y] = [x * c - y * s, x * s + y * c];
    return [x, y, z];
  }

  /** World-space AABB of every part except the explicitly off-engine IPMS cabinet. */
  function bbox() {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const p of PARTS) {
      if (p.id === 'ipms') continue;
      const h = halfExtents(p);
      const r = p.rotation ?? [0, 0, 0];
      for (const sx of [-1, 1])
        for (const sy of [-1, 1])
          for (const sz of [-1, 1]) {
            const c = rot([sx * h[0], sy * h[1], sz * h[2]], r);
            for (let k = 0; k < 3; k++) {
              const w = p.position[k] + c[k];
              if (w < lo[k]) lo[k] = w;
              if (w > hi[k]) hi[k] = w;
            }
          }
    }
    return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
  }

  it('never exceeds the data-sheet L x W x H', () => {
    const { size } = bbox();
    expect(size[0]).toBeLessThanOrEqual(ENGINE_LEN);
    expect(size[2]).toBeLessThanOrEqual(ENGINE_WIDTH);
    expect(size[1]).toBeLessThanOrEqual(ENGINE_HEIGHT);
  });

  it('fills most of that envelope, so the model is not a toy inside its own box', () => {
    const { size } = bbox();
    expect(size[0] / ENGINE_LEN).toBeGreaterThan(0.85);
    expect(size[2] / ENGINE_WIDTH).toBeGreaterThan(0.85);
    expect(size[1] / ENGINE_HEIGHT).toBeGreaterThan(0.85);
  });

  it('keeps the whole engine forward of the driving-end face', () => {
    expect(bbox().lo[0]).toBeGreaterThanOrEqual(0);
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
