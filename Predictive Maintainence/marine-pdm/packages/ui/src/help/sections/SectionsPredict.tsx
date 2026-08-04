// packages/ui/src/help/sections/SectionsPredict.tsx
// Manual section: Prediction & Training Capture — the layer that answers "when does this alarm?"
// and the dataset it labels while you operate.
//
// Everything numeric here is live-imported from the modules that implement it (FORECAST_LIMITS,
// SLOPE_TICKS, LABEL_ERROR_TOLERANCE_MIN, SCHEMA_VERSION, FAULT_GROWTH_RATES), so adding a
// forecastable metric or re-cutting the label tolerance updates this page with no edit here. The
// hand-authored part is the PROSE about why two predictions exist and when to distrust a label —
// see the drift policy in the root CLAUDE.md.
//
// Deliberately imports services/forecast, services/rul-quality and services/training-store, all of
// which are pure. NOT services/training-recorder: that module registers pagehide listeners and kicks
// off IndexedDB run reconciliation at import time, which a documentation page must not trigger.

import React from 'react';
import { Link } from 'react-router-dom';
import { FAULT_GROWTH_RATES } from '@marine-pdm/simulator';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, Bullets,
} from '../HelpPrimitives';
import { FORECAST_LIMITS, SLOPE_TICKS } from '../../services/forecast';
import { LABEL_ERROR_TOLERANCE_MIN } from '../../services/rul-quality';
import { SCHEMA_VERSION } from '../../services/training-store';

export function PredictionSection() {
  const metricRows = Object.entries(FORECAST_LIMITS).map(([key, l]) => [
    <Code>{key}</Code>,
    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{l.label}</span>,
    l.unit,
    l.dir === 'high'
      ? <Hi color="var(--risk-warning)">rises to alarm</Hi>
      : <Hi color="var(--accent-blue)">falls to alarm</Hi>,
    l.dir === 'high' ? String(l.hi ?? '—') : String(l.lo ?? '—'),
    l.ss !== undefined ? String(l.ss) : '—',
  ]);

  return (
    <Section id="predict" title="9 · Prediction — Time-to-Alarm, RUL & Training Capture"
      subtitle="Not just “what is wrong now” but “how long until it trips”, how much to trust that number, and the labelled dataset it writes while you operate.">
      <P>
        Risk scoring (§7) answers <em>how bad is it right now</em>. This layer answers{' '}
        <em>when does it cross the line</em>. The system computes that two independent ways and keeps
        both, because they are produced from completely different information and are <em>supposed</em>{' '}
        to disagree.
      </P>

      <SubSection title="Two answers to “when does this alarm?”">
        <DataTable columns={['', 'Observable ETA', 'Analytic RUL']} colWidths={['120px', undefined, undefined]} rows={[
          [<Hi color="var(--text-muted)">Column</Hi>, <Code>minsToAlarm_*</Code>, <Code>rulTrue_*</Code>],
          ['Method', <>Least-squares slope over the last {SLOPE_TICKS} ticks, projected linearly to the band.</>,
            <>Inverts the degradation model: solves for the severity at which the sensor lands exactly on the band, then converts to time via the fault’s growth rate.</>],
          ['Knows about the fault?', <Hi color="var(--risk-warning)">No</Hi>, <><Hi color="var(--risk-normal)">Yes</Hi> — reads the injected fault’s id, intensity, speed and live severity.</>],
          ['Available on a real ship?', 'Yes — it needs only the sensor history.', <>No. It is <em>ground truth</em>, available only because this is a twin and the fault is known.</>],
          ['Used for', 'What the operator sees, and the naive baseline a learned model has to beat.', 'The training label.'],
        ]} />
        <div style={{
          fontFamily: 'var(--font)', fontSize: 12, color: 'var(--accent-blue)',
          background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 5,
          padding: '9px 12px', marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>
          {'severityAtCross = (threshold − healthyValue) / perSeverity\n'}
          {'rulTrue (min)   = (severityAtCross − severityNow) / growthRate / 60'}
        </div>
        <P>
          <Code>perSeverity</Code> is the deviation the fault produces at severity 1.0 —{' '}
          <Code>predictEffect(mode, effect, 1)</Code>, i.e. <Code>weight × rootMax</Code> from the
          degradation matrix (§8), not the bare weight. <Code>healthyValue</Code> is the{' '}
          <em>lagged baseline</em>, never the live reading: using the live value would fold the fault’s own
          effect into the starting point and shorten every ETA.
        </P>
        <Callout kind="info">
          The two numbers disagreeing is information, not a bug. A slope fitted to {SLOPE_TICKS} ticks of a
          fault that has barely started reads “not trending to alarm” while the analytic label already knows
          it crosses in 12 minutes. That gap is exactly what a learned model is being asked to close.
        </Callout>
      </SubSection>

      <SubSection title="Where you see it">
        <Bullets items={[
          <><Hi>Gauge / trend pop-up → HISTORIC ANALYSIS</Hi> — click any gauge or any trend card. Min, max,
            mean, range over the visible window, drift in units/min, and — only where the sensor has a coded
            alarm band — the ETA line: <em>“1.5 min to Bearing temp (hottest)”</em>,{' '}
            <em>“not trending to alarm”</em>, or <em>“already in alarm band”</em>. This is deterministic and
            needs no API key.</>,
          <><Hi>JARVIS</Hi> (§10) — the <Code>forecast_metric</Code> tool returns the same projection plus
            the current value, slope/min, both thresholds and a horizon projection.</>,
          <><Hi><Link to="/training" style={{ color: 'var(--accent-blue)' }}>Training Data</Link></Hi> — every
            running tick records both columns for every forecastable metric, so the pair can be compared
            offline over a whole run.</>,
        ]} />
        <Callout kind="read" title="ONE NUMBER, NOT TWO">
          The pop-up’s ETA and the dataset’s <Code>minsToAlarm_*</Code> come from the same{' '}
          <Code>stats()</Code> / <Code>minutesToAlarm()</Code> in <Code>services/forecast.ts</Code>. What you
          read on screen and what the CSV records are the same computation, not two estimates that could
          drift apart.
        </Callout>
      </SubSection>

      <SubSection title="What is forecastable (and what is not)">
        <P>
          Only metrics with a <em>coded MTU alarm band</em> can be forecast — you cannot project a time-to-alarm
          for a threshold that does not exist. Everything else stays a trend question.
        </P>
        <DataTable
          columns={['Key', 'Metric', 'Unit', 'Direction', 'Alarm', 'Shutdown']}
          colWidths={['130px', undefined, '60px', '130px', '80px', '90px']}
          rows={metricRows}
        />
        <Callout kind="warn">
          The three Emergency-class trips — last-bearing LO pressure, common-rail pressure and bearing
          temperature — are all here, and the first two are <em>falling</em> alarms: the fault must drive the
          reading <em>down</em> to trip them, so a rising trace on those is moving <em>away</em> from danger.
        </Callout>
      </SubSection>

      <SubSection title="Trusting a label — the quality flag">
        <P>
          <Code>rulTrue_*</Code> is only as good as the fault-free value it was solved from, and that value is
          the lagged baseline — which is re-seeded onto the live (possibly faulted) reading every time RPM
          drops below <Code>RUN_RPM = 300</Code>, then climbs back out over tens of ticks. Labels produced
          during that recovery are wrong <em>directionally</em>: RUL appears to <em>increase</em> while the
          fault develops. So every label carries its own verdict.
        </P>
        <DataTable columns={['rulQuality_*', 'Meaning', 'What to do with the row']} colWidths={['160px', undefined, undefined]} rows={[
          [<Hi color="var(--risk-normal)">OK</Hi>, 'Settled baseline, real crossing.', 'Trust it.'],
          [<Hi color="var(--risk-critical)">SETTLING</Hi>, 'The baseline had not converged — the label is poison, not noise.', 'Filter it out before training.'],
          [<Hi color="var(--risk-warning)">ALREADY_BREACHED</Hi>, 'The fault-free value is itself already in the band (LO pressure at idle genuinely sits under the rated-point minimum).', 'Legitimate zero — keep, but know why it is zero.'],
          [<Hi color="var(--accent-blue)">NO_CROSS</Hi>, 'The fault cannot reach the band at this intensity cap.', 'Correct null — the alarm never comes.'],
          [<Hi color="var(--accent-blue)">WRONG_DIRECTION</Hi>, 'This fault moves the sensor away from its band.', 'Correct null.'],
          [<Hi color="var(--text-muted)">NOT_DRIVEN</Hi>, 'No modelled effect links any active fault to this sensor.', 'Correct null.'],
          [<Hi color="var(--text-muted)">NO_FAULT</Hi>, 'Healthy row — RUL is undefined without a fault.', 'Correct null (this is most rows).'],
          [<Hi color="var(--text-muted)">NO_BAND</Hi>, 'Sensor has no coded alarm band.', 'Nothing to forecast.'],
          [<Hi color="var(--text-muted)">UNKNOWN</Hi>, 'No un-lagged baseline was available, so the gap could not be measured.', 'Do not launder into the training set as OK.'],
        ]} />
        <P>
          The cut is made in <Hi>minutes of label error</Hi>, not in sensor units — a companion column{' '}
          <Code>rulLabelErrMin_*</Code> records the continuous quantity, and anything above{' '}
          <Hi>{LABEL_ERROR_TOLERANCE_MIN} min</Hi> is flagged <Code>SETTLING</Code>. A sensor-unit epsilon
          cannot be defended: the same 0.2 bar of baseline error is negligible for a FAST fault and enormous
          for a SLOW one. Recording the raw minutes means the threshold can be re-chosen from the
          distribution it cuts, without re-collecting data.
        </P>
        <Callout kind="warn" title="THE BLIND SPOT">
          The check compares the <em>lagged</em> baseline against the <em>instant</em> one, so a bias in the
          baseline <em>curve itself</em> is present in both and cancels — it will report <Code>OK</Code>. If a
          label contradicts what the gauge plainly shows (a <Code>NO_CROSS</Code> on a bearing already past
          its limit), suspect the curve in <Code>seed.ts</Code>, not the flag. That is precisely the failure
          that hid a 10.8 °C bearing-baseline bias.
        </Callout>
      </SubSection>

      <SubSection title="Training capture — the dataset writes itself">
        <P>
          Recording is <Hi>automatic</Hi>: a run opens on the pre-op → running edge and every running tick is
          written to a local IndexedDB store, labelled with the injected fault’s ground truth. Nothing to arm,
          nothing to remember. Healthy operation is therefore a <em>free negative class</em> — it accumulates
          whenever the engine is simply running.
        </P>
        <DataTable columns={['Column group', 'What it holds']} colWidths={['210px', undefined]} rows={[
          [<Code>load · rpm · engineState</Code>, 'Operating point.'],
          [<Code>cylDev_* · bearingDev_* · tcSpeedDev_* · …</Code>, 'The ~100-scalar MTU8000 feature vector — per-cylinder / per-bearing deviations, rates, σ, bank means, imbalance.'],
          [<Code>rf_*</Code>, 'The six latent root factors — the true X of the linear degradation model.'],
          [<Code>faultClass · severity · faultIntensity · faultSpeed</Code>, <>Ground-truth label. <Code>HEALTHY</Code> when nothing is injected; the most-developed fault names a compound row, with <Code>faultCount</Code> preserved so those rows can be filtered.</>],
          [<Code>rulTrue_* · minsToAlarm_* · rulQuality_* · rulLabelErrMin_*</Code>, 'Four prediction columns per forecastable metric — see above.'],
          [<Code>systemRisk · status · patternsFiring</Code>, 'The rules-engine verdict, as a comparison target.'],
          [<Code>dataQuality · degradedSensors</Code>, <><Code>DEGRADED</Code> whenever a sensor-failure mode or manual override is active. Kept — they are exactly what a sensor-fault-vs-engine-fault classifier needs — but flagged so a fault-classification run can drop them.</>],
          [<Code>schemaVersion</Code>, <>Stamped on every <em>row</em> (currently <Hi>{SCHEMA_VERSION}</Hi>), not just the run record, because the run record does not survive export. Filter on it before mixing runs.</>],
        ]} />
        <P>
          The <Link to="/training" style={{ color: 'var(--accent-blue)' }}>Training Data</Link> page is the
          readout and the way data gets out: live row count, per-run class balance (the number that decides
          whether a set is trainable at all), storage usage, CSV / JSONL export per run, and delete / wipe.
        </P>
        <Callout kind="tip" title="COLLECTING A USABLE SET">
          Leave <Hi>SEVERITY RAMP</Hi> on (§5) and inject at <Hi>SLOW</Hi> or <Hi>MEDIUM</Hi>. Predicting an
          alarm {(1 / FAULT_GROWTH_RATES.SLOW / 60).toFixed(0)}-odd minutes out requires samples from the
          ramp — a step injection pins severity at its cap immediately, so every row sits at full severity and
          a model only learns to recognise faults that have already tripped.
        </Callout>
      </SubSection>
    </Section>
  );
}
