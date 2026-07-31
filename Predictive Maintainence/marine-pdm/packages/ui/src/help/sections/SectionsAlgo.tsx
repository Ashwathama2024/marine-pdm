// packages/ui/src/help/sections/SectionsAlgo.tsx
// Manual sections: The Algorithm (feature engine → risk scoring → overrides → patterns) and the
// Degradation model + regression. Tables derived from MTU8000_ALARM_BANDS and DEGRADATION_MODES.

import React from 'react';
import { MTU8000_ALARM_BANDS } from '@marine-pdm/decision';
import { DEGRADATION_MODES, FAULT_GROWTH_RATES } from '@marine-pdm/simulator';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, DiagramFrame, Bullets,
} from '../HelpPrimitives';

// ── Risk pipeline diagram ───────────────────────────────────────────────────────────
function RiskPipelineDiagram() {
  const stages = [
    { t: 'Sensor + baseline', c: 'var(--accent-blue)' },
    { t: 'Deviation · Rate · Persist', c: 'var(--accent-purple)' },
    { t: 'Weighted sum → 0–100', c: 'var(--risk-warning)' },
    { t: 'EWMA smooth (α .35)', c: 'var(--risk-warning)' },
    { t: 'max across subsystems', c: 'var(--risk-high)' },
    { t: 'Safety override → 100?', c: 'var(--risk-critical)' },
    { t: 'STATUS', c: 'var(--risk-normal)' },
  ];
  const bw = 150, bh = 30, gap = 12;
  const W = bw + 40, H = stages.length * (bh + gap);
  return (
    <DiagramFrame title="Risk scoring pipeline (top → bottom, per tick)">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 260 }}>
        {stages.map((s, i) => {
          const y = i * (bh + gap);
          return (
            <g key={i}>
              <rect x={20} y={y} width={bw} height={bh} rx={6} fill={`${s.c}14`} stroke={s.c} strokeWidth="1.2" />
              <text x={20 + bw / 2} y={y + bh / 2 + 3.5} fontSize="9.5" fontWeight="700" fill={s.c} textAnchor="middle">{s.t}</text>
              {i < stages.length - 1 && (
                <line x1={20 + bw / 2} y1={y + bh} x2={20 + bw / 2} y2={y + bh + gap} stroke="var(--text-muted)" strokeWidth="1.3" markerEnd="" />
              )}
            </g>
          );
        })}
      </svg>
    </DiagramFrame>
  );
}

export function AlgorithmSection() {
  const bandRows = Object.entries(MTU8000_ALARM_BANDS).map(([k, v]) => [
    <Code>{k}</Code>, String(v.dev), String(v.rate),
  ]);
  return (
    <Section id="algorithm" title="7 · The Algorithm — How the AI Decides"
      subtitle="From raw sensor to a 0–100 risk score and an explained alert. No black boxes.">

      <SubSection title="Step 1 — Features (what changed)">
        <P>The <Code>FeatureEngine</Code> turns raw values into meaning by comparing each sensor to a{' '}
          <em>lagged baseline</em> (its fault-free expected value at the current load/RPM):</P>
        <Bullets items={[
          <><Hi>Deviation</Hi> — actual − expected. The headline “how far off” number.</>,
          <><Hi>Rate</Hi> — slope over a 15-sample window (15, not 5, so pressure jitter doesn’t read as a trend).</>,
          <><Hi>σ (variability)</Hi> — StdDev over a rolling 30-tick window; high σ = an unsteady/erratic signal.</>,
          <><Hi>Cylinder imbalance</Hi> — hottest − coldest cylinder spread.</>,
          <><Hi>Run gate</Hi> — below {`RUN_RPM = 300`} the engine isn’t combusting, so deviations are forced to zero (no pre-op false alarms).</>,
        ]} />
        <Callout kind="info">
          The baseline is <em>lagged with the same inertia as the sensor</em>, so a load change moves both
          together (deviation ≈ 0). Only a genuine divergence from the fault-free curve survives — that is the
          whole trick that keeps transients from firing alarms.
        </Callout>
      </SubSection>

      <SubSection title="Step 2 — Risk score (how bad)">
        <RiskPipelineDiagram />
        <P>Each subsystem gets a 0–100 score from three weighted parts:</P>
        <div style={{
          fontFamily: 'var(--font)', fontSize: 12, color: 'var(--accent-blue)',
          background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 5,
          padding: '9px 12px', marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>
          risk = w.dev·scoreDev·spikeDamp + w.trend·scoreTrend + w.persist·scorePersist
        </div>
        <Bullets items={[
          <><Hi>Deviation score</Hi> with a <Hi color="var(--risk-warning)">20% deadband</Hi> — small normal wobble scores zero; only excursions past the band count.</>,
          <><Hi>Trend score</Hi> with a noise floor and a load gate — rate only matters in loaded steady state (below 25% load it is scaled down, because warming/cooling naturally swings).</>,
          <><Hi>Persistence</Hi> — zero until the condition holds 5 ticks, then 35 → 70 → 100 at 5 / 8 / 12 ticks (“must persist 5 s before it alarms”).</>,
          <><Hi>Spike damping</Hi> — a brand-new deviation (&lt;3 ticks) counts at 40% until it proves it will persist; a rapid-rate fault still fires immediately via the trend term.</>,
          <><Hi>Load-dependent weights</Hi> — at high load deviation &amp; persistence dominate; at low load trending dominates (early warning).</>,
          <><Hi>EWMA smoothing</Hi> (α = 0.35) — a sustained fault crosses WARNING in ~4 ticks; a one-tick spike decays below 10 within 3 ticks.</>,
        ]} />
        <SubSection title="Calibrated alarm bands (deviation to pre-alarm · fault-rate)">
          <DataTable columns={['Sensor', 'Dev band', 'Rate']} colWidths={['220px', undefined, undefined]} rows={bandRows} />
        </SubSection>
      </SubSection>

      <SubSection title="Step 3 — Evidence chain (why)">
        <P>Every decision is explained in three layers you can read on the AI panel:</P>
        <Bullets items={[
          <><Hi color="var(--accent-blue)">PHYSICS</Hi> — which sensors deviate and by how much vs their baseline.</>,
          <><Hi color="var(--accent-purple)">STATISTICS</Hi> — trends, σ, cylinder imbalance, A/B-bank delta.</>,
          <><Hi color="var(--risk-warning)">RULES</Hi> — which fault pattern (P01–P08) matched, with its ECS code and MTU work-order (W-number).</>,
        ]} />
      </SubSection>

      <SubSection title="Step 4 — Safety overrides (hard limits win)">
        <P>
          Physics-based scoring is advisory; real ECS hard limits are not. When a limit is crossed the system
          risk is forced regardless of the AI score:
        </P>
        <DataTable columns={['Condition', 'Action', 'ECS code']} rows={[
          [<>last-bearing pressure &lt; 2.0 bar</>, <Hi color="var(--risk-critical)">risk = 100</Hi>, 'SS P-Oil Last Bearing'],
          [<>bearing temp &gt; 130 °C</>, <Hi color="var(--risk-critical)">risk = 100</Hi>, 'SS T-Bearing N'],
          [<>coolant &gt; 100 °C</>, <Hi color="var(--risk-critical)">risk = 100</Hi>, 'SS T-Coolant'],
          [<>mean exhaust &gt; 460 °C</>, <>risk ≥ 80</>, 'HI T-Exhaust Mean'],
          [<>fuel-rail &lt; 1200 bar</>, <>risk ≥ 85</>, 'SD P-Fuel Rail'],
          [<>bearing temp &gt; 115 °C</>, <>risk ≥ 75</>, 'HI T-Bearing N'],
        ]} />
        <P>
          Overall <Hi>status</Hi> is then banded: <Hi color="var(--risk-normal)">NORMAL</Hi> &lt; 25 ·{' '}
          <Hi color="var(--risk-warning)">WARNING</Hi> 25–49 · <Hi color="var(--risk-high)">HIGH</Hi> 50–74 ·{' '}
          <Hi color="var(--risk-critical)">CRITICAL</Hi> ≥ 75.
        </P>
      </SubSection>
    </Section>
  );
}

export function DegradationSection() {
  const modeRows = DEGRADATION_MODES.map(m => {
    const primary = m.effects.find(e => e.kind === 'PRIMARY') ?? m.effects[0]!;
    return [
      <Hi color="var(--risk-warning)">{m.id}</Hi>,
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{m.name.replace(/\s*\(.*\)/, '')}</span>,
      <Code>{m.rootFactor}</Code>,
      <>{primary.sensorId} <span style={{ color: 'var(--text-dim)' }}>({primary.weight} {primary.unit})</span></>,
    ];
  });
  return (
    <Section id="degradation" title="8 · Degradation Model & Regression"
      subtitle="A structured, weighted model of what degrades how much — and a regression that validates it against live data.">
      <P>
        The degradation matrix is the typed <em>specification</em> of the physics: for every fault mode it
        lists each sensor it moves and the <Hi>weight</Hi> = the physics partial derivative{' '}
        <Code>∂sensor / ∂rootFactor</Code> at the rated point. Because the model is linear in severity,
        the effect on any sensor is simply:
      </P>
      <div style={{
        fontFamily: 'var(--font)', fontSize: 12.5, color: 'var(--accent-blue)',
        background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 5,
        padding: '9px 12px', marginBottom: 12,
      }}>
        effect = severity(t) × rootMax × weight
      </div>
      <P>
        <Hi>rootMax</Hi> is the span the root factor covers at full severity — <Code>1.0</Code> for the
        0–1 factors (injector, lube, bearing, blow-by), but <Code>0.25</Code> for HT cooling-efficiency
        drop and <Code>0.40</Code> for TC-efficiency drop. It is what converts a severity into a physical
        excursion before the weight converts that into sensor units: F05 at full severity fouls the cooler
        by 0.25 efficiency, and at <Code>∂coolant/∂drop = 15</Code> that is a{' '}
        <Hi>+3.75 °C</Hi> coolant rise — not +15 °C. Intensity does <em>not</em> appear in this formula:
        it enters once already, as the ceiling on <Code>severity(t)</Code>.
      </P>

      <SubSection title="Primary effect per mode (weight = ∂sensor/∂root)">
        <DataTable columns={['Mode', 'Name', 'Root factor', 'Primary effect (weight)']}
          colWidths={['54px', '180px', '130px', undefined]} rows={modeRows} />
      </SubSection>

      <SubSection title="Isolation vs combined faults">
        <P>
          Faults that share a root factor combine by <Hi>worst-case max</Hi> on that factor, then their
          effects <Hi>superpose</Hi> through the physics. Example: F03 (lube loss) and F05 (cooler fouling)
          both raise bearing temperature — F03 via pressure starvation, F05 via hotter oil — so a combined
          injection shows the <em>sum</em> of both contributions on the bearing sensor. Growth over time uses
          the same rates as the fault system (SLOW {FAULT_GROWTH_RATES.SLOW}, MEDIUM {FAULT_GROWTH_RATES.MEDIUM},
          FAST {FAULT_GROWTH_RATES.FAST} per second).
        </P>
      </SubSection>

      <SubSection title="Regression validation">
        <P>
          Because the model is linear, ordinary-least-squares fitted to live data should recover each weight
          with R² ≈ 1. The Degradation-BI page logs root factors (X) and sensor deviations (Y) every tick,
          arms a clean window, applies a per-sensor <em>lag-match</em> to cancel ramp hysteresis, and fits{' '}
          <Code>linregress</Code> / <Code>olsFit</Code>. A recovered slope near the matrix weight (high R²)
          means the live engine agrees with the spec.
        </P>
        <Callout kind="info">
          The matrix ↔ physics agreement is locked by an automated finite-difference test
          (<Code>packages/simulator/tests/degradation-matrix.test.ts</Code>): every modelled weight is checked
          against the physics partial, so the spec can never silently drift from the equations.
        </Callout>
      </SubSection>

      <SubSection title="Known modelling decisions (gaps)">
        <Bullets items={[
          <><Hi color="var(--risk-warning)">F05 → charge-air temp = dropped</Hi>: charge air is LT-cooled, so HT-cooler fouling physically can’t raise it (weight 0, documented).</>,
          <><Hi color="var(--risk-normal)">F06/F08 → SFOC = modelled</Hi>: TC fouling and blow-by are real efficiency losses (zero at healthy, so rated SFOC is unchanged).</>,
          <><Hi color="var(--text-muted)">F04 secondaries = deferred</Hi>: the bearing’s knock-on lube-pressure drop and crankcase rise are claimed but not yet modelled (weight 0).</>,
        ]} />
      </SubSection>
    </Section>
  );
}
