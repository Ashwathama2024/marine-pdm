import type { CauseChain } from './cause-chains';

const ROLE = `You are an expert marine chief engineer with 25 years experience on 4-stroke medium-speed diesel engines (MAN B&W / Wärtsilä). You give precise, actionable technical analysis in plain English. Be specific about physical causes. Use engineering terms correctly. Keep responses concise and practical.`;

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
