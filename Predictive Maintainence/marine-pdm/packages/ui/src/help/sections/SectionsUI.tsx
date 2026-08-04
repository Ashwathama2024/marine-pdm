// packages/ui/src/help/sections/SectionsUI.tsx
// Manual sections: Page-by-Page guide, Graph-by-Graph guide, Colour & Status Legend, Glossary.

import React from 'react';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, ColorKey, Bullets,
} from '../HelpPrimitives';
import { LiveGaugeAnnotated } from './LiveExamples';
import { APP_MAP } from '../../services/jarvis-self-knowledge';

/**
 * Operator-facing "what to do here" prose, keyed by route.
 *
 * The route LIST is not kept here — it comes from APP_MAP (services/jarvis-self-knowledge.ts), the
 * same array JARVIS answers "what pages are there" from. A second hand-maintained list is exactly how
 * this table fell three routes behind while Training Data, the System Dossier and JARVIS shipped. A
 * route with no entry below still appears, described by its APP_MAP purpose.
 */
const PAGE_NOTES: Record<string, React.ReactNode> = {
  '/': 'The main watch screen — gauges, 20-cyl view, turbocharger panel, AI risk panel, and a clickable trend card for every gauged sensor. Glance here to see plant health at a moment.',
  '/simulator': 'Engine controls + interlocks + LOP display on the left; fault injector (with the SEVERITY RAMP toggle), per-cylinder injector, sensor-failure and value-injection panels on the right.',
  '/analysis': 'A sensor focus-rail + 6 tabs (Deviations, Table, Trends, Cylinders, Alerts, Degradation). Click a sensor chip to cross-filter every tab at once.',
  '/degradation': 'Power-BI-style: KPI headline, effect decomposition, weight-matrix heatmap, dependency graph, live regression. Arm a window and watch a fault decompose into weighted causes.',
  '/training': <>Every running tick is already being recorded and labelled with the injected fault — this is the readout. Per-run class balance, storage usage, CSV / JSONL export, delete and wipe. See §9.</>,
  '/knowledge': 'Reference: sensor definitions, ranges, baseline curves, dependency map. Look up what a tag means and its healthy envelope.',
  '/baselines': 'View/adjust the display baseline curves. Note: this is the UI-only view — live risk uses the seed baselines, not this editor.',
  '/management': 'Sensor manager and the pattern-library view (P01–P08 rules).',
  '/help': 'You are here.',
  '/about': <>The System Dossier — the causal "why" one level below this manual: what raises each reading, what a sustained change means for the engine, and how every parameter is coupled to every other.</>,
  '/ai': <>JARVIS’s settings — API key, model, reasoning effort, token budget, and the proactive-narration <Hi>Activate</Hi> toggle. The assistant itself is the widget in the bottom-right of every page. See §10.</>,
};

export function PagesSection() {
  const rows = APP_MAP.map(f => [
    <><Code>{f.route}</Code> {f.label}</>,
    <span style={{ color: 'var(--text-dim)', fontSize: 10.5, letterSpacing: '0.06em' }}>{f.group}</span>,
    PAGE_NOTES[f.route] ?? f.purpose,
  ]);
  return (
    <Section id="pages" title="11 · Page-by-Page Guide"
      subtitle="What each route is for, what lives on it, and what to expect.">
      <DataTable
        columns={['Route', 'Group', 'What to do here / expect']}
        colWidths={['180px', '90px', undefined]}
        rows={rows}
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
    <Section id="graphs" title="12 · Graph-by-Graph Guide"
      subtitle="Every visualization: what it plots, its colours, how to read it, and normal vs fault appearance.">

      <SubSection title="Annotated example — a gauge">
        <LiveGaugeAnnotated />
      </SubSection>

      <SubSection title="Dashboard visuals">
        <DataTable columns={['Graph', 'Plots / axes', 'How to read · normal vs fault']} colWidths={['150px', undefined, undefined]} rows={[
          [<Hi color="var(--accent-blue)">Arc gauges</Hi>, 'One sensor each: radial dial, alarm ticks (L1–L4), value vs baseline', 'Needle in the green = healthy; entering yellow = pre-alarm. The L1–L4 ticks on the rim are the coded MTU bands, so you can see how much margin is left, not just the number. Two rows: thermodynamic, then fuel / LO / performance.'],
          [<Hi color="var(--risk-high)">The three SS-trip gauges</Hi>, 'Last Brg Press · Fuel Rail Press · Bearing Temp', <>Every parameter carrying an Emergency-class shutdown now has its own dial. <Hi>Bearing Temp shows the HOTTEST of the 11 mains</Hi>, not a mean — the SS fires on any single bearing, so an average would hide exactly the single-bearing case F04 produces. Note <Code>Last Brg Press</Code> ≈ 55% of the <Code>LO Pressure</Code> gallery gauge: watching only the gallery understates how close the worst-lubricated point is.</>],
          [<Hi color="var(--accent-blue)">Cylinder View (20V)</Hi>, 'X = 20 cylinders (A1–A10 / B1–B10), Y = exhaust °C', 'Bars follow a fixed natural spread. ONE bar climbing away = injector (F01). ALL bars up together = cooling (F05). B-side sits ~4 °C warmer by design. HOTTEST badge flags the peak.'],
          [<Hi color="var(--accent-blue)">Turbocharger panel</Hi>, '4 ETCs (A1/A2/B1/B2): speed + cut-in state', 'Sequential TCs cut in/out with load. A single TC’s speed falling while its side runs hotter = F06 fouling.'],
          [<Hi color="var(--risk-normal)">AI risk orb</Hi>, 'System risk 0–100 as a glowing orb + colour', <>Colour = status band (green→amber→orange→red). Below it, the 3-layer evidence chain says exactly why. This is the “should I worry” at-a-glance — and it is the risk visualisation, not the JARVIS assistant (§10).</>],
          [<Hi color="var(--accent-blue)">Trend cards</Hi>, 'One small chart per gauged sensor: actual (filled) + baseline (B: line)', <>Every gauged sensor has one — a slow drift is a <em>slope</em> here long before it is a number worth noticing on the dial. The green <Code>B:</Code> value is the fault-free expectation; sustained separation from it = real fault, a blip that returns = noise. Click any card for the enlarged view.</>],
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

      <SubSection title="Pop-ups (click a gauge, a trend card, or a cylinder)">
        <P>
          A gauge and its trend card open the <em>same</em> enlarged view, so there is one place to look no
          matter which you clicked:
        </P>
        <Bullets items={[
          <><Hi>Sensor pop-up</Hi> — baseline / actual / deviation headline, the full actual-vs-baseline chart
            with the deviation trace, and the sensor’s cause chain (what physically produces this reading).</>,
          <><Hi color="var(--accent-purple)">HISTORIC ANALYSIS</Hi> — deterministic statistics over the visible
            window: min, max, mean, range, drift in units/min, and where the sensor has a coded alarm band, the
            linear ETA to it (<em>“1.5 min to Bearing temp (hottest)”</em>). No API key needed — see §9.</>,
          <><Hi>AI diagnosis</Hi> — optional, with a key: a physics-strict reading of that sensor built from a
            structured evidence payload (coupled sensors, root factors, decision output), not from the number
            alone. The HISTORIC ANALYSIS block above it is the evidence you can check its narrative against.</>,
          <><Hi>Cylinder trend pop-up</Hi> — the selected cylinder’s temperature history vs the bank.</>,
        ]} />
      </SubSection>
    </Section>
  );
}

export function LegendSection() {
  return (
    <Section id="legend" title="13 · Colour & Status Legend"
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
    <Section id="glossary" title="14 · Glossary & References"
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
          [<Code>RUL</Code>, 'Remaining Useful Life — minutes until a metric crosses its coded alarm band (§9)'],
          [<Code>ETA</Code>, 'The observable time-to-alarm from the recent slope, as opposed to the analytic RUL label'],
          [<Code>rootMax</Code>, 'The span a root factor covers at full severity — the multiplier between a matrix weight and a real excursion (§8)'],
        ]} />
      </SubSection>
      <SubSection title="Where the truth lives (for deeper digging)">
        <Bullets items={[
          <>Physics equations: <Code>packages/simulator/src/mtu8000-physics.ts</Code></>,
          <>Fault definitions: <Code>packages/simulator/src/faults-mtu8000.ts</Code></>,
          <>Degradation matrix (the model spec): <Code>packages/simulator/src/degradation-matrix.ts</Code></>,
          <>Risk scoring: <Code>packages/decision/src/risk.ts</Code> · engine: <Code>decision-engine.ts</Code></>,
          <>Feature engine: <Code>packages/features/src/feature-engine.ts</Code></>,
          <>Prediction: <Code>ui/src/services/forecast.ts</Code> (observable ETA) · <Code>rul.ts</Code> (analytic label) · <Code>rul-quality.ts</Code> (trustworthiness)</>,
          <>Training capture: <Code>ui/src/services/training-recorder.ts</Code> · store: <Code>training-store.ts</Code></>,
          <>JARVIS: <Code>ui/src/services/jarvis-tools.ts</Code> · self-knowledge: <Code>jarvis-self-knowledge.ts</Code> · widget: <Code>components/AssistantWidget.tsx</Code></>,
          <>Guides: the <Code>CLAUDE.md</Code> files · tests: <Code>tests/degradation-matrix.test.ts</Code>, <Code>tests/physics.test.ts</Code></>,
        ]} />
      </SubSection>
    </Section>
  );
}
