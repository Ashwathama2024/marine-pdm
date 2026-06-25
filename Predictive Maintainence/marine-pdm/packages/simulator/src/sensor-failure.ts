// packages/simulator/src/sensor-failure.ts
// 5 sensor failure modes for MTU 8000 PDM simulator.
// Simulates ECS 8000 SD (Sensor Defect) and TD (Transmitter Deviation) signatures.
// PDF upgrade spec §6.

export type FailureMode = 'DROPOUT' | 'DRIFT' | 'SPIKE' | 'INTERMITTENT' | 'FREEZE';

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
export interface SensorFailureConfig {
  sensorId: string;    // e.g. 'ME.CylA4.ExhaustTemp'
  mode: FailureMode;
  active: boolean;

  // DROPOUT: sensor goes to null/0 for a duration, optionally repeating
  dropoutDuration_s?: number;   // seconds at null (default 30)
  dropoutPeriod_s?: number;     // repeat every N seconds; 0 = one-shot (default 0)

  // DRIFT: value drifts linearly from truth at configurable rate
  driftRate_perMin?: number;    // units per minute, signed (default +1.0)

  // SPIKE: sudden large impulse, then returns to normal
  spikeAmplitude?: number;      // units above/below truth (default 20)
  spikeFreq_perMin?: number;    // spikes per minute (default 2)

  // INTERMITTENT: alternates between valid and null — represents loose connector
  onTime_s?: number;   // valid reading duration (default 5)
  offTime_s?: number;  // null duration (default 3)

  // FREEZE: value stops changing — stuck at last-known
  freezeDuration_s?: number;   // 0 = permanent (default 120)
}

// ── RUNTIME STATE ──────────────────────────────────────────────────────────────
export interface SensorFailureState {
  startedAt: number;          // Date.now() when failure was activated
  accumulatedDrift: number;   // total drift accumulated (DRIFT mode)
  lastValidValue: number;     // last known-good physics value (FREEZE mode)
  lastSpikeTime: number;      // timestamp of last spike (SPIKE mode)
  phaseStartTime: number;     // when current ON/OFF phase started (INTERMITTENT)
  isInOnPhase: boolean;       // INTERMITTENT: currently in "on" (valid) phase
  recentValues: (number | null)[];  // rolling 30-sample window for health scoring
}

export function makeInitialSensorFailureState(truthValue: number): SensorFailureState {
  return {
    startedAt: Date.now(),
    accumulatedDrift: 0,
    lastValidValue: truthValue,
    lastSpikeTime: 0,
    phaseStartTime: Date.now(),
    isInOnPhase: true,
    recentValues: Array(30).fill(truthValue),
  };
}

// ── APPLY FAILURE ──────────────────────────────────────────────────────────────
// Returns what the sensor reports (null = dropout) and a quality score 0–100.
export function applySensorFailure(
  truthValue: number,
  cfg: SensorFailureConfig,
  state: SensorFailureState,
  nowMs: number = Date.now(),
): { value: number | null; quality: number; nextState: SensorFailureState } {
  let nextState = { ...state };

  switch (cfg.mode) {
    case 'DROPOUT':  return applyDropout(truthValue, cfg, nextState, nowMs);
    case 'DRIFT':    return applyDrift(truthValue, cfg, nextState, nowMs);
    case 'SPIKE':    return applySpike(truthValue, cfg, nextState, nowMs);
    case 'INTERMITTENT': return applyIntermittent(truthValue, cfg, nextState, nowMs);
    case 'FREEZE':   return applyFreeze(truthValue, cfg, nextState, nowMs);
  }
}

function applyDropout(
  truthValue: number,
  cfg: SensorFailureConfig,
  state: SensorFailureState,
  nowMs: number,
): ReturnType<typeof applySensorFailure> {
  const elapsed = (nowMs - state.startedAt) / 1000;
  const duration = cfg.dropoutDuration_s ?? 30;
  const period   = cfg.dropoutPeriod_s ?? 0;

  let isDropped: boolean;
  if (period > 0) {
    // Periodic: dropout lasts `duration` s every `period` s
    const phase = elapsed % period;
    isDropped = phase < duration;
  } else {
    // One-shot: drop for `duration` seconds then recover
    isDropped = elapsed < duration;
  }

  const value = isDropped ? null : truthValue;
  const nextState = { ...state, lastValidValue: isDropped ? state.lastValidValue : truthValue };
  pushToWindow(nextState.recentValues, value);
  return { value, quality: isDropped ? 0 : 100, nextState };
}

function applyDrift(
  truthValue: number,
  cfg: SensorFailureConfig,
  state: SensorFailureState,
  nowMs: number,
): ReturnType<typeof applySensorFailure> {
  const elapsedMin = (nowMs - state.startedAt) / 60000;
  const rate = cfg.driftRate_perMin ?? 1.0;
  const drift = rate * elapsedMin;
  const value = truthValue + drift;
  const nextState = { ...state, accumulatedDrift: drift };
  pushToWindow(nextState.recentValues, value);
  // Quality degrades as drift magnitude grows — sensor reading diverges from truth
  const quality = Math.max(0, 100 - Math.min(100, Math.abs(drift) * 5));
  return { value, quality, nextState };
}

function applySpike(
  truthValue: number,
  cfg: SensorFailureConfig,
  state: SensorFailureState,
  nowMs: number,
): ReturnType<typeof applySensorFailure> {
  const freqPerMin = cfg.spikeFreq_perMin ?? 2;
  const amplitude  = cfg.spikeAmplitude ?? 20;
  const spikeIntervalMs = (60 / freqPerMin) * 1000;
  const timeSinceLastSpike = nowMs - state.lastSpikeTime;

  // Spike occurs for one tick only — a single-sample impulse
  const isSpiking = state.lastSpikeTime > 0 && timeSinceLastSpike < 1100;
  let nextState = { ...state };

  if (!isSpiking && timeSinceLastSpike >= spikeIntervalMs) {
    // Trigger a new spike
    const sign = Math.random() > 0.5 ? 1 : -1;
    nextState = { ...state, lastSpikeTime: nowMs };
    const value = truthValue + sign * amplitude;
    pushToWindow(nextState.recentValues, value);
    // Quality: spikes look bad momentarily — cross-correlated sensors remain stable
    return { value, quality: 20, nextState };
  }

  const value = truthValue;  // normal reading — cross-correlated sensors stable
  pushToWindow(nextState.recentValues, value);
  return { value, quality: 90, nextState };
}

function applyIntermittent(
  truthValue: number,
  cfg: SensorFailureConfig,
  state: SensorFailureState,
  nowMs: number,
): ReturnType<typeof applySensorFailure> {
  const onTime  = (cfg.onTime_s  ?? 5)  * 1000;
  const offTime = (cfg.offTime_s ?? 3)  * 1000;
  const phaseElapsed = nowMs - state.phaseStartTime;

  let isInOnPhase = state.isInOnPhase;
  let phaseStartTime = state.phaseStartTime;

  // Transition phase when current duration is exceeded
  if (isInOnPhase && phaseElapsed >= onTime) {
    isInOnPhase = false;
    phaseStartTime = nowMs;
  } else if (!isInOnPhase && phaseElapsed >= offTime) {
    isInOnPhase = true;
    phaseStartTime = nowMs;
  }

  const value = isInOnPhase ? truthValue : null;
  const nextState = { ...state, isInOnPhase, phaseStartTime };
  pushToWindow(nextState.recentValues, value);
  // DataFreshness rises during OFF periods; quality drops
  return { value, quality: isInOnPhase ? 90 : 0, nextState };
}

function applyFreeze(
  truthValue: number,
  cfg: SensorFailureConfig,
  state: SensorFailureState,
  nowMs: number,
): ReturnType<typeof applySensorFailure> {
  const duration = cfg.freezeDuration_s ?? 120;
  const elapsed  = (nowMs - state.startedAt) / 1000;

  // If duration > 0 and elapsed exceeds it, sensor recovers (returns truth)
  const isFrozen = duration === 0 || elapsed < duration;
  const value = isFrozen ? state.lastValidValue : truthValue;
  const nextState = { ...state, lastValidValue: isFrozen ? state.lastValidValue : truthValue };
  pushToWindow(nextState.recentValues, value);
  return { value, quality: isFrozen ? 40 : 95, nextState };
}

// ── SENSOR HEALTH SCORE ────────────────────────────────────────────────────────
// Computed per sensor, 0–100. Written to MTU8000Snapshot.sensorHealth[sensorId].
export function computeSensorHealth(
  recentValues: (number | null)[],   // last 30 readings
  nominalStdDev: number,              // expected noise level for this sensor
  failureMode: FailureMode | null,
): number {
  const completeness = recentValues.filter(v => v !== null).length / recentValues.length;
  const validValues = recentValues.filter((v): v is number => v !== null);

  if (validValues.length < 2) return Math.round(completeness * 100);

  const mean = validValues.reduce((s, v) => s + v, 0) / validValues.length;
  const variance = validValues.reduce((s, v) => s + (v - mean) ** 2, 0) / validValues.length;
  const stdDev = Math.sqrt(variance);

  // Frozen sensor: stdDev << nominal → low health (key statistical discriminator)
  const frozenPenalty = (nominalStdDev > 0 && stdDev < nominalStdDev * 0.1) ? 0.4 : 1.0;

  // Excessive stdDev (spiking) also reduces health
  const spikePenalty = stdDev > nominalStdDev * 5 ? 0.7 : 1.0;

  return Math.round(completeness * frozenPenalty * spikePenalty * 100);
}

// ── DATA FRESHNESS ─────────────────────────────────────────────────────────────
// Returns seconds since the last non-null reading.
export function computeDataFreshness(
  recentValues: (number | null)[],
  tickIntervalS: number = 1,
): number {
  for (let i = recentValues.length - 1; i >= 0; i--) {
    if (recentValues[i] !== null) {
      return (recentValues.length - 1 - i) * tickIntervalS;
    }
  }
  return recentValues.length * tickIntervalS;  // all null
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function pushToWindow(window: (number | null)[], value: number | null): void {
  window.push(value);
  if (window.length > 30) window.shift();
}

// ── REGISTRY: manage multiple sensor failures ──────────────────────────────────
export class SensorFailureRegistry {
  private configs  = new Map<string, SensorFailureConfig>();
  private states   = new Map<string, SensorFailureState>();

  activate(cfg: SensorFailureConfig, initialTruth: number): void {
    this.configs.set(cfg.sensorId, cfg);
    this.states.set(cfg.sensorId, makeInitialSensorFailureState(initialTruth));
  }

  deactivate(sensorId: string): void {
    this.configs.delete(sensorId);
    this.states.delete(sensorId);
  }

  deactivateAll(): void {
    this.configs.clear();
    this.states.clear();
  }

  // Apply failure to a sensor's truth value; returns reported value + quality
  apply(
    sensorId: string,
    truthValue: number,
    nowMs: number = Date.now(),
  ): { value: number | null; quality: number } {
    const cfg   = this.configs.get(sensorId);
    const state = this.states.get(sensorId);
    if (!cfg || !state || !cfg.active) return { value: truthValue, quality: 100 };

    const result = applySensorFailure(truthValue, cfg, state, nowMs);
    this.states.set(sensorId, result.nextState);
    return { value: result.value, quality: result.quality };
  }

  // Compute health score for a sensor
  getHealth(sensorId: string, nominalStdDev: number): number {
    const state = this.states.get(sensorId);
    const cfg   = this.configs.get(sensorId);
    if (!state) return 100;
    return computeSensorHealth(state.recentValues, nominalStdDev, cfg?.mode ?? null);
  }

  // Compute data freshness (seconds since last valid reading)
  getDataFreshness(sensorId: string, tickIntervalS = 1): number {
    const state = this.states.get(sensorId);
    if (!state) return 0;
    return computeDataFreshness(state.recentValues, tickIntervalS);
  }

  // Returns all sensor IDs currently under active failure
  getActiveIds(): string[] {
    return [...this.configs.entries()]
      .filter(([, cfg]) => cfg.active)
      .map(([id]) => id);
  }

  getConfig(sensorId: string): SensorFailureConfig | undefined {
    return this.configs.get(sensorId);
  }

  getAllConfigs(): SensorFailureConfig[] {
    return [...this.configs.values()];
  }

  // Build sensorHealth and dataFreshness maps for MTU8000Snapshot
  buildHealthMaps(
    nominalStdDevs: Record<string, number>,
    tickIntervalS = 1,
  ): { sensorHealth: Record<string, number>; dataFreshness: Record<string, number> } {
    const sensorHealth: Record<string, number> = {};
    const dataFreshness: Record<string, number> = {};

    for (const [id, state] of this.states.entries()) {
      const nominal = nominalStdDevs[id] ?? 1.5;
      const cfg = this.configs.get(id);
      sensorHealth[id] = computeSensorHealth(state.recentValues, nominal, cfg?.mode ?? null);
      dataFreshness[id] = computeDataFreshness(state.recentValues, tickIntervalS);
    }

    return { sensorHealth, dataFreshness };
  }
}
