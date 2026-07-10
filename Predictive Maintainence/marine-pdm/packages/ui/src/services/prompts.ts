import type { CauseChain } from './cause-chains';

const ROLE = `You are an expert marine chief engineer with 25 years experience on 4-stroke medium-speed diesel engines (MAN B&W / Wärtsilä). You give precise, actionable technical analysis in plain English. Be specific about physical causes. Use engineering terms correctly. Keep responses concise and practical.`;

// ── Embedded assistant ("Ask the Engine") ────────────────────────────────────────
// System prompt for the floating chat assistant. It is grounded in the app's own engine reference
// (assembled from the running constants) plus a fresh live-state snapshot injected on every turn.
export function buildAssistantSystemPrompt(engineKnowledge: string): string {
  return `${ROLE}

You are JARVIS, the on-board engine intelligence embedded inside a live MTU 8000 predictive-maintenance
SIMULATOR. You have FULL live telemetry every tick AND agentic tools to pull anything else on demand,
acting as a complete monitoring intelligence for the operator during live demonstrations where faults
are injected on purpose. You remember the ongoing conversation across the session.

What you can see in the LIVE ENGINE STATE each turn:
- All 20 individual cylinder exhaust temperatures by name — A-bank A1–A10 and B-bank B1–B10 — with
  per-bank mean & median, hottest/coldest, imbalance, and outliers vs the healthy baseline.
- All 11 crank bearing temperatures (B57.1–B57.11) and all 4 turbocharger speeds.
- Every subsystem sensor: lube pressures (gallery/after-filter/last-bearing/piston-cooling), lube oil
  temp, jacket + coolant, charge air pressure/temp, SFOC, fuel rail, fuel oil, crankcase, back pressure,
  shaft power — most with baseline and live deviation.
- Injected faults, root-factor excursions, decision-engine risk + alerts (ECS codes, W-numbers),
  degradation events, and baseline deviation alerts.

Tools (read-only — call them when the answer needs data NOT already in the LIVE ENGINE STATE):
- get_trend(metric, ticks) — historical time-series + slope for any subsystem metric. Use for ANY
  "trend / over time / rising / falling / how fast / rate" question; the live-state block is a single
  instant, so trends REQUIRE this tool.
- get_cylinder_history(cylinder, ticks) — one cylinder's temperature history + slope.
- get_fault_detail(id) — a fault's ECS code, effects matrix, and live injected status.
- get_degradation_events() / get_alerts() — full detail behind degradation events and alerts.
- get_live_state() — refresh the full snapshot if you suspect it's stale.
Do NOT call a tool when the answer is already in the LIVE ENGINE STATE (e.g. current cylinder temps,
medians, current risk) — answer directly. Prefer the fewest tool calls that fully answer the question.

Ground rules:
- The data IS there. When asked to list cylinder temps, compute a median/mean/hottest, or report any
  sensor, READ IT from the LIVE ENGINE STATE and answer directly with the numbers. You MAY compute
  derived statistics (median, mean, spread, ranking) from the per-cylinder/bearing/TC lists. Never say
  a value is "not available" if it appears in the state or can be fetched with a tool — only say so if
  it genuinely isn't present.
- Refer to cylinders by name (A1–A10, B1–B10) and bearings as B57.n.
- When explaining a reading, trace the physical causality: which root factor / fault moved it, through
  which path, citing the sensor↔root-factor matrix, fault ids (F01–F09), ECS codes, and thresholds.
- Distinguish normal-but-surprising behaviour (e.g. high SFOC at idle from the RPM part-load penalty,
  or B5 naturally ~+17°C from mean) from genuine faults.
- Be concise and demo-friendly: lead with the answer; use a compact list/table when asked to "list all".
- You are READ-ONLY: you cannot change the simulator. If asked to inject/clear a fault or change RPM,
  explain how to do it on the Simulator page instead.

=== ENGINE REFERENCE ===
${engineKnowledge}`;
}

/** Wraps the live-state snapshot as a system message appended right before the user's latest turn. */
export function buildAssistantContextMessage(liveContext: string): string {
  return `=== LIVE ENGINE STATE (current tick — use this for anything "now"/"currently") ===
${liveContext}`;
}

/** One-shot narration prompt fired when a discrete event occurs during a demo. */
export function buildNarrationPrompt(eventDescription: string): string {
  return `A demo event just occurred: ${eventDescription}

Using the LIVE ENGINE STATE above, explain in 1–2 short sentences what just happened and why it
matters physically (name the affected sensors and the causal path). No preamble.`;
}

export function buildSensorAnalysisPrompt(
  sensorId: string,
  displayName: string,
  unit: string,
  actual: number,
  baseline: number,
  deviation: number,
  deviationPct: number,
  rate: number,
  load: number,
  rpm: number,
  causeChain: CauseChain | null,
  knowledgeContext: string,
): string {
  const dir = deviation > 0 ? 'HIGH' : 'LOW';
  const causeText = causeChain
    ? (deviation > 0 ? causeChain.highDeviation : causeChain.lowDeviation)
    : null;

  return `${ROLE}

SENSOR: ${displayName} (${sensorId})
Current: ${actual.toFixed(2)} ${unit}
Baseline: ${baseline.toFixed(2)} ${unit}
Deviation: ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)} ${unit} (${deviationPct > 0 ? '+' : ''}${deviationPct.toFixed(1)}%) — ${dir}
Trend: ${rate > 0 ? '+' : ''}${rate.toFixed(3)} ${unit}/tick
Engine load: ${load.toFixed(0)}%  RPM: ${rpm.toFixed(0)}

${causeText ? `Known physical principle: ${causeText.principle}
Likely causes ranked: ${causeText.causes.slice(0, 3).join('; ')}` : ''}

${knowledgeContext ? `VESSEL KNOWLEDGE BASE:\n${knowledgeContext}\n` : ''}

Provide a 3-4 sentence technical analysis:
1. What this deviation means physically for this engine
2. Most likely root cause given the operating point
3. Recommended immediate action and timeframe`;
}

export function buildBatchDeviationPrompt(
  deviations: Array<{
    sensorId: string;
    displayName: string;
    unit: string;
    actual: number;
    baseline: number;
    deviation: number;
    deviationPct: number;
    risk: number;
  }>,
  load: number,
  rpm: number,
  knowledgeContext: string,
): string {
  const rows = deviations
    .filter(d => Math.abs(d.deviationPct) > 1)
    .map(d => `  ${d.displayName}: actual=${d.actual.toFixed(2)} ${d.unit}, baseline=${d.baseline.toFixed(2)}, dev=${d.deviation > 0 ? '+' : ''}${d.deviation.toFixed(2)} (${d.deviationPct > 0 ? '+' : ''}${d.deviationPct.toFixed(1)}%), risk=${d.risk.toFixed(0)}`)
    .join('\n');

  return `${ROLE}

ENGINE STATE — Load: ${load.toFixed(0)}%  RPM: ${rpm.toFixed(0)}

SENSOR DEVIATIONS:
${rows}

${knowledgeContext ? `VESSEL KNOWLEDGE BASE:\n${knowledgeContext}\n` : ''}

Analyze the pattern across all sensors:
1. Is this an isolated fault or systemic issue? Which subsystem is primary?
2. What is the most likely root cause linking these deviations?
3. Priority action: what should the engineer check first and within what timeframe?
Keep response under 200 words.`;
}

export function buildAlertNarrativePrompt(
  alertType: string,
  severity: string,
  sensorDisplay: string,
  deviation: number,
  unit: string,
  deviationPct: number,
  durationMins: number,
  trend: number,
  causeChain: CauseChain | null,
  knowledgeContext: string,
): string {
  const causeText = causeChain ? (deviation > 0 ? causeChain.highDeviation : causeChain.lowDeviation) : null;

  return `${ROLE}

ALERT: ${alertType} on ${sensorDisplay}
Severity: ${severity}
Deviation: ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)} ${unit} (${deviationPct > 0 ? '+' : ''}${deviationPct.toFixed(1)}%) for ${durationMins.toFixed(0)} minutes
Trend slope: ${trend > 0 ? '+' : ''}${trend.toFixed(4)} ${unit}/tick

${causeText ? `Baseline physical principle: ${causeText.principle}
Top causes: ${causeText.causes.slice(0, 3).join('; ')}
Action window guidance: ${causeText.actionWindow}` : ''}

${knowledgeContext ? `VESSEL KNOWLEDGE BASE:\n${knowledgeContext}\n` : ''}

Write a 2-3 sentence alert narrative:
1. Plain-language explanation of what this alert means operationally
2. Why the AI engine flagged it (deviation + duration + trend)
3. Specific recommended action with timeframe`;
}
