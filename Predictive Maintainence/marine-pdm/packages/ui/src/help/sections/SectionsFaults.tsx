// packages/ui/src/help/sections/SectionsFaults.tsx
// Manual sections: Fault System (F01–F09) and Sensor-Failure Modes.
// The fault table is DERIVED from the exported source-of-truth constants so it can never drift.

import React from 'react';
import { FAULT_DEFINITIONS, FAULT_MAX_EFFECTS, FAULT_GROWTH_RATES } from '@marine-pdm/simulator';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, Bullets,
} from '../HelpPrimitives';

// Max-effect display per fault id, read from FAULT_MAX_EFFECTS (kept in the source of truth).
const MAX_EFFECT: Record<string, string> = {
  F01: `+${FAULT_MAX_EFFECTS.F01_injector_temp_delta} °C (1 cyl)`,
  F02: `+${FAULT_MAX_EFFECTS.F02_multi_injector_delta} °C (A-bank)`,
  F03: `−${FAULT_MAX_EFFECTS.F03_lube_pressure_drop} bar (gallery)`,
  F04: `+${FAULT_MAX_EFFECTS.F04_bearing_temp_rise} °C (bearing)`,
  F05: `−${(FAULT_MAX_EFFECTS.F05_cooling_eff_drop * 100).toFixed(0)}% cooling eff`,
  F06: `−${(FAULT_MAX_EFFECTS.F06_tc_eff_drop * 100).toFixed(0)}% TC eff`,
  F07: `±${FAULT_MAX_EFFECTS.F07_spray_erratic_amp} °C oscillation`,
  F08: `+${FAULT_MAX_EFFECTS.F08_blowby_pressure} mbar crankcase`,
  F09: `+${FAULT_MAX_EFFECTS.F09_multi_injector_delta} °C (B-bank)`,
};

export function FaultsSection() {
  const rows = FAULT_DEFINITIONS.map(f => [
    <Hi color="var(--risk-high)">{f.id}</Hi>,
    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</span>,
    f.primarySignal,
    <Code>{f.ecsAlarmCode}</Code>,
    MAX_EFFECT[f.id] ?? '—',
    f.ssTrigger ?? '—',
  ]);
  return (
    <Section id="faults" title="5 · Fault System (F01–F09)"
      subtitle="The nine injectable degradation modes — what each one does, its ECS alarm, and its shutdown trigger.">
      <P>
        Each fault sets one or more <em>root factors</em> (see §3) and lets the physics propagate the
        consequences. The single most important discrimination the whole system is built to make:{' '}
        <Hi color="var(--risk-warning)">F05 raises ALL 20 cylinders</Hi> (whole-engine cooling loss), while{' '}
        <Hi color="var(--risk-warning)">F01 raises exactly ONE</Hi> (a single injector). Learning to read that
        difference on the cylinder view is the core skill.
      </P>

      <DataTable
        columns={['ID', 'Fault', 'Primary signal', 'ECS code', 'Max effect', 'Shutdown trigger']}
        colWidths={['54px', '170px', undefined, undefined, undefined, undefined]}
        rows={rows}
      />

      <SubSection title="Intensity × speed — how a fault grows">
        <P>
          Two knobs shape every injection. <Hi>Intensity</Hi> (0–100%) is the <em>ceiling</em> — the maximum
          fraction of the fault’s full effect. <Hi>Speed</Hi> is how fast it ramps to that ceiling. The effect
          on a sensor at any moment is:
        </P>
        <div style={{
          fontFamily: 'var(--font)', fontSize: 12.5, color: 'var(--accent-blue)',
          background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 5,
          padding: '9px 12px', marginBottom: 12,
        }}>
          effect = severity(t) × maxEffect{'\n'}
          severity(t) = min(growthRate × elapsedSeconds, intensity/100)
        </div>
        <P>
          Note that intensity appears <em>once</em>, in the second line: it is the ceiling on severity, not a
          second multiplier on the effect. At 50% intensity a fault settles at severity 0.5 and therefore
          delivers half of <Code>maxEffect</Code> — not a quarter.
        </P>
        <DataTable columns={['Speed', 'Growth rate', 'Time to full']} colWidths={['120px', '150px', undefined]} rows={[
          ['SLOW', `${FAULT_GROWTH_RATES.SLOW} /s`, '~20 minutes'],
          ['MEDIUM', `${FAULT_GROWTH_RATES.MEDIUM} /s`, '~5 minutes'],
          ['FAST', `${FAULT_GROWTH_RATES.FAST} /s`, '~80 seconds'],
        ]} />
        <Callout kind="tip">
          For a quick demo use <Hi>FAST</Hi> + 100% intensity. For a realistic “creeping wear” story that the
          degradation regression can fit cleanly, use <Hi>SLOW</Hi> or <Hi>MEDIUM</Hi> and let it run a few
          minutes under steady load.
        </Callout>
      </SubSection>

      <SubSection title="The SEVERITY RAMP toggle — the precondition for that formula">
        <P>
          The growth equation above only describes what happens with <Hi>SEVERITY RAMP</Hi> on (the default,
          in the fault-injector panel). It governs both injectors — the F02–F06/F08/F09 panel and the
          per-cylinder F01/F07 panel — so the two can never disagree about how a fault develops.
        </P>
        <DataTable columns={['Toggle', 'Severity at injection', 'What you get']} colWidths={['110px', '150px', undefined]} rows={[
          [<Hi color="var(--risk-normal)">ON (default)</Hi>, <Code>0</Code>,
            <>Severity grows from zero at the selected speed. SLOW / MEDIUM / FAST actually mean something, and the <em>incipient</em> phase — the part a prediction has to be made from — is recorded.</>],
          [<Hi color="var(--risk-warning)">OFF (demo)</Hi>, <Code>intensity / 100</Code>,
            <>The fault lands at its cap immediately. Alarms fire at once, which is convenient for a demo, but the speed control is inert and every recorded sample sits at a fully-developed fault.</>],
        ]} />
        <Callout kind="warn">
          Leave it ON when you are collecting training data (§9). A dataset gathered with the ramp off can
          only ever teach a model to recognise faults that have <em>already</em> tripped their alarm — there
          is nothing in it to predict from.
        </Callout>
      </SubSection>

      <SubSection title="Cross-correlations — read faults as fingerprints">
        <P>A real fault never moves one sensor alone. Each mode has a signature set of secondary effects:</P>
        <Bullets items={FAULT_DEFINITIONS.slice(0, 9).map(f => (
          <><Hi color="var(--risk-high)">{f.id}</Hi> {f.name.replace(/\s*\(.*\)/, '')}: {f.crossCorrelations.join(' · ')}</>
        ))} />
      </SubSection>
    </Section>
  );
}

export function SensorFailuresSection() {
  return (
    <Section id="sensorfail" title="6 · Sensor-Failure Modes"
      subtitle="Distinct from engine faults: these corrupt the measurement, not the machine. All 52 tags are injectable.">
      <P>
        A degrading <em>engine</em> and a degrading <em>sensor</em> look different, and the system must not
        confuse them. Sensor failures are injected from the Simulator’s Sensor-Failure panel and drive a
        <Code>SensorHealth</Code> score that the decision layer uses to discount untrustworthy inputs.
      </P>
      <DataTable
        columns={['Mode', 'Behaviour', 'SensorHealth signature']}
        colWidths={['130px', undefined, undefined]}
        rows={[
          [<Hi color="var(--accent-blue)">DROPOUT</Hi>, 'Value → null for a duration, then recovers', 'Health → 0 during the dropout'],
          [<Hi color="var(--accent-blue)">DRIFT</Hi>, 'Slow linear divergence from the true value', 'Health falls as drift accumulates'],
          [<Hi color="var(--accent-blue)">SPIKE</Hi>, 'A single impulse, then back to normal', 'StdDev spikes for one tick'],
          [<Hi color="var(--accent-blue)">INTERMITTENT</Hi>, 'Alternates null / valid', 'Data-freshness tracks the on/off'],
          [<Hi color="var(--accent-blue)">FREEZE</Hi>, 'Stuck at the last value (StdDev → 0)', 'Health → ~40 within 60 s (too steady)'],
        ]}
      />
      <Callout kind="read" title="HOW TO TELL THEM APART">
        A <em>freeze</em> shows an impossibly flat line (real signals always jitter). A <em>spike</em> decays in
        one or two ticks — a real fault builds and persists. A <em>drift</em> climbs smoothly but its
        cross-correlations are absent (e.g. an exhaust “rise” with no SFOC change and no cooling loss = sensor
        drift, not a real over-temperature).
      </Callout>
    </Section>
  );
}
