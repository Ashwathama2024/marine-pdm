import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import type { FaultAlert } from '@marine-pdm/shared';
import { useEngine } from './EngineContext';
import { putEpisodes, listEpisodes } from '../services/training-store';
import { getCurrentRun } from '../services/training-recorder';

// Live decision-engine alerts (DecisionOutput.alerts) are recomputed every tick and are NOT persisted:
// the moment a fault injection is reset, they vanish with no trace, which confuses the operator ("what
// was that alert I just saw?"). This provider watches the live alert set and, when an alert that WAS
// active disappears, moves it into a HISTORY window — so a cleared alert is shown as "cleared" on the
// Alert page rather than silently disappearing. The window is capped to keep memory bounded.
//
// Resolved alerts are ALSO written through to the training store's `episodes` table. A ResolvedLiveAlert
// is already an episode record in all but name — it has the pattern id, the ECS code, the work order,
// the peak risk and the active window — so it is the labelled-event view of the same runs the
// per-tick recorder captures, and it used to die on every reload.

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
    if (cleared.length) {
      setResolvedAlerts(prev => [...cleared, ...prev].slice(0, MAX_HISTORY));
      // Durable write-through, tagged with the run that produced it so an episode can be joined back
      // to its per-tick rows. Failures are swallowed: losing an episode must not break the alert page.
      const runId = getCurrentRun()?.runId ?? null;
      void putEpisodes(cleared.map(c => ({ ...c, runId }))).catch(() => { /* non-fatal */ });
    }
  }, [decision]);

  // Rehydrate the in-memory window from the store on mount, so a reload no longer starts blank.
  useEffect(() => {
    void listEpisodes()
      .then(rows => {
        const past = (rows as unknown as ResolvedLiveAlert[])
          .filter(r => typeof r.clearedAt === 'number')
          .sort((a, b) => b.clearedAt - a.clearedAt)
          .slice(0, MAX_HISTORY);
        // Prepend anything this session already resolved — it is newer than everything on disk.
        setResolvedAlerts(prev => [...prev, ...past.filter(p => !prev.some(x => x.id === p.id))].slice(0, MAX_HISTORY));
      })
      .catch(() => { /* store unavailable — history is simply session-only */ });
  }, []);

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
