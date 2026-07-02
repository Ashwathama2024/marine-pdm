import React from 'react';
import { Tabs, type TabDef } from '../components/Tabs';
import { useEngine } from '../context/EngineContext';
import { useAlerts } from '../context/AlertContext';
import { useDegradation } from '../context/DegradationContext';
import { SensorFocusProvider, useSensorFocus, FOCUS_SENSORS } from '../context/SensorFocusContext';
import { DeviationDashboard } from './DeviationDashboard';
import { DeviationTable } from './DeviationTable';
import { AlertAnalytics } from './AlertAnalytics';
import { DegradationLog } from './DegradationLog';
import { TrendChart } from '../dashboard/TrendChart';
import { CylinderView } from '../dashboard/CylinderView';

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)',
      border: '1px dashed var(--border-dim)', borderRadius: 'var(--radius-lg)',
    }}>
      {msg}
    </div>
  );
}

// Persistent focus rail — pick a sensor once, it filters the sensor-keyed tabs
// (Deviations, Table) and stays selected as you switch tabs. "All" clears it.
function SensorRail() {
  const { focus, setFocus } = useSensorFocus();
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', fontFamily: 'var(--font)', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.05em', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? 'rgba(56,189,248,0.16)' : 'var(--bg-elevated)',
    border: `1px solid ${active ? 'rgba(56,189,248,0.55)' : 'var(--border-dim)'}`,
    color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
    transition: 'all 0.15s',
  });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14,
      padding: '10px 12px', background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-lg)',
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginRight: 4 }}>
        FOCUS SENSOR
      </span>
      <button style={chip(focus === null)} onClick={() => setFocus(null)}>ALL</button>
      {FOCUS_SENSORS.map(s => (
        <button key={s.id} style={chip(focus === s.id)} onClick={() => setFocus(focus === s.id ? null : s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// One screen for exploratory analysis — every analytical view is a tab instead of a
// separate route, so the analyst switches views instantly instead of hopping pages
// and scrolling through stacked sections.
export function AnalysisWorkspace() {
  const { history, snapshot, decision, activeFaults, mtuCylFaults } = useEngine();
  const { unacknowledgedCount } = useAlerts();
  const { activeEvents } = useDegradation();

  const tabs: TabDef[] = [
    { id: 'deviations', label: 'Deviations', content: <DeviationDashboard /> },
    { id: 'table',      label: 'Table',      content: <DeviationTable /> },
    {
      id: 'trends', label: 'Trends',
      content: decision
        ? <TrendChart snapHistory={history} cylRisks={decision.cylRisks} decision={decision} activeFaults={activeFaults} mtuCylFaults={mtuCylFaults} />
        : <Empty msg="Start the engine to view trends." />,
    },
    {
      id: 'cylinders', label: 'Cylinders',
      content: snapshot && decision
        ? <CylinderView snap={snapshot} decision={decision} activeFaults={activeFaults} mtuCylFaults={mtuCylFaults} />
        : <Empty msg="Start the engine to view cylinder temperatures." />,
    },
    {
      id: 'alerts', label: 'Alerts', content: <AlertAnalytics />,
      badge: unacknowledgedCount || undefined, badgeColor: 'var(--risk-critical)',
    },
    {
      id: 'degradation', label: 'Degradation', content: <DegradationLog />,
      badge: activeEvents.length || undefined, badgeColor: 'var(--risk-warning)',
    },
  ];

  // No page-level header here — the app top-bar shows the page title and each embedded
  // view carries its own header. The focus rail + tab bar lead directly.
  return (
    <SensorFocusProvider>
      <SensorRail />
      <Tabs tabs={tabs} />
    </SensorFocusProvider>
  );
}
