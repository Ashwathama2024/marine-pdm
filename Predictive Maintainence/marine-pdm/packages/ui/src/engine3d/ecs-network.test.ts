// Pins the ECS 8000 control network against the Rolls-Royce/MTU system overview.
//
// The node numbers are the part that cannot be re-derived from anything else in this repo — they
// come from the deck and nowhere else — so they are worth holding still.

import { describe, expect, it } from 'vitest';
import { BUSES, BUS_X0, BUS_X1, ECS_NODES, KNOWN_NODE_NUMBERS, nodeFor } from './ecs-network';
import { PARTS, getPart } from './topology';

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
