import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { ALARM_LIMITS } from '@marine-pdm/shared';

export type AlertType = 'SUSTAINED_HIGH' | 'SUSTAINED_LOW' | 'TRENDING_UP' | 'TRENDING_DOWN' | 'SPIKE' | 'IMBALANCE';
export type AlertSeverity = 'INFO' | 'WATCH' | 'ACTION' | 'URGENT';

export interface BaselineAlert {
  id: string;
  sensorId: string;
  label: string;
  type: AlertType;
  severity: AlertSeverity;
  deviation: number;
  deviationPct: number;
  durationTicks: number;
  trend: number;
  triggeredAt: number;
  aiNarrative?: string;
  acknowledged: boolean;
}

interface AlertCtx {
  alerts: BaselineAlert[];
  unacknowledgedCount: number;
  acknowledge: (id: string) => void;
  setNarrative: (id: string, text: string) => void;
  processSnapshot: (snap: EngineSnapshot, baselines: Record<string, number>, rates: Record<string, number>, cylImbalance: number) => void;
}

const Ctx = createContext<AlertCtx | null>(null);

// Per-sensor persistence counters
type Counter = Record<string, { highTicks: number; lowTicks: number; lastValue: number }>;

const PHYS_RANGES: Record<string, number> = {
  exhaustTemp:     ALARM_LIMITS.exhaustTemp.physMax - ALARM_LIMITS.exhaustTemp.physMin,
  lubeOilPressure: ALARM_LIMITS.lubeOilPressure.physMax - ALARM_LIMITS.lubeOilPressure.physMin,
  scavengeAir:     ALARM_LIMITS.scavengeAir.physMax - ALARM_LIMITS.scavengeAir.physMin,
  tcRPM:           ALARM_LIMITS.tcRPM.physMax - ALARM_LIMITS.tcRPM.physMin,
  jacketOutlet:    ALARM_LIMITS.jacketOutlet.physMax - ALARM_LIMITS.jacketOutlet.physMin,
  sfoc:            ALARM_LIMITS.sfoc.physMax - ALARM_LIMITS.sfoc.physMin,
};

const LABELS: Record<string, string> = {
  exhaustTemp: 'Exhaust Temp', lubeOilPressure: 'Lube Oil Press',
  scavengeAir: 'Scavenge Air',
  tcRPM: 'TC Speed', jacketOutlet: 'Jacket Outlet', sfoc: 'SFOC',
};

function severity(dev: number, physRange: number): AlertSeverity {
  const pct = Math.abs(dev) / physRange;
  if (pct > 0.20) return 'URGENT';
  if (pct > 0.12) return 'ACTION';
  if (pct > 0.07) return 'WATCH';
  return 'INFO';
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<BaselineAlert[]>([]);
  const counters = useRef<Counter>({});
  const triggered = useRef<Set<string>>(new Set());

  const processSnapshot = useCallback((
    snap: EngineSnapshot,
    baselines: Record<string, number>,
    rates: Record<string, number>,
    cylImbalance: number,
  ) => {
    const now = Date.now();
    const newAlerts: BaselineAlert[] = [];

    const sensors: Array<[string, number, string]> = [
      ['exhaustTemp',     snap.exhaustTemp,     'ME.ExhaustTemp'],
      ['lubeOilPressure', snap.lubeOilPressure, 'ME.LubeOilPressure'],
      ['scavengeAir',     snap.scavengeAir,     'ME.ScavengeAirPressure'],
      ['tcRPM',           snap.tcRPM,           'ME.TCSpeed'],
      ['jacketOutlet',    snap.jacketOutlet,    'ME.JacketCoolingOutlet'],
      ['sfoc',            snap.sfoc,            'ME.SFOC'],
    ];

    for (const [field, actual, sensorId] of sensors) {
      const baseline = baselines[field];
      if (baseline == null) continue;
      const physRange = PHYS_RANGES[field] ?? 100;
      const dev = actual - baseline;
      const devPct = (dev / physRange) * 100;
      const threshold = physRange * 0.08; // 8% of range → alert

      const ctr = counters.current[field] ?? { highTicks: 0, lowTicks: 0, lastValue: actual };

      if (dev > threshold) {
        ctr.highTicks++;
        ctr.lowTicks = 0;
      } else if (dev < -threshold) {
        ctr.lowTicks++;
        ctr.highTicks = 0;
      } else {
        ctr.highTicks = 0;
        ctr.lowTicks = 0;
      }

      // Spike detection (jump > 3x threshold in one tick)
      const jump = Math.abs(actual - ctr.lastValue);
      if (jump > threshold * 3) {
        const alertId = `spike_${field}`;
        if (!triggered.current.has(alertId)) {
          triggered.current.add(alertId);
          setTimeout(() => triggered.current.delete(alertId), 60000);
          newAlerts.push({
            id: `${alertId}_${now}`,
            sensorId, label: LABELS[field] ?? field,
            type: 'SPIKE', severity: 'ACTION',
            deviation: dev, deviationPct: devPct,
            durationTicks: 1, trend: rates[field] ?? 0,
            triggeredAt: now, acknowledged: false,
          });
        }
      }

      // Sustained deviation (30+ ticks)
      if (ctr.highTicks >= 30) {
        const alertId = `sustained_high_${field}`;
        if (!triggered.current.has(alertId)) {
          triggered.current.add(alertId);
          newAlerts.push({
            id: `${alertId}_${now}`,
            sensorId, label: LABELS[field] ?? field,
            type: 'SUSTAINED_HIGH', severity: severity(dev, physRange),
            deviation: dev, deviationPct: devPct,
            durationTicks: ctr.highTicks, trend: rates[field] ?? 0,
            triggeredAt: now, acknowledged: false,
          });
        }
      } else if (ctr.lowTicks >= 30) {
        const alertId = `sustained_low_${field}`;
        if (!triggered.current.has(alertId)) {
          triggered.current.add(alertId);
          newAlerts.push({
            id: `${alertId}_${now}`,
            sensorId, label: LABELS[field] ?? field,
            type: 'SUSTAINED_LOW', severity: severity(dev, physRange),
            deviation: dev, deviationPct: devPct,
            durationTicks: ctr.lowTicks, trend: rates[field] ?? 0,
            triggeredAt: now, acknowledged: false,
          });
        }
      } else {
        // Reset trigger gate when deviation clears
        triggered.current.delete(`sustained_high_${field}`);
        triggered.current.delete(`sustained_low_${field}`);
      }

      ctr.lastValue = actual;
      counters.current[field] = ctr;
    }

    // Cylinder imbalance alert
    if (cylImbalance > ALARM_LIMITS.cylImbalance.preAlarmHigh) {
      const alertId = 'imbalance';
      if (!triggered.current.has(alertId)) {
        triggered.current.add(alertId);
        newAlerts.push({
          id: `imbalance_${now}`,
          sensorId: 'ME.CylImbalance', label: 'Cylinder Imbalance',
          type: 'IMBALANCE', severity: cylImbalance > ALARM_LIMITS.cylImbalance.alarmHigh ? 'ACTION' : 'WATCH',
          deviation: cylImbalance, deviationPct: (cylImbalance / ALARM_LIMITS.cylImbalance.alarmHigh) * 100,
          durationTicks: 1, trend: 0, triggeredAt: now, acknowledged: false,
        });
      }
    } else {
      triggered.current.delete('imbalance');
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 200));
    }
  }, []);

  const acknowledge = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  }, []);

  const setNarrative = useCallback((id: string, text: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, aiNarrative: text } : a));
  }, []);

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <Ctx.Provider value={{ alerts, unacknowledgedCount, acknowledge, setNarrative, processSnapshot }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAlerts(): AlertCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAlerts must be inside AlertProvider');
  return ctx;
}
