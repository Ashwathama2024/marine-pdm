import React, { useState } from 'react';
import { SensorManager } from '../management/SensorManager';
import { PatternLibraryView } from '../management/PatternLibraryView';
import { useKnowledge } from '../hooks/useKnowledge';

type Tab = 'sensors' | 'patterns';

export function Management() {
  const [tab, setTab] = useState<Tab>('sensors');
  const knowledge = useKnowledge();

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="page-title">MANAGEMENT</div>
          <div className="page-subtitle">SENSOR REGISTRY · FAULT PATTERNS</div>
        </div>
      </div>
      <div className="page-body" style={{ paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border-dim)', paddingBottom: 12 }}>
          {(['sensors', 'patterns'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`mag-btn ${tab === t ? 'mag-btn-ghost' : 'mag-btn-ghost'}`}
              style={{ fontSize: 10, opacity: tab === t ? 1 : 0.55, borderColor: tab === t ? 'var(--risk-normal)' : undefined, color: tab === t ? 'var(--risk-normal)' : undefined }}
            >
              {t === 'sensors' ? 'Sensor Manager' : 'Pattern Library'}
            </button>
          ))}
        </div>

        {tab === 'sensors' && (
          <SensorManager
            sensors={knowledge.sensors}
            registry={knowledge.registry}
            onActivate={knowledge.activateSensor}
            onRefresh={knowledge.refreshSensors}
          />
        )}
        {tab === 'patterns' && (
          <PatternLibraryView patternLibrary={knowledge.patternLibrary} />
        )}
      </div>
    </div>
  );
}
