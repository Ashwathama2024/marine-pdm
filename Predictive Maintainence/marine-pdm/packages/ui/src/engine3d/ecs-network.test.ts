// Pins the ECS 8000 control network against the Rolls-Royce/MTU system overview.
//
// The node numbers are the part that cannot be re-derived from anything else in this repo — they
// come from the deck and nowhere else — so they are worth holding still.

import { describe, expect, it } from 'vitest';
import { BUSES, BUS_X0, BUS_X1, ECS_NODES, KNOWN_NODE_NUMBERS, nodeFor } from './ecs-network';
import { PARTS, getPart, isNetworkPart } from './topology';
import { ECS_UNITS, getEcsUnit } from './ecs-units';
import { DECK_Y } from './engine-layout';

describe('everything is supported by something', () => {
  // Every off-engine unit used to hang in mid-air — the LOP at y=2.3 and the customer MCS at 3.5,
  // level with or above the top of the block, with the bus rails sailing over the engine at 2.6 and
  // the cabinets dangling off them. It reads as debris rather than an engine room, and no test or
  // DOM check could see it; it took a screenshot.

  const seatedOn = (partId: string) => {
    const p = getPart(partId)!;
    return p.position[1] - p.size[1] / 2;
  };

  it('stands every engine-room and control-room cabinet on the deck', () => {
    const floating = ECS_NODES
      .filter(n => n.location !== 'engine')
      .filter(n => Math.abs(seatedOn(n.partId) - DECK_Y) > 1e-6)
      .map(n => `${n.partId} base ${seatedOn(n.partId).toFixed(2)}`);
    expect(floating).toEqual([]);
  });

  it('keeps the engine-mounted units on the engine, not on the deck', () => {
    // The converse matters too: seating an EMU on the floor would be just as wrong.
    for (const n of ECS_NODES.filter(x => x.location === 'engine')) {
      expect(seatedOn(n.partId), n.partId).toBeGreaterThan(DECK_Y + 1);
    }
  });

  it('does not let two units occupy the same space', () => {
    // CB-X11 and the customer MCS did exactly this the moment both were seated on the deck. It had
    // been invisible only because they floated at different heights — 0.55 and 3.5 — so the clash was
    // there all along, hidden by one of them being in the wrong place vertically.
    const box = (partId: string) => {
      const p = getPart(partId)!;
      return [0, 1, 2].map(i => [
        p.position[i]! - p.size[i]! / 2,
        p.position[i]! + p.size[i]! / 2,
      ] as const);
    };
    const overlaps = (a: string, b: string) => {
      const [ba, bb] = [box(a), box(b)];
      return [0, 1, 2].every(i => ba[i]![0] < bb[i]![1] - 1e-9 && bb[i]![0] < ba[i]![1] - 1e-9);
    };

    const clashes: string[] = [];
    for (let i = 0; i < ECS_NODES.length; i++) {
      for (let j = i + 1; j < ECS_NODES.length; j++) {
        const [a, b] = [ECS_NODES[i]!.partId, ECS_NODES[j]!.partId];
        if (overlaps(a, b)) clashes.push(`${a} ∩ ${b}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('runs the bus rails above the cabinets they serve, not over the engine', () => {
    const tallestCabinetTop = Math.max(
      ...ECS_NODES.filter(n => n.location !== 'engine')
        .map(n => { const p = getPart(n.partId)!; return p.position[1] + p.size[1] / 2; }),
    );
    for (const bus of BUSES) {
      expect(bus.y, bus.label).toBeGreaterThan(tallestCabinetTop);
      // Comfortably below the top of the block (~2.5) — a CAN trunk is a tray, not a catenary.
      expect(bus.y, bus.label).toBeLessThan(1.0);
    }
  });
});

describe('node list', () => {
  it('matches the documented node numbers', () => {
    expect(nodeFor('ecu4')?.nodeNo).toBe(2); // ECU 4
    expect(nodeFor('emu2.1')?.nodeNo).toBe(3); // EMU 2, 1st unit
    expect(nodeFor('emu2.2')?.nodeNo).toBe(10); // EMU 2, 2nd unit
    expect(nodeFor('meu1')?.nodeNo).toBe(6); // MEU 1 / SAM
    expect(nodeFor('gcu6')?.nodeNo).toBe(7); // GCU 3 or 6 / MPU-29
  });

  it('gives LOP 8 both of its node numbers', () => {
    // The panel presents as two nodes: Display 13 is node 4, MPU-29 is node 5.
    const lop = nodeFor('lop8');
    expect(lop?.nodeNo).toBe(4);
    expect(lop?.nodeNo2).toBe(5);
  });

  it('uses no node number the deck does not document', () => {
    const used = ECS_NODES.flatMap(n => [n.nodeNo, n.nodeNo2]).filter(
      (n): n is number => n !== undefined,
    );
    for (const n of used) expect(KNOWN_NODE_NUMBERS).toContain(n);
    expect(new Set(used).size).toBe(used.length); // no duplicates
  });

  it('leaves the terminal box unnumbered — it taps the bus but is not addressed', () => {
    const x11 = nodeFor('cb.x11');
    expect(x11).toBeDefined();
    expect(x11?.nodeNo).toBeUndefined();
  });

  it('resolves every node to a part that exists', () => {
    for (const n of ECS_NODES) {
      expect(getPart(n.partId), n.partId).not.toBeNull();
    }
  });
});

describe('field buses', () => {
  it('runs two redundant channels', () => {
    expect(BUSES.map(b => b.id)).toEqual(['fb1', 'fb2']);
    expect(BUSES[0].y).not.toBe(BUSES[1].y); // drawn as separate rails
  });

  it('puts every unit on BOTH channels, which is the point of the architecture', () => {
    for (const n of ECS_NODES) {
      expect(n.buses, n.partId).toEqual(['fb1', 'fb2']);
    }
  });

  it('spans far enough to reach the outermost node', () => {
    const xs = ECS_NODES.map(n => getPart(n.partId)!.position[0]);
    expect(BUS_X0).toBeLessThanOrEqual(Math.min(...xs));
    expect(BUS_X1).toBeGreaterThanOrEqual(Math.max(...xs));
  });
});

describe('every control unit is documented', () => {
  it('gives each ECS part a reference card, so clicking one is never a dead end', () => {
    // The sensors have DOSSIER_ENTRIES; this is the control side's equivalent. A network part with
    // no card shows a name and nothing else.
    for (const p of PARTS.filter(isNetworkPart)) {
      expect(getEcsUnit(p.id), `${p.id} has no ECS_UNITS entry`).toBeDefined();
    }
  });

  it('states a role and a source for every unit', () => {
    for (const u of ECS_UNITS) {
      expect(u.role.length, u.partId).toBeGreaterThan(0);
      expect(u.source.length, u.partId).toBeGreaterThan(0);
      expect(u.fullName, u.partId).toBeTruthy();
    }
  });

  it('agrees with the network on node numbers', () => {
    // Two hand-maintained lists of the same fact; this is what keeps them from drifting.
    for (const u of ECS_UNITS) {
      const net = nodeFor(u.partId);
      const numbers = u.nodes.map(n => n.no).sort();
      const netNumbers = [net?.nodeNo, net?.nodeNo2].filter((n): n is number => n !== undefined).sort();
      expect(numbers, u.partId).toEqual(netNumbers);
    }
  });

  it('documents both EMU connectors that actually differ between the units', () => {
    // EMU 2-I takes the exhaust loom on X5.1; EMU 2-II is spray oil on X5.3 only.
    const first = getEcsUnit('emu2.1')!;
    const second = getEcsUnit('emu2.2')!;
    expect(first.connectors?.map(c => c.id)).toContain('X5.1');
    expect(second.connectors?.map(c => c.id)).not.toContain('X5.1');
    expect(second.connectors?.map(c => c.id)).toContain('X5.3');
    // Both take power and CAN from the terminal box on X5.4.
    expect(first.connectors?.map(c => c.id)).toContain('X5.4');
    expect(second.connectors?.map(c => c.id)).toContain('X5.4');
  });
});

describe('installation vs engine', () => {
  it('marks the control-room and engine-room cabinets as off-engine', () => {
    // They sit outside the published engine envelope on purpose; the envelope guard skips them.
    for (const id of ['mcs', 'lop8', 'meu1', 'gcu6', 'cb.x11']) {
      expect(getPart(id)?.offEngine, id).toBe(true);
    }
  });

  it('keeps the three engine-mounted units on the engine', () => {
    for (const id of ['ecu4', 'emu2.1', 'emu2.2']) {
      expect(getPart(id)?.offEngine, id).toBeFalsy();
    }
  });

  it('gives every part carrying a node number an entry in the network', () => {
    for (const p of PARTS) {
      if (p.nodeNo === undefined) continue;
      expect(nodeFor(p.id), `${p.id} has nodeNo ${p.nodeNo} but is not in ECS_NODES`).toBeDefined();
    }
  });
});
