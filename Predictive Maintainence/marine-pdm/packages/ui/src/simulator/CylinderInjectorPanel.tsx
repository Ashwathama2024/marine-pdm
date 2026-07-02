import React, { useState } from 'react';
import { CylinderFaultPopup } from './CylinderFaultPopup';
import type { CylFaultEntry, CylFaultMap } from './CylinderFaultPopup';
import type { FaultSpeed } from '@marine-pdm/simulator';

function cylLabel(idx: number): string {
  return idx < 10 ? `A${idx + 1}` : `B${idx - 9}`;
}

function faultStyle(fault: CylFaultEntry | undefined) {
  if (!fault) return {
    bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)',
    text: 'var(--text-dim)', glow: 'none',
    fillBg: 'transparent', dotColor: 'transparent',
  };
  const p = fault.intensity;
  if (p >= 70) return {
    bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.70)',
    text: '#ef4444', glow: '0 0 10px rgba(239,68,68,0.45)',
    fillBg: 'linear-gradient(0deg,rgba(239,68,68,0.35) 0%,rgba(239,68,68,0.08) 100%)',
    dotColor: '#ef4444',
  };
  if (p >= 40) return {
    bg: 'rgba(249,115,22,0.14)', border: 'rgba(249,115,22,0.60)',
    text: '#f97316', glow: '0 0 8px rgba(249,115,22,0.35)',
    fillBg: 'linear-gradient(0deg,rgba(249,115,22,0.30) 0%,rgba(249,115,22,0.06) 100%)',
    dotColor: '#f97316',
  };
  return {
    bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.45)',
    text: '#f59e0b', glow: '0 0 5px rgba(245,158,11,0.25)',
    fillBg: 'linear-gradient(0deg,rgba(245,158,11,0.25) 0%,rgba(245,158,11,0.05) 100%)',
    dotColor: '#f59e0b',
  };
}

function CylButton({ idx, fault, onClick }: { idx: number; fault: CylFaultEntry | undefined; onClick: () => void }) {
  const c = faultStyle(fault);
  const p = fault?.intensity ?? 0;
  return (
    <button
      onClick={onClick}
      title={fault
        ? `${cylLabel(idx)}: ${fault.faultType} ${p}% — click to edit`
        : `${cylLabel(idx)} — click to inject fault`}
      style={{
        position: 'relative', height: 58, borderRadius: 5,
        border: `1px solid ${c.border}`, background: c.bg,
        cursor: 'pointer', boxShadow: c.glow,
        transition: 'all 0.25s', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: 5, gap: 1,
      }}
    >
      {/* Severity fill rises from bottom */}
      {fault && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${p}%`, background: c.fillBg,
          transition: 'height 0.5s', pointerEvents: 'none',
        }} />
      )}
      {/* Pulsing fault dot */}
      {fault && (
        <div style={{
          position: 'absolute', top: 5,
          width: 5, height: 5, borderRadius: '50%',
          background: c.dotColor, boxShadow: `0 0 5px ${c.dotColor}`,
          animation: 'pulse-dot 1.5s ease-in-out infinite',
        }} />
      )}
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: c.text, position: 'relative', zIndex: 1, lineHeight: 1 }}>
        {cylLabel(idx)}
      </span>
      {fault && (
        <span style={{ fontSize: 9, color: c.text, opacity: 0.85, position: 'relative', zIndex: 1, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {fault.faultType} {p}%
        </span>
      )}
    </button>
  );
}

interface Props {
  cylFaultMap:   CylFaultMap;
  onInjectFault: (cylIndex: number, faultType: 'F01' | 'F07', intensity: number, speed: FaultSpeed) => void;
  onClearFault:  (cylIndex: number) => void;
  onClearAll:    () => void;
}

export function CylinderInjectorPanel({ cylFaultMap, onInjectFault, onClearFault, onClearAll }: Props) {
  const [selectedCyl, setSelectedCyl] = useState<number | null>(null);
  const faultCount = Object.keys(cylFaultMap).length;
  const hasFaults  = faultCount > 0;

  return (
    <>
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hasFaults ? 'rgba(239,68,68,0.35)' : 'var(--border-dim)'}`,
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        transition: 'border-color 0.4s', marginBottom: 16,
      }}>
        {/* Header */}
        <div style={{
          background: hasFaults ? 'rgba(239,68,68,0.06)' : 'var(--bg-elevated)',
          borderBottom: `1px solid ${hasFaults ? 'rgba(239,68,68,0.20)' : 'var(--border-dim)'}`,
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="label-sm" style={{ color: hasFaults ? 'var(--risk-critical)' : undefined }}>
              Cylinder Fault Injector
            </span>
            <span className="label-xs" style={{ color: 'var(--text-dim)' }}>
              MTU 20V · 20 Cylinders · F01 / F07 · Click to inject
            </span>
            {hasFaults && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                color: 'var(--risk-critical)',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 3, padding: '1px 6px',
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }}>
                {faultCount} FAULT{faultCount > 1 ? 'S' : ''} ACTIVE
              </span>
            )}
          </div>
          <span className="label-xs">SIMULATOR ONLY</span>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Bank A */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#F97316' }}>BANK A</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(249,115,22,0.18)' }} />
              <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>A-side</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {[0,1,2,3,4,5,6,7,8,9].map(idx => (
                <CylButton key={idx} idx={idx} fault={cylFaultMap[idx]} onClick={() => setSelectedCyl(idx)} />
              ))}
            </div>
          </div>

          {/* V-engine crankshaft divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,rgba(56,189,248,0.15),transparent)' }} />
            <span style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.12em', padding: '2px 10px', border: '1px solid rgba(56,189,248,0.12)', borderRadius: 3 }}>
              V20 CRANKSHAFT
            </span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,rgba(56,189,248,0.15),transparent)' }} />
          </div>

          {/* Bank B */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#F97316' }}>BANK B</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(249,115,22,0.18)' }} />
              <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>B-side · runs ~4°C hotter than A</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {[10,11,12,13,14,15,16,17,18,19].map(idx => (
                <CylButton key={idx} idx={idx} fault={cylFaultMap[idx]} onClick={() => setSelectedCyl(idx)} />
              ))}
            </div>
          </div>

          {hasFaults && (
            <button
              onClick={onClearAll}
              style={{
                width: '100%', padding: '6px 0', fontSize: 10,
                fontFamily: 'var(--font)', fontWeight: 700, letterSpacing: '0.06em',
                borderRadius: 5, cursor: 'pointer',
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.30)',
                color: 'var(--risk-critical)',
              }}
            >
              Clear All Cylinder Faults ({faultCount})
            </button>
          )}
        </div>
      </div>

      {selectedCyl !== null && (
        <CylinderFaultPopup
          cylIndex={selectedCyl}
          currentFault={cylFaultMap[selectedCyl]}
          onInject={onInjectFault}
          onClear={onClearFault}
          onClose={() => setSelectedCyl(null)}
        />
      )}
    </>
  );
}
