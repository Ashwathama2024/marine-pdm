// engine3d/Parts.tsx — every clickable part, plus the frame loop that colours them from live data.
//
// DEVIATION FROM PLAN, deliberate: the plan called for InstancedMesh on the 20 cylinders and 11
// bearings. At 47 total parts that optimisation buys nothing measurable (a few dozen draw calls is
// far inside budget) and it costs the two things this view is actually for — per-part EdgesGeometry,
// which IS the green-outline look, and one-line raycast picking. Instancing becomes worth revisiting
// if the harness layer later pushes the scene into the thousands.
//
// No React state lives in here. Selection and hover are refs, and colour is mutated inside useFrame,
// so a 1 Hz tick or a click never re-renders the R3F tree.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOT_FACTORS } from '@marine-pdm/simulator';
import { PARTS, type PartDef } from './topology';
import { clamp01, riskColor, FILL, GREEN } from './palette';
import type { LiveRef, LiveValues, RootFactors } from './useLiveBridge';

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

/** Severity 0-1 for whichever of the 6 root factors drives this component. */
function factorRisk(componentId: string | undefined, rf: RootFactors): number {
  switch (componentId) {
    case 'injectors':
      return clamp01(rf.injFaultMax / ROOT_FACTORS.injFault.rootMax);
    case 'bearings':
      return clamp01(rf.bearingFaultMax / ROOT_FACTORS.bearingFault.rootMax);
    case 'ht_cooler':
      return clamp01(rf.coolingEffDrop / ROOT_FACTORS.coolingEff.rootMax);
    case 'turbocharger':
      return clamp01(rf.tcEffDrop / ROOT_FACTORS.tcEff.rootMax);
    case 'lube_system':
      return clamp01(rf.lubeFault / ROOT_FACTORS.lubeFault.rootMax);
    case 'piston_rings':
      return clamp01(rf.pistonBlowby / ROOT_FACTORS.pistonBlowby.rootMax);
    default:
      return 0;
  }
}

/**
 * Per-part risk. Instance-addressable parts read their own element of the live arrays so a single
 * hot cylinder lights up alone; everything else falls back to its component's root-factor severity.
 */
export function partRisk(part: PartDef, v: LiveValues): number {
  if (!v.isOperational) return 0;
  const i = part.instanceIndex;

  if (part.componentId === 'injectors' && i !== undefined) {
    const r = v.cylRisks[i];
    if (typeof r === 'number') return clamp01(r / 100);
  }
  if (part.componentId === 'bearings' && i !== undefined) {
    // HI T-Bearing is 115 °C and SS is 130 °C, but hot oil at rated already sits near 107 °C, so the
    // band only opens at 95 — below that a bearing is not interesting.
    const t = v.bearingTemps[i];
    if (typeof t === 'number') return clamp01((t - 95) / 35);
  }
  return factorRisk(part.componentId, v.rootFactors);
}

interface PartMeshProps {
  part: PartDef;
  register: (id: string, mat: THREE.LineBasicMaterial) => void;
  onSelect: (id: string) => void;
  hoveredRef: React.MutableRefObject<string | null>;
}

function PartMesh({ part, register, onSelect, hoveredRef }: PartMeshProps) {
  const geom = useMemo(() => makeGeometry(part), [part]);
  // 20° keeps the barrel lines on a 12-segment cylinder (30° between faces) while dropping the
  // co-planar noise on boxes — that ratio is what makes the outline read as a drawing, not a mesh.
  const edges = useMemo(() => new THREE.EdgesGeometry(geom, 20), [geom]);

  return (
    <group position={part.position} rotation={part.rotation ?? [0, 0, 0]}>
      {/* Near-black fill so the wireframe occludes correctly instead of reading as an x-ray. */}
      <mesh
        geometry={geom}
        onClick={e => {
          e.stopPropagation();
          onSelect(part.id);
        }}
        onPointerOver={e => {
          e.stopPropagation();
          hoveredRef.current = part.id;
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (hoveredRef.current === part.id) hoveredRef.current = null;
          document.body.style.cursor = '';
        }}
      >
        <meshBasicMaterial color={FILL} transparent opacity={0.72} />
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
  );
}

interface PartsLayerProps {
  live: LiveRef;
  selectedRef: React.MutableRefObject<string | null>;
  onSelect: (id: string) => void;
}

export function PartsLayer({ live, selectedRef, onSelect }: PartsLayerProps) {
  const mats = useRef(new Map<string, THREE.LineBasicMaterial>());
  const hoveredRef = useRef<string | null>(null);
  const scratch = useRef(new THREE.Color());

  const register = React.useCallback((id: string, mat: THREE.LineBasicMaterial) => {
    mats.current.set(id, mat);
  }, []);

  useFrame(({ clock }) => {
    const v = live.current;
    const sel = selectedRef.current;
    const hov = hoveredRef.current;
    // Selected part breathes so it stays findable after the camera moves.
    const pulse = 1.35 + Math.sin(clock.elapsedTime * 3) * 0.35;

    for (const part of PARTS) {
      const mat = mats.current.get(part.id);
      if (!mat) continue;

      riskColor(scratch.current, partRisk(part, v));

      if (part.id === sel) scratch.current.multiplyScalar(pulse);
      else if (part.id === hov) scratch.current.multiplyScalar(1.6);
      else if (sel) scratch.current.multiplyScalar(0.42); // dim everything else once one is chosen

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
          onSelect={onSelect}
          hoveredRef={hoveredRef}
        />
      ))}
    </group>
  );
}
