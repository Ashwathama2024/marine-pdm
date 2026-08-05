// engine3d/PartDetailPanel.tsx — "which part is this?", answered from live data.
//
// A side panel rather than a modal: the whole point of the view is that you keep rotating while you
// read. Everything shown here resolves through registries that already exist — SENSOR_META for the
// live number, DEGRADATION_COMPONENTS for what can fail, DOSSIER_ENTRIES for the prose — so this
// panel cannot drift from the rest of the app.

import React, { useState } from 'react';
import { DEGRADATION_COMPONENTS, DEGRADATION_MODES } from '@marine-pdm/simulator';
import { MTU8000, type BaselineSnapshot, type EngineSnapshot } from '@marine-pdm/shared';
import { getSensorMeta, readSensorValue, sensorLabel } from '../services/sensor-map';
import { getDossierEntry } from '../about/dossier-data';
import { SensorPopup } from '../dashboard/SensorPopup';
import { useEngine } from '../context/EngineContext';
import { cablesTouching, getPart, partsInside, SUBASSEMBLIES } from './topology';
import { MagButton } from './MagButton';
import { getEcsUnit, type EcsUnitInfo } from './ecs-units';
import { YELLOW } from './palette';
import type { LiveRef } from './useLiveBridge';
import type { TCInfo } from '../services/turbo-state';
import { GREEN } from './palette';

const LABEL: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: '0.14em',
  color: 'var(--text-dim)',
  fontWeight: 700,
};

interface Reading {
  label: string;
  value: number;
  unit: string;
  decimals: number;
  context?: string;
  /**
   * What the Dashboard shows for the same parameter. Instance-addressable parts read their own
   * probe while the dashboard gauge shows an engine-level aggregate, so the two legitimately differ
   * — stating both is the difference between "this is per-cylinder" and "these numbers disagree".
   */
  compare?: string;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * The live number for a part. Instance-addressable parts read their own array element — clicking
 * cylinder A4 must show A4's probe, not the 20-cylinder mean that ME.ExhaustTemp resolves to.
 */
function reading(
  partId: string,
  snapshot: EngineSnapshot | null,
  baseline: BaselineSnapshot | null,
  tcInfos: TCInfo[],
): Reading | null {
  const part = getPart(partId);
  if (!part || !snapshot) return null;
  const i = part.instanceIndex;

  if (part.componentId === 'injectors' && i !== undefined) {
    const cyl = snapshot.cylTemps as number[];
    const v = cyl?.[i];
    if (typeof v !== 'number') return null;
    // Bank mean, not engine mean: the A/B banks sit ~4 °C apart by design (BSIDE_TEMP_BIAS).
    const bank = i < 10 ? cyl.slice(0, 10) : cyl.slice(10, 20);
    const d = v - mean(bank);
    return {
      label: `Exhaust temp · ${MTU8000.CYL_NAMES[i]} probe`,
      value: v,
      unit: '°C',
      decimals: 1,
      context: `${d >= 0 ? '+' : ''}${d.toFixed(1)} °C vs ${i < 10 ? 'A' : 'B'}-bank mean`,
      compare: `Dashboard "Exhaust Temp" gauge shows the engine mean, ${snapshot.exhaustTemp.toFixed(1)} °C`,
    };
  }

  if (part.componentId === 'bearings' && i !== undefined) {
    const brg = snapshot.bearingTemps as number[];
    const v = brg?.[i];
    if (typeof v !== 'number') return null;
    const max = Math.max(...brg);
    return {
      label: `Bearing temp · Brg ${i + 1}`,
      value: v,
      unit: '°C',
      decimals: 1,
      context:
        v === max
          ? 'Hottest of the 11 — this is the one the safety system watches'
          : `${(max - v).toFixed(1)} °C below the hottest bearing`,
      compare: `Dashboard "Bearing Temp" gauge shows the hottest of the 11, ${max.toFixed(1)} °C`,
    };
  }

  if (part.componentId === 'turbocharger' && i !== undefined) {
    // Read the same derived state the dashboard's Turbocharger panel shows, NOT snapshot.tcSpeeds[i]
    // — the displayed speed is tcRPM scaled by how many units are cut in. See services/turbo-state.
    const tc = tcInfos[i];
    if (!tc) return null;
    return {
      label: `TC speed · ${tc.name}`,
      value: tc.displaySpeed,
      unit: 'rpm',
      decimals: 0,
      context:
        tc.status === 'STANDBY'
          ? 'CUT-OFF — windmilling, bypass valve closed'
          : tc.status === 'ALARM'
            ? `⚠ ALARM — Δ ${tc.deviation >= 0 ? '+' : ''}${Math.round(tc.deviation)} rpm from expected`
            : 'CUT-IN — active',
      compare: `Dashboard "TC Speed" gauge shows the 4-TC base speed, ${snapshot.tcRPM.toFixed(0)} rpm`,
    };
  }

  const tag = part.sensorTags[0];
  const meta = tag ? getSensorMeta(tag) : null;
  if (!meta) return null;
  const v = readSensorValue(snapshot, meta);
  const expected = baseline ? (baseline[meta.baselineKey] as number) : undefined;
  return {
    label: sensorLabel(tag),
    value: v,
    unit: meta.unit,
    decimals: meta.decimals,
    context:
      typeof expected === 'number'
        ? `expected ${expected.toFixed(meta.decimals)} ${meta.unit}`
        : undefined,
  };
}

/** Fault modes that can degrade this part, straight off the degradation matrix. */
function faultsFor(componentId: string | undefined) {
  if (!componentId) return [];
  const comp = DEGRADATION_COMPONENTS.find(c => c.id === componentId);
  if (!comp) return [];
  return DEGRADATION_MODES.filter(m => comp.modeIds.includes(m.id));
}

/** Reference card for an ECS 8000 control unit — the control-side equivalent of a sensor dossier. */
function EcsUnitCard({ unit }: { unit: EcsUnitInfo }) {
  const row: React.CSSProperties = { fontSize: 10, lineHeight: 1.55, color: 'var(--text-secondary)' };
  const term: React.CSSProperties = { color: YELLOW, fontWeight: 700 };

  return (
    <div style={{ marginTop: 14 }}>
      {/* Identity strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          paddingBottom: 10,
          borderBottom: '1px solid var(--border-dim)',
        }}
      >
        <span
          style={{
            fontSize: 9,
            padding: '2px 7px',
            borderRadius: 3,
            background: 'rgba(255,214,10,0.10)',
            border: '1px solid rgba(255,214,10,0.35)',
            color: YELLOW,
            letterSpacing: '0.06em',
          }}
        >
          {unit.location.toUpperCase()}
        </span>
        {unit.family && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{unit.family}</span>
        )}
        {unit.nodes.map(n => (
          <span
            key={n.no}
            style={{
              fontSize: 9,
              padding: '2px 7px',
              borderRadius: 3,
              background: 'rgba(56,189,248,0.10)',
              border: '1px solid rgba(56,189,248,0.30)',
              color: 'var(--accent-blue)',
            }}
            title={`${n.label} is CAN node ${n.no}`}
          >
            NODE {n.no} · {n.label}
          </span>
        ))}
        {unit.nodes.length === 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Not an addressed CAN node</span>
        )}
      </div>

      <div style={{ ...LABEL, marginTop: 12 }}>ROLE</div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 15 }}>
        {unit.role.map((r, i) => (
          <li key={i} style={{ ...row, marginBottom: 4 }}>
            {r}
          </li>
        ))}
      </ul>

      {unit.connectors && (
        <>
          <div style={{ ...LABEL, marginTop: 14 }}>CONNECTORS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
            {unit.connectors.map(c => (
              <div key={c.id} style={row}>
                <span style={term}>{c.id}</span> — {c.purpose}
              </div>
            ))}
          </div>
        </>
      )}

      {unit.interfaces && (
        <>
          <div style={{ ...LABEL, marginTop: 14 }}>INTERFACES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
            {unit.interfaces.map(c => (
              <div key={c.id} style={row}>
                <span style={term}>{c.id}</span> — {c.purpose}
              </div>
            ))}
          </div>
        </>
      )}

      {unit.connects && (
        <>
          <div style={{ ...LABEL, marginTop: 14 }}>CONNECTED EQUIPMENT</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 15 }}>
            {unit.connects.map((c, i) => (
              <li key={i} style={{ ...row, marginBottom: 3 }}>
                {c}
              </li>
            ))}
          </ul>
        </>
      )}

      <div
        style={{
          fontSize: 9,
          color: 'var(--text-dim)',
          marginTop: 12,
          paddingTop: 8,
          borderTop: '1px solid var(--border-dim)',
          lineHeight: 1.5,
        }}
      >
        Source: {unit.source}
      </div>
    </div>
  );
}

export function PartDetailPanel({
  partId,
  live,
  zIndex = 30,
  onClose,
  onSelect,
}: {
  partId: string;
  live: LiveRef;
  zIndex?: number;
  onClose: () => void;
  onSelect?: (id: string) => void;
}) {
  const { snapshot, baseline, history } = useEngine();
  const [showFull, setShowFull] = useState(false);
  const [showProse, setShowProse] = useState(false);

  const part = getPart(partId);
  if (!part) return null;

  // The panel re-renders every tick with useEngine, so reading the bridge ref here stays in step.
  const r = reading(partId, snapshot, baseline, live.current.tcInfos);
  const contained = partsInside(partId);
  const ecsUnit = getEcsUnit(partId);
  const faults = faultsFor(part.componentId);
  const cables = cablesTouching(partId);
  const dossier = part.dossierId ? getDossierEntry(part.dossierId) : undefined;
  const subLabel = SUBASSEMBLIES.find(s => s.id === part.subassembly)?.label ?? part.subassembly;

  const tag = part.sensorTags[0];
  const meta = tag ? getSensorMeta(tag) : null;

  return (
    <>
      <div
        className="e3d-pill"
        style={{
          position: 'absolute',
          // Clears the controls pill above (bottom edge 66) and the dock below (~73 tall, flush to
          // the bottom edge), so all three can be open at once without overlapping.
          top: 78,
          right: 12,
          width: 320,
          maxHeight: 'calc(100% - 165px)',
          overflowY: 'auto',
          padding: '14px 16px',
          zIndex,
        }}
        role="dialog"
        aria-label={`${part.label} detail`}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...LABEL, color: GREEN }}>{subLabel.toUpperCase()}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 3 }}>
              {part.label}
            </div>
            {part.mtuDesignation && (
              <div style={{ fontSize: 10, color: 'var(--accent-blue)', marginTop: 2 }}>
                MTU {part.mtuDesignation}
                {tag ? ` · ${tag}` : ''}
              </div>
            )}
          </div>
          <MagButton
            onClick={onClose}
            ariaLabel="Close part detail"
            title="Close"
            style={{ padding: '4px 10px', fontSize: 13, minHeight: 28 }}
          >
            ×
          </MagButton>
        </div>

        {part.note && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            {part.note}
          </div>
        )}

        {ecsUnit && <EcsUnitCard unit={ecsUnit} />}

        {r ? (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius)',
            }}
          >
            <div style={LABEL}>{r.label.toUpperCase()}</div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: GREEN,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
              }}
            >
              {r.value.toFixed(r.decimals)}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 5 }}>{r.unit}</span>
            </div>
            {r.context && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{r.context}</div>
            )}
            {r.compare && (
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--text-dim)',
                  marginTop: 5,
                  paddingTop: 5,
                  borderTop: '1px solid var(--border-dim)',
                  lineHeight: 1.5,
                }}
              >
                {r.compare}
              </div>
            )}
          </div>
        ) : ecsUnit ? null : (
          // Suppressed for ECS units — the reference card above already explains what they do, and
          // "not measured" would read as a gap rather than as the nature of a control box.
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 14, lineHeight: 1.5 }}>
            No instrumented sensor on this part — it carries signal but is not itself measured.
          </div>
        )}

        {contained.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={LABEL}>CONTAINS — {contained.length} PARTS</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.5 }}>
              Clicking through this housing in the scene selects whatever is behind it; use these to
              pick directly.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
              {contained.map(c => (
                <MagButton
                  key={c.id}
                  onClick={() => onSelect?.(c.id)}
                  style={{ fontSize: 9, padding: '5px 9px', minHeight: 28 }}
                >
                  {c.label}
                </MagButton>
              ))}
            </div>
          </div>
        )}

        {faults.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={LABEL}>WHAT CAN GO WRONG HERE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 7 }}>
              {faults.map(f => (
                <div key={f.id} style={{ fontSize: 10, lineHeight: 1.45 }}>
                  <span style={{ color: 'var(--risk-warning)', fontWeight: 700 }}>{f.id}</span>
                  <span style={{ color: 'var(--text-secondary)' }}> · {f.name}</span>
                  <div style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                    {f.ecsAlarmCode} · {f.scope}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cables.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={LABEL}>CABLES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }}>
              {cables.map(c => (
                <div key={c.cableNo} style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 700 }}>{c.cableNo}</span>
                  {c.provenance === 'seed' && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 8,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'rgba(245,158,11,0.12)',
                        border: '1px solid rgba(245,158,11,0.35)',
                        color: 'var(--risk-warning)',
                        letterSpacing: '0.08em',
                      }}
                    >
                      PLACEHOLDER
                    </span>
                  )}
                  <div style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                    {c.from.partId} → {c.to.partId} · {c.kind}
                    {c.cores ? ` · ${c.cores} core` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dossier && (
          <div style={{ marginTop: 16 }}>
            <MagButton
              pressed={showProse}
              onClick={() => setShowProse(p => !p)}
              style={{ width: '100%', fontSize: 9 }}
            >
              {showProse ? 'Hide' : 'What this reading means'}
            </MagButton>
            {showProse && (
              <div
                style={{
                  fontSize: 10,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  marginTop: 10,
                }}
              >
                <div>{dossier.definition}</div>
                <div style={{ marginTop: 10, color: 'var(--text-muted)' }}>
                  {dossier.cascadeConsequence}
                </div>
              </div>
            )}
          </div>
        )}

        {meta && (
          <MagButton
            onClick={() => setShowFull(true)}
            style={{ width: '100%', marginTop: 10, fontSize: 9 }}
          >
            Full sensor analysis
          </MagButton>
        )}
      </div>

      {/* The dashboard's own popup, mounted unchanged — charts, cause chain, AI diagnosis. */}
      {showFull && meta && tag && snapshot && (
        <SensorPopup
          sensorId={tag}
          label={sensorLabel(tag)}
          unit={meta.unit}
          decimals={meta.decimals}
          actual={readSensorValue(snapshot, meta)}
          expected={baseline ? (baseline[meta.baselineKey] as number) : 0}
          history={(history[meta.histKey] as number[]) ?? []}
          baselineHistory={(history[meta.baseKey] as number[]) ?? []}
          onClose={() => setShowFull(false)}
        />
      )}
    </>
  );
}
