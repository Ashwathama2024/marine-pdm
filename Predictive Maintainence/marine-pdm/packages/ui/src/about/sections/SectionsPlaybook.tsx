// packages/ui/src/about/sections/SectionsPlaybook.tsx
// Dossier section §7 — Health Assessment Playbook. Distinct from the User Manual's Quick Start
// (which is about operating the plant): this is about assessing it once something looks off.

import React from 'react';
import { Link } from 'react-router-dom';
import { Section, P, Code, Hi, Callout, Steps } from '../AboutPrimitives';

export function PlaybookSection() {
  return (
    <Section id="playbook" title="7 · Health Assessment Playbook"
      subtitle="A practical order of operations for reading the whole engine, not just one gauge.">
      <P>
        This is not a substitute for the <Link to="/help" style={{ color: 'var(--accent-blue)' }}>User
        Manual's Quick Start</Link> (that gets the plant running); it's what to do once you're watching a
        running plant and something needs a second look.
      </P>
      <Steps items={[
        <><Hi>Check the AI risk orb's status band first.</Hi> It's a single composite number for a reason —
          it's the fastest way to know whether you're looking at NORMAL noise or something that needs
          attention.</>,
        <><Hi>Open the evidence chain in order: PHYSICS → STATISTICS → RULES.</Hi> That is the causal order
          the decision engine itself computes in — raw deviation first, then statistical pattern, then rule
          match — so reading it in that order tells the same story the system used to reach its conclusion.</>,
        <><Hi>On the Cylinder View, ask the single most important question in this system:</Hi> is{' '}
          <Hi color="var(--risk-warning)">ONE</Hi> cylinder hot, or are <Hi color="var(--risk-warning)">ALL
          20</Hi> hot together? One means an injector (F01/F02/F07/F09); all means cooling or turbocharging
          (F05/F06). This single distinction resolves more of the fault space than any other single check.</>,
        <><Hi>Cross-check coupled parameters.</Hi> Use the relevant dossier entry's Coupled Parameters list
          (§3) or the Interconnection Map (§4) — corroboration across two or more independently-caused
          sensors is much stronger evidence than any one sensor moving alone.</>,
        <><Hi>Watch SFOC as the earliest general-purpose tell.</Hi> Because nearly every fault mode adds its
          own penalty term to the same formula, a rising SFOC with no single obvious cause is worth treating
          as an early warning even before any individual sensor has crossed its own threshold.</>,
        <><Hi>Rule out a sensor problem before trusting an engine problem.</Hi> An impossibly flat line is a
          FREEZE, a one-tick spike that snaps back is a SPIKE, a smooth climb with no cross-correlating
          symptoms is a DRIFT — none of these are the engine actually degrading. See the User Manual's{' '}
          <Code>Sensor-Failure Modes</Code> section for the full signature list.</>,
        <><Hi>Use Related Faults to close the loop.</Hi> Every dossier entry in §3 lists which fault IDs
          manifest primarily through it — that maps straight to an ECS alarm code and an MTU maintenance work
          order, which is where the diagnosis turns into an action.</>,
        <><Hi>Only then ask “how long have I got?”</Hi> Click the gauge (or its trend card) and read the
          HISTORIC ANALYSIS block: drift per minute and, where the sensor has a coded band, the projected
          time to it. Do this <em>last</em> — an ETA computed from a slope you have not yet explained is a
          number without a diagnosis behind it, and the projection is linear, so a fault that accelerates
          arrives sooner than it says (§6).</>,
      ]} />
      <Callout kind="tip">
        The fastest way to build intuition for this checklist is to practice it against a known cause: open{' '}
        <Link to="/simulator" style={{ color: 'var(--accent-blue)' }}>Simulator</Link>, inject a fault you
        already know the answer to, and walk this playbook against it before checking whether you were right.
      </Callout>
    </Section>
  );
}
