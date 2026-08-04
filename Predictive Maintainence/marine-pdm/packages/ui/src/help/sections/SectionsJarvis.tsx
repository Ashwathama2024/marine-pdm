// packages/ui/src/help/sections/SectionsJarvis.tsx
// Manual section: JARVIS — the in-app engine assistant.
//
// The tool table is GENERATED from JARVIS_TOOLS, the same array handed to the model, so a tool added
// to jarvis-tools.ts appears here automatically and one removed cannot linger as a phantom capability.
// Hand-authored: the read-only guarantee, the settings walkthrough, and the "what it is good at /
// what it is not" prose.

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, Bullets,
} from '../HelpPrimitives';
import { JARVIS_TOOLS } from '../../services/jarvis-tools';
import { AI_MODEL_PRESETS, DEFAULT_AI_SETTINGS } from '../../services/ai-settings';

export function JarvisSection() {
  const toolRows = JARVIS_TOOLS.map(t => [
    <Code>{t.function.name}</Code>,
    // First sentence only — the full text is the model's prompt, not operator documentation.
    t.function.description.split('. ')[0]!.replace(/\.$/, '') + '.',
  ]);

  return (
    <Section id="jarvis" title="10 · JARVIS — The Engine Assistant"
      subtitle="A read-only assistant that can pull any live data on demand, explain what it finds, and tell you how to test it.">
      <P>
        JARVIS is the chat widget in the bottom-right corner of every page, plus its own settings route at{' '}
        <Link to="/ai" style={{ color: 'var(--accent-blue)' }}><Code>/ai</Code></Link>. It is not a second
        opinion bolted onto the risk score — it reads the <em>same</em> live snapshot, history buffers,
        decision output, degradation log and alert list the UI renders from, and it answers by calling tools
        against them rather than by guessing from a text summary.
      </P>
      <Callout kind="info" title="NOT THE RISK ORB">
        The glowing orb on the Dashboard’s AI panel is the <em>risk score</em> visualisation
        (<Code>JarvisOrb</Code>), and it works with no API key at all. JARVIS the assistant is the chat
        widget. They share a name and nothing else.
      </Callout>

      <SubSection title="Observe-only, by construction">
        <P>
          Every tool below is <Hi>read-only</Hi>. There is no tool that injects a fault, changes a setting,
          starts or stops the engine, or writes to the simulator — the assistant can tell you exactly how to
          do those things (<Code>how_to_test</Code>), but you do them. That boundary is in the tool layer
          itself, not in the prompt, so it cannot be talked around.
        </P>
        <DataTable columns={['Tool', 'What it pulls']} colWidths={['210px', undefined]} rows={toolRows} />
        <Callout kind="read" title="WHY TOOLS AND NOT A BIG PROMPT">
          The per-turn context carries the current snapshot only. Trends, per-cylinder history, fault
          internals, the degradation log, pattern definitions and forecasts are <em>not</em> in it — they are
          fetched on demand. That keeps the context small and, more importantly, means the numbers it quotes
          are the ones the engine actually holds at that moment. While it works, the widget shows chips for
          which tools it is calling.
        </Callout>
      </SubSection>

      <SubSection title="What it knows about itself">
        <Bullets items={[
          <><Hi>The app</Hi> — every route, what it is for, and where to go to do a given thing
            (<Code>get_feature_guide</Code>).</>,
          <><Hi>How to test anything</Hi> — a concrete click-path for reproducing a fault or a sensor failure,
            generated from <Code>FAULT_DEFINITIONS</Code> and the pattern library rather than remembered
            (<Code>how_to_test</Code>).</>,
          <><Hi>The physics and the causal matrix</Hi> — the per-mode ∂sensor/∂root effects, reported as the
            real excursion (<Code>weight × rootMax</Code>), not the bare weight.</>,
          <><Hi>The prediction layer</Hi> (§9) — that an observable ETA and an analytic label both exist, that
            they are produced differently and routinely disagree, and that every label ships with a
            trustworthiness verdict.</>,
        ]} />
      </SubSection>

      <SubSection title="Setting it up">
        <P>
          JARVIS needs an OpenAI key. Everything else in this application — including the deterministic
          HISTORIC ANALYSIS block in the sensor pop-up — works without one.
        </P>
        <DataTable columns={['Setting', 'Default', 'Notes']} colWidths={['170px', '120px', undefined]} rows={[
          ['API key', 'none', <>Entered on <Code>/ai</Code> and kept in this browser’s localStorage. A build-time env var is used as a fallback if the field is left empty.</>],
          ['Model', <Code>{DEFAULT_AI_SETTINGS.model}</Code>, <>One of {AI_MODEL_PRESETS.join(' / ')} — both reasoning models.</>],
          ['Reasoning effort', <Code>{DEFAULT_AI_SETTINGS.reasoningEffort}</Code>, 'Higher spends more hidden reasoning tokens before answering.'],
          ['Max tokens', String(DEFAULT_AI_SETTINGS.maxTokens), 'Sent as max_completion_tokens; it must cover hidden reasoning AND the visible answer, so keep it generous.'],
          ['Proactive narration', DEFAULT_AI_SETTINGS.narrationEnabled ? 'on' : 'off (opt-in)', <>The <Hi>Activate</Hi> toggle. Off means JARVIS never makes an API call you did not ask for. On, it comments on new faults, alerts and degradation events — throttled to at most one note every 8 s, and burst events are held rather than dropped.</>],
        ]} />
        <P>
          <Code>TEST CONNECTION</Code> on <Code>/ai</Code> verifies the key and model in one round-trip. The
          conversation itself is one continuous thread persisted in this browser, so it survives reloads and
          navigation between pages.
        </P>
        <Callout kind="warn">
          The key is stored in browser localStorage in plain text — appropriate for a single-operator local
          twin, not for a shared machine.
        </Callout>
      </SubSection>

      <SubSection title="Asking it good questions">
        <Bullets items={[
          <><em>“What is happening right now?”</em> — it reads the live state and the evidence chain.</>,
          <><em>“What is about to happen — anything trending toward an alarm?”</em> — this is the forecast
            path; it will pull slopes and ETAs rather than eyeball the gauges.</>,
          <><em>“List A-bank cylinder temps and each bank median”</em> — per-cylinder history, the one place a
            summary would round away the signal.</>,
          <><em>“How do I test a bearing fault?”</em> — a click-path, not a lecture.</>,
        ]} />
        <Callout kind="tip">
          Ask it for the <em>numbers behind</em> a claim. It has the tools to produce them, and a narrative
          you can check against the deterministic pop-up statistics is worth more than one you cannot.
        </Callout>
      </SubSection>
    </Section>
  );
}
