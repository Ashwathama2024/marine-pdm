import React, { useState, useEffect } from 'react';
import { engine } from '../context/EngineContext';
import { FaultInjector } from '../simulator/FaultInjector';
import { SensorFailurePanel } from '../simulator/SensorFailurePanel';
import { CylinderInjectorPanel } from '../simulator/CylinderInjectorPanel';
import { FaultPlacard } from '../simulator/FaultPlacard';
import { EngineControlPanel } from '../simulator/EngineControlPanel';
import { ValueInjectionPanel } from '../simulator/ValueInjectionPanel';
import { LOPPanel } from '../simulator/LOPPanel';
import { InterlockPanel } from '../simulator/InterlockPanel';
import { StartAirGauge } from '../simulator/StartAirGauge';
import { sensorRegistry } from '../simulator/registry';
import { createFaultConfig } from '@marine-pdm/simulator';
import type { FaultSpeed } from '@marine-pdm/simulator';
import { initialSeverity } from '../services/ramp-mode';
import type { CylFaultMap } from '../simulator/CylinderFaultPopup';

function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color,
        padding: '2px 10px', border: `1px solid ${color}35`, borderRadius: 3,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
    </div>
  );
}

export function Simulator() {
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick(t => t + 1);

  const [cylFaultMap, setCylFaultMap]     = useState<CylFaultMap>({});
  const [activeFaultIds, setActiveFaultIds] = useState<Set<string>>(new Set());

  // ── Reconstruct UI state from engine on every mount (navigation-safe) ─────────
  useEffect(() => {
    const mtuFaults = engine.getMTUFaultList();
    const newCylMap: CylFaultMap = {};
    const newIds = new Set<string>();

    for (const f of mtuFaults) {
      const m = f.id.match(/^(F01|F07)_cyl_(\d+)$/);
      if (m) {
        const cylIndex = parseInt(m[2]);
        newCylMap[cylIndex] = {
          faultType: m[1] as 'F01' | 'F07',
          intensity: f.intensity,
          speed: f.speed,
          uniqueId: f.id,
        };
      } else {
        newIds.add(f.id);
      }
    }

    setCylFaultMap(newCylMap);
    setActiveFaultIds(newIds);
  }, []);

  // ── Cylinder fault handlers ───────────────────────────────────────────────────
  function injectCylFault(cylIndex: number, faultType: 'F01' | 'F07', intensity: number, speed: FaultSpeed) {
    const uniqueId = `${faultType}_cyl_${cylIndex}`;
    const existing = cylFaultMap[cylIndex];
    if (existing) engine.clearMTUFault(existing.uniqueId);

    const config = createFaultConfig(uniqueId, {
      intensity, speed,
      targetCyls: [cylIndex],
      // Shared with FaultInjector's Severity Ramp toggle — see services/ramp-mode.ts.
      currentSeverity: initialSeverity(intensity),
    });
    engine.injectMTUFault(config);
    setCylFaultMap(prev => ({ ...prev, [cylIndex]: { faultType, intensity, speed, uniqueId } }));
  }

  function clearCylFault(cylIndex: number) {
    const existing = cylFaultMap[cylIndex];
    if (existing) {
      engine.clearMTUFault(existing.uniqueId);
      setCylFaultMap(prev => { const n = { ...prev }; delete n[cylIndex]; return n; });
    }
  }

  function clearAllCylFaults() {
    Object.values(cylFaultMap).forEach(f => engine.clearMTUFault(f.uniqueId));
    setCylFaultMap({});
  }

  // ── MTU scenario fault handlers ───────────────────────────────────────────────
  function clearMTUFault(id: string) {
    engine.clearMTUFault(id);
    const n = new Set(activeFaultIds); n.delete(id);
    setActiveFaultIds(n);
  }

  function clearAllMTUFaults() {
    engine.clearAllMTUFaults();
    setActiveFaultIds(new Set());
  }

  function handleFaultInjectorReset() {
    setCylFaultMap({});
  }

  return (
    <div>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">SIMULATOR</div>
          <div className="page-subtitle">ENGINE CONTROL · FAULT INJECTION · SENSOR FAILURE · VALUE OVERRIDE</div>
        </div>
      </div>

      {/* Active injections placard — visible only when something is active */}
      <FaultPlacard
        cylFaultMap={cylFaultMap}
        onClearCylFault={clearCylFault}
        onClearAllCylFaults={clearAllCylFaults}
        activeFaultIds={activeFaultIds}
        onClearMTUFault={clearMTUFault}
        onClearAllMTUFaults={clearAllMTUFaults}
        registry={sensorRegistry}
        onRegistryChange={forceUpdate}
      />

      {/* ── Local Operating Panel — full-width console (LCD display + buttons) ── */}
      <LOPPanel />

      {/* Two intent columns: OPERATE & OVERRIDE | FAULT INJECTION — halves scrolling, groups by intent */}
      <div className="sim-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start', marginTop: 16 }}>

        {/* LEFT — run the engine + manual value overrides */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionDivider label="OPERATE & OVERRIDE" color="#00D4AA" />
          <EngineControlPanel />
          <StartAirGauge />
          <InterlockPanel />
          <ValueInjectionPanel />
        </div>

        {/* RIGHT — inject faults & sensor failures */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionDivider label="FAULT INJECTION" color="#F97316" />
          <CylinderInjectorPanel
            cylFaultMap={cylFaultMap}
            onInjectFault={injectCylFault}
            onClearFault={clearCylFault}
            onClearAll={clearAllCylFaults}
          />
          <FaultInjector
            engine={engine}
            activeFaultIds={activeFaultIds}
            onActiveFaultIdsChange={setActiveFaultIds}
            onResetAll={handleFaultInjectorReset}
          />
          <SensorFailurePanel registry={sensorRegistry} onRegistryChange={forceUpdate} />
        </div>
      </div>
    </div>
  );
}
