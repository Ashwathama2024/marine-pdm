// engine3d/unit-models.ts — surface detail for the ECS control units.
//
// The ECS boxes were plain cuboids, which threw away everything that makes them recognisable: the
// MDEC castings are defined by their row of circular connectors, the LOP by its screen and keypad,
// the terminal box by its split lid. Each unit stays ONE clickable part — this only adds geometry
// inside it, so picking, colouring and the detail panel are untouched.
//
// Every offset is expressed as a fraction of the part's own size, so a unit can be resized or
// repositioned in topology.ts without any of this needing to follow.
//
// Shapes are read off the unit photographs in the ECS 8000 material. They are a likeness at the
// scale this model is viewed, not a reproduction of the castings.

import type { Vec3 } from './engine-layout';

export type UnitDetail =
  | 'mdec-ecu' // MDEC casting, six connectors down one long edge — ECU 4
  | 'mdec-emu' // MDEC casting, four connectors X5.1-X5.4 — EMU 2-I / 2-II
  | 'lop' // Blue panel: display, keypad, softkey row, emergency stop
  | 'meu' // Blue box, lid latches, side connectors
  | 'terminal' // CB-X11: wide box with a split lid
  | 'gcu' // Gearbox control unit: side connector blocks
  | 'cabinet'; // Control-room cabinet with a display window

export interface Prim {
  kind: 'box' | 'cylinder';
  /** Offset from the part centre, in metres. */
  pos: Vec3;
  /** box: [x,y,z] · cylinder: [radius, height, radius] */
  size: Vec3;
  rot?: Vec3;
}

const HALF_PI = Math.PI / 2;

/** Four mounting feet at the base corners, as every one of these castings has. */
function feet(sx: number, sy: number, sz: number, inset = 0.42): Prim[] {
  const out: Prim[] = [];
  for (const ex of [-1, 1]) {
    for (const ez of [-1, 1]) {
      out.push({
        kind: 'box',
        pos: [ex * sx * 0.5, -sy * 0.42, ez * sz * inset],
        size: [sx * 0.1, sy * 0.22, sz * 0.14],
      });
    }
  }
  return out;
}

/** A row of circular connectors protruding from one face. */
function connectorRow(
  count: number,
  axis: 'x' | 'z',
  face: number,
  spread: number,
  y: number,
  radius: number,
  length: number,
): Prim[] {
  const out: Prim[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..1
    out.push({
      kind: 'cylinder',
      pos: axis === 'z' ? [t * spread, y, face] : [face, y, t * spread],
      size: [radius, length, radius],
      // Cylinder axis is local Y; turn it onto the face normal.
      rot: axis === 'z' ? [HALF_PI, 0, 0] : [0, 0, HALF_PI],
    });
  }
  return out;
}

export function unitPrimitives(detail: UnitDetail, size: Vec3): Prim[] {
  const [sx, sy, sz] = size;

  switch (detail) {
    // ── MDEC castings ──────────────────────────────────────────────────────
    case 'mdec-ecu': {
      return [
        // Raised lid panel with its recessed border.
        { kind: 'box', pos: [0, sy * 0.46, 0], size: [sx * 0.74, sy * 0.2, sz * 0.8] },
        // Six connectors down the long (Z) edge, on the -X face.
        ...connectorRow(6, 'x', -sx * 0.5 - 0.028, sz * 0.34, -sy * 0.08, sy * 0.115, 0.056),
        ...feet(sx, sy, sz),
      ];
    }

    case 'mdec-emu': {
      return [
        { kind: 'box', pos: [0, sy * 0.46, 0], size: [sx * 0.76, sy * 0.22, sz * 0.74] },
        // X5.1 – X5.4 along the long (X) edge, on the -Z face.
        ...connectorRow(4, 'z', -sz * 0.5 - 0.026, sx * 0.32, -sy * 0.06, sy * 0.13, 0.052),
        ...feet(sx, sy, sz),
      ];
    }

    // ── Local operating panel ──────────────────────────────────────────────
    case 'lop': {
      const front = -sz * 0.5 - 0.012;
      const out: Prim[] = [
        // Display, upper left of the fascia.
        { kind: 'box', pos: [-sx * 0.17, sy * 0.2, front], size: [sx * 0.44, sy * 0.32, 0.02] },
      ];
      // Keypad block, upper right — 4 x 4.
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          out.push({
            kind: 'box',
            pos: [sx * (0.1 + c * 0.09), sy * (0.32 - r * 0.09), front],
            size: [sx * 0.06, sy * 0.05, 0.014],
          });
        }
      }
      // Softkey row along the bottom.
      for (let i = 0; i < 6; i++) {
        out.push({
          kind: 'box',
          pos: [sx * (-0.32 + i * 0.11), -sy * 0.3, front],
          size: [sx * 0.07, sy * 0.05, 0.014],
        });
      }
      // Emergency stop, bottom right.
      out.push({
        kind: 'cylinder',
        pos: [sx * 0.36, -sy * 0.3, front - 0.006],
        size: [sy * 0.045, 0.022, sy * 0.045],
        rot: [HALF_PI, 0, 0],
      });
      // Mounting brackets either side.
      for (const ex of [-1, 1]) {
        out.push({
          kind: 'box',
          pos: [ex * sx * 0.54, 0, sz * 0.2],
          size: [sx * 0.08, sy * 0.7, sz * 0.16],
        });
      }
      return out;
    }

    // ── Monitoring extension unit ──────────────────────────────────────────
    case 'meu': {
      return [
        // Lid seam across the top.
        { kind: 'box', pos: [0, sy * 0.44, 0], size: [sx * 0.92, sy * 0.1, sz * 0.9] },
        // Two lid latches.
        ...[-1, 1].map<Prim>(ex => ({
          kind: 'box',
          pos: [ex * sx * 0.3, sy * 0.52, 0],
          size: [sx * 0.16, sy * 0.09, sz * 0.5],
        })),
        ...connectorRow(3, 'z', -sz * 0.5 - 0.022, sx * 0.28, -sy * 0.16, sy * 0.09, 0.044),
        ...feet(sx, sy, sz),
      ];
    }

    // ── Terminal box X11 ───────────────────────────────────────────────────
    case 'terminal': {
      const front = -sz * 0.5 - 0.008;
      return [
        // Split lid — two doors with a gap between them.
        { kind: 'box', pos: [-sx * 0.24, 0, front], size: [sx * 0.44, sy * 0.82, 0.016] },
        { kind: 'box', pos: [sx * 0.24, 0, front], size: [sx * 0.44, sy * 0.82, 0.016] },
        // Maker's plate, lower right.
        { kind: 'box', pos: [sx * 0.34, -sy * 0.3, front - 0.006], size: [sx * 0.14, sy * 0.14, 0.01] },
        ...feet(sx, sy, sz, 0.38),
      ];
    }

    // ── Gearbox control unit ───────────────────────────────────────────────
    case 'gcu': {
      return [
        // Connector blocks on both flanks.
        ...[-1, 1].map<Prim>(ex => ({
          kind: 'box',
          pos: [ex * (sx * 0.5 + 0.04), -sy * 0.08, 0],
          size: [0.08, sy * 0.42, sz * 0.6],
        })),
        // Lid latches.
        ...[-1, 1].map<Prim>(ex => ({
          kind: 'box',
          pos: [ex * sx * 0.28, sy * 0.5, 0],
          size: [sx * 0.18, sy * 0.08, sz * 0.42],
        })),
        // Fascia panel.
        { kind: 'box', pos: [0, sy * 0.12, -sz * 0.5 - 0.01], size: [sx * 0.6, sy * 0.3, 0.018] },
        ...feet(sx, sy, sz),
      ];
    }

    // ── Control-room cabinet ───────────────────────────────────────────────
    case 'cabinet': {
      const front = -sz * 0.5 - 0.01;
      return [
        // Display window near the top.
        { kind: 'box', pos: [0, sy * 0.24, front], size: [sx * 0.56, sy * 0.24, 0.02] },
        // Instrument panel below it.
        { kind: 'box', pos: [0, -sy * 0.04, front], size: [sx * 0.38, sy * 0.12, 0.018] },
        // Door seam down the face.
        { kind: 'box', pos: [0, 0, front - 0.004], size: [sx * 0.02, sy * 0.86, 0.008] },
        ...feet(sx, sy, sz, 0.36),
      ];
    }
  }
}
