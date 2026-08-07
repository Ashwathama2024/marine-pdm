// engine3d/Network.tsx — the ECS 8000 control network drawn over the engine.
//
// Two field-bus rails run down the A-side with a drop to every node, mirroring the overview drawing,
// plus the physical harness runs from topology's cable registry. Signal is animated as a travelling
// pulse so direction of flow reads at a glance — sensors up into the EMUs, EMUs onto the buses.
//
// Everything here is static geometry built once; only the shader uniform moves, so the layer costs
// one uniform write per frame regardless of how many runs are drawn.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BUSES, BUS_X0, BUS_X1, BUS_Z, ECS_NODES } from './ecs-network';
import { CABLES, getPart } from './topology';
import { cableRoute } from './cable-route';
import { YELLOW } from './palette';
import { useReducedMotion } from './useReducedMotion';

const DROP_OPACITY = 0.55;

/** Travelling-pulse material — one uniform, shared by every run of a given colour. */
function makeFlowMaterial(color: string, repeat: number, base = 0.5) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Unlit and untone-mapped so the yellow stays saturated and the bloom pass picks it up.
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uRepeat: { value: repeat },
      uSpeed: { value: 0.35 },
      uBase: { value: base },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uRepeat; uniform float uSpeed;
      uniform float uBase;
      varying vec2 vUv;
      void main() {
        float p = fract(vUv.x * uRepeat - uTime * uSpeed);
        // Sharp head, soft tail — reads as motion rather than as a dashed line.
        float pulse = pow(p, 6.0);
        gl_FragColor = vec4(uColor, uBase + pulse * (1.0 - uBase));
      }
    `,
  });
}

function tube(points: THREE.Vector3[], radius: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), radius, 6, false);
}

export function NetworkLayer({ live }: { live?: unknown }) {
  const reduced = useReducedMotion();
  const mats = useRef<THREE.ShaderMaterial[]>([]);

  const { railGeos, dropGeos, harnessGeo } = useMemo(() => {
    const rails = BUSES.map(b =>
      tube(
        [new THREE.Vector3(BUS_X0, b.y, BUS_Z), new THREE.Vector3(BUS_X1, b.y, BUS_Z)],
        0.018,
      ),
    );

    // One drop per node per bus, tapping the rail directly above the unit.
    const drops: { geo: THREE.TubeGeometry; color: string }[] = [];
    for (const node of ECS_NODES) {
      const part = getPart(node.partId);
      if (!part) continue;
      const [px, py, pz] = part.position;
      for (const busId of node.buses) {
        const bus = BUSES.find(b => b.id === busId);
        if (!bus) continue;
        // Small x offset so the two taps do not overlap on the same unit.
        const x = px + (busId === 'fb1' ? -0.06 : 0.06);
        drops.push({
          geo: tube(
            [
              new THREE.Vector3(x, bus.y, BUS_Z),
              new THREE.Vector3(x, (bus.y + py) / 2, (BUS_Z + pz) / 2),
              new THREE.Vector3(x, py, pz),
            ],
            0.011,
          ),
          color: bus.color,
        });
      }
    }

    // Physical harness runs from the cable registry, routed up over the engine rather than through
    // it: sensor -> rise to the spine -> run along the engine -> drop into the unit.
    // Routing lives in cable-route.ts because the fly-through camera follows the same polyline.
    //
    // `lane` spreads cables across the duct instead of stacking them on one centreline. Counted per
    // side, so each duct fills from its own wall rather than leaving a gap where the other side's
    // cables would have been.
    const harnessParts: THREE.TubeGeometry[] = [];
    const laneCount = new Map<number, number>();
    for (const c of CABLES) {
      const a = getPart(c.from.partId);
      const b = getPart(c.to.partId);
      if (!a || !b) continue;
      const side = Math.sign(Math.abs(a.position[2]) > 0.05 ? a.position[2] : b.position[2]) || 1;
      const lane = laneCount.get(side) ?? 0;
      laneCount.set(side, lane + 1);

      const route = cableRoute(c, lane);
      if (!route) continue;
      const pts = route.map(p => new THREE.Vector3(...p));
      harnessParts.push(tube(pts, c.kind === 'can' ? 0.02 : 0.011));
    }

    return { railGeos: rails, dropGeos: drops, harnessGeo: harnessParts };
  }, []);

  useFrame(({ clock }) => {
    if (reduced) return;
    for (const m of mats.current) {
      if (m) m.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  const register = (i: number) => (m: THREE.ShaderMaterial | null) => {
    if (m) mats.current[i] = m;
  };

  let matIndex = 0;

  return (
    <group>
      {/* Field-bus rails */}
      {railGeos.map((geo, i) => {
        const idx = matIndex++;
        return (
          <mesh key={`rail-${i}`} geometry={geo} raycast={() => null}>
            <primitive
              object={makeFlowMaterial(BUSES[i].color, 40)}
              attach="material"
              ref={register(idx)}
            />
          </mesh>
        );
      })}

      {/* Bus drops to each node */}
      {dropGeos.map((d, i) => (
        <mesh key={`drop-${i}`} geometry={d.geo} raycast={() => null}>
          <meshBasicMaterial color={d.color} transparent opacity={DROP_OPACITY} toneMapped={false} />
        </mesh>
      ))}

      {/* Physical harness */}
      {harnessGeo.map((geo, i) => {
        const idx = matIndex++;
        return (
          <mesh key={`harness-${i}`} geometry={geo} raycast={() => null}>
            <primitive
              object={makeFlowMaterial(YELLOW, 10, 0.62)}
              attach="material"
              ref={register(idx)}
            />
          </mesh>
        );
      })}
    </group>
  );
}
