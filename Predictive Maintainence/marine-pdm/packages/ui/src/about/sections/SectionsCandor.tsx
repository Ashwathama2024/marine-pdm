// packages/ui/src/about/sections/SectionsCandor.tsx
// Dossier sections §8 Hidden Strengths, §9 Known Limitations.
//
// Every claim below was checked directly against current source in the same session this file was
// written (mtu8000-physics.ts, degradation-matrix.ts, risk.ts, decision-engine.ts, interfaces.ts,
// the package CLAUDE.md files) — not reconstructed from memory. verifiedCurrent is set accordingly.
// If you are updating this file long after that check, re-verify before trusting it forward.

import React from 'react';
import { Section, SubSection, P, Code, Hi } from '../AboutPrimitives';
import { StrengthCallout, LimitationCallout } from '../AboutPrimitives';

export function StrengthsSection() {
  return (
    <Section id="strengths" title="8 · Hidden Strengths"
      subtitle="Design choices that aren't visible on any gauge, but are load-bearing for why this system doesn't cry wolf.">
      <StrengthCallout title="The lag-matched baseline is the real anti-false-alarm mechanism" verifiedCurrent>
        Every sensor is passed through a first-order lag each tick, and critically, its <em>expected</em>{' '}
        baseline is lagged with the <Hi>same</Hi> time constant. During a load change, the sensor and its
        expectation move together, so the deviation the risk engine actually scores stays near zero
        throughout the transient — only a genuine divergence from the fault-free curve survives as something
        worth alerting on. This is the single mechanism that makes deviation-based scoring viable at all in a
        system with large, frequent, legitimate load swings.
      </StrengthCallout>
      <StrengthCallout title="The degradation spec cannot silently drift from the physics" verifiedCurrent>
        <Code>degradation-matrix.ts</Code>'s weights are documented as literal partial derivatives of the
        physics equations, and an automated finite-difference test checks every <Code>modeled:true</Code>{' '}
        weight against the actual equation. If someone changes a calibration coefficient in{' '}
        <Code>mtu8000-physics.ts</Code> without updating the matching weight, the test suite — not a human
        reviewer — catches it.
      </StrengthCallout>
      <StrengthCallout title="Sensor failures are built to look statistically different from real faults" verifiedCurrent>
        A FREEZE is an impossibly flat line (real signals always jitter). A SPIKE decays within 1–2 ticks (a
        real fault builds and persists). A DRIFT climbs smoothly but carries none of a real fault's
        cross-correlations. These aren't incidental properties — they're the deliberate basis on which the
        system tells "the sensor is lying" apart from "the engine is actually degrading."
      </StrengthCallout>
      <StrengthCallout title="Safety overrides are fully deterministic and bypass the AI score entirely" verifiedCurrent>
        Hard ECS limits (last-bearing pressure, bearing temperature, coolant temperature, and others) are
        checked independently of the weighted risk model and, when crossed, force the risk score directly —
        no smoothing, no weighting, no possibility of a learned/tuned score under-reacting to a genuine
        safety limit.
      </StrengthCallout>
      <StrengthCallout title="Swapping to a real ship is a one-line change" verifiedCurrent>
        The entire analytics stack (features → decision → UI) consumes an engine snapshot through an
        interface, not a concrete class. Replacing the simulator with a real OPC-UA client is a single
        line in <Code>EngineContext.tsx</Code> — everything downstream of that line is simulator-agnostic by
        construction, not by convention.
      </StrengthCallout>
      <StrengthCallout title="Every RUL label states whether it can be trusted" verifiedCurrent>
        The analytic labels are solved from the lagged baseline, which is re-seeded onto the live reading
        whenever RPM drops below 300 — so labels produced during the recovery are wrong, and wrong
        <em>directionally</em> (remaining life appears to grow as the fault develops). Rather than silently
        emitting them, every row carries a per-metric <Code>rulQuality_*</Code> verdict plus the continuous{' '}
        <Code>rulLabelErrMin_*</Code> it was thresholded from, so a training run can filter poison instead of
        averaging it — and the threshold itself can be re-chosen later from the distribution it cuts, without
        re-collecting a single row. See <Hi>§6 The Prediction Layer</Hi>.
      </StrengthCallout>
      <StrengthCallout title="The forecast the operator sees is the one a real ship could compute" verifiedCurrent>
        The exact, analytic time-to-alarm needs the injected fault's identity — information no ship has. So it
        is used only as a training <em>label</em>, and every number on screen (the sensor pop-up's ETA,
        JARVIS's forecast tool) comes from the plain slope-extrapolation that works on sensor history alone.
        The system never shows the operator a figure that depended on knowing the answer in advance.
      </StrengthCallout>
      <StrengthCallout title="Persistence and spike-damping don't fight fast-fault detection" verifiedCurrent>
        A brand-new deviation is deliberately under-weighted (40%) until it survives 3 ticks, which is what
        stops single-tick sensor noise from ever reaching an alert. But that same damping only applies to the
        deviation term — the independent trend/rate term still fires immediately for a fast-ramping
        whole-engine fault. The two goals (ignore noise, catch fast faults) don't have to compromise each
        other because they're scored through different terms.
      </StrengthCallout>
    </Section>
  );
}

export function LimitationsSection() {
  return (
    <Section id="limitations" title="9 · Known Limitations"
      subtitle="Documented gaps, not discovered ones — these are deliberate modeling decisions the codebase already states plainly.">
      <LimitationCallout title="F05 does not reach charge-air temperature — by design, not oversight" verifiedCurrent>
        HT-cooler fouling (F05) raises exhaust, lube oil, bearings, and SFOC — but charge-air temperature is
        cooled by a physically separate LT/seawater circuit, so F05 <em>cannot</em> touch it in this model.
        An earlier version of the fault's cross-correlation metadata claimed otherwise; the claim is still
        recorded (<Code>modeled: false</Code>, weight 0) precisely so the gap between "what a fault's
        metadata says it does" and "what the physics actually produces" stays visible instead of silently
        disappearing. See the dashed edge on the Interconnection Map (§4).
      </LimitationCallout>
      <LimitationCallout title="F04's two secondary claims are deferred, not modeled" verifiedCurrent>
        Bearing-overtemperature (F04) is fully modeled for its direct effect (+45°C on the targeted bearing).
        Its two claimed secondary effects — a knock-on lube-pressure drop at that bearing, and a crankcase
        pressure rise — are recorded in the degradation matrix with <Code>modeled: false</Code>, weight 0.
        <Code>tickFaultsMTU8000()</Code> only ever writes the direct bearing-fault term; nothing currently
        produces these two secondary paths.
      </LimitationCallout>
      <LimitationCallout title="Two baseline systems coexist — only one affects live risk" verifiedCurrent>
        <Code>packages/knowledge/src/seed.ts</Code> feeds the actual risk-scoring pipeline.{' '}
        <Code>packages/ui/src/services/baseline-curves.ts</Code> only feeds the <Code>/baselines</Code> UI
        editor's display and has <Hi color="var(--risk-warning)">zero effect</Hi> on real risk scores. This
        is a genuine trap for anyone who edits the wrong one expecting it to change what the AI actually
        alerts on.
      </LimitationCallout>
      <LimitationCallout title="One vestigial tag survives in the snapshot: fuelRack" verifiedCurrent>
        A fuel rack is the linkage of a <em>mechanical</em> governor. This engine is common-rail — fuel is
        metered by rail pressure and injection timing — so the tag can only ever read 0, and it does.
        <Code>EngineSnapshot.fuelRack</Code> is retained because that interface is the wire format an
        OPC-UA source fills in and a real plant's tag list may still carry the point; everything derived
        from it has been removed (baseline curve, deviation feature, alarm band, trend card, cause chain).
        It had been surfaced as a live sensor for some time, which is worse than useless on two counts: a
        permanently flat trace is the exact signature this system teaches you to read as a{' '}
        <Hi color="var(--risk-warning)">FROZEN sensor</Hi>, and its degradation-matrix mapping pointed at{' '}
        <Code>fuelRailPressure</Code> — a millimetre reading joined to a bar-unit effect — so the AI
        diagnosis payload was told injector faults drive it.
      </LimitationCallout>
      <LimitationCallout title="EngineSnapshot's index signature hides missing-field bugs from the compiler" verifiedCurrent>
        <Code>EngineSnapshot</Code> carries a <Code>[key: string]: number | number[]</Code> index signature
        for backwards compatibility, which means TypeScript cannot catch a typo'd or missing field name on a
        dynamic assignment. <Code>MTU8000Snapshot</Code> is the fully-typed replacement for new code; the
        full migration off <Code>EngineSnapshot</Code> is still an open step.
      </LimitationCallout>
      <LimitationCallout title="This is a calibrated physics twin, not a model trained on fleet failure data" verifiedCurrent>
        Every session is generated live from the calibrated equations, so the system has never learned from a
        real failure it didn't already know how to simulate. Sessions <em>are</em> now persisted — every
        running tick is recorded to a local IndexedDB store, labelled with the injected fault — but that
        dataset is simulator output, not fleet history: a model trained on it learns this model's physics
        faithfully and a real engine's idiosyncrasies not at all. Nothing in the shipped decision path is
        learned from it yet; the risk engine remains entirely rule- and physics-based.
      </LimitationCallout>
      <LimitationCallout title="Both predictions assume the fault ramps linearly" verifiedCurrent>
        The analytic RUL inverts a model that is linear in severity, and the observable ETA is a straight-line
        projection of a {' '}30-tick slope. Inside this twin that is exact by construction. On real plant, wear
        accelerates — so both numbers are <Hi color="var(--risk-warning)">optimistic bounds</Hi>, not
        schedules, and a non-linear fault arrives sooner than either states. <Code>forecast.ts</Code> attaches
        that caveat to every projection it returns rather than leaving it implicit.
      </LimitationCallout>
      <LimitationCallout title="The label-quality flag cannot see a biased baseline curve" verifiedCurrent>
        <Code>rulQuality</Code> measures the gap between the <em>lagged</em> baseline and the <em>instant</em>{' '}
        one, which catches an unsettled filter but not a wrong curve: an error in <Code>seed.ts</Code> itself
        is present in both terms and cancels, and the row is reported <Code>OK</Code>. A 10.8 °C bearing-baseline
        shortfall hid behind exactly this cancellation until <Code>analyticRul()</Code> divided by it. The
        residual rule — <Hi>a label that contradicts the live sensor indicts the curve, not the flag</Hi> — is
        documented in §6, but it is a human check, not an automated one.
      </LimitationCallout>
    </Section>
  );
}
