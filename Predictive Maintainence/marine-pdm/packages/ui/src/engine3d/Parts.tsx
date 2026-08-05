// engine3d/Parts.tsx — every clickable part, plus the frame loop that drives them from live data.
//
// DEVIATION FROM PLAN, deliberate: the plan called for InstancedMesh on the 20 cylinders and 11
// bearings. At this part count that optimisation buys nothing measurable (a few dozen draw calls is
// far inside budget) and it costs the two things this view is actually for — per-part EdgesGeometry,
// which IS the green-outline look, and one-line raycast picking. Instancing becomes worth revisiting
// if the harness layer later pushes the scene into the thousands.
//
// No React state lives in here. Selection and hover are refs, and colour and rotation are mutated
// inside useFrame, so a 1 Hz tick or a click never re-renders the R3F tree.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MTU8000 } from '@marine-pdm/shared';
import { turboWheelPeriodS } from '../services/turbo-state';
import { PARTS, resolvePick, type PartDef } from './topology';
import { riskColor, FILL, GREEN } from './palette';
import { partRisk } from './part-risk';
import type { LiveRef } from './useLiveBridge';

// ── Rotation ─────────────────────────────────────────────────────────────────
// Turbochargers use the DASHBOARD's own wheel period (turboWheelPeriodS), so a turbo in the 3D view
// and the same turbo on the dashboard's wheel turn at visibly the same rate, from the same derived
// display speed — including windmilling when cut out.
//
// The crankshaft has no dashboard animation to match, so it keeps a scaled rate: 1150 rpm is 19
// rev/s, a strobing blur at 60 fps. Proportional to the live reading, and the HUD says it is scaled.
const CRANK_REV_PER_S_AT_RATED = 1.2;
const TWO_PI = Math.PI * 2;

// ── Firing order ─────────────────────────────────────────────────────────────
// Four-stroke, 20 cylinders: each fires once per two revolutions, so the engine fires rpm/6 times a
// second — 192 Hz at rated. Slowed by this factor to a wave the eye can follow.
const FIRING_SLOWDOWN = 1 / 48;
const FIRING_TAIL = 2; // how many firing steps a cylinder stays lit

const CYL_INDEX = new Map(MTU8000.CYL_NAMES.map((n, i) => [n as string, i]));
/** Position in the firing sequence for each cylinder index. */
const FIRING_POS: number[] = (() => {
  const pos = new Array<number>(MTU8000.CYLINDERS).fill(0);
  MTU8000.FIRING_ORDER_CCW.forEach((name, order) => {
    const idx = CYL_INDEX.get(name);
    if (idx !== undefined) pos[idx] = order;
  });
  return pos;
})();

const MOTION_PARTS = PARTS.filter(p => p.motion);

function makeGeometry(part: PartDef): THREE.BufferGeometry {
  const [a, b, c] = part.size;
  switch (part.kind) {
    case 'cylinder':
      return new THREE.CylinderGeometry(a, a, b, 12, 1);
    case 'box':
      return new THREE.BoxGeometry(a, b, c);
    case 'sphere':
      return new THREE.SphereGeometry(a, 14, 10);
    case 'torus':
      return new THREE.TorusGeometry(a, b, 6, 20);
    case 'capsule':
      return new THREE.CapsuleGeometry(a, b, 4, 12);
  }
}

/** R3F hands over the full depth-sorted hit list; topology decides which of them a click means. */
function pickFrom(intersections: THREE.Intersection[], fallbackId: string): string {
  const ids: string[] = [];
  for (const hit of intersections) {
    const pid = hit.object.userData?.partId as string | undefined;
    if (pid) ids.push(pid);
  }
  return resolvePick(ids, fallbackId);
}

interface PartMeshProps {
  part: PartDef;
  register: (id: string, mat: THREE.LineBasicMaterial) => void;
  registerSpin: (id: string, group: THREE.Group) => void;
  onSelect: (id: string) => void;
  hoveredRef: React.MutableRefObject<string | null>;
}

function PartMesh({ part, register, registerSpin, onSelect, hoveredRef }: PartMeshProps) {
  const geom = useMemo(() => makeGeometry(part), [part]);
  // 20° keeps the barrel lines on a 12-segment cylinder (30° between faces) while dropping the
  // co-planar noise on boxes — that ratio is what makes the outline read as a drawing, not a mesh.
  const edges = useMemo(() => new THREE.EdgesGeometry(geom, 20), [geom]);

  return (
    <group position={part.position} rotation={part.rotation ?? [0, 0, 0]}>
      {/* Inner group carries live rotation, so it composes with the part's fixed orientation. */}
      <group
        ref={(g: THREE.Group | null) => {
          if (g && part.motion) registerSpin(part.id, g);
        }}
      >
        {/* Near-black fill so the wireframe occludes correctly instead of reading as an x-ray. */}
        <mesh
          geometry={geom}
          userData={{ partId: part.id }}
          onClick={e => {
            e.stopPropagation();
            onSelect(pickFrom(e.intersections, part.id));
          }}
          onPointerOver={e => {
            e.stopPropagation();
            // Highlight what the click would actually select, not what the ray hit first.
            hoveredRef.current = pickFrom(e.intersections, part.id);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            hoveredRef.current = null;
            document.body.style.cursor = '';
          }}
        >
          {/* An enclosure is a boundary, not a solid: barely tinted and never occluding, so the
              parts inside stay visible through it. */}
          <meshBasicMaterial
            color={FILL}
            transparent
            opacity={part.enclosure ? 0.04 : 0.72}
            depthWrite={!part.enclosure}
          />
        </mesh>

        <lineSegments geometry={edges} raycast={() => null}>
          <lineBasicMaterial
            color={GREEN}
            toneMapped={false}
            ref={(m: THREE.LineBasicMaterial | null) => {
              if (m) register(part.id, m);
            }}
          />
        </lineSegments>
      </group>
    </group>
  );
}

interface PartsLayerProps {
  live: LiveRef;
  selectedRef: React.MutableRefObject<string | null>;
  showFiringRef: React.MutableRefObject<boolean>;
  onSelect: (id: string) => void;
}

export function PartsLayer({ live, selectedRef, showFiringRef, onSelect }: PartsLayerProps) {
  const mats = useRef(new Map<string, THREE.LineBasicMaterial>());
  const spins = useRef(new Map<string, THREE.Group>());
  const hoveredRef = useRef<string | null>(null);
  const scratch = useRef(new THREE.Color());
  const firingPhase = useRef(0);

  const register = React.useCallback((id: string, mat: THREE.LineBasicMaterial) => {
    mats.current.set(id, mat);
  }, []);
  const registerSpin = React.useCallback((id: string, g: THREE.Group) => {
    spins.current.set(id, g);
  }, []);

  useFrame(({ clock }, rawDelta) => {
    const v = live.current;
    const delta = Math.min(rawDelta, 0.1); // a backgrounded tab can hand back a huge delta
    const sel = selectedRef.current;
    const hov = hoveredRef.current;
    const running = v.isOperational && v.rpm > 1;

    // ── Rotation, proportional to the live readings ──
    for (const part of MOTION_PARTS) {
      const g = spins.current.get(part.id);
      if (!g) continue;
      let revPerS = 0;
      if (running) {
        if (part.motion!.source === 'rpm') {
          revPerS = (v.rpm / MTU8000.RATED_RPM) * CRANK_REV_PER_S_AT_RATED;
        } else {
          const tc = v.tcInfos[part.instanceIndex ?? 0];
          revPerS = tc ? 1 / turboWheelPeriodS(tc.displaySpeed, tc.status) : 0;
        }
      }
      g.rotation[part.motion!.axis] += revPerS * TWO_PI * delta;
    }

    // ── Firing wave, walking the true FIRING_ORDER_CCW ──
    const firing = running && showFiringRef.current;
    if (firing) firingPhase.current += (v.rpm / 6) * FIRING_SLOWDOWN * delta;

    // Selected part breathes so it stays findable after the camera moves.
    const pulse = 1.35 + Math.sin(clock.elapsedTime * 3) * 0.35;

    for (const part of PARTS) {
      const mat = mats.current.get(part.id);
      if (!mat) continue;

      riskColor(scratch.current, partRisk(part, v));

      // A stopped engine reads as a cold drawing rather than as "all healthy".
      if (!v.isOperational) scratch.current.multiplyScalar(0.5);

      if (firing && part.componentId === 'injectors' && part.instanceIndex !== undefined) {
        let since = firingPhase.current - FIRING_POS[part.instanceIndex];
        since = ((since % MTU8000.CYLINDERS) + MTU8000.CYLINDERS) % MTU8000.CYLINDERS;
        if (since < FIRING_TAIL) scratch.current.multiplyScalar(1 + 2.2 * (1 - since / FIRING_TAIL));
      }

      if (part.id === sel) scratch.current.multiplyScalar(pulse);
      else if (part.id === hov) scratch.current.multiplyScalar(1.6);
      else if (sel) scratch.current.multiplyScalar(0.42); // dim the rest once one is chosen

      mat.color.copy(scratch.current);
    }
  });

  return (
    <group>
      {PARTS.map(part => (
        <PartMesh
          key={part.id}
          part={part}
          register={register}
          registerSpin={registerSpin}
          onSelect={onSelect}
          hoveredRef={hoveredRef}
        />
      ))}
    </group>
  );
}
