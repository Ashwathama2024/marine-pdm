// packages/ui/src/help/sections/SectionsUI.tsx
// Manual sections: Page-by-Page guide, Graph-by-Graph guide, Colour & Status Legend, Glossary.

import React from 'react';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, ColorKey, Bullets,
} from '../HelpPrimitives';
import { LiveGaugeAnnotated } from './LiveExamples';

export function PagesSection() {
  return (
    <Section id="pages" title="9 · Page-by-Page Guide"
      subtitle="What each route is for, what lives on it, and what to expect.">
      <DataTable
        columns={['Route', 'Purpose', 'What to do here / expect']}
        colWidths={['150px', '190px', undefined]}
        rows={[
          [<><Code>/</Code> Dashboard</>, 'Live operating picture', 'The main watch screen — gauges, 20-cyl view, turbocharger panel, AI risk panel, trend chart. Glance here to see plant health at a moment.'],
          [<><Code>/simulator</Code></>, 'Drive the plant & inject', 'Engine controls + interlocks + LOP display on the left; fault injector, per-cylinder injector, sensor-failure and value-injection panels on the right.'],
          [<><Code>/analysis</Code> Analysis</>, 'Exploratory analysis hub', 'A sensor focus-rail + 6 tabs (Deviations, Table, Trends, Cylinders, Alerts, Degradation). Click a sensor chip to cross-filter every tab at once.'],
          [<><Code>/degradation</Code> BI</>, 'Root-cause degradation', 'Power-BI-style: KPI headline, effect decomposition, weight-matrix heatmap, dependency graph, live regression. Arm a window and watch a fault decompose into weighted causes.'],
          [<><Code>/knowledge</Code></>, 'Sensor & baseline library', 'Reference: sensor definitions, ranges, baseline curves, dependency map. Look up what a tag means and its healthy envelope.'],
          [<><Code>/baselines</Code></>, 'UI baseline editor', 'View/adjust the display baseline curves. Note: this is the UI-only view — live risk uses the seed baselines, not this editor.'],
          [<><Code>/management</Code></>, 'Config & patterns', 'Sensor manager and the pattern-library view (P01–P08 rules).'],
          [<><Code>/help</Code></>, 'This manual', 'You are here.'],
        ]}
      />
      <Callout kind="info">
        Deviations, Table and Alerts are <em>tabs inside Analysis</em>, not separate nav items — the goal is
        one analysis screen with minimal page-hopping. The focus-rail selection drives all six tabs together.
      </Callout>
    </Section>
  );
}

export function GraphsSection() {
  return (
    <Section id="graphs" title="10 · Graph-by-Graph Guide"
      subtitle="Every visualization: what it plots, its colours, how to read it, and normal vs fault appearance.">

      <SubSection title="Annotated example — a gauge">
        <LiveGaugeAnnotated />
      </SubSection>

      <SubSection title="Dashboard visuals">
        <DataTable columns={['Graph', 'Plots / axes', 'How to read · normal vs fault']} colWidths={['150px', undefined, undefined]} rows={[
          [<Hi color="var(--accent-blue)">Gauges + sparkline</Hi>, 'One sensor: radial dial + last-minute mini line', 'Needle in the green = healthy; entering yellow = pre-alarm. The sparkline shows the trend direction — a steady climb is degradation, a flat line may be a frozen sensor.'],
          [<Hi color="var(--accent-blue)">Cylinder View (20V)</Hi>, 'X = 20 cylinders (A1–A10 / B1–B10), Y = exhaust °C', 'Bars follow a fixed natural spread. ONE bar climbing away = injector (F01). ALL bars up together = cooling (F05). B-side sits ~4 °C warmer by design. HOTTEST badge flags the peak.'],
          [<Hi color="var(--accent-blue)">Turbocharger panel</Hi>, '4 ETCs (A1/A2/B1/B2): speed + cut-in state', 'Sequential TCs cut in/out with load. A single TC’s speed falling while its side runs hotter = F06 fouling.'],
          [<Hi color="var(--risk-normal)">AI risk orb (Jarvis)</Hi>, 'System risk 0–100 as a glowing orb + colour', 'Colour = status band (green→amber→orange→red). Below it, the 3-layer evidence chain says exactly why. This is the “should I worry” at-a-glance.'],
          [<Hi color="var(--accent-blue)">Trend chart</Hi>, 'X = time (rolling), Y = selected sensor(s)', 'Watch slope and divergence from baseline. A sustained separation from the expected line = real fault; a brief blip that returns = noise/spike.'],
        ]} />
      </SubSection>

      <SubSection title="Analysis workspace visuals">
        <DataTable columns={['Graph', 'Plots', 'How to read']} colWidths={['150px', undefined, undefined]} rows={[
          [<Hi color="var(--accent-purple)">Deviation table</Hi>, 'Every sensor: actual, expected, Δ, mini-sparkline', 'Sort by Δ to find the worst offender. Colour intensity scales with deviation. The sparkline confirms whether Δ is growing or settling.'],
          [<Hi color="var(--accent-purple)">Trends tab</Hi>, 'Multi-sensor time series (focus-highlighted)', 'Selecting a focus sensor highlights its line and dims the rest — isolate one signal’s behaviour without losing context.'],
          [<Hi color="var(--accent-purple)">Cylinders tab</Hi>, 'Per-cylinder deviation detail', 'Responds to the exhaust focus; use it to confirm single-cyl vs whole-engine.'],
          [<Hi color="var(--accent-purple)">Alerts tab</Hi>, 'Alert history, ECS codes, W-numbers', 'Each alert carries its evidence and recommended MTU work order.'],
        ]} />
      </SubSection>

      <SubSection title="Degradation-BI visuals">
        <DataTable columns={['Panel', 'Plots', 'How to read']} colWidths={['160px', undefined, undefined]} rows={[
          [<Hi color="var(--risk-warning)">KPI header</Hi>, 'Dominant component, peak %, sample count, R²', 'The one-line verdict: which component is degrading most and how confident the fit is.'],
          [<Hi color="var(--risk-warning)">Effect decomposition</Hi>, 'Stacked bars: each sensor’s change split by root cause', 'Bar height = total change; the stacked segments show how much each root factor contributed. Two segments on one bar = a combined fault (superposition).'],
          [<Hi color="var(--risk-warning)">Weight-matrix heatmap</Hi>, 'Rows = sensors, cols = root factors, cell = weight', 'Brighter cell = stronger ∂sensor/∂root coupling. Read a column to see everything a fault touches; read a row to see what can move a sensor.'],
          [<Hi color="var(--risk-warning)">Dependency graph</Hi>, 'Root factors → sensors as an edge graph', 'Highlighted edges show the active fault’s propagation path from cause to symptoms.'],
          [<Hi color="var(--risk-warning)">Regression panel</Hi>, 'Scatter of sensor Δ vs root factor + fitted line', 'Points on the line (high R²) = the live engine matches the matrix weight (the slope). Scatter = transients; arm a clean window and enable lag-match to tighten it.'],
        ]} />
        <Callout kind="read" title="ARMING THE REGRESSION">
          Click <Code>CLEAR &amp; ARM</Code>, then inject a fault under steady load. The panel fits only the
          post-arm window, so startup/clutch transients don’t pollute the slope. <Code>LAG-MATCH</Code> applies
          each sensor’s lag to the X series to cancel ramp hysteresis → R² approaches 1.
        </Callout>
      </SubSection>

      <SubSection title="Simulator visuals">
        <DataTable columns={['Graph', 'Plots', 'How to read']} colWidths={['150px', undefined, undefined]} rows={[
          [<Hi color="var(--risk-high)">LOP display</Hi>, 'Vertical bar graphs of key start/run parameters', 'Local-operating-panel style: green zone = normal, yellow = limit. A quick physical read of the plant like a real engine-room panel.'],
          [<Hi color="var(--risk-high)">Start-air gauge</Hi>, 'Air-receiver pressure (0–30 bar)', 'Must sit 14–30 bar (green) to satisfy IL-5 before a real start.'],
          [<Hi color="var(--risk-high)">Fault placards</Hi>, 'Active fault severity + impact preview', 'Shows the growing severity and the predicted sensor impact of the injected fault.'],
        ]} />
      </SubSection>

      <SubSection title="Pop-ups (click a gauge/cylinder)">
        <Bullets items={[
          <><Hi>Sensor pop-up</Hi> — full detail for one sensor: value, baseline, deviation, trend, definition.</>,
          <><Hi>SFOC pop-up</Hi> — efficiency breakdown and contributors.</>,
          <><Hi>Cylinder trend pop-up</Hi> — the selected cylinder’s temperature history vs the bank.</>,
        ]} />
      </SubSection>
    </Section>
  );
}

export function LegendSection() {
  return (
    <Section id="legend" title="11 · Colour & Status Legend"
      subtitle="Every colour in the app means the same thing everywhere — learn it once.">
      <SubSection title="Risk / status">
        <ColorKey items={[
          { color: '#00D4AA', label: 'NORMAL', note: 'risk < 25 — within envelope' },
          { color: '#F59E0B', label: 'WARNING', note: 'risk 25–49 — watch it' },
          { color: '#F97316', label: 'HIGH', note: 'risk 50–74 — act soon' },
          { color: '#EF4444', label: 'CRITICAL', note: 'risk ≥ 75 / ECS override' },
          { color: '#818CF8', label: 'OBSERVATION', note: 'informational / low-priority' },
        ]} />
      </SubSection>
      <SubSection title="Gauge / bar bands">
        <ColorKey items={[
          { color: 'rgba(0,212,170,0.6)', label: 'Green zone', note: 'normal operating band' },
          { color: 'rgba(245,158,11,0.7)', label: 'Yellow zone', note: 'pre-alarm (HI/LO) band' },
          { color: 'rgba(239,68,68,0.7)', label: 'Red zone', note: 'shutdown (SS) threshold' },
        ]} />
      </SubSection>
      <SubSection title="Engine state dot">
        <ColorKey items={[
          { color: '#FF3B3B', label: 'OFF / STOPPING', note: 'not running' },
          { color: '#FFD700', label: 'STANDBY', note: 'armed (pulsing)' },
          { color: '#FF8C00', label: 'TURNING / CRANKING', note: 'starting (pulsing)' },
          { color: '#D4AC0D', label: 'IDLE / WARMING / DECLUTCHED', note: 'running, no load' },
          { color: '#00C878', label: 'CLUTCHED / LOADED', note: 'coupled, under load' },
        ]} />
      </SubSection>
      <SubSection title="Cross-filter focus">
        <P>On the Analysis page, clicking a sensor chip in the focus-rail tints and filters every tab to that
          sensor. Click it again (or ALL) to clear. Standalone routes are unaffected — the default is no filter.</P>
      </SubSection>
    </Section>
  );
}

export function GlossarySection() {
  return (
    <Section id="glossary" title="12 · Glossary & References"
      subtitle="Codes, abbreviations, and where to dig deeper in the codebase.">
      <SubSection title="ECS alarm code prefixes">
        <DataTable columns={['Prefix', 'Meaning']} colWidths={['80px', undefined]} rows={[
          [<Code>SS</Code>, 'Safety Shutdown — hard limit, forces risk = 100'],
          [<Code>HI</Code>, 'High pre-alarm (e.g. HI T-Exhaust)'],
          [<Code>LO</Code>, 'Low pre-alarm (e.g. LO P-Oil)'],
          [<Code>SD</Code>, 'Shutdown / speed-down (e.g. SD P-Fuel Rail)'],
          [<Code>Wxxxx</Code>, 'MTU maintenance work-order (e.g. W1047 oil system, W1073 centrifugal filter)'],
        ]} />
      </SubSection>
      <SubSection title="Abbreviations">
        <DataTable columns={['Term', 'Meaning']} colWidths={['120px', undefined]} rows={[
          [<Code>SFOC</Code>, 'Specific Fuel Oil Consumption (g/kWh) — efficiency'],
          [<Code>TC / ETC</Code>, 'Turbocharger / Exhaust Turbo-Charger'],
          [<Code>HT / LT</Code>, 'High-Temp (jacket) / Low-Temp (charge-air, sea-water) coolant circuits'],
          [<Code>LOP</Code>, 'Local Operating Panel — the engine-room readout'],
          [<Code>ECS</Code>, 'Engine Control System (MTU 8000 alarm/limit authority)'],
          [<Code>IPMS</Code>, 'Integrated Platform Management System'],
          [<Code>MCR</Code>, 'Maximum Continuous Rating (9100 kW)'],
          [<Code>OPC-UA</Code>, 'The protocol a real ship would feed live data through'],
        ]} />
      </SubSection>
      <SubSection title="Where the truth lives (for deeper digging)">
        <Bullets items={[
          <>Physics equations: <Code>packages/simulator/src/mtu8000-physics.ts</Code></>,
          <>Fault definitions: <Code>packages/simulator/src/faults-mtu8000.ts</Code></>,
          <>Degradation matrix (the model spec): <Code>packages/simulator/src/degradation-matrix.ts</Code></>,
          <>Risk scoring: <Code>packages/decision/src/risk.ts</Code> · engine: <Code>decision-engine.ts</Code></>,
          <>Feature engine: <Code>packages/features/src/feature-engine.ts</Code></>,
          <>Guides: the <Code>CLAUDE.md</Code> files · tests: <Code>tests/degradation-matrix.test.ts</Code>, <Code>tests/physics.test.ts</Code></>,
        ]} />
      </SubSection>
    </Section>
  );
}
