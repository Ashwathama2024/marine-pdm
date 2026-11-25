// packages/ui/src/about/sections/SectionsPrediction.tsx
// Dossier section §6 — The Prediction Layer. Sits directly after the Decision Logic deep-dive because
// it is the layer built ON TOP of it: risk answers "how bad now", this answers "when does it trip".
//
// Assumes the reader has the operator-level view from the User Manual §9 (what the ETA line on a
// pop-up means, what the rulQuality values are). This is the WHY: why an analytic label is even
// possible, why it is not simply "the better forecast", and where its trustworthiness check is blind.
//
// The two worked examples below are COMPUTED, not quoted — perSeverity comes from predictEffect()
// against the real DEGRADATION_MODES entry, the healthy value from the real physics function, and the
// threshold from FORECAST_LIMITS. If a weight, a rootMax or an alarm band changes, the numbers and the
// verdicts in this section change with them. The prose around them states the reasoning, which is what
// no constant can regenerate — re-read it if a coefficient change flips a verdict.

import React from 'react';
import { Link } from 'react-router-dom';
import {
  DEGRADATION_MODES, GROWTH_RATES, predictEffect,
  bearingTemp_MTU8000, lubeOilTemp_MTU8000, lubeOilPressure_MTU8000,
} from '@marine-pdm/simulator';
import { Section, SubSection, P, Code, Hi, Callout, DataTable, Bullets } from '../AboutPrimitives';
import { forecastLimit, SLOPE_TICKS } from '../../services/forecast';
import { LABEL_ERROR_TOLERANCE_MIN } from '../../services/rul-quality';

const L = 85, R = 1150;
const n = (x: number, d = 1) => x.toFixed(d);

/** Solve one worked example the same way analyticRul() does, from the live constants. */
function solve(modeId: string, sensorId: string, forecastKey: string, healthy: number) {
  const mode = DEGRADATION_MODES.find(m => m.id === modeId)!;
  const effect = mode.effects.find(e => e.sensorId === sensorId)!;
  const perSeverity = predictEffect(mode, effect, 1);
  const lim = forecastLimit(forecastKey)!;   // worked examples are all at the rated point
  const threshold = (lim.dir === 'high' ? lim.hi : lim.lo)!;
  const severityAtCross = (threshold - healthy) / perSeverity;
  return { mode, effect, perSeverity, threshold, severityAtCross };
}

// Healthy (fault-free) values at the rated point, from the real physics.
// Bearing index 10 deliberately: the observable is the MAX of the 11 mains, and at healthy the hottest
// is always the one carrying the largest positionBias (+5 °C at index 10). Solving against the mean
// instead is exactly the 10.8 °C error described at the end of this section.
const sLubeT = lubeOilTemp_MTU8000(L, R, 36, 1.0);
const sLubeP = lubeOilPressure_MTU8000(R, L, sLubeT, 0.15, 0);
const healthyBearing = bearingTemp_MTU8000(L, R, sLubeT, sLubeP, 10, 0);
const healthyCoolant = Math.max(50, 30 + (L / 100) * 55);   // same expression /help documents for B6.1

const f04 = solve('F04', 'bearingTemps[i]', 'bearingTemp', healthyBearing);
const f05 = solve('F05', 'coolantTempAfterEngine', 'jacket', healthyCoolant);

/** Minutes from severity 0 to `severityAtCross` at a given growth rate. */
const minutesAt = (severityAtCross: number, rate: number) => severityAtCross / rate / 60;

export function PredictionLayerSection() {
  const f04Crosses = f04.severityAtCross >= 0 && f04.severityAtCross <= 1;
  const f05Crosses = f05.severityAtCross >= 0 && f05.severityAtCross <= 1;

  return (
    <Section id="prediction" title="6 · The Prediction Layer"
      subtitle="Why this system can state an exact time-to-alarm, why it keeps a worse estimate alongside it on purpose, and where its own trust check is blind.">
      <P>
        The decision layer (§5) scores the present. This layer projects forward, and it does so twice —
        once the way a real ship could, and once the way only a twin can. The operator-facing description
        of both lives in the{' '}
        <Link to="/help#predict" style={{ color: 'var(--accent-blue)' }}>User Manual §9</Link>; what
        follows is why the design is shaped this way.
      </P>

      <SubSection title="Why an exact answer is even possible">
        <P>
          Forecasting normally means extrapolating a noisy slope. Here it does not have to, because the
          degradation model is <Hi>linear in severity by construction</Hi> and its weights are pinned to the
          real physics partials by a finite-difference test (§8). The forward relation is:
        </P>
        <div style={{
          fontFamily: 'var(--font)', fontSize: 12, color: 'var(--accent-blue)',
          background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 5,
          padding: '9px 12px', marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>
          {'deviation = weight × rootMax × severity  =  predictEffect(mode, effect, severity)'}
        </div>
        <P>
          A linear relation can be <em>inverted</em>. Instead of asking "where is this heading", the system
          solves for the severity at which the sensor lands exactly on its band, then converts that severity
          into time through the fault's own growth rate:
        </P>
        <div style={{
          fontFamily: 'var(--font)', fontSize: 12, color: 'var(--accent-blue)',
          background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 5,
          padding: '9px 12px', marginBottom: 12, whiteSpace: 'pre-wrap',
        }}>
          {'severityAtCross = (threshold − healthyValue) / perSeverity\n'}
          {'minutes         = (severityAtCross − severityNow) / growthRate / 60'}
        </div>
        <P>
          <Code>perSeverity</Code> is <Code>predictEffect(mode, effect, 1)</Code> — the excursion at full
          severity, <Code>weight × rootMax</Code>, not the bare weight. The distinction is not pedantic: for
          the two modes where <Code>rootMax ≠ 1</Code> it is the difference between a 15 °C claim and the
          3.75 °C the physics actually produces, and dropping it has silently produced wrong magnitudes in
          three separate places in this codebase.
        </P>
      </SubSection>

      <SubSection title="Two worked examples, solved live">
        <DataTable columns={['', `${f04.mode.id} → bearing temp (hottest)`, `${f05.mode.id} → coolant temp`]}
          colWidths={['190px', undefined, undefined]} rows={[
          [<Hi color="var(--text-muted)">Fault-free value (rated)</Hi>, `${n(healthyBearing)} °C`, `${n(healthyCoolant)} °C`],
          [<Hi color="var(--text-muted)">Alarm band</Hi>, `${f04.threshold} °C`, `${f05.threshold} °C`],
          [<><Code>perSeverity</Code> (weight × rootMax)</>, `${n(f04.perSeverity)} °C`, `${n(f05.perSeverity, 2)} °C`],
          [<Hi color="var(--text-muted)">Severity needed to cross</Hi>,
            <Hi color={f04Crosses ? 'var(--risk-warning)' : 'var(--accent-blue)'}>{n(f04.severityAtCross, 2)}</Hi>,
            <Hi color={f05Crosses ? 'var(--risk-warning)' : 'var(--accent-blue)'}>{n(f05.severityAtCross, 2)}</Hi>],
          [<Hi color="var(--text-muted)">Verdict at 100% intensity</Hi>,
            f04Crosses
              ? <>crosses at severity {n(f04.severityAtCross, 2)} — <Hi color="var(--risk-normal)">OK</Hi> label</>
              : <><Hi color="var(--accent-blue)">NO_CROSS</Hi> — cannot reach the band</>,
            f05Crosses
              ? <>crosses at severity {n(f05.severityAtCross, 2)} — <Hi color="var(--risk-normal)">OK</Hi> label</>
              : <><Hi color="var(--accent-blue)">NO_CROSS</Hi> — cannot reach the band</>],
          [<Hi color="var(--text-muted)">Time from injection (MEDIUM)</Hi>,
            f04Crosses ? `${n(minutesAt(f04.severityAtCross, GROWTH_RATES.MEDIUM), 1)} min` : '—',
            f05Crosses ? `${n(minutesAt(f05.severityAtCross, GROWTH_RATES.MEDIUM), 1)} min` : '—'],
        ]} />
        <Callout kind="read" title="WHAT THE SECOND COLUMN IS TELLING YOU">
          {f05Crosses ? (
            <>HT-cooler fouling reaches the coolant alarm within its severity range at the rated point.</>
          ) : (
            <>HT-cooler fouling alone <em>cannot</em> trip <Code>HI T-Coolant</Code> at the rated operating
              point: it would need severity {n(f05.severityAtCross, 2)}, and severity is capped at 1.0. The
              honest label is a <Hi color="var(--accent-blue)">null</Hi>, not a large number — which is why{' '}
              <Code>NO_CROSS</Code> exists as a distinct value rather than being folded into "unknown". F05
              is still plainly visible long before that: it moves exhaust (weight {' '}
              {DEGRADATION_MODES.find(m => m.id === 'F05')!.effects.find(e => e.sensorId === 'exhaustMeanTemp')!.weight} °C),
              lube-oil temperature and SFOC together, and the risk score reacts to the deviation regardless of
              whether any single band is reachable.</>
          )}
        </Callout>
      </SubSection>

      <SubSection title="Why the worse estimate is kept on purpose">
        <P>
          The analytic label reads the injected fault's id, intensity, speed and live severity. No ship has
          that. So next to it the recorder stores <Code>minsToAlarm_*</Code> — an ordinary least-squares
          slope over the last {SLOPE_TICKS} ticks, projected linearly — computed from the sensor history
          alone.
        </P>
        <Bullets items={[
          <><Hi>It is the baseline to beat.</Hi> A learned model that cannot outperform a straight-line
            extrapolation has not learned anything about the physics.</>,
          <><Hi>It is what the operator actually sees.</Hi> The ETA line in every sensor pop-up is this
            number, not the label — so the screen never shows a figure that depended on knowing the answer.</>,
          <><Hi>Its failure mode is instructive.</Hi> Early in a slow fault the slope is buried in noise and
            reports "not trending to alarm" while the analytic label already knows the crossing time. That
            gap, per fault speed and per sensor, is the quantity the whole training set exists to close.</>,
        ]} />
        <Callout kind="info">
          One implementation, two consumers: <Code>services/forecast.ts</Code> is called by the pop-up, by
          JARVIS's <Code>forecast_metric</Code> tool and by the recorder. The operator, the assistant and the
          dataset cannot quote three different slopes for the same sensor.
        </Callout>
      </SubSection>

      <SubSection title="Labels that carry their own verdict">
        <P>
          <Code>rulTrue_*</Code> is solved from a fault-free reference, and the only one available at runtime
          is the <em>lagged</em> baseline. <Code>FeatureEngine.actualAsBaseline()</Code> re-seeds that filter
          onto the live — possibly faulted — reading every time RPM drops below <Code>RUN_RPM</Code> (300),
          and it then climbs back out through a two-stage lag cascade over tens of ticks.
        </P>
        <P>
          Every label computed during that recovery is wrong in a <Hi color="var(--risk-warning)">systematically
          directional</Hi> way, which is what makes it poison rather than noise. On a falling-alarm metric such
          as lube pressure, both <Code>threshold − healthyValue</Code> and <Code>perSeverity</Code> are
          negative; as a depressed baseline recovers upward the quotient <em>grows</em>, so a regressor sees
          remaining life <em>increasing</em> while the fault develops. It is the most damaging shape an error
          can have — it teaches the exact opposite of the thing being learned.
        </P>
        <Callout kind="read" title="THE DESIGN DECISION">
          The fix is not to correct the label — during the recovery the honest fault-free value is simply not
          known. It is to make every row <em>declare</em> whether its own label is trustworthy, so training
          can filter instead of silently averaging poison. Hence a per-key <Code>rulQuality_*</Code> enum
          rather than a global "wait N ticks" rule: the lag alphas span ~10x across sensors, so a
          slow-settling jacket must not discard a perfectly good lube label recorded on the same tick.
        </Callout>
        <Bullets items={[
          <><Hi>Thresholded in minutes, not sensor units.</Hi> The same 0.2 bar of baseline error is
            negligible under a FAST fault and enormous under a SLOW one. Converting the gap through the
            label's own sensitivity, <Code>d(min)/d(healthy) = −1 / (perSeverity · growthPerSec · 60)</Code>,
            gives a tolerance that can be stated plainly: flag while the gap could distort this label by more
            than <Hi>{LABEL_ERROR_TOLERANCE_MIN} min</Hi>.</>,
          <><Hi>The raw quantity is recorded too.</Hi> <Code>rulLabelErrMin_*</Code> keeps the continuous
            value the flag is cut from, because that cut is an unmeasured judgement call and validating it
            requires the distribution it slices. Without the column the check is unrunnable from exported
            data — too tight silently discards good rows, too loose silently passes poison, and neither shows
            up in the enum alone.</>,
          <><Hi>SETTLING deliberately outranks ALREADY_BREACHED.</Hi> A depressed baseline sitting below its
            own limit makes "already in the band" fire and records a spurious leading zero. Checking the gap
            first catches the fabricated breaches while keeping the genuine ones — idle LO pressure really
            does sit under the rated-point running minimum.</>,
          <><Hi>Stateless by design.</Hi> The gap is measured directly against the un-lagged baseline, so
            there is no settling counter or module singleton to be corrupted by React StrictMode's
            double-invoke — which the recorder around it already has to guard against.</>,
        ]} />
      </SubSection>

      <SubSection title="Where the trust check is blind">
        <Callout kind="warn" title="A BIASED BASELINE CURVE CANCELS">
          <Code>rulQuality</Code> compares the <em>lagged</em> baseline against the <em>instant</em> one. Both
          are generated from the same curve, so an error in the <em>curve itself</em> is present in both and
          subtracts out — the row is reported <Code>OK</Code> while every label on it is wrong by the size of
          the bias. This is not hypothetical: a 10.8 °C error in the bearing baseline hid behind exactly this
          cancellation, producing a confident <Code>NO_CROSS</Code> on a bearing the gauge showed heading past
          its limit. The rule that follows: <Hi>when a label contradicts the live sensor, the curve in{' '}
          <Code>seed.ts</Code> is the suspect, not the flag.</Hi>
        </Callout>
        <P>
          The second boundary is the linear model itself. Both predictions assume severity grows at a constant
          rate and effects superpose linearly — true inside this twin by construction, and an approximation of
          a real engine, where wear accelerates. A fault that ramps non-linearly crosses <em>sooner</em> than
          either number says, so both should be read as optimistic bounds rather than schedules.
        </P>
      </SubSection>
    </Section>
  );
}
