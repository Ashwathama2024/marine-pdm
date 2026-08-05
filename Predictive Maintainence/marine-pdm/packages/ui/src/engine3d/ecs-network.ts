// engine3d/ecs-network.ts — the ECS 8000 control network.
//
// Source: Rolls-Royce/MTU "ECS 8000 — System Overview — With GCU", plus the per-unit slides that
// give each node its number. This is the THIRD network in this app and it is worth keeping the
// three apart:
//
//   causal network   fault mode → root factor → sensor. Abstract. Derived from degradation-matrix.
//   sensor harness   the physical looms — X5.1 exhaust probes into EMU 2-I, and so on.
//   control network  THIS. Two redundant CAN channels linking the ECS units. Fully documented.
//
// Every unit hangs off BOTH field buses; that redundancy is the point of the architecture, so the
// two rails are drawn separately rather than as one line.

export type BusId = 'fb1' | 'fb2';

export interface Bus {
  id: BusId;
  label: string;
  /** Rail colour, matching the overview drawing: field bus 1 red, field bus 2 black/white. */
  color: string;
  /** Height of the rail above the crank axis. */
  y: number;
}

/** The rails run down the A-side of the engine, above the engine-room cabinets. */
export const BUS_Z = -2.05;
export const BUS_X0 = -0.9;
export const BUS_X1 = 6.3;

export const BUSES: Bus[] = [
  { id: 'fb1', label: 'Field-BUS 1', color: '#EF4444', y: 2.62 },
  { id: 'fb2', label: 'Field-BUS 2', color: '#CBD5E1', y: 2.82 },
];

export interface EcsNode {
  /** Part id in topology.ts. */
  partId: string;
  label: string;
  /** CAN node number where the unit is addressed as one; a terminal box has none. */
  nodeNo?: number;
  /** Second node number for units that present two (LOP 8 is Display 13 and MPU-29). */
  nodeNo2?: number;
  buses: BusId[];
  location: 'engine' | 'engineRoom' | 'controlRoom';
}

/**
 * Node list exactly as the overview drawing shows it, left to right.
 *
 * CB-X11 appears on the buses in the drawing even though it is a terminal box rather than an
 * addressed node — it is drawn with a bus tap, so it gets one here too, with no node number.
 */
export const ECS_NODES: EcsNode[] = [
  { partId: 'meu1', label: 'MEU 1 / SAM', nodeNo: 6, buses: ['fb1', 'fb2'], location: 'engineRoom' },
  { partId: 'lop8', label: 'LOP 8', nodeNo: 4, nodeNo2: 5, buses: ['fb1', 'fb2'], location: 'engineRoom' },
  { partId: 'cb.x11', label: 'CB-X11', buses: ['fb1', 'fb2'], location: 'engineRoom' },
  { partId: 'gcu6', label: 'GCU 6 / MPU-29', nodeNo: 7, buses: ['fb1', 'fb2'], location: 'engineRoom' },
  { partId: 'emu2.2', label: 'EMU 2-II', nodeNo: 10, buses: ['fb1', 'fb2'], location: 'engine' },
  { partId: 'emu2.1', label: 'EMU 2-I', nodeNo: 3, buses: ['fb1', 'fb2'], location: 'engine' },
  { partId: 'ecu4', label: 'ECU 4', nodeNo: 2, buses: ['fb1', 'fb2'], location: 'engine' },
  { partId: 'mcs', label: 'Customer MCS', buses: ['fb1', 'fb2'], location: 'controlRoom' },
];

export function nodeFor(partId: string): EcsNode | undefined {
  return ECS_NODES.find(n => n.partId === partId);
}

/** Node numbers the deck documents, for the guard test. */
export const KNOWN_NODE_NUMBERS = [2, 3, 4, 5, 6, 7, 10] as const;
