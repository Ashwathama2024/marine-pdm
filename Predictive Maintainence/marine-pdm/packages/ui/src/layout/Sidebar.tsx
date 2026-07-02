import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAlerts } from '../context/AlertContext';
import { useDegradation } from '../context/DegradationContext';
import { useEngine } from '../context/EngineContext';
import { STATE_BADGE } from '@marine-pdm/simulator';
import type { EngineState } from '@marine-pdm/simulator';
import { useSimulatorControl } from '../context/SimulatorControlContext';

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// Grouped by intent: OPERATE (run the plant) vs ANALYZE (exploratory analysis).
const NAV_GROUPS: { group: string; items: { to: string; label: string; icon: string; color: string; glow: string }[] }[] = [
  {
    group: 'OPERATE',
    items: [
      { to: '/',          label: 'Dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', color: '#00D4AA', glow: '0,212,170'  },
      { to: '/simulator', label: 'Simulator', icon: 'M9.5 2A2.5 2.5 0 017 4.5v1A2.5 2.5 0 009.5 8h5A2.5 2.5 0 0017 5.5v-1A2.5 2.5 0 0014.5 2h-5zM4 10h16M4 14h16M4 18h16', color: '#F97316', glow: '249,115,22' },
    ],
  },
  {
    group: 'ANALYZE',
    items: [
      // Deviations / Table / Alerts / Degradation are now TABS inside the Analysis workspace (one screen, no hopping).
      { to: '/analysis',    label: 'Analysis',       icon: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',                          color: '#38BDF8', glow: '56,189,248'  },
      { to: '/degradation', label: 'Degradation BI', icon: 'M13 17H3m10 0l-4-4m4 4l-4 4M21 7H11m10 0l-4-4m4 4l-4 4',                       color: '#F59E0B', glow: '245,158,11'  },
      { to: '/knowledge',   label: 'Knowledge Base', icon: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z', color: '#A78BFA', glow: '167,139,250' },
      { to: '/baselines',  label: 'Baselines',      icon: 'M3 3v18h18M7 16l4-4 4 4 5-5',                                                   color: '#10B981', glow: '16,185,129'  },
      { to: '/management', label: 'Management',     icon: 'M12 20h9 M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z',                color: '#6366F1', glow: '99,102,241'  },
    ],
  },
  {
    group: 'HELP',
    items: [
      { to: '/help', label: 'User Manual', icon: 'M12 22a10 10 0 100-20 10 10 0 000 20z M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5 M12 17h.01', color: '#38BDF8', glow: '56,189,248' },
    ],
  },
];

function ctrlBtn(enabled: boolean, color: string): React.CSSProperties {
  return {
    flex: 1, padding: '8px 4px', fontSize: 8, fontWeight: 700,
    letterSpacing: '0.1em', borderRadius: 5, fontFamily: 'var(--font)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    background: enabled ? `${color}18` : 'rgba(255,255,255,0.03)',
    border: `1px solid ${enabled ? `${color}55` : 'var(--border-dim)'}`,
    color: enabled ? color : 'var(--text-dim)',
    transition: 'all 0.2s',
  };
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: Props) {
  const { unacknowledgedCount } = useAlerts();
  const { activeEvents } = useDegradation();
  const { engineState, engineControls, interlocks, snapshot } = useEngine();
  const { rpm, setRpm } = useSimulatorControl();
  const { pathname } = useLocation();
  const isOperateRoute = pathname === '/' || pathname === '/simulator';
  // Engine control is open on OPERATE routes, collapsed on ANALYZE routes so the nav
  // never forces a scroll while exploring data. Resets on route change; toggle-able.
  const [engineOpen, setEngineOpen] = React.useState(isOperateRoute);
  React.useEffect(() => { setEngineOpen(isOperateRoute); }, [isOperateRoute]);

  const badge       = STATE_BADGE[engineState];
  const ilStatus    = interlocks.getStatus();
  const readyCount  = ilStatus.filter(s => s.ok).length;
  const allReady    = readyCount === 8;
  const isPreOp     = ['ENGINE_OFF', 'STANDBY', 'SAFETY_TURNING', 'CRANKING'].includes(engineState);
  const isRunning   = !isPreOp && engineState !== 'STOPPING';

  const liveRpm     = snapshot?.rpm  ?? 0;
  const liveLoad    = snapshot?.load ?? 0;
  const rpmPct      = Math.min(100, (liveRpm / 1150) * 100);
  const loadColor   = liveLoad >= 85 ? '#ef4444' : liveLoad >= 60 ? '#f97316' : liveLoad >= 30 ? '#f59e0b' : '#00D4AA';

  // Speed lever is live whenever the engine is running (declutched rev raises RPM, not load).
  const rpmActive = ['IDLE', 'WARMING', 'DECLUTCHED_RUN', 'CLUTCHED', 'LOADED'].includes(engineState);

  const canStart   = engineState === 'ENGINE_OFF' || (engineState === 'STANDBY' && allReady);
  const canStop    = isRunning;
  const canClutch  = ['IDLE', 'WARMING', 'DECLUTCHED_RUN'].includes(engineState);
  const canDeclutch= ['CLUTCHED', 'LOADED'].includes(engineState);

  const startLabel  = engineState === 'ENGINE_OFF' ? '▶ READY UP'
    : engineState === 'STANDBY' ? (allReady ? '▶ START ENG' : '… INTERLOCKS')
    : ['SAFETY_TURNING', 'CRANKING'].includes(engineState) ? '… STARTING'
    : '✓ RUNNING';
  const clutchLabel = engineState === 'DECLUTCHED_RUN' ? '⊕ ENGAGE'
    : engineState === 'CLUTCHING' ? '… CLUTCHING'
    : '⊕ CLUTCH';

  return (
    <>
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>

        {/* Brand header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '16px 14px 14px',
          borderBottom: '1px solid rgba(56,189,248,0.10)', flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(0,212,170,0.06) 0%, rgba(56,189,248,0.04) 100%)',
        }}>
          <button
            onClick={onToggle}
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-muted)', cursor: 'pointer', padding: 6, borderRadius: 6,
              display: 'flex', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0,
            }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {!collapsed && (
            <div style={{ marginLeft: 10, overflow: 'hidden' }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                background: 'linear-gradient(90deg, #00D4AA, #38BDF8)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>MARINE PDM</div>
              <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em', marginTop: 1 }}>MTU 8000 · v2.0</div>
            </div>
          )}

          {/* Engine state dot — replaces the old fixed green live dot */}
          <div style={{ marginLeft: 'auto' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: badge.color,
              boxShadow: `0 0 8px ${badge.color}`,
              animation: badge.pulse ? 'pulse-dot 1.4s ease-in-out infinite' : undefined,
              transition: 'background 0.5s, box-shadow 0.5s',
            }} />
          </div>
        </div>

        <div className="sidebar-scroll">

          {/* Navigation */}
          <div style={{ padding: '8px 0 4px' }}>
            {NAV_GROUPS.map(grp => (
              <div key={grp.group}>
                <div className="sidebar-label sidebar-hide" style={{ paddingTop: 8 }}>{grp.group}</div>
                {grp.items.map(item => (
              <NavLink
                key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => `nav-item-glass${isActive ? ' active' : ''}`}
                style={({ isActive: _ }) => ({ '--nav-color': item.color, '--nav-glow': item.glow } as React.CSSProperties)}
                title={collapsed ? item.label : undefined}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `rgba(${item.glow},0.10)`, border: `1px solid rgba(${item.glow},0.20)`,
                  color: item.color, transition: 'all 0.2s',
                }}>
                  <Icon d={item.icon} size={14} />
                </span>
                <span className="nav-label" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.label}
                  {item.to === '/analysis' && unacknowledgedCount > 0 && (
                    <span style={{ background: 'var(--risk-critical)', color: '#fff', borderRadius: 8, fontSize: 8, padding: '1px 5px', fontWeight: 700, boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}>
                      {unacknowledgedCount}
                    </span>
                  )}
                  {item.to === '/analysis' && activeEvents.length > 0 && (
                    <span style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.5)', color: 'var(--risk-warning)', borderRadius: 8, fontSize: 8, padding: '1px 5px', fontWeight: 700 }}>
                      {activeEvents.length}
                    </span>
                  )}
                </span>
              </NavLink>
                ))}
              </div>
            ))}
          </div>

          {/* ── ENGINE CONTROL (collapsible — open on OPERATE routes) ───────── */}
          <div className="sidebar-section-glass">
            <div
              className="sidebar-label sidebar-hide"
              onClick={() => setEngineOpen(o => !o)}
              style={{ color: badge.color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
            >
              <span>ENGINE CONTROL</span>
              <span style={{ fontSize: 9, display: 'inline-block', transform: engineOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▸</span>
            </div>

            {engineOpen && (
            <div className="sidebar-hide" style={{ padding: '0 14px 12px' }}>

              {/* State badge row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                padding: '7px 10px', borderRadius: 7,
                background: `${badge.color}12`, border: `1px solid ${badge.color}35`,
                animation: badge.pulse ? 'statePulse 1.4s ease-in-out infinite' : undefined,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: badge.color, boxShadow: `0 0 5px ${badge.color}`, flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: badge.color, flex: 1 }}>{badge.label}</span>
                {/* Interlock readiness chip */}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: allReady ? 'rgba(0,200,120,0.12)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${allReady ? 'rgba(0,200,120,0.4)' : 'var(--border)'}`,
                  color: allReady ? '#00C878' : 'var(--text-dim)',
                }}>
                  {readyCount}/8 IL
                </span>
              </div>

              {/* RPM / Load live meters — state-machine driven */}
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* RPM bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>RPM</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#38BDF8', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(liveRpm)}
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${rpmPct}%`,
                      background: 'linear-gradient(90deg, rgba(56,189,248,0.6), #38BDF8)',
                      boxShadow: rpmPct > 5 ? '0 0 6px rgba(56,189,248,0.5)' : undefined,
                      transition: 'width 0.8s ease',
                      borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 9, color: 'var(--text-dim)' }}>
                    <span>0</span><span>400 IDLE</span><span>1150</span>
                  </div>
                </div>

                {/* Load bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>LOAD</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: loadColor, fontVariantNumeric: 'tabular-nums', transition: 'color 0.3s' }}>
                      {liveLoad.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${liveLoad}%`,
                      background: loadColor,
                      boxShadow: liveLoad > 5 ? `0 0 6px ${loadColor}80` : undefined,
                      transition: 'width 0.8s ease, background 0.3s, box-shadow 0.3s',
                      borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 9, color: 'var(--text-dim)' }}>
                    <span>NO LOAD</span>
                    <span style={{ color: engineState === 'DECLUTCHED_RUN' || engineState === 'IDLE' ? 'var(--accent-blue)' : 'var(--text-dim)' }}>
                      {engineState === 'DECLUTCHED_RUN' ? 'DECLUTCHED' : engineState === 'IDLE' ? 'IDLE' : '85% NOR'}
                    </span>
                    <span>MCR</span>
                  </div>
                </div>
              </div>

              {/* Speed lever — live whenever the engine is running. Load is propeller-derived (read-only above). */}
              {rpmActive && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, letterSpacing: '0.09em', color: 'var(--text-muted)' }}>SPEED LEVER</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#38BDF8', fontVariantNumeric: 'tabular-nums' }}>{rpm} RPM</span>
                  </div>
                  <input type="range" min={400} max={1150} step={5} value={rpm}
                    onChange={e => setRpm(+e.target.value)}
                    style={{ width: '100%', accentColor: '#38BDF8' } as React.CSSProperties} />
                </div>
              )}

              {/* Divider between meters and buttons */}
              <div style={{ height: 1, background: 'var(--border-dim)', marginBottom: 8 }} />

              {/* 4-button engine control grid: START / STOP / CLUTCH / DECLUTCH */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
                {/* START */}
                <button
                  onClick={() => engineControls.initStart()}
                  disabled={!canStart}
                  style={ctrlBtn(canStart, '#00C878')}
                >
                  {startLabel}
                </button>

                {/* STOP */}
                <button
                  onClick={() => engineControls.stopEngine()}
                  disabled={!canStop}
                  style={ctrlBtn(canStop, '#FF3B3B')}
                >
                  {engineState === 'STOPPING' ? '… STOPPING' : '■ STOP'}
                </button>

                {/* CLUTCH */}
                <button
                  onClick={() => engineControls.engageClutch()}
                  disabled={!canClutch}
                  style={ctrlBtn(canClutch, '#F59E0B')}
                >
                  {clutchLabel}
                </button>

                {/* DECLUTCH */}
                <button
                  onClick={() => engineControls.clutchNeutral()}
                  disabled={!canDeclutch}
                  style={ctrlBtn(canDeclutch, '#F97316')}
                >
                  ⊘ DECLUTCH
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-dim)', margin: '6px 0' }} />

              {/* Quick Start bypass */}
              <button
                onClick={() => engineControls.quickStart()}
                style={{
                  width: '100%', padding: '7px 0',
                  background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.25)',
                  color: 'var(--accent-blue)', borderRadius: 6, fontFamily: 'var(--font)',
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
                }}
              >
                ⚡ QUICK START
              </button>
            </div>
            )}

            {/* Collapsed icon — show state dot + quick start icon */}
            {collapsed && (
              <div style={{ padding: '6px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${badge.color}15`, border: `1px solid ${badge.color}40`,
                  animation: badge.pulse ? 'statePulse 1.4s ease-in-out infinite' : undefined,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: badge.color }} />
                </div>
              </div>
            )}
          </div>

        </div>
      </aside>

      <style>{`
        @keyframes statePulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
      `}</style>
    </>
  );
}

