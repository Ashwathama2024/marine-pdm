// engine3d/topology.ts — the data contract behind the 3D view.
//
// THIS IS THE FILE TO EDIT when you have the real vessel drawings. Nothing in the scene is
// hard-coded against a mesh: parts and cables are read from the two registries below, so replacing a
// seeded cable row with a real one updates the 3D view with no code change.
//
// A part is only useful if a click on it resolves to something real, so every PartDef carries its
// domain bindings:
//   sensorTags      → SENSOR_META keys in services/sensor-map.ts (live value, baseline, history)
//   mtuDesignation  → the OEM sensor designation from packages/ingestion/src/tag-map.ts (B4.4, B57.11)
//   componentId     → DEGRADATION_COMPONENTS id in @marine-pdm/simulator (live severity)
//   dossierId       → DOSSIER_ENTRIES id in about/dossier-data.tsx (the descriptive prose)
//   instanceIndex   → position in the snapshot array (cylTemps 0-19, bearingTemps 0-10, tcSpeeds 0-3)
//
// PROVENANCE: every cable declares whether it came off a vessel drawing or was seeded by us as a
// placeholder. Seeded runs render dimmed and badged, so invented routing can never be mistaken for
// the real harness.

import { MTU8000 } from '@marine-pdm/shared';
import {
  bearingTransform,
  cylBank,
  cylinderTransform,
  manifoldTransform,
  tcTransform,
  type Vec3,
} from './engine-layout';

export type GeometryKind = 'cylinder' | 'box' | 'sphere' | 'torus' | 'capsule';

export interface PartDef {
  id: string;
  label: string;
  subassembly: string;
  /** Optional one-line note shown above the live reading. */
  note?: string;

  // ── Geometry (metres, frame defined in engine-layout.ts) ──
  kind: GeometryKind;
  position: Vec3;
  rotation?: Vec3;
  /** cylinder: [radius, height, radius] · box: [x,y,z] · sphere: [r,,] · torus: [radius, tube,] */
  size: Vec3;
  /** Reserved: the mesh name to bind to if a real .glb is dropped in later. */
  glbNodeName?: string;

  // ── Domain bindings ──
  sensorTags: string[];
  mtuDesignation?: string;
  componentId?: string;
  dossierId?: string;
  instanceIndex?: number;
}

export interface CableDef {
  /** Your cable number. Seeded placeholders use the SEED- prefix. */
  cableNo: string;
  from: { partId: string; terminal?: string };
  to: { partId: string; terminal?: string };
  kind: 'signal' | 'power' | 'can' | 'fibre';
  cores?: number;
  gauge?: string;
  /** Intermediate routing points; a straight run is drawn if omitted. */
  waypoints?: Vec3[];
  provenance: 'seed' | 'vessel';
}

export interface Subassembly {
  id: string;
  label: string;
  /** Order the fly-through walks them in. */
  order: number;
}

export const SUBASSEMBLIES: Subassembly[] = [
  { id: 'bank.A', label: 'A-Bank', order: 1 },
  { id: 'bank.B', label: 'B-Bank', order: 2 },
  { id: 'crankshaft', label: 'Crankshaft & Bearings', order: 3 },
  { id: 'turbo', label: 'Turbochargers', order: 4 },
  { id: 'exhaust', label: 'Exhaust Manifolds', order: 5 },
  { id: 'cooling', label: 'Cooling', order: 6 },
  { id: 'lube', label: 'Lube Oil', order: 7 },
  { id: 'fuel', label: 'Fuel', order: 8 },
  { id: 'harness', label: 'Sensor Harness', order: 9 },
];

// ── Generated parts ───────────────────────────────────────────────────────────
// Counts and names come from MTU8000, so they cannot drift from the physics.

const cylinders: PartDef[] = MTU8000.CYL_NAMES.map((name, i) => {
  const t = cylinderTransform(i);
  return {
    id: `cyl.${name}`,
    label: `Cylinder ${name}`,
    subassembly: `bank.${cylBank(i)}`,
    kind: 'cylinder' as const,
    position: t.position,
    rotation: t.rotation,
    size: [0.132, 0.46, 0.132] as Vec3,
    sensorTags: ['ME.ExhaustTemp'],
    mtuDesignation: `B4.${i + 1}`,
    componentId: 'injectors',
    dossierId: 'dossier-cylinders',
    instanceIndex: i,
  };
});

const bearings: PartDef[] = Array.from({ length: 11 }, (_, i) => {
  const t = bearingTransform(i);
  return {
    id: `bearing.${i + 1}`,
    label: `Main Bearing ${i + 1}`,
    subassembly: 'crankshaft',
    note: i === 10 ? 'Free end (KGS) — runs hottest, carries the position bias' : undefined,
    kind: 'torus' as const,
    position: t.position,
    rotation: t.rotation,
    size: [0.2, 0.05, 0] as Vec3,
    sensorTags: ['ME.BearingTemp'],
    mtuDesignation: `B57.${i + 1}`,
    componentId: 'bearings',
    dossierId: 'dossier-bearings',
    instanceIndex: i,
  };
});

// tcSpeeds[] order is 0=A1, 1=A2, 2=B1, 3=B2 — mirrors TC_META in dashboard/TurbochargerPanel.tsx.
const TC_SPEC = [
  { name: 'A1', desig: 'B44.1', note: '3rd — switchable, cuts in at 850 rpm' },
  { name: 'A2', desig: 'B44.2', note: '1st — basic, always running' },
  { name: 'B1', desig: 'B44.11', note: '4th — switchable, cuts in at 1000 rpm' },
  { name: 'B2', desig: 'B44.12', note: '2nd — basic, always running' },
];

const turbos: PartDef[] = TC_SPEC.map((tc, i) => {
  const t = tcTransform(i);
  return {
    id: `tc.${tc.name}`,
    label: `Turbocharger ${tc.name}`,
    subassembly: 'turbo',
    note: tc.note,
    kind: 'cylinder' as const,
    position: t.position,
    rotation: t.rotation,
    size: [0.26, 0.44, 0.26] as Vec3,
    sensorTags: ['ME.TCSpeed'],
    mtuDesignation: tc.desig,
    componentId: 'turbocharger',
    dossierId: 'dossier-turbo',
    instanceIndex: i,
  };
});

const manifolds: PartDef[] = (['A', 'B'] as const).map(bank => {
  const t = manifoldTransform(bank);
  return {
    id: `manifold.${bank}`,
    label: `${bank}-Bank Exhaust Manifold`,
    subassembly: 'exhaust',
    kind: 'box' as const,
    position: t.position,
    rotation: t.rotation,
    size: t.size,
    sensorTags: ['ME.ExhaustTemp'],
    mtuDesignation: 'B4.30',
    dossierId: 'dossier-exhaust',
  };
});

// ── Hand-placed parts ─────────────────────────────────────────────────────────
// Positions here are our best reading of a 20V 8000 layout and are the first thing the reference
// photographs should correct. Domain bindings are exact.

const ancillaries: PartDef[] = [
  {
    id: 'cooler.ht',
    label: 'HT Cooler',
    subassembly: 'cooling',
    kind: 'box',
    position: [1.55, 0.12, -1.18],
    size: [1.0, 0.42, 0.3],
    sensorTags: ['ME.JacketCoolingOutlet'],
    mtuDesignation: 'B6.1',
    componentId: 'ht_cooler',
    dossierId: 'dossier-coolant',
  },
  {
    id: 'cooler.charge',
    label: 'Charge-Air Cooler',
    subassembly: 'cooling',
    kind: 'box',
    position: [2.85, 0.12, -1.18],
    size: [0.9, 0.42, 0.3],
    sensorTags: ['ME.ChargeAirTemp'],
    mtuDesignation: 'B9',
    dossierId: 'dossier-chargeair',
  },
  {
    id: 'lube.module',
    label: 'Lube Oil Module',
    subassembly: 'lube',
    note: 'Pump, filter and cooler — B5.1 main gallery, B5.2 after filter',
    kind: 'box',
    position: [0.85, -0.2, 1.18],
    size: [0.85, 0.5, 0.3],
    sensorTags: ['ME.LubeOilPressure'],
    mtuDesignation: 'B5.1',
    componentId: 'lube_system',
    dossierId: 'dossier-lube',
  },
  {
    id: 'lube.filter',
    label: 'LO Filter (ΔP)',
    subassembly: 'lube',
    kind: 'cylinder',
    position: [1.85, -0.2, 1.18],
    size: [0.16, 0.4, 0.16],
    sensorTags: ['ME.LOFilterDP'],
    mtuDesignation: 'B5.3/B5.4',
    componentId: 'lube_system',
    dossierId: 'dossier-lube',
  },
  {
    id: 'fuel.rail.A',
    label: 'A-Bank Fuel Rail',
    subassembly: 'fuel',
    kind: 'cylinder',
    position: [2.0, 0.78, -0.3],
    rotation: [0, 0, Math.PI / 2],
    size: [0.05, 3.4, 0.05],
    sensorTags: ['ME.FuelRailPressure'],
    mtuDesignation: 'B48',
    dossierId: 'dossier-fuelrail',
  },
  {
    id: 'fuel.rail.B',
    label: 'B-Bank Fuel Rail',
    subassembly: 'fuel',
    kind: 'cylinder',
    position: [2.0, 0.78, 0.3],
    rotation: [0, 0, Math.PI / 2],
    size: [0.05, 3.4, 0.05],
    sensorTags: ['ME.FuelRailPressure'],
    mtuDesignation: 'B48',
    dossierId: 'dossier-fuelrail',
  },
  {
    id: 'jbox.A',
    label: 'A-Side Junction Box',
    subassembly: 'harness',
    note: 'Placeholder position — awaiting vessel drawing',
    kind: 'box',
    position: [1.9, 1.2, -0.98],
    size: [0.26, 0.3, 0.16],
    sensorTags: [],
  },
  {
    id: 'jbox.B',
    label: 'B-Side Junction Box',
    subassembly: 'harness',
    note: 'Placeholder position — awaiting vessel drawing',
    kind: 'box',
    position: [1.9, 1.2, 0.98],
    size: [0.26, 0.3, 0.16],
    sensorTags: [],
  },
  {
    id: 'ecu.8',
    label: 'ECU-8 Engine Control Unit',
    subassembly: 'harness',
    note: 'Aggregates the 52-tag namespace and publishes it on CAN',
    kind: 'box',
    position: [0.2, 1.35, 0],
    size: [0.42, 0.3, 0.5],
    sensorTags: [],
  },
  {
    id: 'ipms',
    label: 'IPMS / Bridge Interface',
    subassembly: 'harness',
    note: 'Off-engine. This system reads the OPC-UA namespace from here',
    kind: 'box',
    position: [-1.5, 1.5, 0],
    size: [0.4, 0.5, 0.4],
    sensorTags: [],
  },
];

export const PARTS: PartDef[] = [
  ...cylinders,
  ...bearings,
  ...turbos,
  ...manifolds,
  ...ancillaries,
];

// ── Cable registry ────────────────────────────────────────────────────────────
// PASTE YOUR CABLE SCHEDULE HERE. Set provenance:'vessel' on real rows and they stop rendering
// dimmed. The chain below is the shape the harness takes — sensor → junction box → ECU → IPMS —
// with only three of the ~52 sensor drops drawn, as an example of the pattern.

export const CABLES: CableDef[] = [
  {
    cableNo: 'SEED-001',
    from: { partId: 'cyl.A4', terminal: 'B4.4' },
    to: { partId: 'jbox.A' },
    kind: 'signal',
    cores: 2,
    provenance: 'seed',
  },
  {
    cableNo: 'SEED-002',
    from: { partId: 'bearing.7', terminal: 'B57.7' },
    to: { partId: 'jbox.B' },
    kind: 'signal',
    cores: 2,
    provenance: 'seed',
  },
  {
    cableNo: 'SEED-003',
    from: { partId: 'tc.A1', terminal: 'B44.1' },
    to: { partId: 'jbox.A' },
    kind: 'signal',
    cores: 3,
    provenance: 'seed',
  },
  {
    cableNo: 'SEED-004',
    from: { partId: 'jbox.A' },
    to: { partId: 'ecu.8' },
    kind: 'can',
    provenance: 'seed',
  },
  {
    cableNo: 'SEED-005',
    from: { partId: 'jbox.B' },
    to: { partId: 'ecu.8' },
    kind: 'can',
    provenance: 'seed',
  },
  {
    cableNo: 'SEED-006',
    from: { partId: 'ecu.8' },
    to: { partId: 'ipms' },
    kind: 'can',
    provenance: 'seed',
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────────

const BY_ID = new Map(PARTS.map(p => [p.id, p]));

export function getPart(id: string): PartDef | null {
  return BY_ID.get(id) ?? null;
}

export function partsIn(subassemblyId: string): PartDef[] {
  return PARTS.filter(p => p.subassembly === subassemblyId);
}

/** Every cable touching a part, either end. */
export function cablesTouching(partId: string): CableDef[] {
  return CABLES.filter(c => c.from.partId === partId || c.to.partId === partId);
}
