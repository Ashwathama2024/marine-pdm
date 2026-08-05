// engine3d/Hud.tsx — overlay chrome for the 3D view.
//
// Layout principle: the canvas IS the content, so nothing sits in the middle. A status pill hugs the
// top-left, controls the top-right, and the subassembly dock runs along the bottom. The previous
// single 232px card ate a column down the whole left edge for a legend that is read once.
//
// Z-index stays on a 10/20/30 scale, all below the app's .overlay-backdrop (200), so the sensor
// popup still covers this correctly.

import React from 'react';
import { MTU8000 } from '@marine-pdm/shared';
import { MagButton } from './MagButton';
import { PARTS, partsIn, SUBASSEMBLIES } from './topology';
import { GREEN } from './palette';

export const Z = { dock: 20, panel: 30 } as const;

const LABEL: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: '0.14em',
  color: 'var(--text-dim)',
  fontWeight: 700,
  lineHeight: 1,
};

const LEGEND = [
  { c: GREEN, t: 'Normal' },
  { c: '#F59E0B', t: 'Warning' },
  { c: '#F97316', t: 'High' },
  { c: '#EF4444', t: 'Critical' },
];

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 42 }}>
      <span style={LABEL}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: color ?? 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

interface StatusProps {
  engineState: string;
  isOperational: boolean;
  rpm: string;
  load: string;
  risk: string;
  riskColor: string;
}

/** Top-left: what this is, and what it is doing right now. */
export function StatusPill({ engineState, isOperational, rpm, load, risk, riskColor }: StatusProps) {
  return (
    <div
      className="e3d-pill"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: Z.dock,
        padding: '9px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...LABEL, color: GREEN }}>{MTU8000.MODEL}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1 }}>
          {PARTS.length} parts · {MTU8000.CYLINDERS} cyl · {MTU8000.V_ANGLE_DEG}° V
        </span>
      </div>

      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-dim)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className={isOperational ? 'live-dot' : undefined} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isOperational ? GREEN : 'var(--text-dim)',
            letterSpacing: '0.06em',
          }}
        >
          {engineState}
        </span>
      </div>

      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-dim)' }} />

      <Stat label="RPM" value={rpm} />
      <Stat label="LOAD" value={load} unit="%" />
      <Stat label="RISK" value={risk} color={riskColor} />
    </div>
  );
}

interface ControlsProps {
  showFiring: boolean;
  onToggleFiring: () => void;
  showNetwork: boolean;
  onToggleNetwork: () => void;
  showHelp: boolean;
  onToggleHelp: () => void;
}

/** Top-right: legend and the view toggles. */
export function ControlsPill({
  showFiring,
  onToggleFiring,
  showNetwork,
  onToggleNetwork,
  showHelp,
  onToggleHelp,
}: ControlsProps) {
  return (
    <div
      className="e3d-pill"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: Z.dock,
        padding: '9px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 10 }} role="list" aria-label="Severity legend">
        {LEGEND.map(l => (
          <div key={l.t} style={{ display: 'flex', alignItems: 'center', gap: 4 }} role="listitem">
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: 2, background: l.c, display: 'inline-block' }}
            />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{l.t}</span>
          </div>
        ))}
      </div>

      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-dim)' }} />

      <MagButton
        pressed={showNetwork}
        onClick={onToggleNetwork}
        title="ECS 8000 control network — Field-BUS 1 and 2 with a drop to every node, plus the physical harness"
        style={{ minWidth: 84 }}
      >
        Network
      </MagButton>

      <MagButton
        pressed={showFiring}
        onClick={onToggleFiring}
        title="Walk the true firing order A1–B6–A6… slowed 48× from the real 192 Hz"
        style={{ minWidth: 96 }}
      >
        Firing order
      </MagButton>

      <MagButton
        pressed={showHelp}
        onClick={onToggleHelp}
        ariaLabel="Toggle controls help"
        title="Controls"
        style={{ minWidth: 34, padding: '6px 10px' }}
      >
        ?
      </MagButton>
    </div>
  );
}

interface DockProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

/**
 * Bottom dock — every subassembly in two centred rows.
 *
 * Split by half rather than a hard-coded six: there are 13 subassemblies, and slicing 0-6 / 6-12
 * silently dropped Sensor Harness off the end. Deriving the split means adding one can never orphan
 * it again.
 *
 * Two explicit rows rather than flex-wrap, because a control strip that grows a third row under the
 * cursor is the one thing a dock must never do.
 */
export function SubassemblyDock({ selected, onSelect }: DockProps) {
  const half = Math.ceil(SUBASSEMBLIES.length / 2);
  const rows = [SUBASSEMBLIES.slice(0, half), SUBASSEMBLIES.slice(half)];

  return (
    <div
      className="e3d-pill e3d-dock"
      style={{
        position: 'absolute',
        bottom: 0, // flush to the bottom edge of the canvas
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: Z.dock,
        padding: '7px 10px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        // Wide enough that no label ellipsises at the longest ("Charge Air"), and still inside the
        // viewport on narrow screens.
        width: 'min(920px, calc(100% - 24px))',
      }}
      role="group"
      aria-label="Jump to subassembly"
    >
      {rows.map((row, i) => (
        <div key={i} className="e3d-dock-row">
          {row.map(s => {
            const members = partsIn(s.id);
            const first = members[0];
            const active = selected != null && members.some(p => p.id === selected);
            return (
              <MagButton
                key={s.id}
                pressed={active}
                disabled={!first}
                onClick={() => first && onSelect(first.id)}
                ariaLabel={s.label}
                title={`${s.label} — ${members.length} part${members.length === 1 ? '' : 's'}`}
              >
                {s.short}
              </MagButton>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Controls help, shown on demand rather than occupying the canvas permanently. */
export function HelpCard() {
  return (
    <div
      className="e3d-pill"
      style={{
        position: 'absolute',
        top: 78, // clears the controls pill it hangs from
        right: 12,
        zIndex: Z.dock,
        padding: '10px 14px',
        width: 224,
        fontSize: 10,
        color: 'var(--text-muted)',
        lineHeight: 1.7,
      }}
      role="note"
    >
      <div style={{ ...LABEL, marginBottom: 6 }}>CONTROLS</div>
      Drag to rotate · scroll to zoom
      <br />
      Right-drag to pan
      <br />
      Click a part to identify it
      <br />
      Click empty space to deselect
      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--border-dim)',
          color: 'var(--text-dim)',
          fontSize: 9,
        }}
      >
        Turbochargers turn at the dashboard's own rate. The crankshaft is scaled — 1150 rpm is 19
        rev/s, unwatchable at 60 fps.
      </div>
    </div>
  );
}
