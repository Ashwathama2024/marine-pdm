// Deterministic evidence payload for a single-sensor AI diagnosis.
//
// WHY THIS EXISTS: the old prompt sent actual/baseline/deviation and a hardcoded `rate: 0` — five
// numbers with no thresholds, no rate, no causal structure. A model given that has nothing to reason
// from, so it falls back on generic marine-engineering prose. Everything assembled here already
// exists in the codebase; this module's whole job is to put it in front of the model so the answer is
// forced to be specific to THIS engine at THIS instant.
//
// Design rules:
//   • Every number the model is allowed to state appears here, pre-computed and pre-rounded. The
//     model performs no arithmetic — that is what made the old `deviationPct` ambiguous and the
//     trend line wrong.
//   • The candidate-fault list is a reverse lookup through DEGRADATION_MODES, so the model gets the
//     actual ∂sensor/∂rootFactor weights the physics uses, plus each fault's OTHER predicted effects
//     with their live readings. That turns diagnosis into a checkable cross-correlation test:
//     a fault that should have moved three other sensors, and didn't, is ruled out.
//   • The injected-fault list is deliberately NOT included. JARVIS sees it (services/live-context.ts);
//     this must not. Handing the model the answer turns diagnosis into formatting, and blind accuracy
//     is the only number that means anything before this runs against real IPMS data.

import type { EngineSnapshot, BaselineSnapshot, DecisionOutput } from '@marine-pdm/shared';
import { DEGRADATION_MODES, ROOT_FACTORS } from '@marine-pdm/simulator';
import type { RootFactor } from '@marine-pdm/simulator';
import { MTU8000_PATTERNS } from '@marine-pdm/knowledge';
import type { SensorHistory } from '../context/EngineContext';
import { getCauseChain } from './cause-chains';
import { getSensorMeta, sensorLabel } from './sensor-map';
import { stats, forecastFrom, FORECAST_LIMITS, SLOPE_TICKS, r } from './forecast';

export interface EvidenceInput {
  sensorId: string;
  snapshot: EngineSnapshot;
  baseline: BaselineSnapshot;
  history: SensorHistory;
  decision: DecisionOutput | null;
  /** engine.getRootFactors() — the live latent state, NOT the injected fault list. */
  rootFactors: Record<string, number>;
  engineState: string;
  /** Uploaded vessel documents, already flattened by knowledge-store.buildContextString(). */
  knowledgeContext?: string;
}

// Root-factor keys as returned by engine.getRootFactors() → the matrix RootFactor they represent.
const RF_KEY_TO_FACTOR: Record<string, RootFactor> = {
  injFaultMax: 'injFault',
  coolingEffDrop: 'coolingEff',
  tcEffDrop: 'tcEff',
  lubeFault: 'lubeFault',
  bearingFaultMax: 'bearingFault',
  pistonBlowby: 'pistonBlowby',
};

// Live reading for a matrix sensorId. Sensors with a gauge series resolve to actual + lagged
// baseline; the rest ride EngineSnapshot's index signature and report actual only (honest: the
// baseline for those is not tracked in the history buffers).
type Reader = (s: EngineSnapshot, h: SensorHistory) => { value: number; unit: string; baseline?: number } | null;

const last = (a: number[] | undefined) => (a && a.length ? a[a.length - 1]! : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const MATRIX_READERS: Record<string, Reader> = {
  exhaustMeanTemp:            (s, h) => ({ value: s.exhaustTemp, unit: '°C', baseline: last(h.baseExhaust) }),
  'cylTemps[all]':            (s, h) => ({ value: s.cylTemps.reduce((a, b) => a + b, 0) / s.cylTemps.length, unit: '°C', baseline: last(h.baseExhaust) }),
  'cylTemps[n]':              (s)    => ({ value: Math.max(...s.cylTemps), unit: '°C (hottest cyl)' }),
  aSideMeanExhaust:           (s)    => ({ value: s.cylTemps.slice(0, 10).reduce((a, b) => a + b, 0) / 10, unit: '°C' }),
  bSideMeanExhaust:           (s)    => ({ value: s.cylTemps.slice(10).reduce((a, b) => a + b, 0) / 10, unit: '°C' }),
  cylImbalance:               (s)    => ({ value: Math.max(...s.cylTemps) - Math.min(...s.cylTemps), unit: '°C spread' }),
  coolantTempAfterEngine:     (s, h) => ({ value: s.jacketOutlet, unit: '°C', baseline: last(h.baseJacket) }),
  lubeOilPressure:            (s, h) => ({ value: s.lubeOilPressure, unit: 'bar', baseline: last(h.baseLube) }),
  chargeAirPressure:          (s, h) => ({ value: s.scavengeAir, unit: 'bar', baseline: last(h.baseScavenge) }),
  chargeAirTemp:              (s, h) => ({ value: s.chargeAirTemp, unit: '°C', baseline: last(h.baseChargeAirTemp) }),
  'tcSpeeds[i]':              (s, h) => ({ value: s.tcRPM, unit: 'RPM', baseline: last(h.baseTcRPM) }),
  sfoc:                       (s, h) => ({ value: s.sfoc, unit: 'g/kWh', baseline: last(h.baseSfoc) }),
  filterDifferentialP:        (s, h) => ({ value: s.loFilterDP, unit: 'bar', baseline: last(h.baseLoFilterDP) }),
  pistonCoolingPress:         (s, h) => ({ value: s.pistonCoolingPress, unit: 'bar', baseline: last(h.basePistonCoolingPress) }),
  fuelRailPressure:           (s)    => { const v = num(s.fuelRailPressure); return v === null ? null : { value: v, unit: 'bar' }; },
  'bearingTemps[all]':        (s)    => { const b = s.bearingTemps as number[] | undefined; return b?.length ? { value: b.reduce((x, y) => x + y, 0) / b.length, unit: '°C' } : null; },
  'bearingTemps[i]':          (s)    => { const b = s.bearingTemps as number[] | undefined; return b?.length ? { value: Math.max(...b), unit: '°C (hottest bearing)' } : null; },
  lubeOilTemp:                (s)    => { const v = num(s.lubeOilTemp); return v === null ? null : { value: v, unit: '°C' }; },
  crankcasePressure:          (s)    => { const v = num(s.crankcasePressure); return v === null ? null : { value: v, unit: 'mbar' }; },
  exhaustBackPressure:        (s)    => { const v = num(s.exhaustBackPressure); return v === null ? null : { value: v, unit: 'mbar' }; },
  lubeLastBearingPressure:    (s)    => { const v = num(s.lubeLastBearingPressure); return v === null ? null : { value: v, unit: 'bar' }; },
  lubeOilPressureAfterFilter: (s)    => { const v = num(s.lubeOilPressureAfterFilter); return v === null ? null : { value: v, unit: 'bar' }; },
};

function readingLine(sensorId: string, s: EngineSnapshot, h: SensorHistory): string {
  const rd = MATRIX_READERS[sensorId]?.(s, h);
  if (!rd) return `${sensorId}: not instrumented`;
  const dev = rd.baseline !== undefined ? ` (base ${r(rd.baseline)}, Δ${rd.value - rd.baseline >= 0 ? '+' : ''}${r(rd.value - rd.baseline)})` : '';
  return `${sensorId} = ${r(rd.value)} ${rd.unit}${dev}`;
}

/**
 * Candidate faults for a deviating sensor, from the physics matrix rather than a hand-written list.
 * Only `modeled` effects are considered — an effect the equations don't actually produce would send
 * the model hunting for a cross-correlation that cannot exist.
 */
function candidateFaults(sensorId: string, s: EngineSnapshot, h: SensorHistory): string[] {
  const meta = getSensorMeta(sensorId);
  if (!meta || meta.matrixSensorIds.length === 0) {
    return ['(no modelled degradation mode drives this sensor — treat any deviation as operational, instrumentation, or an unmodelled effect)'];
  }
  const out: string[] = [];
  for (const mode of DEGRADATION_MODES) {
    const hit = mode.effects.find(e => e.modeled && meta.matrixSensorIds.includes(e.sensorId));
    if (!hit) continue;
    const rf = ROOT_FACTORS[mode.rootFactor];
    const others = mode.effects.filter(e => e.modeled && e !== hit && e.weight !== 0);
    out.push(
      `- **${mode.id} ${mode.name}** — ECS \`${mode.ecsAlarmCode}\`, root factor: ${rf.label} (max ${rf.rootMax} ${rf.rootUnit}), scope: ${mode.scope}\n` +
      `  ∂(this sensor)/∂root = ${hit.weight} ${hit.unit} [${hit.kind}]${hit.via ? ` via ${hit.via}` : ''}\n` +
      (others.length
        ? `  MUST also move (∂/∂root, then the live reading):\n` +
          others.map(e => `    · ${e.sensorId} ${e.weight > 0 ? '+' : ''}${e.weight} ${e.unit} [${e.kind}] → ${readingLine(e.sensorId, s, h)}`).join('\n')
        : '  no other modelled effects'),
    );
  }
  return out.length ? out : ['(no modelled degradation mode drives this sensor)'];
}

function rootFactorLines(rf: Record<string, number>): string {
  const live = Object.entries(rf).filter(([, v]) => Math.abs(v) > 0.001);
  if (!live.length) return 'All nominal (no root-factor excursion detected).';
  return live.map(([k, v]) => {
    const f = RF_KEY_TO_FACTOR[k];
    const info = f ? ROOT_FACTORS[f] : undefined;
    return `- ${k} = ${r(v, 4)}${info ? ` (${info.label}, max ${info.rootMax} ${info.rootUnit})` : ''}`;
  }).join('\n');
}

function patternLines(decision: DecisionOutput | null): string {
  const alerts = decision?.alerts ?? [];
  if (!alerts.length) return 'No fault pattern is firing (P01–P08 all unmatched).';
  return alerts.map(a => {
    const p = MTU8000_PATTERNS.find(x => x.id === a.patternId);
    return `- ${a.patternId ?? '—'} ${a.patternName ?? a.issue} — ECS \`${a.ecsAlarmCode ?? '—'}\`, ` +
      `risk ${Math.round(a.riskScore)}/100, confidence ${(a.confidence * 100).toFixed(0)}%, source ${a.faultSource}` +
      (p ? `, action window ${p.actionWindow}, work order ${p.maintenanceTask ?? '—'}` : '') +
      `\n  evidence: ${a.evidence.join(' | ')}`;
  }).join('\n');
}

/** Root-factor block, for callers building a whole-engine payload rather than a single-sensor one. */
export function describeRootFactors(rootFactors: Record<string, number>): string {
  return rootFactorLines(rootFactors);
}

/** Decision-engine block (risk, firing patterns, evidence chain) for the whole-engine payload. */
export function describeDecision(decision: DecisionOutput | null): string {
  return [
    `system risk ${decision ? Math.round(decision.systemRisk) : '—'}/100, status ${decision?.status ?? '—'}`,
    `subsystem risk — exhaust ${decision ? Math.round(decision.exhaustRisk) : '—'}, lube ${decision ? Math.round(decision.lubeRisk) : '—'}, cooling ${decision ? Math.round(decision.coolingRisk) : '—'}`,
    patternLines(decision),
    `evidence chain:\n${evidenceChainLines(decision)}`,
  ].join('\n');
}

function evidenceChainLines(decision: DecisionOutput | null): string {
  const chain = decision?.evidenceChain ?? [];
  if (!chain.length) return 'not available';
  return chain.map(l => `- ${l.layer}: ${l.findings.join(' | ')}`).join('\n');
}

/**
 * Assemble the DATA block. Plain labelled text rather than JSON — same style as
 * services/live-context.ts, and cheaper in tokens than nested JSON for this shape.
 */
export function buildSensorEvidence(input: EvidenceInput): string {
  const { sensorId, snapshot, baseline, history, decision, rootFactors, engineState } = input;
  const meta = getSensorMeta(sensorId);
  const label = sensorLabel(sensorId);
  if (!meta) return `Unknown sensor id "${sensorId}".`;

  const actual = snapshot[meta.snapKey] as number;
  const expected = baseline[meta.baselineKey] as number;
  const deviation = actual - expected;
  const series = (history[meta.histKey] as number[]) ?? [];

  // Real measured rate over the recent window — this replaces the hardcoded `rate: 0` that made the
  // old prompt's "Trend: +0.000/tick" line meaningless on every single call.
  const recent = series.slice(-SLOPE_TICKS);
  const slopePerMin = recent.length >= 3 ? stats(recent).slope * 60 : null;

  const fc = meta.forecastKey && series.length >= 3
    ? forecastFrom(series, FORECAST_LIMITS[meta.forecastKey]!, 15)
    : null;

  const chain = getCauseChain(sensorId);
  const dir = deviation > 0 ? 'highDeviation' : 'lowDeviation';
  const causeText = chain ? chain[dir] : null;

  const sections = [
    `## Sensor under diagnosis
${label} (\`${sensorId}\`)
actual        = ${actual.toFixed(meta.decimals)} ${meta.unit}
baseline      = ${expected.toFixed(meta.decimals)} ${meta.unit}   (load/RPM-corrected expected value)
deviation     = ${deviation >= 0 ? '+' : ''}${deviation.toFixed(meta.decimals)} ${meta.unit} = ${expected !== 0 ? `${((deviation / expected) * 100).toFixed(1)}% of baseline` : 'n/a'}
rate          = ${slopePerMin === null ? 'not enough history yet' : `${slopePerMin >= 0 ? '+' : ''}${r(slopePerMin, 3)} ${meta.unit}/min (least-squares over last ${recent.length} ticks)`}
history depth = ${series.length} ticks @ 1 s`,

    `## Operating point
engine state ${engineState}, load ${snapshot.load.toFixed(0)}%, ${snapshot.rpm.toFixed(0)} RPM
(baselines above are already corrected for this operating point — a deviation is NOT explained by load)`,

    fc
      ? `## Coded alarm band + projection (deterministic, from MTU8000_LIMITS)
alarm threshold    = ${fc.alarmThreshold ?? 'none'} ${meta.unit}
shutdown threshold = ${fc.shutdownThreshold ?? 'none'} ${meta.unit}
direction          = travels ${fc.direction}
ETA to alarm       = ${fc.etaToAlarmMin === null ? 'not projected to reach it at the current rate' : `${fc.etaToAlarmMin} min`}
ETA to shutdown    = ${fc.etaToShutdownMin === null ? 'not projected to reach it at the current rate' : `${fc.etaToShutdownMin} min`}
verdict            = ${fc.verdict}`
      : `## Coded alarm band
This sensor has no coded MTU alarm band, so there is no threshold or ETA to cite. Do not invent one.`,

    `## Candidate faults that can physically move this sensor
Reverse lookup through the degradation matrix (∂sensor/∂rootFactor at the rated point, 85% load /
1150 RPM). Use the "MUST also move" readings to confirm or eliminate each candidate.
${candidateFaults(sensorId, snapshot, history).join('\n')}`,

    `## Live root-factor state (latent degradation variables)
${rootFactorLines(rootFactors)}`,

    `## Decision engine
system risk ${decision ? Math.round(decision.systemRisk) : '—'}/100, status ${decision?.status ?? '—'}
${patternLines(decision)}`,

    `## Evidence chain (rules engine's own findings)
${evidenceChainLines(decision)}`,

    causeText
      ? `## Reference principle for this sensor going ${deviation > 0 ? 'HIGH' : 'LOW'}
${causeText.principle}
documented causes: ${causeText.causes.slice(0, 3).join(' | ')}
documented action window: ${causeText.actionWindow}`
      : `## Reference principle
None on file for this sensor — reason from the matrix weights and the live readings above.`,

    input.knowledgeContext ? `## Vessel documents\n${input.knowledgeContext}` : '',
  ];

  return sections.filter(Boolean).join('\n\n');
}
