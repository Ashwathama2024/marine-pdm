import React from 'react';
import { FAULT_DEFINITIONS } from '@marine-pdm/simulator';
import type { SensorFailureRegistry } from '@marine-pdm/simulator';
import type { CylFaultMap } from './CylinderFaultPopup';

function cylLabel(idx: number): string {
  return idx < 10 ? `A${idx + 1}` : `B${idx - 9}`;
}

interface Props {
  cylFaultMap:         CylFaultMap;
  onClearCylFault:     (idx: number) => void;
  onClearAllCylFaults: () => void;
  activeFaultIds:      Set<string>;
  onClearMTUFault:     (id: string) => void;
  onClearAllMTUFaults: () => void;
  registry:            SensorFailureRegistry;
  onRegistryChange:    () => void;
}

export function FaultPlacard({
  cylFaultMap,
  onClearCylFault,
  onClearAllCylFaults,
  activeFaultIds,
  onClearMTUFault,
  onClearAllMTUFaults,
  registry,
  onRegistryChange,
}: Props) {
  const cylEntries  = Object.entries(cylFaultMap) as [string, NonNullable<CylFaultMap[number]>][];
  const mtuEntries  = [...activeFaultIds];
  const sensorIds   = registry.getActiveIds();
  const totalActive = cylEntries.length + mtuEntries.length + sensorIds.length;

  if (totalActive === 0) return null;

  function resetAll() {
    onClearAllCylFaults();
    onClearAllMTUFaults();
    registry.deactivateAll();
    onRegistryChange();
  }

  return (
    <div style={{
      background: 'rgba(239,68,68,0.04)',
      border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 'var(--radius-lg)',
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--risk-critical)' }}>
            ACTIVE INJECTIONS
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700,
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: 'var(--risk-critical)',
            borderRadius: 3, padding: '1px 7px',
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }}>
            {totalActive}
          </span>
        </div>
        <button
          onClick={resetAll}
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: 'var(--risk-critical)',
            fontFamily: 'var(--font)',
          }}
        >
          RESET ALL INJECTIONS
        </button>
      </div>

      {/* Fault chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>

        {/* Cylinder faults (F01 / F07 via MTU system) */}
        {cylEntries.map(([idxStr, fault]) => {
          const idx = Number(idxStr);
          const color = fault.intensity >= 70 ? '#ef4444' : fault.intensity >= 40 ? '#f97316' : '#f59e0b';
          const bg    = fault.intensity >= 70 ? 'rgba(239,68,68,0.14)' : fault.intensity >= 40 ? 'rgba(249,115,22,0.12)' : 'rgba(245,158,11,0.10)';
          const bd    = fault.intensity >= 70 ? 'rgba(239,68,68,0.40)' : fault.intensity >= 40 ? 'rgba(249,115,22,0.38)' : 'rgba(245,158,11,0.35)';
          return (
            <FaultChip
              key={`cyl-${idx}`}
              category={fault.faultType}
              label={cylLabel(idx)}
              detail={`${fault.intensity}% · ${fault.speed}`}
              bg={bg} borderColor={bd} textColor={color}
              onClear={() => onClearCylFault(idx)}
            />
          );
        })}

        {/* MTU scenario faults (F02–F08 excl. cylinder types) */}
        {mtuEntries.map(id => {
          const def = FAULT_DEFINITIONS.find(f => f.id === id);
          return (
            <FaultChip
              key={`mtu-${id}`}
              category="MTU"
              label={id}
              detail={def?.name ?? ''}
              bg="rgba(249,115,22,0.12)"
              borderColor="rgba(249,115,22,0.38)"
              textColor="#f97316"
              onClear={() => onClearMTUFault(id)}
            />
          );
        })}

        {/* Sensor failures */}
        {sensorIds.map(sensorId => {
          const cfg       = registry.getConfig(sensorId);
          const shortLabel = sensorId.split('.').slice(-1)[0] ?? sensorId;
          return (
            <FaultChip
              key={`sensor-${sensorId}`}
              category="SENSOR"
              label={shortLabel}
              detail={cfg?.mode ?? ''}
              bg="rgba(245,158,11,0.10)"
              borderColor="rgba(245,158,11,0.35)"
              textColor="#f59e0b"
              onClear={() => { registry.deactivate(sensorId); onRegistryChange(); }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ChipProps {
  category:    string;
  label:       string;
  detail:      string;
  bg:          string;
  borderColor: string;
  textColor:   string;
  onClear:     () => void;
}

function FaultChip({ category, label, detail, bg, borderColor, textColor, onClear }: ChipProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 6px 4px 8px',
      background: bg, border: `1px solid ${borderColor}`,
      borderRadius: 5,
    }}>
      <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', color: textColor, opacity: 0.7 }}>
        {category}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color: textColor }}>{label}</span>
      {detail && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{detail}</span>
      )}
      <button
        onClick={onClear}
        title={`Clear ${label}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: textColor, fontSize: 14, lineHeight: 1, padding: '0 2px',
          opacity: 0.75, marginLeft: 2,
        }}
      >×</button>
    </div>
  );
}
