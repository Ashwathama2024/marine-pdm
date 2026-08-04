// JARVIS self-knowledge — what JARVIS knows about ITSELF and the app around it, so it can answer
// "what can you do?", "how do I test X?", and guide the operator without re-deriving from the engine
// reference every turn.
//
// Built LAZILY and memoized (getJarvisSelfKnowledge / the granular getters): the module imports
// JARVIS_TOOLS from jarvis-tools.ts, which in turn imports these getters — a cycle that is safe only
// because neither side USES the other's binding during top-level evaluation. Do not turn this into a
// top-level `const = build()`.
//
// Drift policy (mirrors /help + /about): the fault/pattern playbook is GENERATED from the source
// constants (FAULT_DEFINITIONS, DEGRADATION_MODES, MTU8000_PATTERNS) so new faults/patterns appear
// automatically, and predictiveCapabilities() reads its ramp timings and RUL column list from
// GROWTH_RATES / FORECAST_LIMITS for the same reason. Hand-authored, and therefore the sync points to
// keep current: APP_MAP (add a row when a page is added — /help's Page-by-Page guide renders from it,
// so that row is the only place a new route has to be described), the identity prose, and the *explanatory*
// prose in predictiveCapabilities() — the latter describes INTENT (why blind diagnosis, why rulTrue can
// legitimately be null), which no constant can regenerate.

import { FAULT_DEFINITIONS, DEGRADATION_MODES, GROWTH_RATES } from '@marine-pdm/simulator';
import { MTU8000_PATTERNS } from '@marine-pdm/knowledge';
import { JARVIS_TOOLS } from './jarvis-tools';
import { FORECAST_LIMITS } from './forecast';
// NOTE: deliberately NOT importing ./training-recorder here — that module registers pagehide /
// visibilitychange listeners and kicks off run reconciliation at import time. This is a prompt-text
// module; pulling those side effects in just to read a constant would be wrong. ./forecast and
// ./training-store are pure.

// ── App map (the one hand-maintained list — keep in sync with Sidebar/App routes) ──
//
// Exported because the User Manual's Page-by-Page guide (help/sections/SectionsUI.tsx) renders FROM
// this array rather than keeping a second route list. There used to be two, and the /help one fell
// three pages behind — Training Data, System Dossier and JARVIS all shipped without appearing in the
// guide that claims to document every route. One list, two readers (the model and the operator).
export interface Feature { route: string; label: string; group: string; purpose: string }
export const APP_MAP: Feature[] = [
  { route: '/', label: 'Dashboard', group: 'OPERATE', purpose: 'Live gauges, 20-cylinder view, AI decision panel (system risk, evidence chain, active alerts), rolling trend chart.' },
  { route: '/simulator', label: 'Simulator', group: 'OPERATE', purpose: 'Inject faults (F01–F09 at chosen intensity/speed) and sensor failures (52 tags, 5 failure modes). This is where you TEST anything.' },
  { route: '/engine3d', label: '3D Engine', group: 'OPERATE', purpose: 'Rotatable 3D wireframe of the engine. Click any cylinder, main bearing, turbocharger or ancillary to identify it and read its own live value (cylinder A4 shows A4\'s probe, not the mean), the fault modes that can degrade it, and its cable runs. Parts colour by live severity — a single hot cylinder lights up alone. Geometry is procedural from the MTU8000 constants, not CAD, and cable routing is placeholder until the vessel schedule is loaded.' },
  { route: '/analysis', label: 'Analysis Workspace', group: 'ANALYZE', purpose: 'Tabs: per-sensor deviations, full sensor table with baselines, and alert analytics.' },
  { route: '/degradation', label: 'Degradation BI', group: 'ANALYZE', purpose: 'Live regression of sensor deviations against the 6 root factors — validates the ∂sensor/∂root model against physics.' },
  { route: '/knowledge', label: 'Knowledge Base', group: 'ANALYZE', purpose: 'Sensor definitions, alarm bands, and baseline curves.' },
  { route: '/baselines', label: 'Baseline Editor', group: 'ANALYZE', purpose: 'Inspect/edit the UI display baselines (note: live risk uses the seed baselines, not these).' },
  { route: '/training', label: 'Training Data', group: 'ANALYZE', purpose: 'Persistent local capture of every running tick, labelled with the injected fault. Run list with class balance, CSV/JSONL export, storage usage, delete/wipe. This is where the dataset for a learned model accumulates.' },
  { route: '/management', label: 'Management', group: 'ANALYZE', purpose: 'Sensor manager and the pattern library (P01–P08) view.' },
  { route: '/help', label: 'User Manual', group: 'REFERENCE', purpose: 'Operator manual — how to run the plant, page-by-page guides, glossary, ECS code prefixes.' },
  { route: '/about', label: 'System Dossier', group: 'REFERENCE', purpose: 'Deep causal reference — parameter-by-parameter meaning, interconnection map, decision-logic deep dive.' },
  { route: '/ai', label: 'JARVIS', group: 'REFERENCE', purpose: 'My own settings page — API key, model, reasoning effort, max tokens, proactive-narration toggle.' },
];

// ── Sections (each cached) ─────────────────────────────────────────────────────────
function identity(): string {
  return [
    '## Who I am',
    'I am **JARVIS**, the on-board engine intelligence for this MTU 8000 (20V M71/M71L, 9100 kW, 20 cylinders) predictive-maintenance simulator. I monitor every sensor, cylinder, bearing, turbocharger and fault **live, every tick**, remember our conversation, and reason strictly from the engine\'s real physics, thresholds and decision logic — never guesswork.',
    '',
    'I work across three time horizons:',
    '- **Present** — the LIVE ENGINE STATE injected each turn (all sensors, risk, alerts).',
    '- **Past** — historical trends via `get_trend` / `get_cylinder_history`.',
    '- **Future** — projections via `forecast_metric` (time-to-alarm from the live rate + the coded MTU alarm bands).',
    '',
    'I am **read-only**: I observe and advise but cannot change the simulator. To act (inject/clear a fault, change RPM), I point you to the right page.',
  ].join('\n');
}

function toolCatalog(): string {
  const rows = JARVIS_TOOLS.map(t => `- \`${t.function.name}\` — ${t.function.description}`);
  return ['## My tools (read-only)', ...rows].join('\n');
}

function appMap(): string {
  const rows = APP_MAP.map(f => `| [${f.label}](${f.route}) | ${f.group} | ${f.purpose} |`);
  return [
    '## App map — pages you can open',
    '| Page | Group | What it does |',
    '|---|---|---|',
    ...rows,
  ].join('\n');
}

// ── Predictive-data capabilities ────────────────────────────────────────────────────
// The three features that moved this system from reactive-deterministic (physics → rules → alert)
// toward predictive. Hand-authored prose because it explains INTENT, but every number is read from the
// source constants (GROWTH_RATES, FORECAST_LIMITS) so the ramp timings and the RUL column list cannot
// drift from the code the way a typed-in table would.
function predictiveCapabilities(): string {
  const rampRows = (Object.keys(GROWTH_RATES) as Array<keyof typeof GROWTH_RATES>).map(speed => {
    const rate = GROWTH_RATES[speed];
    const minsToFull = rate > 0 ? 1 / rate / 60 : Infinity;
    return `| ${speed} | ${rate}/s | ~${minsToFull < 2 ? `${Math.round(minsToFull * 60)} s` : `${minsToFull.toFixed(1)} min`} |`;
  });
  const rulCols = Object.keys(FORECAST_LIMITS).filter(k => k !== 'systemRisk');

  return [
    '## Severity Ramp — how faults develop over time',
    'Both fault injectors (the F02–F06/F08/F09 panel and the per-cylinder F01/F07 popup) have a **Severity Ramp** toggle, **default ON**, on the [Simulator](/simulator) page.',
    '',
    '- **Ramp ON** — a fault starts at severity **0** and grows toward its intensity cap at the selected speed. The incipient phase is real and observable, so an alarm can be predicted before it trips.',
    '- **Ramp OFF** — severity starts pinned at the cap (instant full effect). Useful for a quick demo.',
    '',
    '| Speed | Growth rate | Time to full severity |',
    '|---|---|---|',
    ...rampRows,
    '',
    'Why this matters: before the toggle existed, both injectors created faults at `currentSeverity = intensity/100`, so SLOW/MED/FAST were recorded on the fault but **changed nothing** — every sample sat at full severity. If an operator asks why a fault is not developing, check two things: the ramp toggle, and that the engine is **CLUTCHED or LOADED** — faults only advance under load, so a fault injected while declutched stays inert at severity 0.',
    '',
    '## Training Data capture',
    'Every running tick is written to a local IndexedDB database (`marine-pdm-training`), surfaced on [Training Data](/training). It survives reload and is present in every later local session — nothing else in this app persists that way.',
    '',
    '- **Automatic.** A run opens on the engine\'s stopped→running edge and closes on the reverse. No operator action, so healthy (negative-class) data accumulates for free.',
    '- **Labelled from ground truth.** Each row carries the injected fault read live from the engine: `faultClass` (F01–F09 or `HEALTHY`), target cylinder/bearing/TC, intensity, speed, elapsed seconds and current `severity`.',
    '- **Features.** The ~100-scalar `MTU8000Features` vector (per-cylinder deviations/rates/σ, bearings, turbochargers, lube, coolant, charge air, SFOC, crankcase) plus the 6 latent root factors — flattened to one CSV column each.',
    '- **`dataQuality`.** `DEGRADED` when a sensor-failure mode or manual override is active, so those rows can be filtered out of a fault-classification run — or used deliberately to train sensor-fault vs equipment-fault discrimination.',
    '- **Export.** Per-run or all-runs CSV/JSONL, streamed by run so a multi-hour dataset never materialises in memory.',
    '',
    '### The two RUL columns — the important distinction',
    `For each forecastable metric (${rulCols.join(', ')}) every row carries **two** remaining-useful-life numbers:`,
    '',
    '- **`rulTrue_*` — the exact label.** Because the degradation model is linear and its weights are pinned to the real physics partials by a finite-difference test, the crossing can be SOLVED rather than extrapolated: `severityAtCross = (threshold − healthy) / (weight × rootMax)`, then divided by the growth rate. `null` means the fault genuinely cannot reach that alarm band at its intensity cap — e.g. F05 alone cannot reach the 95 °C coolant alarm at any intensity, so `null` there is correct, not missing data.',
    '- **`minsToAlarm_*` — the naive baseline.** A linear extrapolation of the recent measured slope: exactly what a rules engine can already do. It is noisy and swings widely early in a ramp.',
    '',
    'The gap between them is the headroom a learned model has to capture. If someone asks "is the dataset useful yet", that gap — plus the `faultClass` balance on the Training Data page — is the answer.',
    '',
    '## Analyze with AI — the blind per-sensor diagnosis',
    'Separate from me. Clicking a Dashboard gauge and pressing **Analyze with AI** sends one sensor\'s evidence to the same model and key I use (configured on [JARVIS](/ai)) under a strict four-line contract: VERDICT / MECHANISM / CAUSE / ACTION, ≤90 words, or `INSUFFICIENT:` when the data cannot support a conclusion.',
    '',
    'It receives the sensor\'s deviation and real measured rate, the coded MTU alarm band with time-to-alarm, the ∂sensor/∂rootFactor weights of every fault that can move that sensor, and the live readings of the sensors those faults must ALSO have moved — so it can eliminate candidates rather than guess.',
    '',
    '**It is deliberately NOT told which fault is injected.** I can see the injected fault list; that diagnosis cannot. Handing it the answer would make the output a formatting exercise instead of a real diagnosis, and blind accuracy is the only measure worth trusting before this runs against real IPMS data. The recorded `faultClass` label is the scorecard. If an operator asks why the AI diagnosis "missed" something obvious, this is why — and that is the point.',
  ].join('\n');
}

// How-to-test playbook — GENERATED from the fault/pattern constants (drift-free).
function testPlaybook(): string {
  const faults = FAULT_DEFINITIONS.map(fd => {
    const mode = DEGRADATION_MODES.find(m => m.id === fd.id);
    const primaryEffects = mode
      ? mode.effects.filter(e => e.modeled && e.kind === 'PRIMARY').map(e => e.sensorId).join(', ')
      : '';
    return [
      `### ${fd.id} — ${fd.name}`,
      `- **Test it:** open [Simulator](/simulator) → Fault Injector → select **${fd.id}**, choose intensity + speed, inject.`,
      `- **Watch for:** ECS \`${fd.ecsAlarmCode}\`; primary signal **${fd.primarySignal}**${primaryEffects ? ` (sensors: ${primaryEffects})` : ''}.`,
      `- **Confirm on:** [Dashboard](/) AI decision panel (risk climbs, matched pattern + evidence) and [Analysis](/analysis) deviations.`,
      fd.ssTrigger ? `- **Shutdown trigger:** ${fd.ssTrigger}.` : '',
      '- Ask me `forecast_metric` to see when the affected sensor is projected to cross its alarm band.',
    ].filter(Boolean).join('\n');
  });

  const patterns = MTU8000_PATTERNS.map(p =>
    `- **${p.id} ${p.name}** — fires as ECS \`${p.ecsAlarmCode}\`, work order ${p.maintenanceTask}. Action window: ${p.actionWindow}.`);

  return [
    '## How to test any fault',
    'Every fault is injected from the **Simulator** page and produces a decision-engine alert you can inspect.',
    '',
    ...faults,
    '',
    '### Patterns the decision engine will match (P01–P08)',
    ...patterns,
    '',
    'Sensor failures (dropout / drift / spike / intermittent / freeze) are tested from the same Simulator page, Sensor-Failure panel (52 tags).',
  ].join('\n');
}

// ── Memoized getters ────────────────────────────────────────────────────────────────
let _full: string | null = null;
let _identity: string | null = null;
let _tools: string | null = null;
let _map: string | null = null;
let _play: string | null = null;
let _predictive: string | null = null;

const getIdentity = () => (_identity ??= identity());
const getTools = () => (_tools ??= toolCatalog());
const getAppMap = () => (_map ??= appMap());
const getPlaybook = () => (_play ??= testPlaybook());
const getPredictive = () => (_predictive ??= predictiveCapabilities());

/** Full self-knowledge block for the system prompt. */
export function getJarvisSelfKnowledge(): string {
  return (_full ??= [getIdentity(), getTools(), getAppMap(), getPredictive(), getPlaybook()].join('\n\n'));
}

/** get_self_info tool — identity + capabilities. */
export function getSelfInfo(): string {
  return [getIdentity(), getTools()].join('\n\n');
}

/** Predictive-data capabilities: severity ramp, training capture, the two RUL columns, AI diagnosis. */
export function getPredictiveInfo(): string {
  return getPredictive();
}

// Subjects that are CONCEPTS rather than pages — asking "what is rulTrue" or "what does severity ramp
// do" must not fall through to the route table, which would answer with a page description instead.
// Each group names the `## ` heading inside predictiveCapabilities() that answers it, so a focused
// question gets the matching section rather than the whole block headed "Severity Ramp".
const PREDICTIVE_TOPICS: Array<{ heading: string; terms: string[] }> = [
  { heading: 'Severity Ramp', terms: ['ramp', 'severity ramp', 'growth rate', 'slow med fast', 'incipient', 'declutched', 'inert fault'] },
  { heading: 'Training Data capture', terms: ['training', 'training data', 'dataset', 'data collection', 'record', 'recording', 'capture', 'csv', 'export', 'jsonl', 'indexeddb', 'label', 'labels', 'ground truth', 'dataquality', 'faultclass'] },
  { heading: 'The two RUL columns', terms: ['rul', 'rultrue', 'remaining useful life', 'minstoalarm', 'time to alarm', 'naive baseline', 'predictive'] },
  { heading: 'Analyze with AI', terms: ['analyze with ai', 'analyse with ai', 'ai analysis', 'diagnosis', 'diagnose', 'blind', 'root cause'] },
];

/** Pull one `## `/`### ` section out of the predictive block by heading prefix. */
function predictiveSection(heading: string): string {
  const block = getPredictive();
  const lines = block.split('\n');
  const start = lines.findIndex(l => /^#{2,3} /.test(l) && l.replace(/^#{2,3} /, '').startsWith(heading));
  if (start < 0) return block;
  // A `###` subsection ends at the next heading of the SAME OR SHALLOWER depth, so "The two RUL
  // columns" (###) does not swallow the "## Analyze with AI" section that follows it.
  const depth = (lines[start]!.match(/^#+/) ?? ['##'])[0]!.length;
  const rest = lines.slice(start + 1);
  const endRel = rest.findIndex(l => {
    const m = l.match(/^(#{2,3}) /);
    return !!m && m[1]!.length <= depth;
  });
  return [lines[start]!, ...(endRel < 0 ? rest : rest.slice(0, endRel))].join('\n').trim();
}

/** get_feature_guide tool — the app map, one page, or a predictive-capability concept. */
export function getFeatureGuide(topic?: string): string {
  const q = (topic ?? '').trim().toLowerCase();
  if (q) {
    // Concept check first: '/training' as a route still resolves below, but 'rulTrue' has no route.
    const concept = PREDICTIVE_TOPICS.find(g => g.terms.some(t => t.includes(q) || q.includes(t)));
    if (concept) return predictiveSection(concept.heading);
    const hit = APP_MAP.find(f => f.label.toLowerCase().includes(q) || f.route === q || f.route.slice(1) === q);
    if (hit) return `## ${hit.label} (${hit.route})\n\n${hit.purpose}\n\nOpen it: [${hit.label}](${hit.route}).`;
  }
  return getAppMap();
}

/** how_to_test tool — the whole playbook, or one fault/pattern if `subject` matches an id/name. */
export function getHowToTest(subject?: string): string {
  const q = (subject ?? '').trim().toUpperCase();
  if (q) {
    const fd = FAULT_DEFINITIONS.find(f => f.id === q || f.name.toUpperCase().includes(q));
    if (fd) {
      const full = testPlaybook();
      const block = full.split('\n\n').find(b => b.startsWith(`### ${fd.id}`));
      if (block) return block;
    }
    const p = MTU8000_PATTERNS.find(x => x.id === q || x.name.toUpperCase().includes(q));
    if (p) return `- **${p.id} ${p.name}** — ECS \`${p.ecsAlarmCode}\`, ${p.maintenanceTask}, action window ${p.actionWindow}. Trigger the underlying fault from [Simulator](/simulator) and it matches automatically.`;
  }
  return getPlaybook();
}
