import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Sidebar } from './layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { DeviationDashboard } from './pages/DeviationDashboard';
import { DeviationTable } from './pages/DeviationTable';
import { AlertAnalytics } from './pages/AlertAnalytics';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { BaselineEditorPage } from './pages/BaselineEditorPage';
import { Management } from './pages/Management';
import { Simulator } from './pages/Simulator';
import { DegradationBI } from './pages/DegradationBI';
import { AnalysisWorkspace } from './pages/AnalysisWorkspace';
import { HelpManual } from './pages/HelpManual';
import { AlertTicker } from './components/AlertTicker';
import { useEngine } from './context/EngineContext';
import { DegradationProvider } from './context/DegradationContext';
import { SimulatorControlProvider } from './context/SimulatorControlContext';

const PAGE_TITLES: Record<string, string> = {
  '/':             'Dashboard',
  '/analysis':     'Analysis Workspace',
  '/deviations':   'Deviation Overview',
  '/table':        'Analysis Table',
  '/alerts':       'Alert Analytics',
  '/degradation':  'Degradation Analytics',
  '/knowledge':    'Knowledge Base',
  '/baselines':    'Baseline Editor',
  '/management':   'Management',
  '/simulator':    'Simulator',
  '/help':         'User Manual',
};

function riskColor(risk: number): string {
  if (risk >= 75) return 'var(--risk-critical)';
  if (risk >= 50) return 'var(--risk-high)';
  if (risk >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

function Header({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const { snapshot, decision, shipName, setShipName, engineName, setEngineName, isOperational } = useEngine();
  const location = useLocation();
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  useEffect(() => {
    const id = setInterval(() =>
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    , 1000);
    return () => clearInterval(id);
  }, []);

  const statusStr = decision?.status ?? 'CONNECTING';
  const riskVal   = decision ? Math.round(decision.systemRisk) : 0;
  const col       = decision ? riskColor(decision.systemRisk) : 'var(--text-muted)';
  const ribbonCol = decision
    ? (statusStr === 'CRITICAL' ? 'var(--risk-critical)'
      : statusStr === 'HIGH'    ? 'var(--risk-high)'
      : statusStr === 'WARNING' ? 'var(--risk-warning)'
      : 'var(--risk-normal)')
    : 'var(--border)';
  const pageTitle = PAGE_TITLES[location.pathname] ?? '';

  return (
    <>
      <header style={{
        height: 'var(--header-h)',
        background: 'rgba(4,12,24,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(56,189,248,0.08)',
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px',
        flexShrink: 0, position: 'relative', zIndex: 10,
      }}>

        {sidebarCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" stroke="var(--risk-normal)" strokeWidth="1.5" fill="rgba(0,212,170,0.08)"/>
              <circle cx="12" cy="12" r="3" fill="var(--risk-normal)"/>
            </svg>
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
          {pageTitle}
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--border-dim)' }} />

        <input
          className="inline-edit"
          value={shipName}
          onChange={e => setShipName(e.target.value)}
          placeholder="Vessel name"
          style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', width: 150 }}
        />
        <input
          className="inline-edit"
          value={engineName}
          onChange={e => setEngineName(e.target.value)}
          style={{ fontSize: 10, color: 'var(--accent-blue)', width: 180 }}
        />

        <div style={{ flex: 1 }} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)',
          borderRadius: 4, padding: '3px 10px',
          fontSize: 10, color: 'var(--risk-normal)', letterSpacing: '0.08em',
        }}>
          <span className="live-dot" />
          SIMULATOR 1
        </div>

        {/* Risk badge — suppressed during pre-start to avoid false CRITICAL at 0-bar lube */}
        {isOperational ? (
          decision && (
            <div style={{
              background: `rgba(${
                statusStr === 'CRITICAL' ? '239,68,68' :
                statusStr === 'HIGH'     ? '249,115,22' :
                statusStr === 'WARNING'  ? '245,158,11' : '0,212,170'
              },0.10)`,
              border: `1px solid ${col}`,
              borderRadius: 4, padding: '4px 12px',
              fontSize: 12, fontWeight: 700, color: col,
              letterSpacing: '0.06em',
              transition: 'all 0.5s ease',
              boxShadow: `0 0 12px rgba(${
                statusStr === 'CRITICAL' ? '239,68,68' :
                statusStr === 'HIGH'     ? '249,115,22' :
                statusStr === 'WARNING'  ? '245,158,11' : '0,212,170'
              },0.20)`,
            }}>
              {statusStr} · {riskVal}
            </div>
          )
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-dim)',
            borderRadius: 4, padding: '4px 12px',
            fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.06em',
          }}>
            PRE-START
          </div>
        )}

        {snapshot && (
          <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            <span><span style={{ color: 'var(--text-dim)' }}>RPM </span>{snapshot.rpm.toFixed(0)}</span>
            <span><span style={{ color: 'var(--text-dim)' }}>LOAD </span>{snapshot.load.toFixed(0)}%</span>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', width: 70, textAlign: 'right' }}>
          {time}
        </div>
      </header>

      <div style={{ height: 3, background: ribbonCol, transition: 'background 0.6s ease', flexShrink: 0 }} />
    </>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SimulatorControlProvider>
    <DegradationProvider>
      <div className="app-shell">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

        <div className="app-main">
          <Header sidebarCollapsed={collapsed} />

          <div className="app-content">
            <div style={{ padding: 20, maxWidth: 1600, margin: '0 auto' }}>
              <Routes>
                <Route path="/"            element={<Dashboard />} />
                <Route path="/analysis"    element={<AnalysisWorkspace />} />
                <Route path="/deviations"  element={<DeviationDashboard />} />
                <Route path="/table"       element={<DeviationTable />} />
                <Route path="/alerts"      element={<AlertAnalytics />} />
                <Route path="/degradation" element={<DegradationBI />} />
                <Route path="/knowledge"   element={<KnowledgeBase />} />
                <Route path="/baselines"   element={<BaselineEditorPage />} />
                <Route path="/management"  element={<Management />} />
                <Route path="/simulator"   element={<Simulator />} />
                <Route path="/help"        element={<HelpManual />} />
              </Routes>
            </div>
          </div>
        </div>

        {/* Fixed footer alert ticker — always visible */}
        <AlertTicker />
      </div>
    </DegradationProvider>
    </SimulatorControlProvider>
  );
}
