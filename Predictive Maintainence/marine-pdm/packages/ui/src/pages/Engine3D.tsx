// pages/Engine3D.tsx — the interactive 3D engine view.
//
// Stage 1: a rotatable green-wireframe 20V 8000 where every part is clickable, reports its live
// reading, and moves with the engine. The causal-network lattice and the cable fly-through mount as
// additional layers here.
//
// This page holds useEngine (via useLiveBridge) so it re-renders every tick — which is what keeps
// the readout strip and the detail panel live. <Scene> is memoized behind stable props so that tick
// never reaches the 3D tree; see engine3d/useLiveBridge.ts.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Scene } from '../engine3d/Scene';
import { PartDetailPanel } from '../engine3d/PartDetailPanel';
import { useLiveBridge } from '../engine3d/useLiveBridge';
import { PARTS, partsIn, SUBASSEMBLIES } from '../engine3d/topology';
import { GREEN } from '../engine3d/palette';
import { useEngine } from '../context/EngineContext';
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

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: color ?? 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.2,
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

export function Engine3D() {
  const live = useLiveBridge();
  const { snapshot, decision, engineState, isOperational } = useEngine();

  const [selected, setSelected] = useState<string | null>(null);
  const [showFiring, setShowFiring] = useState(false);
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
  const riskCol = !isOperational
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
        onSelect={handleSelect}
        onMiss={handleMiss}
      />

      {/* ── Live readout ──────────────────────────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '12px 14px',
          width: 232,
          zIndex: 40,
        }}
      >
        <div style={{ ...LABEL, color: GREEN }}>{MTU8000.MODEL}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          {PARTS.length} parts · {MTU8000.CYLINDERS} cyl at {MTU8000.V_ANGLE_DEG}° V
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            paddingTop: 9,
            borderTop: '1px solid var(--border-dim)',
          }}
        >
          <span className={isOperational ? 'live-dot' : undefined} />
          <span style={{ fontSize: 10, fontWeight: 700, color: isOperational ? GREEN : 'var(--text-dim)' }}>
            {engineState}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 9 }}>
          <Stat label="RPM" value={snapshot ? snapshot.rpm.toFixed(0) : '—'} />
          <Stat label="LOAD" value={snapshot ? snapshot.load.toFixed(0) : '—'} unit="%" />
          <Stat label="RISK" value={riskText} color={riskCol} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
          {LEGEND.map(l => (
            <div key={l.t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{ width: 8, height: 8, borderRadius: 2, background: l.c, display: 'inline-block' }}
              />
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{l.t}</span>
            </div>
          ))}
        </div>

        <button
          className="mag-btn"
          onClick={toggleFiring}
          style={{
            width: '100%',
            marginTop: 10,
            fontSize: 9,
            borderColor: showFiring ? GREEN : undefined,
            color: showFiring ? GREEN : undefined,
          }}
        >
          {showFiring ? 'FIRING ORDER ON' : 'SHOW FIRING ORDER'}
        </button>

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
          <br />
          <span style={{ color: 'var(--text-muted)' }}>
            Rotation is proportional to live speed, slowed to stay readable.
          </span>
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
          const members = partsIn(s.id);
          const first = members[0];
          const active = selected != null && members.some(p => p.id === selected);
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

      {selected && (
        <PartDetailPanel
          partId={selected}
          live={live}
          onClose={handleMiss}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
