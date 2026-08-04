// pages/Engine3D.tsx — the interactive 3D engine view.
//
// Stage 1: a rotatable green-wireframe 20V 8000 where every part is clickable and reports its live
// reading. The causal-network lattice and the cable fly-through mount as additional layers here.
//
// This page holds useEngine (via useLiveBridge) so it re-renders every tick — which is what keeps the
// detail panel's number live. <Scene> is memoized behind stable props so that tick never reaches the
// 3D tree; see engine3d/useLiveBridge.ts.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Scene } from '../engine3d/Scene';
import { PartDetailPanel } from '../engine3d/PartDetailPanel';
import { useLiveBridge } from '../engine3d/useLiveBridge';
import { PARTS, partsIn, SUBASSEMBLIES } from '../engine3d/topology';
import { GREEN } from '../engine3d/palette';
import { MTU8000 } from '@marine-pdm/shared';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

const LABEL: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: '0.14em',
  color: 'var(--text-dim)',
  fontWeight: 700,
};

const LEGEND = [
  { c: GREEN, t: 'Normal' },
  { c: '#F59E0B', t: 'Warning' },
  { c: '#F97316', t: 'High' },
  { c: '#EF4444', t: 'Critical' },
];

export function Engine3D() {
  const live = useLiveBridge();
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const webgl = useMemo(hasWebGL, []);

  const handleSelect = useCallback((id: string) => {
    selectedRef.current = id;
    setSelected(id);
  }, []);

  const handleMiss = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
  }, []);

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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Scene
        live={live}
        selectedRef={selectedRef}
        onSelect={handleSelect}
        onMiss={handleMiss}
      />

      {/* ── HUD ───────────────────────────────────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '12px 14px',
          width: 210,
          zIndex: 40,
          pointerEvents: 'none',
        }}
      >
        <div style={{ ...LABEL, color: GREEN }}>{MTU8000.MODEL}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          {PARTS.length} parts · {MTU8000.CYLINDERS} cylinders at {MTU8000.V_ANGLE_DEG}° V
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {LEGEND.map(l => (
            <div key={l.t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{ width: 8, height: 8, borderRadius: 2, background: l.c, display: 'inline-block' }}
              />
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{l.t}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: 9,
            color: 'var(--text-dim)',
            marginTop: 10,
            lineHeight: 1.6,
            borderTop: '1px solid var(--border-dim)',
            paddingTop: 8,
          }}
        >
          Drag to rotate · scroll to zoom
          <br />
          Click a part to identify it
        </div>
      </div>

      {/* ── Subassembly rail ──────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          maxWidth: 460,
          zIndex: 40,
        }}
      >
        {SUBASSEMBLIES.map(s => {
          const first = partsIn(s.id)[0];
          const active = selected != null && first != null && partsIn(s.id).some(p => p.id === selected);
          return (
            <button
              key={s.id}
              className="mag-btn"
              disabled={!first}
              onClick={() => first && handleSelect(first.id)}
              style={{
                fontSize: 9,
                padding: '5px 9px',
                borderColor: active ? GREEN : undefined,
                color: active ? GREEN : undefined,
              }}
            >
              {s.label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {selected && <PartDetailPanel partId={selected} onClose={handleMiss} />}
    </div>
  );
}
