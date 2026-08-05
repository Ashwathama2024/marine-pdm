// pages/Engine3D.tsx — the interactive 3D engine view.
//
// Stage 1: a rotatable green-wireframe 20V 8000 where every part is clickable, reports its live
// reading, and moves with the engine. The causal-network lattice and the cable fly-through mount as
// additional layers here.
//
// This page holds useEngine (via useLiveBridge) so it re-renders every tick — which is what keeps
// the status pill and the detail panel live. <Scene> is memoized behind stable props so that tick
// never reaches the 3D tree; see engine3d/useLiveBridge.ts.
//
// The overlay chrome lives in engine3d/Hud.tsx. Nothing is placed in the middle of the viewport:
// the canvas is the content.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Scene } from '../engine3d/Scene';
import { PartDetailPanel } from '../engine3d/PartDetailPanel';
import { ControlsPill, HelpCard, StatusPill, SubassemblyDock, Z } from '../engine3d/Hud';
import { useLiveBridge } from '../engine3d/useLiveBridge';
import { GREEN } from '../engine3d/palette';
import { useEngine } from '../context/EngineContext';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function Engine3D() {
  const live = useLiveBridge();
  const { snapshot, decision, engineState, isOperational } = useEngine();

  const [selected, setSelected] = useState<string | null>(null);
  const [showFiring, setShowFiring] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const selectedRef = useRef<string | null>(null);
  const showFiringRef = useRef(false);
  const webgl = useMemo(hasWebGL, []);

  const handleSelect = useCallback((id: string) => {
    selectedRef.current = id;
    setSelected(id);
  }, []);

  const handleMiss = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
  }, []);

  const toggleFiring = useCallback(() => {
    setShowFiring(f => {
      showFiringRef.current = !f;
      return !f;
    });
  }, []);

  const toggleNetwork = useCallback(() => setShowNetwork(n => !n), []);
  const toggleHelp = useCallback(() => setShowHelp(h => !h), []);

  if (!webgl) {
    return (
      <div className="card" style={{ padding: 24, maxWidth: 560, margin: '40px auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--risk-warning)' }}>
          3D unavailable
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          This view needs WebGL, which this browser or machine has not made available. Every reading it
          shows is also on the Dashboard and the Analysis workspace — nothing is exclusive to the 3D
          view.
        </div>
      </div>
    );
  }

  // Risk is suppressed before the engine is operational, exactly as the app header does: at 0-bar
  // lube the safety override forces systemRisk to 100, which is true but not meaningful pre-start.
  const risk = decision ? Math.round(decision.systemRisk) : 0;
  const riskText = isOperational ? String(risk) : '—';
  const riskColor = !isOperational
    ? 'var(--text-dim)'
    : risk >= 75 ? 'var(--risk-critical)'
    : risk >= 50 ? 'var(--risk-high)'
    : risk >= 25 ? 'var(--risk-warning)'
    : GREEN;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Scene
        live={live}
        selectedRef={selectedRef}
        showFiringRef={showFiringRef}
        showNetwork={showNetwork}
        onSelect={handleSelect}
        onMiss={handleMiss}
      />

      <StatusPill
        engineState={engineState}
        isOperational={isOperational}
        rpm={snapshot ? snapshot.rpm.toFixed(0) : '—'}
        load={snapshot ? snapshot.load.toFixed(0) : '—'}
        risk={riskText}
        riskColor={riskColor}
      />

      <ControlsPill
        showFiring={showFiring}
        onToggleFiring={toggleFiring}
        showNetwork={showNetwork}
        onToggleNetwork={toggleNetwork}
        showHelp={showHelp}
        onToggleHelp={toggleHelp}
      />

      {showHelp && !selected && <HelpCard />}

      <SubassemblyDock selected={selected} onSelect={handleSelect} />

      {selected && (
        <PartDetailPanel
          partId={selected}
          live={live}
          zIndex={Z.panel}
          onClose={handleMiss}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
