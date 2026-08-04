// packages/ui/src/about/sections/SectionsIdentity.tsx
// Dossier sections: §1 System Identity, §2 Module Architecture.

import React from 'react';
import { Link } from 'react-router-dom';
import { MTU8000, BSIDE_TEMP_BIAS } from '@marine-pdm/shared';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, DiagramFrame, Bullets,
} from '../AboutPrimitives';

export function SystemIdentitySection() {
  return (
    <Section id="identity" title="1 · System Identity"
      subtitle="What this dossier is, who it's for, and how it relates to the Operator's Manual.">
      <Callout kind="info">
        The <Link to="/help" style={{ color: 'var(--accent-blue)' }}>User Manual</Link> teaches you to{' '}
        <Hi>operate</Hi> the plant and read its gauges day to day — quick start, engine states, page-by-page
        and graph-by-graph guides all live there, and are not repeated here. This dossier goes one layer
        deeper: the causal <Hi color="var(--accent-purple)">"why"</Hi> behind every reading, written for
        someone who wants to understand the system, not just run it. It assumes you already know the basic
        vocabulary (RPM/load, the engine state machine, the fault-injection workflow).
      </Callout>

      <P>
        This is a <Hi>predictive-maintenance digital twin</Hi> of an <Hi color="var(--accent-blue)">MTU 20V
        8000 M71/M71L</Hi> marine diesel — a physics engine simulates the whole plant second-by-second, and an
        analytics pipeline watches every sensor, decides what is normal vs. degrading vs. alarming, and
        explains why. Everything in this dossier traces to an actual equation, constant, or threshold in the
        codebase — where a fact is a live-computed number, it cannot silently drift from the code; where it is
        hand-authored interpretation (what a reading <em>means</em>), that is stated plainly as interpretation.
      </P>

      <SubSection title="Engine identity">
        <DataTable columns={['Property', 'Value']} colWidths={['200px', undefined]} rows={[
          ['Model', MTU8000.MODEL],
          ['Cylinders', `${MTU8000.CYLINDERS} (Bank A: A1–A10, Bank B: B1–B10), ${MTU8000.V_ANGLE_DEG}° V`],
          ['Bore × Stroke', `${MTU8000.BORE_MM} × ${MTU8000.STROKE_MM} mm`],
          ['Rated speed / power', `${MTU8000.RATED_RPM} RPM · ${MTU8000.MAX_POWER_KW.toLocaleString()} kW (M71L)`],
          ['Normal operating point', `${MTU8000.LOAD.cruise}% load, ${MTU8000.RATED_RPM} RPM (${(MTU8000.LOAD_PROFILE.pct85_timeShare*100).toFixed(0)}% of operating time)`],
          ['B-side thermal bias', `+${BSIDE_TEMP_BIAS} °C — structurally warmer, V-angle heat accumulation`],
        ]} />
      </SubSection>
    </Section>
  );
}

// ── Package dependency diagram — the BUILD-TIME import graph, distinct from Help's RUNTIME
// tick data-flow diagram (§1 of the User Manual). Fixed hand-positioned coordinates, same
// box/arrow idiom as Help's diagrams.
function PackageDependencyDiagram() {
  const nodes = [
    { id: 'shared',    label: 'shared',    x: 30,  y: 100, c: 'var(--accent-blue)' },
    { id: 'simulator', label: 'simulator', x: 220, y: 40,  c: 'var(--risk-high)' },
    { id: 'features',  label: 'features',  x: 220, y: 160, c: 'var(--accent-purple)' },
    { id: 'decision',  label: 'decision',  x: 410, y: 100, c: 'var(--risk-warning)' },
    { id: 'knowledge', label: 'knowledge', x: 220, y: 260, c: '#10B981' },
    { id: 'ingestion', label: 'ingestion', x: 410, y: 260, c: '#6366F1' },
    { id: 'ui',        label: 'ui',        x: 220, y: 340, c: 'var(--risk-normal)' },
  ];
  const bw = 96, bh = 34;
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges: [string, string][] = [
    ['simulator', 'shared'], ['decision', 'shared'], ['features', 'shared'],
    ['decision', 'features'], ['knowledge', 'features'], ['ingestion', 'knowledge'],
    ['ui', 'knowledge'],
  ];
  const cx = (n: typeof nodes[0]) => n.x + bw / 2;
  const cy = (n: typeof nodes[0]) => n.y + bh / 2;
  return (
    <DiagramFrame title="Build-time import graph — which package may import which (via Vite aliases)">
      <svg viewBox="0 0 520 390" width="100%" style={{ maxWidth: 520 }}>
        {edges.map(([from, to], i) => {
          const a = byId[from]!, b = byId[to]!;
          return (
            <g key={i} stroke="var(--text-muted)" strokeWidth="1.2">
              <line x1={cx(a)} y1={cy(a)} x2={cx(b)} y2={cy(b)} markerEnd="" opacity={0.6} />
              <polygon
                points={`${cx(b)+ (cx(a)>cx(b)?8:-8)},${cy(b)} ${cx(b)+(cx(a)>cx(b)?16:-16)},${cy(b)-4} ${cx(b)+(cx(a)>cx(b)?16:-16)},${cy(b)+4}`}
                fill="var(--text-muted)" stroke="none" opacity={0.6}
              />
            </g>
          );
        })}
        {nodes.map(n => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={bw} height={bh} rx={7} fill="var(--bg-inset)" stroke={n.c} strokeWidth="1.3" />
            <text x={cx(n)} y={cy(n)+4} fontSize="11" fontWeight="700" fill={n.c} textAnchor="middle">{n.label}</text>
          </g>
        ))}
      </svg>
    </DiagramFrame>
  );
}

export function ModuleArchitectureSection() {
  return (
    <Section id="architecture" title="2 · Module Architecture"
      subtitle="The monorepo's build-time dependency graph — who is allowed to import whom.">
      <PackageDependencyDiagram />
      <Callout kind="info">
        Not to be confused with the runtime data-flow diagram in the User Manual §1 — that shows how one
        engine snapshot moves through the pipeline every second; this shows which packages are allowed to
        import which <em>at build time</em>. <Code>shared</Code> has no dependencies (the contract everything
        else imports); nothing depends on <Code>ui</Code>; <Code>simulator</Code> has no UI dependencies;{' '}
        <Code>decision</Code> depends only on <Code>shared</Code> and <Code>features</Code>.
      </Callout>

      <SubSection title="Import rule">
        <P>
          All cross-package imports use Vite aliases — never deep relative paths into another package's{' '}
          <Code>src/</Code>. New exports must be added to the package's own <Code>src/index.ts</Code> barrel
          before another package can import them.
        </P>
        <DataTable columns={['Alias', 'Resolves to']} colWidths={['210px', undefined]} rows={[
          [<Code>@marine-pdm/shared</Code>, 'shared/src/index.ts'],
          [<Code>@marine-pdm/simulator</Code>, 'packages/simulator/src/index.ts'],
          [<Code>@marine-pdm/decision</Code>, 'packages/decision/src/index.ts'],
          [<Code>@marine-pdm/features</Code>, 'packages/features/src/index.ts'],
          [<Code>@marine-pdm/knowledge</Code>, 'packages/knowledge/src/index.ts'],
          [<Code>@marine-pdm/ingestion</Code>, 'packages/ingestion/src/index.ts'],
        ]} />
      </SubSection>

      <SubSection title="What each package owns">
        <Bullets items={[
          <><Code>shared</Code> — all TypeScript interfaces (the contract), physics/alarm constants, tiny utils. No framework dependencies.</>,
          <><Code>simulator</Code> — engine physics, faults, sensor failures, the 11-state engine lifecycle. This dossier's Parameter Dossier (§3) and Interconnection Map (§4) are almost entirely sourced from here.</>,
          <><Code>features</Code> — turns a raw snapshot into deviation/rate/σ/imbalance features.</>,
          <><Code>decision</Code> — risk scoring, safety overrides, pattern matching. §5's worked example is sourced from here.</>,
          <><Code>knowledge</Code> — the live baseline curves that risk scoring actually uses (see §9, the dual-baseline-system limitation).</>,
          <><Code>ingestion</Code> — the OPC-UA client + 52-tag map; the one-line swap point for a real ship (see §8).</>,
          <><Code>ui</Code> — everything you're reading right now. Depends on all the above; nothing depends on it.</>,
        ]} />
      </SubSection>
    </Section>
  );
}
