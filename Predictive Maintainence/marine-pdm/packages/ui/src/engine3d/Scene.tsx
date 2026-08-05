// engine3d/Scene.tsx — the canvas, camera, controls and bloom pass.
//
// Memoized on purpose. The page above it re-renders every tick (it holds useEngine), but every prop
// here is referentially stable — a ref, a ref, and two useCallbacks — so the R3F tree mounts once and
// is then driven entirely by useFrame.

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { PartsLayer } from './Parts';
import { NetworkLayer } from './Network';
import { ENGINE_CENTRE, ORBIT_RADIUS } from './engine-layout';
import { BACKDROP } from './palette';
import type { LiveRef } from './useLiveBridge';

interface SceneProps {
  live: LiveRef;
  selectedRef: React.MutableRefObject<string | null>;
  showFiringRef: React.MutableRefObject<boolean>;
  /** Prop rather than a ref: mounting the layer is a structural change, not a per-frame one. */
  showNetwork: boolean;
  onSelect: (id: string) => void;
  onMiss: () => void;
}

export const Scene = React.memo(function Scene({
  live,
  selectedRef,
  showFiringRef,
  showNetwork,
  onSelect,
  onMiss,
}: SceneProps) {
  return (
    <Canvas
      camera={{
        position: [ENGINE_CENTRE[0] + 2.6, 2.6, ORBIT_RADIUS],
        fov: 42,
        near: 0.1,
        far: 200,
      }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={onMiss}
    >
      <color attach="background" args={[BACKDROP]} />

      {/* Everything is basic/line material, so the scene needs no lights — only bloom. */}
      <PartsLayer
        live={live}
        selectedRef={selectedRef}
        showFiringRef={showFiringRef}
        onSelect={onSelect}
      />

      {showNetwork && <NetworkLayer />}

      {/* A floor grid is the cheapest way to make rotation legible; kept far below bloom threshold. */}
      <Grid
        position={[ENGINE_CENTRE[0], -0.95, 0]}
        args={[26, 14]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#0C2A20"
        sectionSize={2.5}
        sectionThickness={0.9}
        sectionColor="#123F30"
        fadeDistance={30}
        fadeStrength={1.2}
      />

      <OrbitControls
        target={ENGINE_CENTRE}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.8}
        maxDistance={24}
        minPolarAngle={0.06}
        maxPolarAngle={Math.PI * 0.94}
      />

      <EffectComposer>
        <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.18} luminanceSmoothing={0.32} />
      </EffectComposer>
    </Canvas>
  );
});
