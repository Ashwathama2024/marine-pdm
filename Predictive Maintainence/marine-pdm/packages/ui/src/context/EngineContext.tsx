import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import type { EngineSnapshot, DecisionOutput, BaselineSnapshot } from '@marine-pdm/shared';
import type { IDataSource } from '@marine-pdm/shared';
import { applyLag, MTU8000_CYL_SPREAD, BSIDE_TEMP_BIAS, bearingTempMax } from '@marine-pdm/shared';
import { SimulatorEngine } from '@marine-pdm/simulator';
import {
  bearingTemp_MTU8000, lubeOilTemp_MTU8000, lubeOilPressure_MTU8000, crankcasePressure_MTU8000,
} from '@marine-pdm/simulator';
import type { EngineState, InterlockSystem, StartSequence } from '@marine-pdm/simulator';
import { useDataSource } from '../hooks/useDataSource';
import { useDecision } from '../hooks/useDecision';
import { useKnowledge } from '../hooks/useKnowledge';
import { useManualOverride } from './ManualOverrideContext';
import { useAlerts } from './AlertContext';
import { sensorRegistry } from '../simulator/registry';
import { recordDegradationSample } from '../services/degradation-regression';
import { recordTrainingSample, startRun, endRun, getCurrentRun } from '../services/training-recorder';

// Sensor tag → EngineSnapshot field (scalar sensors)
const SENSOR_FIELD_MAP: Record<string, string> = {
  'ME.ExhaustMean':                  'exhaustTemp',
  'ME.ExhaustBackPressure':          'exhaustBackPressure',
  'ME.LubeOilPressure.BeforeFilter': 'lubeOilPressure',
  'ME.LubeOilPressure.AfterFilter':  'lubeOilPressureAfterFilter',
  'ME.LubeOilPressure.PistonCooling':'pistonCoolingPress',
  'ME.LubeOilPressure.LastBearing':  'lubeLastBearingPressure',
  'ME.LubeOilTemp':                  'lubeOilTemp',
  'ME.CoolantTemp.AfterEngine':      'jacketOutlet',
  'ME.CoolantPressure':              'coolantPressure',
  'ME.ChargeAirPressure':            'scavengeAir',
  'ME.ChargeAirTemp':                'chargeAirTemp',
  'ME.FuelRailPressure':             'fuelRailPressure',
  'ME.FuelTemp':                     'fuelOilTemp',
  'ME.CrankcasePressure':            'crankcasePressure',
  'ME.RPM':                          'rpm',
  'ME.RPM.Redundant':                'rpmRedundant',
};

const TC_SPEED_IDX: Record<string, number> = {
  'ME.TC.A1.Speed': 0, 'ME.TC.A2.Speed': 1, 'ME.TC.B1.Speed': 2, 'ME.TC.B2.Speed': 3,
};

function applyRegistryToSnapshot(raw: EngineSnapshot): EngineSnapshot {
  const activeIds = sensorRegistry.getActiveIds();
  if (activeIds.length === 0) return raw;

  const now = Date.now();
  const snap = { ...raw } as Record<string, unknown>;
  let cylTemps: number[] | null = null;
  let bearingTemps: number[] | null = null;
  let tcSpeeds: number[] | null = null;

  for (const id of activeIds) {
    // Cylinder exhaust temps: ME.CylA1..ME.CylA10
    const mA = id.match(/^ME\.CylA(\d+)\.ExhaustTemp$/);
    if (mA) {
      const n = +mA[1] - 1;
      if (n >= 0 && n < 10) {
        const { value } = sensorRegistry.apply(id, raw.cylTemps[n] ?? 0, now);
        if (value !== null) {
          if (!cylTemps) cylTemps = [...raw.cylTemps];
          cylTemps[n] = value;
        }
      }
      continue;
    }
    // ME.CylB1..ME.CylB10
    const mB = id.match(/^ME\.CylB(\d+)\.ExhaustTemp$/);
    if (mB) {
      const n = 10 + +mB[1] - 1;
      if (n >= 10 && n < 20) {
        const { value } = sensorRegistry.apply(id, raw.cylTemps[n] ?? 0, now);
        if (value !== null) {
          if (!cylTemps) cylTemps = [...raw.cylTemps];
          cylTemps[n] = value;
        }
      }
      continue;
    }
    // Bearing temps: ME.BearingTemp.1..11
    const mBear = id.match(/^ME\.BearingTemp\.(\d+)$/);
    if (mBear) {
      const n = +mBear[1] - 1;
      const rawBears = (raw as Record<string, unknown>).bearingTemps as number[] | undefined ?? [];
      if (rawBears[n] !== undefined) {
        const { value } = sensorRegistry.apply(id, rawBears[n]!, now);
        if (value !== null) {
          if (!bearingTemps) bearingTemps = [...rawBears];
          bearingTemps[n] = value;
        }
      }
      continue;
    }
    // TC speeds: ME.TC.A1.Speed etc.
    if (id in TC_SPEED_IDX) {
      const n = TC_SPEED_IDX[id]!;
      const rawSpeeds = (raw as Record<string, unknown>).tcSpeeds as number[] | undefined ?? [];
      if (rawSpeeds[n] !== undefined) {
        const { value } = sensorRegistry.apply(id, rawSpeeds[n]!, now);
        if (value !== null) {
          if (!tcSpeeds) tcSpeeds = [...rawSpeeds];
          tcSpeeds[n] = value;
          if (n === 0) snap.tcRPM = value;
        }
      }
      continue;
    }
    // Scalar field map
    const field = SENSOR_FIELD_MAP[id];
    if (field) {
      const truth = snap[field] as number | undefined;
      if (truth !== undefined) {
        const { value } = sensorRegistry.apply(id, truth, now);
        if (value !== null) snap[field] = value;
      }
    }
  }

  if (cylTemps)    snap.cylTemps    = cylTemps;
  if (bearingTemps) snap.bearingTemps = bearingTemps;
  if (tcSpeeds)   snap.tcSpeeds    = tcSpeeds;

  return snap as EngineSnapshot;
}

// Lag alphas matching physics.ts LAG — baseline must track the same thermal/hydraulic inertia
// as the real sensor it's compared against, or a load-step (e.g. clutch-in) opens a gap that
// looks like a sustained fault for 30+ ticks even though nothing is actually wrong.
// physics.ts field names differ from these in three places — mapped explicitly so the sync is
// checkable at a glance: lube→lube, chargeAirPress→scavenge, coolantTemp→jacket.
const BASELINE_LAG = {
  exhaust:          0.08,
  lube:             0.06,   // physics LAG.lube (was 0.05 — went stale when physics moved 0.05→0.06)
  fuelRack:         0.08,
  scavenge:         0.08,   // physics LAG.chargeAirPress (was 0.10 — went stale when physics moved 0.10→0.08)
  tcRPM:            0.08,
  jacket:           0.02,   // physics LAG.coolantTemp (was 0.05 — went stale when physics moved 0.05→0.02)
  sfoc:             0.03,
  chargeAirTemp:    0.06,
  fuelOilPressure:  0.20,
  fuelOilTemp:      0.04,
  loFilterDP:       0.05,
  pistonCoolingPress: 0.05,
  shaftPower:       0.10,
  bearingTemp:      0.03,
};

interface LaggedBaseline {
  exhaust: number; lube: number; fuelRack: number; scavenge: number;
  tcRPM: number; jacket: number; sfoc: number; chargeAirTemp: number;
  fuelOilPressure: number; fuelOilTemp: number; loFilterDP: number;
  pistonCoolingPress: number; shaftPower: number; bearingTemp: number;
}

// Module-level singletons — created once for the app lifetime
// Start at idle (400 RPM / 4% load) — matches sidebar RPM slider initial state.
export const engine = new SimulatorEngine(400, 4);
export const src: IDataSource = engine;

const MAX_HISTORY = 120;

export interface SensorHistory {
  exhaustTemp:        number[];
  lubeOilPressure:    number[];
  fuelRack:           number[];
  scavengeAir:        number[];
  tcRPM:              number[];
  jacketOutlet:       number[];
  sfoc:               number[];
  chargeAirTemp:      number[];
  fuelOilPressure:    number[];
  fuelOilTemp:        number[];
  loFilterDP:         number[];
  pistonCoolingPress: number[];
  shaftPower:         number[];
  /** Hottest of the 11 main bearings — the scalar the SS T-Bearing override actually trips on. */
  bearingTemp:        number[];
  cylTemps:           number[][];   // 20 banks
  baseCylTemps:       number[][];   // per-cylinder lagged baselines
  systemRisk:         number[];
  // Baseline traces
  baseExhaust:             number[];
  baseLube:                number[];
  baseFuelRack:            number[];
  baseScavenge:            number[];
  baseTcRPM:               number[];
  baseJacket:              number[];
  baseSfoc:                number[];
  baseChargeAirTemp:       number[];
  baseFuelOilPressure:     number[];
  baseFuelOilTemp:         number[];
  baseLoFilterDP:          number[];
  basePistonCoolingPress:  number[];
  baseShaftPower:          number[];
  baseBearingTemp:         number[];
  timestamps:              number[];
}

interface EngineControls {
  readyForOperation:  () => boolean;
  startEngine:        () => boolean;
  initStart:          () => boolean;
  engageClutch:       () => boolean;
  beginWarming:       () => boolean;
  advanceToDeclutched:() => boolean;
  clutchAhead:        () => boolean;
  clutchNeutral:      () => boolean;
  stopEngine:         () => boolean;
  speedIncrease:      (amount?: number) => void;
  speedDecrease:      (amount?: number) => void;
  setStartAir:        (bar: number) => void;
  quickStart:         () => void;
}

interface EngineCtx {
  snapshot:    EngineSnapshot | null;
  decision:    DecisionOutput | null;
  baseline:    BaselineSnapshot | null;
  history:     SensorHistory;
  shipName:    string;
  setShipName: (n: string) => void;
  engineName:  string;
  setEngineName: (n: string) => void;
  handleConfirm:       (id: string) => void;
  handleFalsePositive: (id: string) => void;
  activeFaults:      Record<number, number>;
  injectCylFault:    (cylIndex: number, severity: number) => void;
  clearCylFault:     (cylIndex: number) => void;
  clearAllCylFaults: () => void;
  // MTU v2.0 cylinder fault map: cylIndex → intensity 0–100
  mtuCylFaults: Record<number, { intensity: number; faultType: string }>;
  // Start sequence
  engineState:  EngineState;
  interlocks:   InterlockSystem;
  startSeq:     StartSequence;
  engineControls: EngineControls;
  isOperational: boolean;  // true when IDLE or above (dashboard should show live data)
}

const Ctx = createContext<EngineCtx | null>(null);

function emptyHistory(): SensorHistory {
  return {
    exhaustTemp: [], lubeOilPressure: [], fuelRack: [], scavengeAir: [],
    tcRPM: [], jacketOutlet: [], sfoc: [], systemRisk: [],
    chargeAirTemp: [], fuelOilPressure: [], fuelOilTemp: [],
    loFilterDP: [], pistonCoolingPress: [], shaftPower: [], bearingTemp: [],
    cylTemps: Array.from({ length: 20 }, () => []),
    baseCylTemps: Array.from({ length: 20 }, () => []),
    baseExhaust: [], baseLube: [], baseFuelRack: [], baseScavenge: [],
    baseTcRPM: [], baseJacket: [], baseSfoc: [],
    baseChargeAirTemp: [], baseFuelOilPressure: [], baseFuelOilTemp: [],
    baseLoFilterDP: [], basePistonCoolingPress: [], baseShaftPower: [], baseBearingTemp: [],
    timestamps: [],
  };
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const [shipName, setShipName]     = useState('');
  const [engineName, setEngineName] = useState('Main Engine — MTU 20V 8000 M71');
  const [activeFaults, setActiveFaults] = useState<Record<number, number>>({});

  const injectCylFault = useCallback((cylIndex: number, severity: number) => {
    engine.injectFault('injector', cylIndex, severity);
    setActiveFaults(prev => ({ ...prev, [cylIndex]: severity }));
  }, []);

  const clearCylFault = useCallback((cylIndex: number) => {
    engine.clearFault('injector', cylIndex);
    setActiveFaults(prev => { const n = { ...prev }; delete n[cylIndex]; return n; });
  }, []);

  const clearAllCylFaults = useCallback(() => {
    engine.clearAllFaults();
    setActiveFaults({});
  }, []);

  const rawSnapshot = useDataSource(src);
  const { applyToSnapshot, overrides } = useManualOverride();
  // Apply sensor failure modes first, then manual value overrides on top
  const snapshot = rawSnapshot
    ? applyToSnapshot(applyRegistryToSnapshot(rawSnapshot))
    : null;

  // Derive MTU v2.0 cylinder fault map from engine fault list each render
  const mtuCylFaults = React.useMemo(() => {
    if (!snapshot) return {} as Record<number, { intensity: number; faultType: string }>;
    const map: Record<number, { intensity: number; faultType: string }> = {};
    for (const f of engine.getMTUFaultList()) {
      const m = f.id.match(/^(F01|F07)_cyl_(\d+)$/);
      if (m) map[parseInt(m[2])] = { intensity: f.intensity, faultType: m[1] };
    }
    return map;
  }, [snapshot]);

  const { output: decision, baseline, instantBaseline, features } = useDecision(snapshot);
  const knowledge = useKnowledge();
  const { processSnapshot } = useAlerts();

  const historyRef        = useRef<SensorHistory>(emptyHistory());
  const laggedBaselineRef = useRef<LaggedBaseline | null>(null);
  const wasRunningRef     = useRef(false);

  // Push history + advance lagged baseline + feed the alert engine — once per tick, in an
  // effect (NOT during render) so processSnapshot's setState in AlertProvider never fires
  // while EngineProvider is rendering. Keying on `snapshot` also guarantees the lagged
  // baseline integrates exactly once per tick (previously it advanced on every render).
  React.useEffect(() => {
  if (snapshot && decision && baseline) {
    const h = historyRef.current;
    const push = (arr: number[], v: number) => { arr.push(v); if (arr.length > MAX_HISTORY) arr.shift(); };

    push(h.exhaustTemp,        snapshot.exhaustTemp);
    push(h.lubeOilPressure,    snapshot.lubeOilPressure);
    push(h.fuelRack,           snapshot.fuelRack);
    push(h.scavengeAir,        snapshot.scavengeAir);
    push(h.tcRPM,              snapshot.tcRPM);
    push(h.jacketOutlet,       snapshot.jacketOutlet);
    push(h.sfoc,               snapshot.sfoc);
    push(h.chargeAirTemp,      snapshot.chargeAirTemp);
    push(h.fuelOilPressure,    snapshot.fuelOilPressure);
    push(h.fuelOilTemp,        snapshot.fuelOilTemp);
    push(h.loFilterDP,         snapshot.loFilterDP);
    push(h.pistonCoolingPress, snapshot.pistonCoolingPress);
    push(h.bearingTemp, bearingTempMax(snapshot));
    push(h.shaftPower,         snapshot.shaftPower);
    push(h.systemRisk,         decision.systemRisk);
    push(h.timestamps,         snapshot.timestamp);
    snapshot.cylTemps.forEach((t, i) => push(h.cylTemps[i]!, t));
    // Per-cylinder baselines are pushed after lb is updated (below)

    // Engine running state — computed here (not just below) because it also gates the baseline
    // (re-)seed: a snapshot exists from the moment the page loads (ENGINE_OFF, rpm=0, load=0),
    // long before the operator starts anything, so a plain "first tick" seed captures whatever
    // pre-op value happens to be current (often 0/degenerate) and locks it in for the rest of
    // the session — the 0.02-0.06 lag alphas then take 100+ ticks to climb away from it, which
    // reads as a "sustained fault" for the first 30+ ticks of every single run regardless of
    // what the operator actually does. Physics avoids this by reseeding lag state fresh at
    // CRANKING→IDLE (initPhysicsForIdle()); do the same here for the baseline.
    const _currentState = engine.getEngineState();
    const _preOpStates = ['ENGINE_OFF', 'STANDBY', 'SAFETY_TURNING', 'CRANKING'];
    const _isRunning = !_preOpStates.includes(_currentState) && _currentState !== 'STOPPING';
    const _wasRunning = wasRunningRef.current;   // captured before the assignment below

    // Training-run lifecycle, strictly on the running EDGES. Opened here — BEFORE the recorder call
    // further down — so the first running tick is captured rather than skipped for want of a run.
    // Edge-triggering matters on the falling side too: testing `!_isRunning && getCurrentRun()` every
    // tick fired endRun() once per second for as long as the engine sat stopped, and those overlapping
    // async calls raced the next startRun(), leaving a run with zero rows.
    if (_isRunning && !_wasRunning) startRun();
    else if (!_isRunning && _wasRunning) void endRun();

    // Seed lagged baseline on the very first tick (harmless fallback) AND re-seed fresh every
    // time the engine transitions from pre-op/stopped into an operational state — so it always
    // starts from a real, current-conditions value instead of a stale pre-op snapshot.
    if (!laggedBaselineRef.current || (_isRunning && !_wasRunning)) {
      laggedBaselineRef.current = {
        exhaust: baseline.expectedExhaust, lube: baseline.expectedLube,
        fuelRack: baseline.expectedFuelRack, scavenge: baseline.expectedScavenge,
        tcRPM: baseline.expectedTcRPM, jacket: baseline.expectedJacket,
        sfoc: baseline.expectedSfoc, chargeAirTemp: baseline.expectedChargeAirTemp,
        fuelOilPressure: baseline.expectedFuelOilPressure, fuelOilTemp: baseline.expectedFuelOilTemp,
        loFilterDP: baseline.expectedLoFilterDP, pistonCoolingPress: baseline.expectedPistonCoolingPress,
        shaftPower: baseline.expectedShaftPower, bearingTemp: baseline.expectedBearingTemp,
      };
    }
    wasRunningRef.current = _isRunning;

    // Advance lagged baseline with same thermal inertia as actual sensors
    const lb = laggedBaselineRef.current;
    lb.exhaust           = applyLag(lb.exhaust,           baseline.expectedExhaust,           BASELINE_LAG.exhaust);
    lb.lube              = applyLag(lb.lube,              baseline.expectedLube,              BASELINE_LAG.lube);
    lb.fuelRack          = applyLag(lb.fuelRack,          baseline.expectedFuelRack,          BASELINE_LAG.fuelRack);
    lb.scavenge          = applyLag(lb.scavenge,          baseline.expectedScavenge,          BASELINE_LAG.scavenge);
    lb.tcRPM             = applyLag(lb.tcRPM,             baseline.expectedTcRPM,             BASELINE_LAG.tcRPM);
    lb.jacket            = applyLag(lb.jacket,            baseline.expectedJacket,            BASELINE_LAG.jacket);
    lb.sfoc              = applyLag(lb.sfoc,              baseline.expectedSfoc,              BASELINE_LAG.sfoc);
    lb.chargeAirTemp     = applyLag(lb.chargeAirTemp,     baseline.expectedChargeAirTemp,     BASELINE_LAG.chargeAirTemp);
    lb.fuelOilPressure   = applyLag(lb.fuelOilPressure,   baseline.expectedFuelOilPressure,   BASELINE_LAG.fuelOilPressure);
    lb.fuelOilTemp       = applyLag(lb.fuelOilTemp,       baseline.expectedFuelOilTemp,       BASELINE_LAG.fuelOilTemp);
    lb.loFilterDP        = applyLag(lb.loFilterDP,        baseline.expectedLoFilterDP,        BASELINE_LAG.loFilterDP);
    lb.pistonCoolingPress= applyLag(lb.pistonCoolingPress,baseline.expectedPistonCoolingPress,BASELINE_LAG.pistonCoolingPress);
    lb.shaftPower        = applyLag(lb.shaftPower,        baseline.expectedShaftPower,        BASELINE_LAG.shaftPower);
    lb.bearingTemp       = applyLag(lb.bearingTemp,       baseline.expectedBearingTemp,       BASELINE_LAG.bearingTemp);

    push(h.baseExhaust,            lb.exhaust);
    push(h.baseLube,               lb.lube);
    push(h.baseFuelRack,           lb.fuelRack);
    push(h.baseScavenge,           lb.scavenge);
    push(h.baseTcRPM,              lb.tcRPM);
    push(h.baseJacket,             lb.jacket);
    push(h.baseSfoc,               lb.sfoc);
    push(h.baseChargeAirTemp,      lb.chargeAirTemp);
    push(h.baseFuelOilPressure,    lb.fuelOilPressure);
    push(h.baseFuelOilTemp,        lb.fuelOilTemp);
    push(h.baseLoFilterDP,         lb.loFilterDP);
    push(h.basePistonCoolingPress, lb.pistonCoolingPress);
    push(h.baseShaftPower,         lb.shaftPower);
    push(h.baseBearingTemp,        lb.bearingTemp);

    // Per-cylinder lagged baselines: mean exhaust + natural spread + B-side thermal bias
    snapshot.cylTemps.forEach((_, i) => {
      const cylBase = lb.exhaust + (MTU8000_CYL_SPREAD[i] ?? 0) + (i >= 10 ? BSIDE_TEMP_BIAS : 0);
      push(h.baseCylTemps[i]!, cylBase);
    });

    // Only feed alert engine when engine is actually running (suppresses pre-op false alarms)
    // — _isRunning computed above, alongside the baseline-reseed check it also gates.
    if (_isRunning) {
      processSnapshot(
        snapshot,
        {
          exhaustTemp: lb.exhaust, lubeOilPressure: lb.lube, fuelRack: lb.fuelRack,
          scavengeAir: lb.scavenge, tcRPM: lb.tcRPM, jacketOutlet: lb.jacket,
          sfoc: lb.sfoc, chargeAirTemp: lb.chargeAirTemp, fuelOilPressure: lb.fuelOilPressure,
          fuelOilTemp: lb.fuelOilTemp, loFilterDP: lb.loFilterDP,
          pistonCoolingPress: lb.pistonCoolingPress, shaftPower: lb.shaftPower,
        },
        { exhaustTemp: 0, lubeOilPressure: 0, fuelRack: 0, scavengeAir: 0, tcRPM: 0, jacketOutlet: 0, sfoc: 0,
          chargeAirTemp: 0, fuelOilPressure: 0, fuelOilTemp: 0, loFilterDP: 0, pistonCoolingPress: 0, shaftPower: 0 },
        Math.max(...snapshot.cylTemps) - Math.min(...snapshot.cylTemps),
      );

      // ── Degradation regression instrumentation ──────────────────────────────
      // Log independent root factors (X) + dependent sensor deviations (Y) each running
      // tick. The linear model means the regression slope ≈ the matrix weight.
      const rf = engine.getRootFactors();
      const load = snapshot.load, rpm = snapshot.rpm;
      const bearings = (snapshot.bearingTemps as number[] | undefined) ?? [];
      // Exact healthy (fault-free) baselines from the calibrated physics equations at the current
      // load/rpm — replaces the earlier hand-approximated constants so the regression Y is a clean
      // deviation and the recovered slope lands on the matrix weight (not a biased offset).
      const healthyOil       = lubeOilTemp_MTU8000(load, rpm, 36, 1.0);
      const healthyGallery   = lubeOilPressure_MTU8000(rpm, load, healthyOil, 0.15, 0);
      const healthyLastB     = lubeOilPressure_MTU8000(rpm, load, healthyOil, 0.15, 0) * 0.55;
      // Free-end bearing (index 10, +5°C position bias) is the normal hottest → baseline for the max.
      const healthyBearingMax = bearingTemp_MTU8000(load, rpm, healthyOil, healthyGallery, 10, 0);
      const healthyCrankcase  = crankcasePressure_MTU8000(load, 0);
      recordDegradationSample({
        t: snapshot.timestamp,
        rf,
        dev: {
          exhaustMeanTemp:         snapshot.exhaustTemp - lb.exhaust,
          coolantTempAfterEngine:  snapshot.jacketOutlet - lb.jacket,
          lubeOilPressure:         snapshot.lubeOilPressure - lb.lube,
          lubeLastBearingPressure: (snapshot.lubeLastBearingPressure as number) - healthyLastB,
          bearingTempMax:          (bearings.length ? Math.max(...bearings) : healthyBearingMax) - healthyBearingMax,
          tcSpeed:                 snapshot.tcRPM - lb.tcRPM,
          chargeAirPressure:       snapshot.scavengeAir - lb.scavenge,
          sfoc:                    snapshot.sfoc - lb.sfoc,
          crankcasePressure:       (snapshot.crankcasePressure as number) - healthyCrankcase,
        },
      });

      // ── Training-data capture (durable) ─────────────────────────────────────
      // Same tick, same lagged baselines, same fault-free physics references as above — but written
      // to IndexedDB with the injected-fault ground truth and an analytic RUL attached. A run opens
      // on the pre-op → running edge (below) and closes on the way back down.
      if (features) {
        recordTrainingSample({
          snapshot, baseline, instantBaseline, features, decision, history: h,
          lagged: {
            exhaust: lb.exhaust, jacket: lb.jacket, lube: lb.lube, tcRPM: lb.tcRPM,
            chargeAirTemp: lb.chargeAirTemp, pistonCoolingPress: lb.pistonCoolingPress,
            bearingTemp: lb.bearingTemp,
          },
          faults: engine.getMTUFaultList(),
          rootFactors: rf,
          engineState: _currentState,
          degradedSensorIds: [...sensorRegistry.getActiveIds(), ...Object.keys(overrides)],
        });
      }
    }

  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const handleConfirm       = useCallback((id: string) => knowledge.recordPatternOutcome(id, 'CONFIRMED'), [knowledge]);
  const handleFalsePositive = useCallback((id: string) => knowledge.recordPatternOutcome(id, 'FALSE_POSITIVE'), [knowledge]);

  // Re-render when engine state changes (state machine fires transitions)
  const [engineState, setEngineState] = React.useState<EngineState>(() => engine.getEngineState());
  React.useEffect(() => {
    if (snapshot) setEngineState(engine.getEngineState());
  }, [snapshot]);

  const engineControls = React.useMemo<EngineControls>(() => ({
    readyForOperation:   () => engine.readyForOperation(),
    startEngine:         () => engine.startEngine(),
    initStart:           () => engine.initStart(),
    engageClutch:        () => engine.engageClutch(),
    beginWarming:        () => engine.beginWarming(),
    advanceToDeclutched: () => engine.advanceToDeclutched(),
    clutchAhead:         () => engine.clutchAhead(),
    clutchNeutral:       () => engine.clutchNeutral(),
    stopEngine:          () => engine.stopEngine(),
    speedIncrease:       (a?: number) => engine.speedIncrease(a),
    speedDecrease:       (a?: number) => engine.speedDecrease(a),
    setStartAir:         (b: number) => engine.setStartAir(b),
    quickStart:          () => { engine.quickStart(); setEngineState('IDLE'); },
  }), []);

  const PRE_OP_STATES: EngineState[] = ['ENGINE_OFF', 'STANDBY', 'SAFETY_TURNING', 'CRANKING'];
  const isOperational = !PRE_OP_STATES.includes(engineState) && engineState !== 'STOPPING';

  return (
    <Ctx.Provider value={{
      snapshot, decision, baseline,
      history: historyRef.current,
      shipName, setShipName,
      engineName, setEngineName,
      handleConfirm, handleFalsePositive,
      activeFaults,
      injectCylFault,
      clearCylFault,
      clearAllCylFaults,
      mtuCylFaults,
      engineState,
      interlocks:     engine.interlocks,
      startSeq:       engine.startSeq,
      engineControls,
      isOperational,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEngine(): EngineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEngine must be inside EngineProvider');
  return ctx;
}
