// engine3d/ecs-units.ts — what each ECS 8000 unit IS, for the click-to-identify panel.
//
// The sensors have DOSSIER_ENTRIES to explain them; the control units had nothing, so clicking ECU 4
// showed a name and an empty reading. This is the equivalent reference layer for the control side.
//
// Everything here is transcribed from the Rolls-Royce/MTU material: the ECS 8000 system overview
// (with GCU), the per-unit slides for ECU 4, EMU 2-1, EMU 2-2, LOP 8, MEU 1, terminal box X11 and
// GCU 3/6, and the PIM 4 third-party interface sheet. Nothing is inferred — where the decks are
// silent, the field is simply absent.

export interface NodeRef {
  /** How the deck names this node, e.g. "Display 13". */
  label: string;
  no: number;
}

export interface Connector {
  id: string;
  purpose: string;
}

export interface EcsUnitInfo {
  partId: string;
  fullName: string;
  /** MDEC/MTU product line the unit belongs to, where the deck states it. */
  family?: string;
  location: 'On engine' | 'Engine room' | 'Control room';
  /** CAN node addresses. A terminal box taps the bus without being addressed, so this is empty. */
  nodes: NodeRef[];
  /** What the unit does, in the deck's own terms. */
  role: string[];
  /** Physical connectors, where the slide labels them. */
  connectors?: Connector[];
  /** Buses and serial links this unit carries. */
  interfaces?: Connector[];
  /** Equipment wired to it. */
  connects?: string[];
  /** Which document this came from, so a reader can go and check. */
  source: string;
}

export const ECS_UNITS: EcsUnitInfo[] = [
  {
    partId: 'ecu4',
    fullName: 'ECU 4 — Engine Control Unit',
    family: 'MDEC',
    location: 'On engine',
    nodes: [{ label: 'ECU-4', no: 2 }],
    role: [
      'Governs fuel injection across all 20 cylinders.',
      'Runs cylinder cutout — switches off the fuel supply to individual injection valves in defined operating ranges. At low load this gives markedly less smoke and better consumption.',
      'Cuts the switchable turbochargers A1 and B1 in and out, via hydraulically actuated switching valves driven by solenoids Y26 and Y29.',
      'Holds the engine dataset, which Diasys programs from the central database.',
    ],
    interfaces: [
      { id: 'CAN ×2', purpose: 'Field-BUS 1 and Field-BUS 2 — the data link to the rest of the engine system' },
      { id: 'RS232', purpose: 'Dialogue unit (Diasys 2.xx): dataset update, measuring-point recording, reading ECU error logfiles' },
    ],
    connects: ['Injection valves (all cylinders)', 'ETC switching solenoids Y26 / Y29'],
    source: 'ECS 8000 Introduction; ECS 8000 System Overview — With GCU',
  },
  {
    partId: 'emu2.1',
    fullName: 'EMU 2-I — Engine Monitoring Unit, 1st unit',
    family: 'MDEC',
    location: 'On engine',
    nodes: [{ label: 'EMU 2 — 1st unit', no: 3 }],
    role: [
      'Acquires the engine sensor signals and publishes them on the CAN field buses.',
      'Carries the whole exhaust-temperature loom: all twenty B4xN probes land here on one connector.',
    ],
    connectors: [
      { id: 'X5.1', purpose: 'Engine cable harness for the exhaust temperature sensors (B4A1–B4A10, B4B1–B4B10)' },
      { id: 'X5.2', purpose: 'Engine cable harness for sensors' },
      { id: 'X5.3', purpose: 'Engine cable harness for sensors' },
      { id: 'X5.4', purpose: 'Connecting box X11 — power supply and CAN bus interface' },
    ],
    interfaces: [{ id: 'CAN ×2', purpose: 'Field-BUS 1 and Field-BUS 2, via X5.4' }],
    source: 'EMU 2-1 (Engine Monitoring Unit) slide',
  },
  {
    partId: 'emu2.2',
    fullName: 'EMU 2-II — Engine Monitoring Unit, 2nd unit',
    family: 'MDEC',
    location: 'On engine',
    nodes: [{ label: 'EMU 2 — 2nd unit', no: 10 }],
    role: [
      'Second monitoring unit, dedicated to the spray-oil temperatures.',
      'Only X5.3 and X5.4 are used — X5.1 and X5.2 are not populated on this unit.',
    ],
    connectors: [
      { id: 'X5.3', purpose: 'Engine cable harness for the "Spray Oil" temperature sensors (B77.x)' },
      { id: 'X5.4', purpose: 'Connecting box X11 — power supply and CAN bus interface' },
    ],
    interfaces: [{ id: 'CAN ×2', purpose: 'Field-BUS 1 and Field-BUS 2, via X5.4' }],
    source: 'EMU 2-2 (Engine Monitoring Unit) slide',
  },
  {
    partId: 'lop8',
    fullName: 'LOP 8 — Local Operating Panel',
    location: 'Engine room',
    nodes: [
      { label: 'Display 13', no: 4 },
      { label: 'MPU-29', no: 5 },
    ],
    role: [
      'Sits in the engine room, next to the engine it is assigned to.',
      'One unit for local monitoring AND control of both the engine and its adapted gearbox.',
      'Presents as two CAN nodes: the display and the processor unit are addressed separately.',
    ],
    interfaces: [{ id: 'CAN ×2', purpose: 'Communicates with the other system components over the field buses' }],
    connects: ['External sensors and actuators not on the MTU RCS'],
    source: 'LOP 8 (Local Operating Unit) slide',
  },
  {
    partId: 'meu1',
    fullName: 'MEU 1 — Monitoring Extension Unit',
    location: 'Engine room',
    nodes: [{ label: 'SAM', no: 6 }],
    role: ['Extends monitoring beyond the engine itself, onto the gearbox and the plant.'],
    interfaces: [{ id: 'CAN ×2', purpose: 'Field-BUS 1 and Field-BUS 2' }],
    connects: ['Gearbox — redundant signal path', 'Plant I/O'],
    source: 'MEU 1 (Monitoring Extension Unit) slide; ECS 8000 System Overview',
  },
  {
    partId: 'gcu6',
    fullName: 'GCU 6 — Gearbox Control Unit',
    location: 'Engine room',
    nodes: [{ label: 'MPU-29', no: 7 }],
    role: [
      'Takes the monitoring-system and remote-control input signals at the gearbox.',
      'Drives the gearbox actuators.',
      'Acquires the current gearbox state.',
      'On an inadmissible state, trips an alarm or an engine stop.',
      'GCU 6 is the variant WITHOUT trolling; GCU 3 is the same unit with the trolling function.',
    ],
    interfaces: [{ id: 'CAN ×2', purpose: 'Communication via CAN bus in the system' }],
    source: 'GCU 6 / GCU 3 (Gearbox Control Unit) slide',
  },
  {
    partId: 'cb.x11',
    fullName: 'CB-X11 — Terminal Box',
    location: 'Engine room',
    nodes: [], // taps the bus, but is not an addressed node
    role: [
      'The junction between the engine-mounted units and the rest of the installation.',
      'Supplies power to both EMUs and carries their CAN connection.',
    ],
    connects: [
      'Emergency air shutoff flaps (SSK)',
      'EMU 2-I and EMU 2-II',
      'LPU — Local Power Unit',
      'PPC',
      'Engine room sensors',
    ],
    source: 'Terminal Box — X11 slide',
  },
  {
    partId: 'mcs',
    fullName: 'Customer MCS — Monitoring and Control System',
    location: 'Control room',
    nodes: [],
    role: [
      'The customer-side control system. Not MTU equipment — the ECS presents defined interfaces to it.',
      'A third-party MCS is supported through PIM 4 alone.',
    ],
    interfaces: [
      { id: 'PIM 5', purpose: 'Serial interface, RS422' },
      { id: 'PIM 3', purpose: 'Parallel interface for instruments and push buttons' },
      { id: 'PIM 4', purpose: 'Third-party MCS interface — the only module needed for that setup' },
    ],
    connects: [
      'PIM 4 inputs: key switch, start/stop, emergency stop, override, acknowledge from control station',
      'PIM 4 outputs: buzzer, engine speed indication',
    ],
    source: 'ECS 8000 System Overview — With GCU; 3rd Party MCS Interface (PIM 4) sheet',
  },
];

const BY_PART = new Map(ECS_UNITS.map(u => [u.partId, u]));

export function getEcsUnit(partId: string): EcsUnitInfo | undefined {
  return BY_PART.get(partId);
}
