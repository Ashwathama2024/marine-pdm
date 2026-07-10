import { useEffect, useRef } from 'react';
import type { DecisionOutput } from '@marine-pdm/shared';
import { FAULT_DEFINITIONS } from '@marine-pdm/simulator';
import type { FaultConfig } from '@marine-pdm/simulator';
import type { DegradationEvent } from '../context/DegradationContext';
import type { BaselineAlert } from '../context/AlertContext';

export interface NarrationSources {
  enabled: boolean;
  isOperational: boolean;
  faults: FaultConfig[];
  decision: DecisionOutput | null;
  degradationEvents: DegradationEvent[];
  baselineAlerts: BaselineAlert[];
}

// Hard floor between proactive notes so a burst of simultaneous changes yields ONE narration, and the
// assistant never talks every tick. New events arriving during the cooldown are held (not dropped) and
// narrated on the next eligible tick.
const MIN_INTERVAL_MS = 8000;

const faultName = (id: string) => FAULT_DEFINITIONS.find(f => f.id === id)?.name ?? id;

// Flatten the four live sources into keyed, describable items. Keys are stable so re-detection is
// idempotent; pruning to currently-present items lets a cleared-then-reinjected fault narrate again.
function currentItems(src: NarrationSources): Map<string, string> {
  const m = new Map<string, string>();
  for (const fc of src.faults) {
    m.set(`fault:${fc.id}`, `fault ${fc.id} (${faultName(fc.id)}) was injected at ${fc.intensity}% intensity`);
  }
  if (src.decision) {
    for (const a of src.decision.alerts) {
      m.set(`alert:${a.component}|${a.ecsAlarmCode ?? ''}`, `the decision engine raised a ${a.component} alert — ${a.issue}`);
    }
  }
  for (const ev of src.degradationEvents.filter(e => e.status === 'ACTIVE')) {
    m.set(`deg:${ev.id}`, `a degradation event triggered — ${ev.label} ${ev.direction === 'falling' ? 'falling' : 'rising'} (${ev.rootCause})`);
  }
  for (const al of src.baselineAlerts.filter(a => !a.acknowledged)) {
    m.set(`base:${al.id}`, `a baseline deviation alert fired — ${al.label} ${al.type}`);
  }
  return m;
}

/** Watches for new discrete events and calls `onEvent(description)` at most once per cooldown. */
export function useAssistantNarration(src: NarrationSources, onEvent: (description: string) => void) {
  const seen = useRef<Set<string>>(new Set());
  const lastFire = useRef(0);
  const primed = useRef(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Recompute each tick (the widget re-renders on every snapshot).
  useEffect(() => {
    const items = currentItems(src);
    const keys = new Set(items.keys());

    // Prune seen down to currently-present items so removed events can re-fire if they return.
    for (const k of Array.from(seen.current)) if (!keys.has(k)) seen.current.delete(k);

    // First run after mount: adopt existing state as baseline; never narrate what was already there.
    if (!primed.current) {
      primed.current = true;
      seen.current = new Set(keys);
      return;
    }

    const fresh = Array.from(items.entries()).filter(([k]) => !seen.current.has(k));
    if (fresh.length === 0) return;

    // When narration is off or the engine isn't operational, absorb silently (no backlog later).
    if (!src.enabled || !src.isOperational) {
      for (const [k] of fresh) seen.current.add(k);
      return;
    }

    // Respect the cooldown — hold fresh events (don't mark seen) so they narrate next eligible tick.
    if (Date.now() - lastFire.current < MIN_INTERVAL_MS) return;

    const description = fresh.slice(0, 3).map(([, d]) => d).join('; ')
      + (fresh.length > 3 ? `, plus ${fresh.length - 3} more` : '');
    for (const [k] of fresh) seen.current.add(k);
    lastFire.current = Date.now();
    onEventRef.current(description);
  });
}
