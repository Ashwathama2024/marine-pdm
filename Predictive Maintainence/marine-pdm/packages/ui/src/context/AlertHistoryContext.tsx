import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import type { FaultAlert } from '@marine-pdm/shared';
import { useEngine } from './EngineContext';

// Live decision-engine alerts (DecisionOutput.alerts) are recomputed every tick and are NOT persisted:
// the moment a fault injection is reset, they vanish with no trace, which confuses the operator ("what
// was that alert I just saw?"). This provider watches the live alert set and, when an alert that WAS
// active disappears, moves it into a persisted HISTORY window — so a cleared alert is shown as "cleared"
// on the Alert page rather than silently disappearing. History survives navigation (provider sits above
// the routes) and is capped to keep memory bounded.

export interface ResolvedLiveAlert {
  id: string;                 // unique per resolution
  key: string;                // stable identity used for active↔resolved matching
  component: string;
  issue: string;
  ecsAlarmCode?: string;
  patternId?: string;
  patternName?: string;
  maintenanceTask?: string;
  faultSource: string;
  recommendedAction: string;
  evidence: string[];
  peakRisk: number;           // highest risk seen while it was active
  firstSeen: number;          // when it first appeared (ms)
  clearedAt: number;          // when it dropped out of the live set (ms)
}

interface AlertHistoryCtx {
  resolvedAlerts: ResolvedLiveAlert[];
  clearResolved: () => void;
}

const Ctx = createContext<AlertHistoryCtx | null>(null);

const MAX_HISTORY = 100;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Stable identity for an alert across ticks — pattern id first (survives evidence/wording changes),
// then ECS code, then component+issue.
const alertKey = (a: FaultAlert): string =>
  `${a.patternId ?? ''}|${a.ecsAlarmCode ?? ''}|${a.component}|${a.patternId || a.ecsAlarmCode ? '' : a.issue}`;

interface ActiveRec { alert: FaultAlert; firstSeen: number; peakRisk: number }

export function AlertHistoryProvider({ children }: { children: React.ReactNode }) {
  const { decision } = useEngine();
  const [resolvedAlerts, setResolvedAlerts] = useState<ResolvedLiveAlert[]>([]);
  const active = useRef<Map<string, ActiveRec>>(new Map());

  useEffect(() => {
    // Skip when there's no decision yet (pre-start / disconnected) — don't spuriously "resolve"
    // everything just because the pipeline hasn't produced output.
    if (!decision) return;

    const now = Date.now();
    const current = new Map<string, FaultAlert>();
    for (const a of decision.alerts) current.set(alertKey(a), a);

    // Carry forward / update everything still active (keep firstSeen, track peak risk).
    const nextActive = new Map<string, ActiveRec>();
    for (const [key, a] of current) {
      const prev = active.current.get(key);
      nextActive.set(key, {
        alert: a,
        firstSeen: prev?.firstSeen ?? now,
        peakRisk: Math.max(prev?.peakRisk ?? 0, a.riskScore),
      });
    }

    // Anything that was active last tick but is gone now → it cleared → move to history.
    const cleared: ResolvedLiveAlert[] = [];
    for (const [key, rec] of active.current) {
      if (!current.has(key)) {
        const a = rec.alert;
        cleared.push({
          id: uid(), key,
          component: a.component, issue: a.issue,
          ecsAlarmCode: a.ecsAlarmCode, patternId: a.patternId, patternName: a.patternName,
          maintenanceTask: a.maintenanceTask, faultSource: a.faultSource,
          recommendedAction: a.recommendedAction, evidence: a.evidence,
          peakRisk: rec.peakRisk, firstSeen: rec.firstSeen, clearedAt: now,
        });
      }
    }

    active.current = nextActive;
    if (cleared.length) setResolvedAlerts(prev => [...cleared, ...prev].slice(0, MAX_HISTORY));
  }, [decision]);

  const clearResolved = useCallback(() => setResolvedAlerts([]), []);

  return (
    <Ctx.Provider value={{ resolvedAlerts, clearResolved }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAlertHistory(): AlertHistoryCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAlertHistory must be inside AlertHistoryProvider');
  return ctx;
}
