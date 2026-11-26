// engine3d/useLiveBridge.ts — carries the 1 Hz engine tick into the 3D scene WITHOUT re-rendering it.
//
// The naive wiring (useEngine() inside a mesh component) re-renders 60+ meshes every second and
// thrashes the reconciler. Instead this hook writes each tick into one stable ref object; the scene
// reads that ref inside useFrame and mutates materials directly. React never re-renders on a tick —
// only on a selection change.
//
// It is also why the scene gets its data as a prop rather than from context: React Three Fiber v8
// renders <Canvas> children through a separate reconciler root, so React context does not cross the
// boundary. A ref passed as a prop does, and stays referentially stable.

import { useEffect, useRef } from 'react';
import { engine, useEngine } from '../context/EngineContext';
import { SENSOR_META, readSensorValue } from '../services/sensor-map';
import { sensorSeverity } from '../services/sensor-severity';
import {
  INITIAL_CUTIN,
  deriveTCInfos,
  nextCutInState,
  type TCInfo,
} from '../services/turbo-state';

export interface RootFactors {
  injFaultMax: number;
  coolingEffDrop: number;
  tcEffDrop: number;
  lubeFault: number;
  bearingFaultMax: number;
  pistonBlowby: number;
}

export interface LiveValues {
  /** Snapshot timestamp — lets the scene skip work when the tick has not advanced. */
  t: number;
  cylTemps: number[];
  cylRisks: number[];
  bearingTemps: number[];
  tcSpeeds: number[];
  rpm: number;
  load: number;
  systemRisk: number;
  isOperational: boolean;
  rootFactors: RootFactors;
  /** 0-1 severity per SENSOR_META key, so any instrumented part can colour itself. */
  devByTag: Record<string, number>;
  /**
   * The four turbochargers exactly as the dashboard derives them — cut-in state, display speed and
   * status. NOT snapshot.tcSpeeds[], which is a different number; see services/turbo-state.ts.
   */
  tcInfos: TCInfo[];
}

const ZERO_FACTORS: RootFactors = {
  injFaultMax: 0,
  coolingEffDrop: 0,
  tcEffDrop: 0,
  lubeFault: 0,
  bearingFaultMax: 0,
  pistonBlowby: 0,
};

export type LiveRef = React.MutableRefObject<LiveValues>;

export function useLiveBridge(): LiveRef {
  const { snapshot, decision, baseline, isOperational } = useEngine();

  const ref = useRef<LiveValues>({
    t: 0,
    cylTemps: [],
    cylRisks: [],
    bearingTemps: [],
    tcSpeeds: [],
    rpm: 0,
    load: 0,
    systemRisk: 0,
    isOperational: false,
    rootFactors: ZERO_FACTORS,
    devByTag: {},
    tcInfos: [],
  });

  // Cut-in is hysteretic, so it has to be advanced tick by tick rather than derived. Kept in a ref
  // for the same reason everything else here is: the 3D tree must not re-render on a tick.
  const cutIn = useRef<boolean[]>(INITIAL_CUTIN);

  useEffect(() => {
    if (!snapshot) return;
    // Idempotent write of the current tick — StrictMode's double invoke is harmless here because
    // nothing accumulates, unlike the per-tick consumers that need a duplicate-timestamp guard.
    const v = ref.current;
    v.t = snapshot.timestamp;
    v.cylTemps = (snapshot.cylTemps as number[]) ?? [];
    v.bearingTemps = (snapshot.bearingTemps as number[]) ?? [];
    v.tcSpeeds = (snapshot.tcSpeeds as number[]) ?? [];
    v.rpm = snapshot.rpm;
    v.load = snapshot.load;
    v.cylRisks = decision?.cylRisks ?? [];
    v.systemRisk = decision?.systemRisk ?? 0;
    v.isOperational = isOperational;
    v.rootFactors = engine.getRootFactors();

    // Same derivation the dashboard's TurbochargerPanel runs, from the same snapshot. Advancing the
    // hysteresis twice with identical inputs is a no-op, so StrictMode's double invoke is harmless.
    cutIn.current = nextCutInState(cutIn.current, snapshot.rpm, snapshot.tcRPM);
    v.tcInfos = deriveTCInfos(snapshot, baseline?.expectedTcRPM ?? snapshot.tcRPM, cutIn.current);

    // Per-tag severity, computed ONCE per tick rather than 60x/s inside useFrame. Uses the same
    // judgement the dashboard gauges make (services/sensor-severity.ts) so a part cannot read
    // orange here while its gauge reads green there.
    for (const tag of Object.keys(SENSOR_META)) {
      const meta = SENSOR_META[tag];
      if (!isOperational) {
        v.devByTag[tag] = 0;
        continue;
      }
      const expected = baseline ? (baseline[meta.baselineKey] as number) : undefined;
      v.devByTag[tag] = sensorSeverity(tag, readSensorValue(snapshot, meta), expected, snapshot.rpm);
    }
  }, [snapshot, decision, baseline, isOperational]);

  return ref;
}
