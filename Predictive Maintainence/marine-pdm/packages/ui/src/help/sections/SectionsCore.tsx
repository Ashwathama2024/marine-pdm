// packages/ui/src/help/sections/SectionsCore.tsx
// Manual sections: Overview, Quick Start, Engine States & Start Logic.

import React from 'react';
import { MTU8000 } from '@marine-pdm/shared';
import { STATE_BADGE } from '@marine-pdm/simulator';
import type { EngineState } from '@marine-pdm/simulator';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, DiagramFrame, Steps, Bullets,
} from '../HelpPrimitives';
import { LiveKpiStrip } from './LiveExamples';

// ── Data-flow diagram (SimulatorEngine → Snapshot → Features → Decision → UI) ────────
function DataFlowDiagram() {
  const boxes = [
    { t: 'SimulatorEngine', s: 'physics tick, 1 Hz', c: 'var(--risk-high)' },
    { t: 'EngineSnapshot', s: '52 sensor values', c: 'var(--accent-blue)' },
    { t: 'FeatureEngine', s: 'deviation · rate · σ', c: 'var(--accent-purple)' },
    { t: 'DecisionEngine', s: 'risk · alerts', c: 'var(--risk-warning)' },
    { t: 'React UI', s: 'gauges · charts', c: 'var(--risk-normal)' },
  ];
  const bw = 116, gap = 22, h = 52, y = 14;
  const W = boxes.length * bw + (boxes.length - 1) * gap;
  return (
    <DiagramFrame title="Data flow — every 1000 ms tick">
      <svg viewBox={`0 0 ${W} 84`} width="100%" style={{ maxWidth: W }}>
        {boxes.map((b, i) => {
          const x = i * (bw + gap);
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={h} rx={7} fill="var(--bg-inset)" stroke={b.c} strokeWidth="1.3" />
              <text x={x + bw / 2} y={y + 22} fontSize="11" fontWeight="700" fill={b.c} textAnchor="middle">{b.t}</text>
              <text x={x + bw / 2} y={y + 38} fontSize="8.5" fill="var(--text-dim)" textAnchor="middle">{b.s}</text>
              {i < boxes.length - 1 && (
                <g stroke="var(--text-muted)" strokeWidth="1.4">
                  <line x1={x + bw + 3} y1={y + h / 2} x2={x + bw + gap - 3} y2={y + h / 2} />
                  <polygon points={`${x + bw + gap - 3},${y + h / 2} ${x + bw + gap - 9},${y + h / 2 - 4} ${x + bw + gap - 9},${y + h / 2 + 4}`} fill="var(--text-muted)" stroke="none" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </DiagramFrame>
  );
}

export function OverviewSection() {
  return (
    <Section id="overview" title="1 · Overview & Orientation"
      subtitle="What this system is, what it is for, and how a value gets from the engine to the screen.">
      <P>
        This is a <Hi>predictive-maintenance (PDM) digital twin</Hi> of an <Hi color="var(--accent-blue)">MTU
        20V 8000 M71/M71L</Hi> marine diesel — {MTU8000.CYLINDERS} cylinders, rated {MTU8000.RATED_RPM} RPM,
        {' '}{(MTU8000.MAX_POWER_KW / 1000).toFixed(1)} MW, normal operating point {MTU8000.LOAD.cruise}% load.
        A physics engine simulates the whole plant second-by-second; an analytics pipeline watches every
        sensor, decides what is normal vs degrading vs alarming, and explains <em>why</em>. Nothing here is a
        black box — this manual documents every equation, every score, and every graph.
      </P>
      <P>
        It is called a <em>living</em> twin because there is no recorded dataset: the engine state is generated
        live from calibrated physics, so you can inject a fault and watch the entire chain of consequences
        propagate in real time. You are the sole operator; there is no multi-user or data-privacy concern.
      </P>

      <SubSection title="The pipeline — how a number reaches the screen">
        <DataFlowDiagram />
        <Bullets items={[
          <><Code>SimulatorEngine</Code> advances the physics one tick (1 s) and emits an <Code>EngineSnapshot</Code> — ~52 sensor values (temperatures, pressures, speeds).</>,
          <><Code>FeatureEngine</Code> compares each sensor to its <em>expected</em> value at the current load/RPM and derives <em>deviation</em>, <em>rate of change</em>, rolling <em>σ</em>, and cylinder <em>imbalance</em>.</>,
          <><Code>DecisionEngine</Code> turns those features into a 0–100 <em>risk</em> score per subsystem, applies hard safety limits, and matches fault <em>patterns</em> → alerts with real ECS codes.</>,
          <>The <em>React UI</em> renders it all: gauges, trend charts, the cylinder view, the AI risk panel, and the analysis / degradation workspaces.</>,
        ]} />
        <Callout kind="info">
          One-line swap to a real ship: the UI reads from an engine interface, so replacing{' '}
          <Code>SimulatorEngine</Code> with an OPC-UA client feeds real IPMS data through the exact same
          analytics — the simulator is a stand-in for live plant data.
        </Callout>
      </SubSection>

      <SubSection title="Live snapshot (right now)">
        <LiveKpiStrip />
      </SubSection>
    </Section>
  );
}

export function QuickStartSection() {
  return (
    <Section id="quickstart" title="2 · Quick Start — Operating the Plant"
      subtitle="The fastest path from cold engine to a running, loaded plant you can experiment on.">
      <P>All engine control lives in the left sidebar under <Hi color="var(--risk-warning)">ENGINE CONTROL</Hi>
        {' '}(open automatically on the Dashboard and Simulator). Two ways to start:</P>

      <SubSection title="Fast path (recommended for exploring)">
        <Steps items={[
          <>Click <Hi color="var(--accent-blue)">⚡ QUICK START</Hi> — this bypasses the interlock sequence and jumps the engine straight to a running IDLE at 400 RPM.</>,
          <>Click <Hi color="var(--risk-warning)">⊕ CLUTCH</Hi> — the engine engages the propeller shaft and advances CLUTCHING → CLUTCHED → LOADED.</>,
          <>Drag the <Hi color="var(--accent-blue)">SPEED LEVER</Hi> up toward 1150 RPM. Load follows automatically by the propeller cube-law (it is <em>not</em> a separate lever).</>,
          <>Watch the RPM / LOAD bars fill and the dashboard gauges leave PRE-START and settle at their rated values.</>,
        ]} />
      </SubSection>

      <SubSection title="Realistic path (full start sequence)">
        <Steps items={[
          <><Hi color="var(--risk-normal)">▶ READY UP</Hi> arms the plant (ENGINE_OFF → STANDBY).</>,
          <>Satisfy the <Hi>8 interlocks</Hi> in the Simulator page (plant clear, air flaps, lube level, coolant, start-air 14–30 bar, pre-heat ≥40 °C, oil priming 180 s, fuel ready). The chip reads <Code>n/8 IL</Code>.</>,
          <>With <Code>8/8 IL</Code>, <Hi color="var(--risk-normal)">START ENG</Hi> runs SAFETY_TURNING → CRANKING → IDLE.</>,
          <>Warm up, then CLUTCH and raise the speed lever as above.</>,
        ]} />
        <Callout kind="warn">
          Pre-heat matters: interlock <Code>IL-6</Code> requires coolant ≥ 40 °C before start (MTU high-speed
          diesel practice). Turn the pre-heater on and it ramps toward a 45 °C setpoint.
        </Callout>
      </SubSection>

      <SubSection title="Inject a fault and read the result">
        <Steps items={[
          <>Go to <Hi color="var(--risk-high)">Simulator</Hi>. Pick a fault (F01–F09), set <em>intensity</em> (the ceiling, 0–100%) and <em>speed</em> (SLOW / MEDIUM / FAST — how fast it grows).</>,
          <>Watch the affected gauges drift, the AI risk panel climb, and alerts appear in the footer ticker with ECS codes.</>,
          <>Open <Hi color="var(--accent-blue)">Analysis</Hi> to see deviations/trends, or <Hi color="var(--risk-warning)">Degradation BI</Hi> to see the fault decomposed into root-cause weights.</>,
        ]} />
        <Callout kind="tip">
          Faults are only processed once the engine is CLUTCHED or LOADED — a fault has no meaning on a cold
          or declutched engine, so inject after you are under load.
        </Callout>
      </SubSection>
    </Section>
  );
}

// ── Engine state-machine diagram ────────────────────────────────────────────────────
function StateMachineDiagram() {
  const order: EngineState[] = [
    'ENGINE_OFF', 'STANDBY', 'SAFETY_TURNING', 'CRANKING', 'IDLE',
    'WARMING', 'DECLUTCHED_RUN', 'CLUTCHING', 'CLUTCHED', 'LOADED',
  ];
  const bw = 128, bh = 34, gapX = 18, gapY = 26, perRow = 5;
  const W = perRow * bw + (perRow - 1) * gapX;
  const rows = Math.ceil(order.length / perRow);
  const H = rows * bh + (rows - 1) * gapY + 46;
  const pos = (i: number) => {
    const row = Math.floor(i / perRow);
    const colRaw = i % perRow;
    const col = row % 2 === 0 ? colRaw : perRow - 1 - colRaw; // serpentine
    return { x: col * (bw + gapX), y: row * (bh + gapY) };
  };
  return (
    <DiagramFrame title="Engine lifecycle — 11-state machine (serpentine order shown)">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
        {order.map((s, i) => {
          const { x, y } = pos(i);
          const b = STATE_BADGE[s];
          const next = i < order.length - 1 ? pos(i + 1) : null;
          return (
            <g key={s}>
              {next && (
                <line
                  x1={x + bw / 2} y1={y + bh / 2} x2={next.x + bw / 2} y2={next.y + bh / 2}
                  stroke="var(--border-hi)" strokeWidth="1.2" strokeDasharray="3 3"
                />
              )}
              <rect x={x} y={y} width={bw} height={bh} rx={6} fill={`${b.color}18`} stroke={b.color} strokeWidth="1.2" />
              <text x={x + bw / 2} y={y + bh / 2 + 3.5} fontSize="10" fontWeight="700" fill={b.color} textAnchor="middle">{b.label}</text>
            </g>
          );
        })}
        <text x={0} y={H - 6} fontSize="9.5" fill="var(--text-dim)">STOPPING → ENGINE_OFF returns from any running state · DECLUTCH drops LOADED/CLUTCHED back to DECLUTCHED RUN</text>
      </svg>
    </DiagramFrame>
  );
}

export function EngineStatesSection() {
  const ilRows: React.ReactNode[][] = [
    ['IL-1', 'Plant Ready', 'External clear toggle', 'ON'],
    ['IL-2', 'Air Flaps', 'Combustion-air flaps open', 'OPEN'],
    ['IL-3', 'Lube Oil Level', 'Sump level', '> 20 %'],
    ['IL-4', 'Coolant Level', 'HT expansion tank', 'OK'],
    ['IL-5', 'Start Air Pressure', 'Air-start receiver', '14 – 30 bar'],
    ['IL-6', 'Coolant Pre-heat', 'Jacket temp before start', '≥ 40 °C'],
    ['IL-7', 'Oil Priming', 'Pre-lube pump run time', '≥ 180 s'],
    ['IL-8', 'Fuel System', 'Fuel ready', 'READY'],
  ];
  return (
    <Section id="states" title="4 · Engine States & Start Logic"
      subtitle="The lifecycle the engine moves through, the interlocks that gate a start, and how load is derived.">
      <StateMachineDiagram />
      <P>
        The engine is always in exactly one of <Hi>11 states</Hi>. Transitions are guarded — you cannot skip
        steps (e.g. you cannot CLUTCH from IDLE without WARMING first). The state colour in the sidebar dot
        and badge tells you where you are; a pulsing dot means a transient state (STANDBY, CRANKING,
        CLUTCHING, STOPPING).
      </P>
      <Bullets items={[
        <><Hi color="#FF3B3B">Pre-operational</Hi> (ENGINE_OFF, STANDBY, SAFETY_TURNING, CRANKING): sensors show ambient / pre-lube physics; risk scoring is suppressed to avoid false alarms.</>,
        <><Hi color="#D4AC0D">Running, no load</Hi> (IDLE, WARMING, DECLUTCHED_RUN): the shaft is spinning but the clutch is open — raising the speed lever raises RPM only, <em>not</em> load.</>,
        <><Hi color="#00C878">Coupled</Hi> (CLUTCHING, CLUTCHED, LOADED): the propeller is engaged. Now load appears and faults are processed.</>,
      ]} />

      <SubSection title="The 8 start interlocks">
        <P>A realistic start requires all eight satisfied. Quick Start bypasses them for convenience.</P>
        <DataTable
          columns={['ID', 'Interlock', 'What it checks', 'Pass condition']}
          colWidths={['48px', '150px', undefined, '110px']}
          rows={ilRows}
        />
      </SubSection>

      <SubSection title="How load is derived (propeller cube-law)">
        <P>
          Load is <em>not</em> a free lever. With a fixed-pitch propeller, absorbed power scales with the cube
          of shaft speed. The plant computes:
        </P>
        <div style={{
          fontFamily: 'var(--font)', fontSize: 12.5, color: 'var(--accent-blue)',
          background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 5,
          padding: '9px 12px', marginBottom: 12,
        }}>
          load% = 85 × (rpm / 1150)³
        </div>
        <P>
          So at 1150 RPM load ≈ 85% (rated); at 575 RPM (half speed) load ≈ 85 × 0.125 ≈ 11%. This is why the
          load bar tracks the speed lever automatically, and why revving a <em>declutched</em> engine produces
          RPM with zero load.
        </P>
      </SubSection>
    </Section>
  );
}
