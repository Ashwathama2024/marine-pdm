import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { StateBadge } from '../dashboard/StateBadge';
import { PhaseTimeline } from '../dashboard/PhaseTimeline';
import { GaugeGrid, ShaftPowerStrip } from '../dashboard/GaugeGrid';
import { TurbochargerPanel } from '../dashboard/TurbochargerPanel';
import { AIDecisionPanel } from '../dashboard/AIDecisionPanel';
import { TrendChart } from '../dashboard/TrendChart';
import { AlertBar } from '../dashboard/AlertBar';
import { SensorPopup } from '../dashboard/SensorPopup';
import { SfocPopup }   from '../dashboard/SfocPopup';
import { CylinderDegradationPopup } from '../simulator/CylinderDegradationPopup';
import { CylinderTrendPopup } from '../dashboard/CylinderTrendPopup';
import { useEngine } from '../context/EngineContext';
import { useDegradation, type DegradationEvent } from '../context/DegradationContext';
import { SENSOR_META, sensorLabel, readSensorValue } from '../services/sensor-map';

// SENSOR_META moved to services/sensor-map.ts — the AI diagnosis payload and the training recorder
// resolve the same sensor ids, so the table is shared rather than duplicated per consumer.

// ── Degradation banner (shown for each ACTIVE degradation event) ─────────────
function DegradationBanner({ event, onAcknowledge }: {
  event: DegradationEvent;
  onAcknowledge: () => void;
}) {
  const navigate = useNavigate();
  const col = event.severity === 'ACTION' ? 'var(--risk-high)'
    : event.severity === 'CAUTION' ? 'var(--risk-warning)'
    : 'var(--accent-blue)';
  const glow = event.severity === 'ACTION' ? '249,115,22'
    : event.severity === 'CAUTION' ? '245,158,11'
    : '56,189,248';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: `rgba(${glow},0.06)`,
      border: `1px solid rgba(${glow},0.30)`,
      borderLeft: `3px solid ${col}`,
      borderRadius: 8, padding: '10px 14px',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Icon */}
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: `rgba(${glow},0.12)`, border: `1px solid rgba(${glow},0.3)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: col, fontSize: 14, fontWeight: 700,
      }}>
        {event.direction === 'falling' ? '↓' : '↑'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{event.label}</span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
            background: `rgba(${glow},0.12)`, color: col, letterSpacing: '0.1em',
          }}>{event.severity}</span>
          <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>DEGRADATION DETECTED</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {event.rootCause} ·{' '}
          <span style={{ color: col }}>
            {event.direction === 'falling' ? '−' : '+'}
            {Math.abs(event.totalDeviation).toFixed(3)} {event.unit} vs baseline
          </span>
          {' '}over {event.consecutiveTicks} ticks
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => { navigate('/degradation'); }}
          style={{
            padding: '5px 12px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-hi)',
            color: 'var(--text-secondary)', borderRadius: 5, fontFamily: 'var(--font)',
          }}
        >
          VIEW LOG
        </button>
        <button
          onClick={onAcknowledge}
          style={{
            padding: '5px 12px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
            background: `rgba(${glow},0.12)`, border: `1px solid rgba(${glow},0.4)`,
            color: col, borderRadius: 5, fontFamily: 'var(--font)',
            letterSpacing: '0.06em',
          }}
        >
          ACKNOWLEDGE
        </button>
      </div>
    </div>
  );
}

export function Dashboard() {
  const {
    snapshot, decision, baseline, history,
    handleConfirm, handleFalsePositive, engineName,
    activeFaults, injectCylFault, clearCylFault, mtuCylFaults,
    engineState, isOperational,
  } = useEngine();
  const { activeEvents, acknowledge: acknowledgeDegradation } = useDegradation();

  const [selectedSensor,   setSelectedSensor]   = useState<string | null>(null);
  const [selectedCyl,      setSelectedCyl]      = useState<number | null>(null);
  const [selectedTrendCyl, setSelectedTrendCyl] = useState<number | null>(null);

  if (!snapshot || !decision || !baseline) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', flexDirection: 'column', gap: 16,
        color: 'var(--text-muted)',
      }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="var(--border)" strokeWidth="2" />
          <path d="M24 14v10l6 4" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 12, letterSpacing: '0.08em' }}>Connecting to Simulator…</span>
      </div>
    );
  }

  const meta           = selectedSensor ? SENSOR_META[selectedSensor] : null;
  const popupActual    = meta ? readSensorValue(snapshot, meta) : 0;
  const popupExpected  = meta ? (baseline[meta.baselineKey] as number) : 0;
  const popupHist      = meta ? (history[meta.histKey] as number[]) : [];
  const popupBaseHist  = meta ? (history[meta.baseKey] as number[]) : [];

  const bankMeanForCyl = (idx: number) => {
    const bank = idx < 10
      ? snapshot.cylTemps.slice(0, 10)
      : snapshot.cylTemps.slice(10, 20);
    return bank.reduce((a, b) => a + b, 0) / bank.length;
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Engine state badge + phase timeline — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <StateBadge engineState={engineState} />
        <PhaseTimeline engineState={engineState} />
      </div>

      {/* Pre-start info strip — replaces blank page, shows while engine not running */}
      {!isOperational && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-dim)',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: 'var(--text-dim)', opacity: 0.5,
          }} />
          <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
            ENGINE PRE-START — gauges showing ambient / pre-lube physics ·{' '}
          </span>
          <Link to="/simulator" style={{ fontSize: 10, color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 600 }}>
            Open Simulator →
          </Link>
        </div>
      )}

      {/* Degradation banner — only when operational */}
      {isOperational && activeEvents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--risk-warning)', marginBottom: 2 }}>
            AI DEGRADATION PATTERNS DETECTED ({activeEvents.length})
          </div>
          {activeEvents.map(ev => (
            <DegradationBanner
              key={ev.id}
              event={ev}
              onAcknowledge={() => acknowledgeDegradation(ev.id)}
            />
          ))}
        </div>
      )}

      {/* 1 ── Shaft power + RPM/Load strip — always visible */}
      <ShaftPowerStrip snap={snapshot} decision={decision} isOperational={isOperational} />

      {/* 2 ── AI Decision Engine — only when running */}
      {isOperational && (
        <AIDecisionPanel
          decision={decision}
          engineName={engineName}
          onConfirm={handleConfirm}
          onFalsePositive={handleFalsePositive}
          hero
        />
      )}

      {/* 3 ── 4-Turbocharger sequential system — always (shows 0 speed pre-op) */}
      <TurbochargerPanel snap={snapshot} expectedTcRPM={baseline.expectedTcRPM} />

      {/* 4 ── All sensor arc gauges — always visible, grey when pre-start */}
      <GaugeGrid
        snap={snapshot}
        baseline={baseline}
        decision={decision}
        isOperational={isOperational}
        onGaugeClick={isOperational ? setSelectedSensor : undefined}
      />

      {/* 5+6 ── Sensor trends + cylinder section — operational only */}
      {isOperational && (
        <TrendChart
          snapHistory={history}
          cylRisks={decision.cylRisks}
          decision={decision}
          activeFaults={activeFaults}
          mtuCylFaults={mtuCylFaults}
          onCylinderClick={setSelectedTrendCyl}
          onSensorClick={setSelectedSensor}
        />
      )}

      {/* Alert bar — operational only */}
      {isOperational && (
        <AlertBar
          decision={decision}
          onConfirm={handleConfirm}
          onFalsePositive={handleFalsePositive}
        />
      )}

      {/* ── Popups ── */}
      {selectedCyl !== null && (
        <CylinderDegradationPopup
          cylIndex={selectedCyl}
          currentSeverity={activeFaults[selectedCyl]}
          onInject={injectCylFault}
          onClear={clearCylFault}
          onClose={() => setSelectedCyl(null)}
        />
      )}

      {selectedTrendCyl !== null && (
        <CylinderTrendPopup
          cylIndex={selectedTrendCyl}
          history={history.cylTemps[selectedTrendCyl] ?? []}
          cylRisks={decision.cylRisks}
          bankMean={bankMeanForCyl(selectedTrendCyl)}
          onClose={() => setSelectedTrendCyl(null)}
        />
      )}

      {selectedSensor === 'ME.SFOC' && (
        <SfocPopup
          actual={popupActual}
          expected={popupExpected}
          load={snapshot.load}
          rpm={snapshot.rpm}
          history={popupHist}
          baselineHistory={popupBaseHist}
          onClose={() => setSelectedSensor(null)}
        />
      )}

      {selectedSensor && selectedSensor !== 'ME.SFOC' && meta && (
        <SensorPopup
          sensorId={selectedSensor}
          label={sensorLabel(selectedSensor)}
          unit={meta.unit}
          decimals={meta.decimals}
          actual={popupActual}
          expected={popupExpected}
          history={popupHist}
          baselineHistory={popupBaseHist}
          onClose={() => setSelectedSensor(null)}
        />
      )}
    </div>
  );
}
