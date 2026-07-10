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
// automatically. Only APP_MAP (the route list) and the identity prose are hand-authored — APP_MAP is
// the one sync point to keep current when a page is added.

import { FAULT_DEFINITIONS, DEGRADATION_MODES } from '@marine-pdm/simulator';
import { MTU8000_PATTERNS } from '@marine-pdm/knowledge';
import { JARVIS_TOOLS } from './jarvis-tools';

// ── App map (the one hand-maintained list — keep in sync with Sidebar/App routes) ──
interface Feature { route: string; label: string; group: string; purpose: string }
const APP_MAP: Feature[] = [
  { route: '/', label: 'Dashboard', group: 'OPERATE', purpose: 'Live gauges, 20-cylinder view, AI decision panel (system risk, evidence chain, active alerts), rolling trend chart.' },
  { route: '/simulator', label: 'Simulator', group: 'OPERATE', purpose: 'Inject faults (F01–F09 at chosen intensity/speed) and sensor failures (52 tags, 5 failure modes). This is where you TEST anything.' },
  { route: '/analysis', label: 'Analysis Workspace', group: 'ANALYZE', purpose: 'Tabs: per-sensor deviations, full sensor table with baselines, and alert analytics.' },
  { route: '/degradation', label: 'Degradation BI', group: 'ANALYZE', purpose: 'Live regression of sensor deviations against the 6 root factors — validates the ∂sensor/∂root model against physics.' },
  { route: '/knowledge', label: 'Knowledge Base', group: 'ANALYZE', purpose: 'Sensor definitions, alarm bands, and baseline curves.' },
  { route: '/baselines', label: 'Baseline Editor', group: 'ANALYZE', purpose: 'Inspect/edit the UI display baselines (note: live risk uses the seed baselines, not these).' },
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

const getIdentity = () => (_identity ??= identity());
const getTools = () => (_tools ??= toolCatalog());
const getAppMap = () => (_map ??= appMap());
const getPlaybook = () => (_play ??= testPlaybook());

/** Full self-knowledge block for the system prompt. */
export function getJarvisSelfKnowledge(): string {
  return (_full ??= [getIdentity(), getTools(), getAppMap(), getPlaybook()].join('\n\n'));
}

/** get_self_info tool — identity + capabilities. */
export function getSelfInfo(): string {
  return [getIdentity(), getTools()].join('\n\n');
}

/** get_feature_guide tool — the app map, or one page if `topic` matches. */
export function getFeatureGuide(topic?: string): string {
  const q = (topic ?? '').trim().toLowerCase();
  if (q) {
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
