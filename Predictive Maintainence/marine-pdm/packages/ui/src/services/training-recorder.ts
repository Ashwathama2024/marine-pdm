/// <reference types="vite/client" />
// Per-tick training-sample recorder.
//
// Called once per running tick from EngineContext's tick effect, immediately after
// recordDegradationSample — which is the precedent this copies, including the key idea that the
// fault-free reference values are computed from the CALIBRATED PHYSICS EQUATIONS at the current
// load/rpm rather than hand-approximated, so the recorded deviations are clean.
//
// Three things this adds over the existing degradation instrumentation:
//   1. MTU8000Features — the ~100-scalar vector. DecisionEngine.analyze() builds one internally and
//      discards it, so a second builder is instantiated here (see the StrictMode note below).
//   2. Ground truth — engine.getMTUFaultList() gives the injected fault id, target, intensity, speed
//      and live severity. Nothing else in the app reads it for labelling.
//   3. Analytic RUL per forecastable metric, alongside the naive linear projection.
//
// STRICTMODE: main.tsx enables StrictMode, so this is offered every timestamp twice in dev.
// MTU8000FeatureBuilder carries prev-tick state (prevCylDevs, prevBearingDevs) to compute the *Rate
// fields, so processing the same tick twice would zero every rate. The `lastT` guard below makes the
// second call a no-op. The store's compound ['runId','t'] key covers the write side.

import type { EngineSnapshot, BaselineSnapshot, DecisionOutput, FeatureSnapshot, MTU8000Features } from '@marine-pdm/shared';
import { MTU8000 } from '@marine-pdm/shared';
import { MTU8000FeatureBuilder } from '@marine-pdm/features';
import { baselineStore } from '@marine-pdm/knowledge';
import type { FaultConfig } from '@marine-pdm/simulator';
import {
  putRun, putSamples, getRun, reconcileOpenRuns, purgeStaleCalibration,
  SCHEMA_VERSION, CALIBRATION_REVISION,
  type TrainingRun, type TrainingSample,
} from './training-store';
import { analyticRul, baseFaultId } from './rul';
import { classifyRulQuality } from './rul-quality';
import { minutesToAlarm, FORECAST_LIMITS } from './forecast';
import { isRampMode } from './ramp-mode';
import type { SensorHistory } from '../context/EngineContext';

// Rows held in memory before one batched transaction. This is also the worst-case data loss if the
// tab dies without firing pagehide, so it is deliberately small: 10 writes/100 s is nothing for
// IndexedDB, and 10 s is a tolerable tail to lose off a ramp.
const BUFFER_FLUSH = 10;

const CYL_NAMES = MTU8000.CYL_NAMES as readonly string[];
const FORECAST_KEYS = Object.keys(FORECAST_LIMITS).filter(k => k !== 'systemRisk');

// ── Module state ──────────────────────────────────────────────────────────────────
const featureBuilder = new MTU8000FeatureBuilder(baselineStore);
let lastT = 0;
let buffer: TrainingSample[] = [];
let currentRun: TrainingRun | null = null;
let tickIndex = 0;
let ending = false;
let warnedFeatureError = false;
let warnedFlushError = false;
/** Rows offered but not recorded, by reason — surfaced on the training page. */
export const skipped = { duplicateTick: 0, noRun: 0, featureError: 0 };
const listeners = new Set<() => void>();

function notify() { listeners.forEach(l => l()); }

/** Subscribe to run/count changes so the training page can show live progress. */
export function subscribeRecorder(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getCurrentRun(): TrainingRun | null { return currentRun; }
export function getBufferedCount(): number { return buffer.length; }

// ── Durability against reload / tab close / HMR ────────────────────────────────────
//
// endRun() only fires on the engine's running→stopped edge. A reload, a tab close or a Vite HMR module
// swap produces no such edge, so without the two mechanisms below a run stays open forever (the
// training page then shows a duration of `now − startedAt`, which grows every time you look at it) and
// the buffered tail is dropped on the floor.
//
// Belt and braces, because neither is individually sufficient: pagehide gives the flush a chance to
// land (IndexedDB writes started there usually complete, but the spec does not guarantee it), and
// reconcileOpenRuns() repairs the run row afterwards regardless, recovering endedAt from the last
// sample actually written rather than from wall-clock time.
if (typeof window !== 'undefined') {
  const flushNow = () => {
    void flush().catch(() => { /* the tab is going away; reconcile fixes the row on next load */ });
  };
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
  // Runs before the replacement module's state exists, so the outgoing buffer is not orphaned.
  import.meta.hot?.dispose(flushNow);

  // Startup repair. Safe here specifically because it runs at module init, before any startRun():
  // every run still open in the database at this instant belongs to a previous session.
  void reconcileOpenRuns()
    .then(({ closed, pruned }) => {
      if (closed || pruned) {
        console.info(`[training-recorder] recovered ${closed} interrupted run(s), pruned ${pruned} empty one(s)`);
        notify();
      }
    })
    .catch(err => console.warn('[training-recorder] run reconciliation failed', err));

  // Drop runs recorded against a superseded calibration. Their labels were solved from wrong
  // baselines against wrong thresholds, and nothing in the row content gives them away —
  // rulQuality_* reports OK on them, because a bias in the baseline CURVE cancels out of the
  // lagged-vs-instant comparison it makes. Deleting beats filtering: an export carries sample
  // rows only, so a "filter before training" instruction is unfollowable downstream.
  void purgeStaleCalibration()
    .then(({ removed }) => {
      if (removed) {
        console.info(
          `[training-recorder] discarded ${removed} run(s) recorded before calibration ` +
          `${CALIBRATION_REVISION} — their RUL labels were solved against the pre-OEM envelope`,
        );
        notify();
      }
    })
    .catch(err => console.warn('[training-recorder] stale-calibration purge failed', err));
}

export interface RecordInput {
  snapshot: EngineSnapshot;
  baseline: BaselineSnapshot;
  /**
   * The same load/rpm curves with NO lag applied (FeatureEngine.process().instantBaseline). Used only
   * to measure how far `baseline` is from converged, so each rulTrue_* label can declare whether it is
   * trustworthy. See services/rul-quality.ts.
   */
  instantBaseline: BaselineSnapshot | null;
  features: FeatureSnapshot;
  decision: DecisionOutput;
  history: SensorHistory;
  /** Lagged baselines from EngineContext — the fault-free reference at this operating point. */
  lagged: Record<string, number>;
  faults: FaultConfig[];
  rootFactors: Record<string, number>;
  engineState: string;
  /** Sensor ids with an active failure mode, plus manually overridden ids. */
  degradedSensorIds: string[];
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────────

export function startRun(): TrainingRun {
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  currentRun = {
    runId,
    startedAt: Date.now(),
    endedAt: null,
    sampleCount: 0,
    schemaVersion: SCHEMA_VERSION,
    calibrationRevision: CALIBRATION_REVISION,
    engineModel: MTU8000.MODEL,
    rampMode: isRampMode(),
  };
  tickIndex = 0;
  void putRun(currentRun);
  notify();
  return currentRun;
}

/**
 * Close the open run. Safe to call redundantly.
 *
 * The `currentRun?.runId === run.runId` guard at the end is load-bearing. This is async, and the
 * caller fires it from the engine tick, so several calls can be in flight at once while the engine is
 * stopped. An earlier version nulled `currentRun` unconditionally, so a stale call that was still
 * awaiting IndexedDB would land AFTER the engine restarted and wipe the run that startRun() had just
 * opened — leaving a run row with zero samples and every subsequent tick silently discarded, because
 * recordTrainingSample bails when there is no current run.
 */
export async function endRun(): Promise<void> {
  const run = currentRun;
  if (!run || ending) return;
  ending = true;
  try {
    await flush();
    const stored = await getRun(run.runId);
    await putRun({ ...(stored ?? run), endedAt: Date.now() });
    if (currentRun?.runId === run.runId) currentRun = null;
    notify();
  } finally {
    ending = false;
  }
}

export async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const rows = buffer;
  buffer = [];
  await putSamples(rows);
  if (currentRun) {
    const stored = await getRun(currentRun.runId);
    const count = (stored?.sampleCount ?? 0) + rows.length;
    currentRun = { ...currentRun, sampleCount: count };
    await putRun(currentRun);
  }
  notify();
}

// ── Row construction ──────────────────────────────────────────────────────────────

const fx = (v: number | undefined, d = 4): number | null =>
  v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d));

/**
 * Ground-truth label for this tick. `HEALTHY` when nothing is injected, which is what makes the
 * negative class free — auto-recording every running tick means healthy data accumulates without
 * the operator having to collect it deliberately.
 */
function labelFrom(faults: FaultConfig[]) {
  const active = faults.filter(f => f.active);
  if (active.length === 0) {
    return { faultClass: 'HEALTHY', faultCount: 0, faultTargets: '', faultIntensity: null as number | null,
             faultSpeed: '', faultElapsedS: null as number | null, severity: 0 };
  }
  // Most-developed fault names the row. faultCount preserves the compound case so those rows can be
  // filtered out (or used deliberately) at training time.
  const lead = [...active].sort((a, b) => b.currentSeverity - a.currentSeverity)[0]!;
  const target = lead.targetCyls?.length ? `cyl${lead.targetCyls.map(c => CYL_NAMES[c] ?? c).join('+')}`
    : lead.targetBearing !== undefined ? `bearing${lead.targetBearing + 1}`
    : lead.targetTC !== undefined ? `tc${lead.targetTC + 1}`
    : '';
  return {
    faultClass: baseFaultId(lead.id),
    faultCount: active.length,
    faultTargets: target,
    faultIntensity: lead.intensity,
    faultSpeed: lead.speed,
    faultElapsedS: fx((Date.now() - lead.startedAt) / 1000, 1),
    severity: fx(lead.currentSeverity, 5) ?? 0,
  };
}

function featureColumns(f: MTU8000Features): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  f.cylDevs.forEach((v, i) => { out[`cylDev_${CYL_NAMES[i]}`] = fx(v, 3); });
  f.cylDevRates.forEach((v, i) => { out[`cylDevRate_${CYL_NAMES[i]}`] = fx(v, 3); });
  f.cylStdDevs.forEach((v, i) => { out[`cylStdDev_${CYL_NAMES[i]}`] = fx(v, 3); });
  f.bearingDevs.forEach((v, i) => { out[`bearingDev_${i + 1}`] = fx(v, 3); });
  f.bearingRates.forEach((v, i) => { out[`bearingRate_${i + 1}`] = fx(v, 3); });
  f.tcSpeedDevs.forEach((v, i) => { out[`tcSpeedDev_${i + 1}`] = fx(v, 1); });
  out.aSideMeanDev = fx(f.aSideMeanDev, 3);
  out.bSideMeanDev = fx(f.bSideMeanDev, 3);
  out.allCylMeanDev = fx(f.allCylMeanDev, 3);
  out.cylImbalance = fx(f.cylImbalance, 3);
  out.lubeDev = fx(f.lubeDev, 4);
  out.lubeLastBearingDev = fx(f.lubeLastBearingDev, 4);
  out.lubeRate = fx(f.lubeRate, 5);
  out.coolantTempDev = fx(f.coolantTempDev, 3);
  out.chargeAirTempDev = fx(f.chargeAirTempDev, 3);
  out.chargeAirPressDev = fx(f.chargeAirPressDev, 4);
  out.sfocDev = fx(f.sfocDev, 3);
  out.fuelRailPressDev = fx(f.fuelRailPressDev, 3);
  out.crankcasePressure = fx(f.crankcasePressure, 4);
  out.crankcaseRate = fx(f.crankcaseRate, 5);
  return out;
}

/** Fault-free reference for a forecastable metric — the lagged baseline EngineContext already keeps. */
const HEALTHY_REF: Record<string, string> = {
  exhaust: 'exhaust', jacket: 'jacket', chargeAirTemp: 'chargeAirTemp',
  tcSpeed: 'tcRPM', lube: 'lube', pistonCoolingPress: 'pistonCoolingPress',
  bearingTemp: 'bearingTemp', lubeLastBearing: 'lubeLastBearing',
  fuelRailPressure: 'fuelRailPressure',
};

/**
 * Record one tick. Returns false when it was a duplicate (StrictMode) or no run is open.
 * Never throws into the tick effect — a storage failure must not stop the engine loop.
 */
export function recordTrainingSample(input: RecordInput): boolean {
  const { snapshot, baseline, features, decision, history, lagged, faults, rootFactors } = input;

  if (snapshot.timestamp === lastT) { skipped.duplicateTick++; return false; }   // StrictMode double-invoke
  lastT = snapshot.timestamp;
  if (!currentRun) { skipped.noRun++; return false; }

  let mtu: MTU8000Features;
  try {
    mtu = featureBuilder.process(snapshot, features, baseline);
  } catch (err) {
    // A feature-builder failure must not break the tick, but it must not be invisible either:
    // silently returning false here made a whole run record zero rows with no explanation.
    skipped.featureError++;
    if (!warnedFeatureError) {
      warnedFeatureError = true;
      console.warn('[training-recorder] MTU8000FeatureBuilder.process threw — samples are being skipped', err);
    }
    return false;
  }

  const label = labelFrom(faults);

  const row: TrainingSample = {
    runId: currentRun.runId,
    // Stamped on every ROW, not just the run record, because the run record does not survive export.
    // training-store.ts's schema note says "filter on schemaVersion before training" — that
    // instruction was unfollowable from exported data, since the CSV/JSONL carry sample rows only.
    // Mixing schema versions silently is exactly what made the previous capture untrainable, so the
    // discriminator has to travel with the rows that would be mixed.
    schemaVersion: SCHEMA_VERSION,
    // Which calibration the labels in this row were solved against. Travels with the row for the
    // same reason schemaVersion does, and answers a different question: schemaVersion says what
    // columns exist, this says what truth they were measured against. The next time the envelope
    // moves, affected rows are identifiable from the export alone.
    calibrationRevision: CALIBRATION_REVISION,
    t: snapshot.timestamp,
    tickIndex: tickIndex++,
    engineState: input.engineState,
    load: fx(snapshot.load, 2),
    rpm: fx(snapshot.rpm, 1),
    // Rows where a sensor failure mode or manual override is active carry corrupted signal. Kept
    // (they are exactly what a sensor-fault-vs-equipment-fault classifier needs) but flagged so a
    // fault-classification training run can filter them out.
    dataQuality: input.degradedSensorIds.length === 0 ? 'CLEAN' : 'DEGRADED',
    degradedSensors: input.degradedSensorIds.join('+'),

    ...featureColumns(mtu),

    // Latent root-factor state — the true X of the linear degradation model.
    rf_injFaultMax: fx(rootFactors.injFaultMax, 5),
    rf_coolingEffDrop: fx(rootFactors.coolingEffDrop, 5),
    rf_tcEffDrop: fx(rootFactors.tcEffDrop, 5),
    rf_lubeFault: fx(rootFactors.lubeFault, 5),
    rf_bearingFaultMax: fx(rootFactors.bearingFaultMax, 5),
    rf_pistonBlowby: fx(rootFactors.pistonBlowby, 5),

    // Labels
    faultClass: label.faultClass,
    faultCount: label.faultCount,
    faultTargets: label.faultTargets,
    faultIntensity: label.faultIntensity,
    faultSpeed: label.faultSpeed,
    faultElapsedS: label.faultElapsedS,
    severity: label.severity,

    // Decision-engine output — the rules-engine verdict, useful as a comparison target.
    systemRisk: fx(decision.systemRisk, 2),
    status: decision.status,
    patternsFiring: decision.alerts.map(a => a.patternId).filter(Boolean).join('+'),
  };

  // Four RUL columns per forecastable metric:
  //   rulTrue_*         exact, solved from the linear model
  //   minsToAlarm_*     the naive slope extrapolation a rules engine can already do
  //   rulQuality_*      whether rulTrue_* can be trusted on THIS row
  //   rulLabelErrMin_*  the continuous quantity rulQuality_* is thresholded FROM
  //
  // The error-minutes column exists because the threshold it feeds — LABEL_ERROR_TOLERANCE_MIN, 0.5 —
  // is an unmeasured judgement call, and validating it requires the distribution it cuts. That number
  // was already computed on every row and discarded here, which made the check impossible to run from
  // exported data: too tight silently discards good rows, too loose silently passes poison, and
  // neither shows up in rulQuality_* alone. Recording it lets the cut be re-chosen from evidence, and
  // re-derived at any other tolerance without re-collecting.
  //
  // The quality column is not optional bookkeeping. rulTrue_* is solved from the LAGGED baseline, and
  // that baseline is re-seeded onto the live faulted reading whenever rpm dips below 300, then takes
  // tens of ticks to recover. Labels produced during the recovery are wrong directionally — RUL
  // appears to INCREASE as the fault develops — so without a per-row flag a regressor silently
  // averages poison. Per-key rather than per-row because the lag alphas span 10x: a slow-settling
  // jacket must not discard a perfectly good lube label on the same tick.
  // Both the label and the observable baseline are solved against the band in force AT THIS
  // ENGINE SPEED. Several MTU limits are RPM curves (ZNG00028788 sheet 2) and the spread is wide —
  // the last-bearing warning is 5.8 bar at rated and 2.37 at idle — so resolving them at the rated
  // point would mislabel every row recorded at part load, systematically and in one direction.
  const liveRpm = snapshot.rpm;

  for (const key of FORECAST_KEYS) {
    const refKey = HEALTHY_REF[key];
    const healthy = refKey !== undefined ? lagged[refKey] : undefined;
    const detail = healthy === undefined ? null : analyticRul(faults, key, healthy, liveRpm);

    row[`rulTrue_${key}`] = detail ? fx(detail.minutes ?? undefined, 2) : null;

    const series = (history[FORECAST_LIMITS[key]!.key] as number[] | undefined) ?? [];
    row[`minsToAlarm_${key}`] = fx(minutesToAlarm(series, key, liveRpm) ?? undefined, 2);

    if (detail && healthy !== undefined && input.instantBaseline) {
      const { quality, errorMinutes } = classifyRulQuality({
        forecastKey: key, detail, healthyUsed: healthy, instant: input.instantBaseline,
      });
      row[`rulQuality_${key}`] = quality;
      // null is meaningful here, not missing: labelErrorMinutes() returns null when the label has no
      // sensitivity to distort (no fault, no driving effect, no band), which is different from an
      // error of zero. Keep them distinguishable in the export.
      row[`rulLabelErrMin_${key}`] = errorMinutes === null ? null : fx(errorMinutes, 3);
    } else {
      // No instant baseline means the gap is unmeasurable, so trustworthiness is unknown — say so
      // rather than defaulting to OK, which would launder unverified rows into the training set.
      row[`rulQuality_${key}`] = detail ? 'UNKNOWN' : null;
      row[`rulLabelErrMin_${key}`] = null;
    }
  }

  buffer.push(row);
  if (buffer.length >= BUFFER_FLUSH) {
    void flush().catch(err => {
      if (!warnedFlushError) {
        warnedFlushError = true;
        console.warn('[training-recorder] flush to IndexedDB failed', err);
      }
    });
  }
  return true;
}
