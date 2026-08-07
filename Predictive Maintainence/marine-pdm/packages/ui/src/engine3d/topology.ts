// engine3d/topology.ts — the data contract behind the 3D view.
//
// THIS IS THE FILE TO EDIT when you have the real vessel drawings. Nothing in the scene is
// hard-coded against a mesh: parts and cables are read from the two registries below, so replacing a
// seeded cable row with a real one updates the 3D view with no code change.
//
// Designations and part inventory follow MS15082/00E "Sensors and actuators 20V - Overview"
// (drawings TD0000012614 left side, TD0000012616 right side, TD0000012620 top, TD0000012618 free
// end). That manual lists 85 sensors and actuators across the four views; the parts below carry the
// ones with a live tag in this system, plus the structural assemblies needed for the engine to read
// as itself. Positions are proportional readings of those drawings, not surveyed points.
//
// A part is only useful if a click on it resolves to something real, so every PartDef carries its
// domain bindings:
//   sensorTags      → SENSOR_META keys in services/sensor-map.ts (live value, baseline, history)
//   mtuDesignation  → the OEM designation from the manual above (B4A4, B57.11, B44.1)
//   componentId     → DEGRADATION_COMPONENTS id in @marine-pdm/simulator (live severity)
//   dossierId       → DOSSIER_ENTRIES id in about/dossier-data.tsx (the descriptive prose)
//   instanceIndex   → position in the snapshot array (cylTemps 0-19, bearingTemps 0-10, tcSpeeds 0-3)
//
// PROVENANCE: every cable declares whether it came off a vessel drawing or was seeded by us as a
// placeholder. Seeded runs render dimmed and badged, so invented routing can never be mistaken for
// the real harness.

import { MTU8000 } from '@marine-pdm/shared';
import {
  BANK_MID_X,
  BLOCK_END_X,
  BLOCK_START_X,
  bearingTransform,
  chargeDuctTransform,
  cylBank,
  cylNumber,
  cylinderTransform,
  headTransform,
  manifoldTransform,
  tcTransform,
  deckSeatY,
  type Vec3,
} from './engine-layout';
import type { UnitDetail } from './unit-models';

export type GeometryKind = 'cylinder' | 'box' | 'sphere' | 'torus' | 'capsule';

/**
 * Rotation driven by a live signal. `axis` is the part's LOCAL axis after its own rotation is
 * applied — a CylinderGeometry spins about local Y, a TorusGeometry about local Z.
 *
 * Rate is proportional to the real reading but scaled down for visibility: 1150 rpm is 19 rev/s and
 * a turbocharger at 28 000 rpm is 467 rev/s, both of which are a strobing blur at 60 fps. The HUD
 * says so rather than implying the rotation is real-time.
 */
export interface PartMotion {
  axis: 'x' | 'y' | 'z';
  source: 'rpm' | 'tcSpeed';
}

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
  /**
   * Surface detail for a control unit — connectors, lid, keypad. Adds geometry inside the part; it
   * stays one clickable thing. See unit-models.ts.
   */
  detail?: UnitDetail;

  // ── Domain bindings ──
  sensorTags: string[];
  mtuDesignation?: string;
  componentId?: string;
  dossierId?: string;
  instanceIndex?: number;
  motion?: PartMotion;
  /** ECS 8000 CAN node number, where the unit is a node on the field buses. */
  nodeNo?: number;
  /**
   * Sits outside the engine's published envelope — control-room and engine-room cabinets. Excluded
   * from the envelope guard, which measures the ENGINE, not the installation around it.
   */
  offEngine?: boolean;
  /**
   * This part geometrically contains others (a housing, a casing, the crankcase). Enclosures are
   * drawn as an open boundary rather than a solid, and they never steal a click from the part
   * inside them — see resolvePick in Parts.tsx.
   */
  enclosure?: boolean;
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
  /** Dock label. The full `label` still shows in the tooltip and the detail panel. */
  short: string;
  /** Order the fly-through walks them in. */
  order: number;
}

export const SUBASSEMBLIES: Subassembly[] = [
  { id: 'bank.A', label: 'A-Bank', short: 'A-Bank', order: 1 },
  { id: 'bank.B', label: 'B-Bank', short: 'B-Bank', order: 2 },
  { id: 'crankshaft', label: 'Crankshaft & Bearings', short: 'Crankshaft', order: 3 },
  { id: 'turbo', label: 'Turbochargers', short: 'Turbos', order: 4 },
  { id: 'exhaust', label: 'Exhaust', short: 'Exhaust', order: 5 },
  { id: 'chargeair', label: 'Charge Air', short: 'Charge Air', order: 6 },
  { id: 'cooling', label: 'Cooling', short: 'Cooling', order: 7 },
  { id: 'lube', label: 'Lube Oil', short: 'Lube Oil', order: 8 },
  { id: 'fuel', label: 'Fuel', short: 'Fuel', order: 9 },
  { id: 'geartrain', label: 'Free-End Gear Train', short: 'Gear Train', order: 10 },
  { id: 'structure', label: 'Block & Structure', short: 'Structure', order: 11 },
  { id: 'control', label: 'ECU / EMU', short: 'ECU / EMU', order: 12 },
  { id: 'harness', label: 'ECS 8000 Network', short: 'Network', order: 13 },
];

/** OEM exhaust-probe designation for a cylinder: B4 + bank + number, e.g. B4A4, B4B10. */
export function exhaustDesignation(i: number): string {
  return `B4${cylBank(i)}${cylNumber(i)}`;
}

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
    mtuDesignation: exhaustDesignation(i),
    componentId: 'injectors',
    dossierId: 'dossier-cylinders',
    instanceIndex: i,
  };
});

// The row of heads is what makes the side elevation recognisable, and it is where the B4xN exhaust
// probe actually sits — so a head reads the same tag and index as the cylinder under it.
const heads: PartDef[] = MTU8000.CYL_NAMES.map((name, i) => {
  const t = headTransform(i);
  return {
    id: `head.${name}`,
    label: `Cylinder Head ${name}`,
    subassembly: `bank.${cylBank(i)}`,
    note: `Carries the ${exhaustDesignation(i)} exhaust probe and the ${name} injector`,
    kind: 'box' as const,
    position: t.position,
    rotation: t.rotation,
    size: [0.4, 0.34, 0.42] as Vec3,
    sensorTags: ['ME.ExhaustTemp'],
    mtuDesignation: exhaustDesignation(i),
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
    note:
      i === 0
        ? 'Driving end (KS)'
        : i === 10
          ? 'Free end (KGS) — runs hottest, carries the position bias'
          : undefined,
    kind: 'torus' as const,
    position: t.position,
    rotation: t.rotation,
    size: [0.22, 0.055, 0] as Vec3,
    sensorTags: ['ME.BearingTemp'],
    mtuDesignation: `B57.${i + 1}`,
    componentId: 'bearings',
    dossierId: 'dossier-bearings',
    instanceIndex: i,
  };
});

// tcSpeeds[] order is 0=A1, 1=A2, 2=B1, 3=B2 — mirrors TC_META in dashboard/TurbochargerPanel.tsx.
// Designations and the control solenoids come from the top view.
const TC_SPEC = [
  { name: 'A1', desig: 'B44.1', note: '3rd — switchable, cuts in at 850 rpm (solenoid Y26)' },
  { name: 'A2', desig: 'B44.2', note: '1st — basic, always running' },
  { name: 'B1', desig: 'B44.11', note: '4th — switchable, cuts in at 1000 rpm (solenoid Y29)' },
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
    size: [0.3, 0.56, 0.3] as Vec3,
    sensorTags: ['ME.TCSpeed'],
    mtuDesignation: tc.desig,
    componentId: 'turbocharger',
    dossierId: 'dossier-turbo',
    instanceIndex: i,
    motion: { axis: 'y', source: 'tcSpeed' }, // CylinderGeometry spins about its local Y
  };
});

const manifolds: PartDef[] = (['A', 'B'] as const).map(bank => {
  const t = manifoldTransform(bank);
  return {
    id: `manifold.${bank}`,
    label: `${bank}-Bank Exhaust Manifold`,
    subassembly: 'exhaust',
    note: 'Runs inboard in the V-valley, feeding forward to the turbochargers',
    kind: 'box' as const,
    position: t.position,
    rotation: t.rotation,
    size: t.size,
    sensorTags: ['ME.ExhaustTemp'],
    dossierId: 'dossier-exhaust',
  };
});

const chargeDucts: PartDef[] = (['A', 'B'] as const).map(bank => {
  const t = chargeDuctTransform(bank);
  return {
    id: `charge.duct.${bank}`,
    label: `${bank}-Bank Charge-Air Duct`,
    subassembly: 'chargeair',
    note: 'Cold side, outboard — the widest structure on the engine',
    kind: 'box' as const,
    position: t.position,
    rotation: t.rotation,
    size: t.size,
    sensorTags: ['ME.ScavengeAirPressure'],
    mtuDesignation: 'B10',
    dossierId: 'dossier-chargeair',
  };
});

const chargeCoolers: PartDef[] = (['A', 'B'] as const).map(bank => ({
  id: `cooler.charge.${bank}`,
  label: `${bank}-Bank Charge-Air Cooler`,
  subassembly: 'chargeair',
  kind: 'box' as const,
  position: [1.15, 0.5, bank === 'A' ? -0.86 : 0.86] as Vec3,
  size: [0.8, 0.62, 0.5] as Vec3,
  sensorTags: ['ME.ChargeAirTemp'],
  mtuDesignation: 'B9',
  dossierId: 'dossier-chargeair',
}));

// ── Driving end (KS) — flywheel, turbocharger group, exhaust outlet ──────────

const drivingEnd: PartDef[] = [
  {
    id: 'tc.module',
    label: 'Turbocharger Module',
    subassembly: 'turbo',
    note: 'The driving-end assembly carrying all four turbochargers, their volutes and the intakes',
    kind: 'box',
    position: [0.72, 1.12, 0],
    size: [1.24, 1.88, 1.84],
    enclosure: true,
    sensorTags: ['ME.TCSpeed'],
    componentId: 'turbocharger',
    dossierId: 'dossier-turbo',
  },
  {
    id: 'flywheel',
    label: 'Flywheel / Output Coupling',
    subassembly: 'structure',
    note: 'Driving end (KS) — cylinder 1, bearing 1 and all four turbochargers are this end',
    kind: 'torus',
    position: [0.22, 0, 0],
    rotation: [0, Math.PI / 2, 0],
    size: [0.55, 0.11, 0],
    sensorTags: [],
    motion: { axis: 'z', source: 'rpm' }, // TorusGeometry spins about its local Z
  },
  {
    id: 'exhaust.outlet',
    label: 'Exhaust Collector / Outlet',
    subassembly: 'exhaust',
    note: 'B4.30 exhaust bulk temperature and B41.1 exhaust pressure after turbocharger',
    kind: 'box',
    position: [0.55, 2.0, 0],
    size: [0.7, 0.45, 0.9],
    sensorTags: ['ME.ExhaustTemp'],
    mtuDesignation: 'B4.30 / B41.1',
    dossierId: 'dossier-exhaust',
  },
  {
    id: 'intake.A',
    label: 'A-Side Air Intake',
    subassembly: 'chargeair',
    note: 'B3 intake air temperature, B10.2 intake air pressure',
    kind: 'cylinder',
    position: [1.18, 1.82, -0.62],
    size: [0.24, 0.5, 0.24],
    sensorTags: [],
    mtuDesignation: 'B3 / B10.2',
  },
  {
    id: 'intake.B',
    label: 'B-Side Air Intake',
    subassembly: 'chargeair',
    kind: 'cylinder',
    position: [1.18, 1.82, 0.62],
    size: [0.24, 0.5, 0.24],
    sensorTags: [],
    mtuDesignation: 'B3 / B10.2',
  },
];

// ── Free end (KGS) — gear train and the pumps it drives ─────────────────────
// Every item here is listed in the manual's free-end view, which is what settles the engine's
// orientation: no turbocharger appears in it.

const freeEnd: PartDef[] = [
  {
    id: 'gear.housing',
    label: 'Free-End Housing',
    subassembly: 'geartrain',
    note: 'Encloses the gear train and the pumps it drives',
    kind: 'box',
    position: [6.34, 0.25, 0],
    size: [0.52, 2.0, 1.5],
    enclosure: true,
    sensorTags: [],
  },
  {
    id: 'gear.cover',
    label: 'Free-End Gear Train Cover',
    subassembly: 'geartrain',
    note: 'Drives the coolant, raw-water and HP fuel pumps. B1 camshaft speed is taken here',
    kind: 'cylinder',
    position: [6.28, 0, 0],
    rotation: [0, 0, Math.PI / 2],
    size: [0.45, 0.3, 0.45],
    sensorTags: [],
    mtuDesignation: 'B1',
    motion: { axis: 'y', source: 'rpm' },
  },
  {
    id: 'pump.hp.A',
    label: 'HP Fuel Pump A',
    subassembly: 'fuel',
    kind: 'cylinder',
    position: [6.3, 0.75, -0.45],
    size: [0.15, 0.36, 0.15],
    sensorTags: ['ME.FuelRailPressure'],
    mtuDesignation: 'M8.1',
    dossierId: 'dossier-fuelrail',
  },
  {
    id: 'pump.hp.B',
    label: 'HP Fuel Pump B',
    subassembly: 'fuel',
    kind: 'cylinder',
    position: [6.3, 0.75, 0.45],
    size: [0.15, 0.36, 0.15],
    sensorTags: ['ME.FuelRailPressure'],
    mtuDesignation: 'M8.2',
    dossierId: 'dossier-fuelrail',
  },
  {
    id: 'pump.coolant',
    label: 'Coolant Pump',
    subassembly: 'cooling',
    note: 'B16.1 coolant pressure after pump, B6.3 coolant temperature before engine',
    kind: 'cylinder',
    position: [6.32, -0.55, -0.42],
    size: [0.17, 0.34, 0.17],
    sensorTags: ['ME.JacketCoolingOutlet'],
    mtuDesignation: 'B16.1 / B6.3',
    componentId: 'ht_cooler',
    dossierId: 'dossier-coolant',
  },
  {
    id: 'pump.rawwater',
    label: 'Raw-Water Pump',
    subassembly: 'cooling',
    note: 'B21 raw-water pressure after pump — the sea-water side of the heat exchanger',
    kind: 'cylinder',
    position: [6.32, -0.55, 0.42],
    size: [0.17, 0.34, 0.17],
    sensorTags: [],
    mtuDesignation: 'B21',
  },
  {
    id: 'fuel.filter',
    label: 'Fuel Filter Module',
    subassembly: 'fuel',
    note: 'B34.1 pressure before filter, B34.2 after — the pair gives filter ΔP',
    kind: 'box',
    // Dropped inside the free-end housing to clear the ECU/EMU row now sat on its top edge.
    position: [6.34, 0.72, 0],
    size: [0.35, 0.42, 0.5],
    sensorTags: [],
    mtuDesignation: 'B34.1 / B34.2',
  },
];

// ── Along the block ──────────────────────────────────────────────────────────

const ancillaries: PartDef[] = [
  {
    id: 'crankcase',
    label: 'Crankcase',
    subassembly: 'structure',
    note: 'B50 crankcase pressure',
    kind: 'box',
    position: [(BLOCK_START_X + BLOCK_END_X) / 2, -0.05, 0],
    size: [BLOCK_END_X - BLOCK_START_X, 0.85, 1.45],
    enclosure: true, // the 11 main bearings sit inside it
    sensorTags: [],
    mtuDesignation: 'B50',
    dossierId: 'dossier-crankcase',
  },
  {
    id: 'oilpan',
    label: 'Oil Pan / Sump',
    subassembly: 'structure',
    note: 'Two level sensors — B24.1 in pan 1 (A-side), B24.2 in pan 2 (B-side)',
    kind: 'box',
    position: [(BLOCK_START_X + BLOCK_END_X) / 2, -0.62, 0],
    size: [BLOCK_END_X - BLOCK_START_X - 0.2, 0.76, 1.25],
    sensorTags: [],
    mtuDesignation: 'B24.1 / B24.2',
    componentId: 'lube_system',
    dossierId: 'dossier-lube',
  },
  {
    id: 'cooler.ht',
    label: 'HT Cooler',
    subassembly: 'cooling',
    note: 'B6.2 coolant temperature after engine',
    kind: 'box',
    position: [3.2, -0.38, -0.96],
    size: [1.3, 0.5, 0.32],
    sensorTags: ['ME.JacketCoolingOutlet'],
    mtuDesignation: 'B6.2',
    componentId: 'ht_cooler',
    dossierId: 'dossier-coolant',
  },
  {
    id: 'air.start',
    label: 'Starting-Air System',
    subassembly: 'structure',
    note: 'B19 starting-air pressure, S37 start interlock for turning gear',
    kind: 'cylinder',
    position: [1.9, -0.3, -0.96],
    size: [0.16, 0.5, 0.16],
    sensorTags: [],
    mtuDesignation: 'B19 / S37',
  },
  {
    id: 'lube.module',
    label: 'Lube Oil Module',
    subassembly: 'lube',
    note: 'B5.1 before filter, B5.5 after filter, B7 oil temperature before engine',
    kind: 'box',
    position: [2.6, -0.5, 0.96],
    size: [1.2, 0.5, 0.32],
    sensorTags: ['ME.LubeOilPressure'],
    mtuDesignation: 'B5.1',
    componentId: 'lube_system',
    dossierId: 'dossier-lube',
  },
  {
    id: 'lube.filter',
    label: 'LO Filter (ΔP)',
    subassembly: 'lube',
    note: 'Differential across B5.1 (before) and B5.5 (after)',
    kind: 'cylinder',
    position: [4.1, -0.45, 0.94],
    size: [0.18, 0.44, 0.18],
    sensorTags: ['ME.LOFilterDP'],
    mtuDesignation: 'B5.1 / B5.5',
    componentId: 'lube_system',
    dossierId: 'dossier-lube',
  },
  {
    id: 'lube.lastbearing',
    label: 'Last-Bearing Oil Gallery',
    subassembly: 'lube',
    note: 'B5.3 and B5.4 — the end of the gallery, where pressure is lowest',
    kind: 'cylinder',
    position: [5.75, -0.3, -0.96],
    size: [0.12, 0.4, 0.12],
    sensorTags: ['ME.LubeOilPressure.LastBearing'],
    mtuDesignation: 'B5.3 / B5.4',
    componentId: 'lube_system',
    dossierId: 'dossier-lube',
  },
  {
    id: 'fuel.rail.A',
    label: 'A-Bank Fuel Rail',
    subassembly: 'fuel',
    kind: 'cylinder',
    position: [BANK_MID_X, 0.72, -0.62],
    rotation: [0, 0, Math.PI / 2],
    size: [0.05, 4.7, 0.05],
    sensorTags: ['ME.FuelRailPressure'],
    mtuDesignation: 'B48',
    dossierId: 'dossier-fuelrail',
  },
  {
    id: 'fuel.rail.B',
    label: 'B-Bank Fuel Rail',
    subassembly: 'fuel',
    kind: 'cylinder',
    position: [BANK_MID_X, 0.72, 0.62],
    rotation: [0, 0, Math.PI / 2],
    size: [0.05, 4.7, 0.05],
    sensorTags: ['ME.FuelRailPressure'],
    mtuDesignation: 'B48',
    dossierId: 'dossier-fuelrail',
  },
  // ── ECS 8000 units, per the Rolls-Royce/MTU system overview ────────────────
  // Node numbers and roles are from the ECS 8000 deck. The two invented junction boxes that used to
  // sit here were wrong: the real installation has ONE terminal box, CB-X11.
  {
    id: 'ecu4',
    label: 'ECU 4 — Engine Control Unit',
    subassembly: 'control',
    note: 'Node 2. Mounted on the free-end housing. Governs injection, cylinder cutout and the turbocharger cut-in solenoids',
    kind: 'box',
    // Sat on the top edge of the free-end housing (top face y=1.25, x 6.08-6.60), long axis across
    // the engine so the three units sit in a row without overhanging the published 6622 mm length.
    position: [6.34, 1.37, 0],
    size: [0.46, 0.24, 0.62],
    sensorTags: [],
    nodeNo: 2,
    detail: 'mdec-ecu',
  },
  {
    id: 'emu2.1',
    label: 'EMU 2-I — Engine Monitoring Unit',
    subassembly: 'control',
    note: 'Node 3. On the free-end housing, A-side. X5.1 carries the 20 exhaust-temperature probes; X5.2/X5.3 the rest; X5.4 to X11',
    kind: 'box',
    position: [6.34, 1.35, -0.52],
    size: [0.42, 0.2, 0.34],
    sensorTags: ['ME.ExhaustTemp'],
    nodeNo: 3,
    detail: 'mdec-emu',
  },
  {
    id: 'emu2.2',
    label: 'EMU 2-II — Engine Monitoring Unit',
    subassembly: 'control',
    note: 'Node 10. On the free-end housing, B-side. X5.3 carries the spray-oil temperature sensors; X5.4 to X11',
    kind: 'box',
    position: [6.34, 1.35, 0.52],
    size: [0.42, 0.2, 0.34],
    sensorTags: [],
    nodeNo: 10,
    detail: 'mdec-emu',
  },
  {
    id: 'cb.x11',
    label: 'CB-X11 — Terminal Box',
    subassembly: 'harness',
    note: 'Emergency air-shutoff flaps (SSK), EMU 2-I and 2-II, LPU, PPC, engine-room sensors',
    kind: 'box',
    position: [3.6, deckSeatY(0.3), -2.05],
    size: [0.62, 0.3, 0.4],
    sensorTags: [],
    detail: 'terminal',
    offEngine: true,
  },
  {
    id: 'lop8',
    label: 'LOP 8 — Local Operating Panel',
    subassembly: 'harness',
    note: 'Nodes 4 (Display 13) and 5 (MPU-29). Engine-room local monitoring and control',
    kind: 'box',
    // Past the free end and on the engine-room line with the other cabinets, standing on the deck —
    // which is what makes it read as engine-room equipment rather than something bolted to the
    // engine. It used to be at y=2.3, level with the top of the block and supported by nothing.
    position: [7.6, deckSeatY(0.6), -2.05],
    size: [0.5, 0.6, 0.34],
    sensorTags: [],
    nodeNo: 4,
    detail: 'lop',
    offEngine: true,
  },
  {
    id: 'meu1',
    label: 'MEU 1 — Monitoring Extension Unit',
    subassembly: 'harness',
    note: 'Node 6 (SAM). Redundant gearbox signals and plant I/O',
    kind: 'box',
    position: [-0.4, deckSeatY(0.42), -2.05],
    size: [0.5, 0.42, 0.34],
    sensorTags: [],
    nodeNo: 6,
    detail: 'meu',
    offEngine: true,
  },
  {
    id: 'gcu6',
    label: 'GCU 6 — Gearbox Control Unit',
    subassembly: 'harness',
    note: 'Node 7 (MPU-29). Gearbox state and actuators; trips alarms or an engine stop',
    kind: 'box',
    position: [5.5, deckSeatY(0.55), -2.05],
    size: [0.5, 0.55, 0.36],
    sensorTags: [],
    nodeNo: 7,
    detail: 'gcu',
    offEngine: true,
  },
  {
    id: 'mcs',
    label: 'Customer MCS',
    subassembly: 'harness',
    note: 'Control room. RS422 serial on PIM 5, parallel instruments and push buttons on PIM 3',
    kind: 'box',
    position: [3.3, deckSeatY(0.72), -2.05],
    size: [0.5, 0.72, 0.36],
    sensorTags: [],
    detail: 'cabinet',
    offEngine: true,
  },
];

export const PARTS: PartDef[] = [
  ...cylinders,
  ...heads,
  ...bearings,
  ...turbos,
  ...manifolds,
  ...chargeDucts,
  ...chargeCoolers,
  ...drivingEnd,
  ...freeEnd,
  ...ancillaries,
];

// ── Cable registry ────────────────────────────────────────────────────────────
// Real runs, from the ECS 8000 system overview and the EMU 2 connector detail. Nothing here is
// invented any more, so every row is provenance:'vessel' and none render dimmed.
//
// The routing that matters: the twenty exhaust probes do NOT fan out to per-bank junction boxes
// (that was our guess) — they all land on EMU 2-I connector X5.1. Spray-oil temperatures go to
// EMU 2-II on X5.3. Both units take power and CAN from terminal box X11 on X5.4.

/** X5.1 — the 20-way exhaust-temperature loom into EMU 2-I. */
const exhaustHarness: CableDef[] = MTU8000.CYL_NAMES.map((name, i) => ({
  cableNo: `X5.1/${exhaustDesignation(i)}`,
  from: { partId: `head.${name}`, terminal: exhaustDesignation(i) },
  to: { partId: 'emu2.1', terminal: 'X5.1' },
  kind: 'signal' as const,
  cores: 2,
  provenance: 'vessel' as const,
}));

/**
 * X5.3 — the eleven crankshaft bearing PT1000s into EMU 2-I.
 *
 * From MTU drawing XZ00E50000106 ("SM MOTORVERKABELUNG / EMU-STECKER X5.3"), sheet 3: each bearing
 * is a two-wire PT1000 reading −25…200 °C on a GND/TEn + IN/TEn pin pair. The first three pairs are
 * transcribed below because they were read directly; the rest of the block continues on sheet 4 and
 * carries the connector only. Terminals name what was actually seen — a pin number nobody has
 * verified is worse than no pin number.
 */
const BEARING_PIN_PAIRS: Record<number, string> = { 1: 'NN/PP', 2: 'LL/MM', 3: 'JJ/KK' };

const bearingHarness: CableDef[] = Array.from({ length: 11 }, (_, i) => {
  const n = i + 1;
  const pins = BEARING_PIN_PAIRS[n];
  return {
    cableNo: `X5.3/B57.${n}`,
    from: { partId: `bearing.${n}`, terminal: `B57.${n}` },
    to: { partId: 'emu2.1', terminal: pins ? `X5.3 ${pins}` : 'X5.3' },
    kind: 'signal' as const,
    cores: 2,
    provenance: 'vessel' as const,
  };
});

/**
 * Turbocharger speed pickups.
 *
 * The A-side pair goes to EMU 2-I on X5.3 (XZ00E50000106 sheet 3, pins E/F and C/D); the B-side pair
 * goes to the ECU on X2 instead, which is why they are not one loom. Worth keeping straight: the
 * designations are B44.1/B44.2 for A and B44.11/B44.12 for B, per ZNG00028788.
 */
const tcSpeedHarness: CableDef[] = [
  { id: 'tc.A1', d: 'B44.1', to: 'emu2.1', t: 'X5.3 E/F' },
  { id: 'tc.A2', d: 'B44.2', to: 'emu2.1', t: 'X5.3 C/D' },
  { id: 'tc.B1', d: 'B44.11', to: 'ecu4', t: 'X2' },
  { id: 'tc.B2', d: 'B44.12', to: 'ecu4', t: 'X2' },
].map(r => ({
  cableNo: `${r.t.split(' ')[0]}/${r.d}`,
  from: { partId: r.id, terminal: r.d },
  to: { partId: r.to, terminal: r.t },
  kind: 'signal' as const,
  cores: 2,
  provenance: 'vessel' as const,
}));

export const CABLES: CableDef[] = [
  ...exhaustHarness,
  ...bearingHarness,
  ...tcSpeedHarness,
  {
    cableNo: 'X5.3/SPRAY-OIL',
    from: { partId: 'emu2.2', terminal: 'X5.3' },
    to: { partId: 'crankcase' },
    kind: 'signal',
    gauge: 'bundle',
    provenance: 'vessel',
  },
  {
    cableNo: 'X5.4/EMU2-I',
    from: { partId: 'emu2.1', terminal: 'X5.4' },
    to: { partId: 'cb.x11' },
    kind: 'can',
    provenance: 'vessel',
  },
  {
    cableNo: 'X5.4/EMU2-II',
    from: { partId: 'emu2.2', terminal: 'X5.4' },
    to: { partId: 'cb.x11' },
    kind: 'can',
    provenance: 'vessel',
  },
  {
    cableNo: 'X11/SSK',
    from: { partId: 'cb.x11' },
    to: { partId: 'intake.A' },
    kind: 'signal',
    gauge: 'emergency air shutoff',
    provenance: 'vessel',
  },
  {
    cableNo: 'X11/SSK-B',
    from: { partId: 'cb.x11' },
    to: { partId: 'intake.B' },
    kind: 'signal',
    gauge: 'emergency air shutoff',
    provenance: 'vessel',
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────────

const BY_ID = new Map(PARTS.map(p => [p.id, p]));

export function getPart(id: string): PartDef | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Part of the ECS 8000 layer — a control unit or a harness/terminal item rather than machinery.
 * These render in the network's yellow and carry no thermal severity.
 */
export function isNetworkPart(part: PartDef): boolean {
  return part.subassembly === 'control' || part.subassembly === 'harness';
}

export function partsIn(subassemblyId: string): PartDef[] {
  return PARTS.filter(p => p.subassembly === subassemblyId);
}

/**
 * Parts sitting geometrically inside an enclosure, tested by centre point. Every enclosure is an
 * axis-aligned box, so this is exact rather than approximate. Used both to route clicks past a
 * housing and to list its contents in the detail panel.
 */
export function partsInside(enclosureId: string): PartDef[] {
  const e = getPart(enclosureId);
  if (!e?.enclosure) return [];
  return PARTS.filter(p => p.id !== e.id && !p.enclosure && enclosureContains(e, p));
}

/**
 * Does box `a` hold `b`'s centre? Tested with a tolerance because parts routinely sit exactly on a
 * face — main bearing 1 is precisely on the crankcase's driving-end face, and without the epsilon
 * accumulated float error drops it outside its own housing.
 *
 * Shared by partsInside and by the test that enforces enclosure marking, so both agree on what
 * "inside" means. Enclosures are axis-aligned boxes, so this is otherwise exact.
 */
export function enclosureContains(a: PartDef, b: PartDef): boolean {
  const EPS = 1e-6;
  return (
    Math.abs(b.position[0] - a.position[0]) <= a.size[0] / 2 + EPS &&
    Math.abs(b.position[1] - a.position[1]) <= a.size[1] / 2 + EPS &&
    Math.abs(b.position[2] - a.position[2]) <= a.size[2] / 2 + EPS
  );
}

/**
 * Which part a click means, given the part ids the ray hit in depth order.
 *
 * A housing sits in front of everything it contains, so the raw nearest hit is always the housing —
 * which made the four turbochargers and all eleven main bearings unselectable. Take the first hit
 * that is NOT an enclosure. Falling back to the enclosure means clicking a housing where nothing is
 * behind it (a corner, an empty face) still selects the housing, which is what you would expect.
 */
export function resolvePick(hitPartIds: string[], fallbackId: string): string {
  for (const id of hitPartIds) {
    if (!getPart(id)?.enclosure) return id;
  }
  return fallbackId;
}

/** Every cable touching a part, either end. */
export function cablesTouching(partId: string): CableDef[] {
  return CABLES.filter(c => c.from.partId === partId || c.to.partId === partId);
}
