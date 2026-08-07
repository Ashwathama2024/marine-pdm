// Static engine knowledge base for the AI assistant.
//
// Assembled ONCE, at module load, from the same constants and physics functions the simulator runs
// on — FAULT_DEFINITIONS, DEGRADATION_MODES/ROOT_FACTORS, MTU8000/MTU8000_LIMITS, and the rated-point
// physics calls (identical L=85/R=1150 chain used by about/dossier-data.tsx). This means the
// assistant's "hard facts" (spec, rated values, alarm bands, fault metadata, the ∂sensor/∂rootFactor
// matrix) can never numerically drift from the code. Only the causality primer at the bottom is
// hand-authored narrative.

import {
  FAULT_DEFINITIONS, DEGRADATION_MODES, ROOT_FACTORS, predictEffect,
  exhaustTemp_MTU8000, lubeOilTemp_MTU8000, lubeOilPressure_MTU8000,
  chargeAirPressure_MTU8000, chargeAirTemp_MTU8000, fuelRailPressure_MTU8000,
  sfoc_MTU8000, tcSpeed_MTU8000, bearingTemp_MTU8000, sprayOilTemp_MTU8000,
} from '@marine-pdm/simulator';
import type { RootFactor } from '@marine-pdm/simulator';
import { MTU8000, MTU8000_LIMITS } from '@marine-pdm/shared';
import { FORECAST_LIMITS, SLOPE_TICKS } from './forecast';
import { LABEL_ERROR_TOLERANCE_MIN } from './rul-quality';

const L = 85, R = 1150;              // rated operating point
const f = (x: number, d = 1) => x.toFixed(d);

// ── Rated-point live samples (same chain as dossier-data.tsx) ────────────────────
const sLubeT   = lubeOilTemp_MTU8000(L, R, 36, 1.0);
const sLube    = lubeOilPressure_MTU8000(R, L, sLubeT, 0.15, 0);
const sExhaust = exhaustTemp_MTU8000(L, R, 1.0, 1.0);
// Bearing 1 (mid-engine) and bearing 11 (free end, +5 °C position bias). The HOTTEST is the one that
// matters: the SS T-Bearing override trips on ANY single bearing, and both the gauge and the RUL
// label track the max — so quoting only index 0 understated the rated figure by that bias.
const sBearing    = bearingTemp_MTU8000(L, R, sLubeT, sLube, 0, 0);
const sBearingHot = Math.max(...Array.from({ length: 11 }, (_, i) =>
  bearingTemp_MTU8000(L, R, sLubeT, sLube, i, 0)));
const sSprayOil = sprayOilTemp_MTU8000(L, R, sLubeT, 0, 0);
const sCaP     = chargeAirPressure_MTU8000(R, L, 1.0);
const sCaT     = chargeAirTemp_MTU8000(L, R, 36);
const sRail    = fuelRailPressure_MTU8000(L, R, 0);
const sSfoc    = sfoc_MTU8000(L, R, {}, 1.0, 1.0, 0);
const sTc      = tcSpeed_MTU8000(R, L, 1.0);
const sCoolant = Math.max(50, 30 + (L / 100) * 55);

function sensorCatalogue(): string {
  const rows: [string, string, string, string][] = [
    ['Mean exhaust temp', `${f(sExhaust)} °C`, `HI ${MTU8000_LIMITS.exhaust.mean_hi} · SS ${MTU8000_LIMITS.exhaust.critical_max}`, 'combustion / thermal load'],
    ['Lube oil pressure (gallery)', `${f(sLube, 2)} bar`, `LO alarm ${MTU8000_LIMITS.lubeOil.pressure_before_filter_min}`, 'pump + bearing supply'],
    ['Last-bearing LO pressure', `~${f(sLube * 0.55, 2)} bar`, `SS < ${MTU8000_LIMITS.lubeOil.pressure_last_bearing_min}`, 'furthest lubrication point'],
    ['Jacket cooling outlet', `${f(sCoolant)} °C`, `HI ${MTU8000_LIMITS.cooling.coolant_temp_after_engine_max} · SS ${MTU8000_LIMITS.cooling.coolant_temp_ss}`, 'HT circuit health'],
    ['Bearing temp (hottest of 11)', `${f(sBearingHot)} °C (mid-engine ${f(sBearing)})`, `HI ${MTU8000_LIMITS.lubeOil.bearing_temp_hi} · SS ${MTU8000_LIMITS.lubeOil.bearing_temp_max}`, 'friction / lube starvation'],
    ['Spray oil temp (10, one per crank throw)', `${f(sSprayOil)} °C`, `difference HI +${MTU8000_LIMITS.sprayOil.diff_warn} · SS +${MTU8000_LIMITS.sprayOil.diff_shutdown} above the mean`, 'earliest bearing-distress signal'],
    ['Charge air pressure', `${f(sCaP, 2)} bar`, `nominal ${MTU8000_LIMITS.chargeAir.pressure_nominal_at_85pct}`, 'boost / TC output'],
    ['Charge air temp (LT-cooled)', `${f(sCaT)} °C`, `HI ${MTU8000_LIMITS.chargeAir.temp_after_intercooler_hi}`, 'intercooler (LT circuit ~36 °C)'],
    ['TC speed', `${f(sTc / 1000, 1)}k RPM`, `nominal ${MTU8000_LIMITS.turbocharger.speed_nominal_at_85pct}`, 'turbocharger health'],
    ['Fuel rail pressure', `${f(sRail)} bar`, `SD < ${MTU8000_LIMITS.fuel.rail_pressure_min}`, 'common-rail injection'],
    ['SFOC', `${f(sSfoc)} g/kWh`, 'efficiency KPI', 'overall thermal efficiency'],
  ];
  return [
    '| Sensor | Rated value (85% / 1150 RPM) | Alarm band | Meaning |',
    '|---|---|---|---|',
    ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
  ].join('\n');
}

function faultCatalogue(): string {
  return FAULT_DEFINITIONS.map(fd =>
    `- **${fd.id} ${fd.name}** — ECS \`${fd.ecsAlarmCode}\`. Primary: ${fd.primarySignal}. ` +
    `Cross-correlations: ${fd.crossCorrelations.join('; ')}.` +
    (fd.ssTrigger ? ` Shutdown trigger: ${fd.ssTrigger}.` : '')
  ).join('\n');
}

// The sensor↔root-factor causal matrix: for each degradation mode, which sensors move and by how
// much. This is the "which sensor is connected to what, and why" backbone.
//
// Reports the FULL-SEVERITY EFFECT via predictEffect(), not the bare `weight`. The two are not the
// same number: weight is ∂sensor/∂rootFactor, and the excursion is `weight · rootMax`, where rootMax
// is 1.0 for four of the six root factors but 0.25 for coolingEff and 0.40 for tcEff. Printing the
// raw weight told the assistant F05 raises coolant by 15 °C when the physics produces 3.75, and F06
// raises back-pressure by 40 mbar when it produces 16 — 4x and 2.5x overstatements on exactly the two
// modes where rootMax ≠ 1. Both numbers are shown so the distinction is legible rather than implicit.
function causalMatrix(): string {
  return DEGRADATION_MODES.map(m => {
    const info = ROOT_FACTORS[m.rootFactor as RootFactor];
    const rootLabel = info?.label ?? m.rootFactor;
    const eff = m.effects
      .filter(e => e.modeled && e.weight !== 0)
      .map(e => {
        const full = predictEffect(m, e, 1);
        const sign = full >= 0 ? '+' : '';
        return `${e.sensorId} ${sign}${f(full, 2)}${e.unit} at full severity (∂=${e.weight})`
          + (e.kind === 'PRIMARY' ? ' (primary)' : '');
      })
      .join(', ');
    return `- **${m.id}** (root: ${rootLabel}, rootMax ${info?.rootMax ?? 1}) → ${eff}`;
  }).join('\n');
}

function safetyThresholds(): string {
  const lo = MTU8000_LIMITS.lubeOil, co = MTU8000_LIMITS.cooling, ex = MTU8000_LIMITS.exhaust,
        fu = MTU8000_LIMITS.fuel, so = MTU8000_LIMITS.sprayOil;
  return [
    `- Immediate shutdown (systemRisk → 100): last-bearing LO pressure < ${lo.pressure_last_bearing_min} bar; ` +
      `any bearing > ${lo.bearing_temp_max} °C; coolant > ${co.coolant_temp_ss} °C; ` +
      `spray-oil spread > +${so.diff_shutdown} °C.`,
    `- High-priority floors: mean exhaust > ${ex.mean_hi} °C; fuel rail < ${fu.rail_pressure_min} bar; ` +
      `bearing > ${lo.bearing_temp_hi} °C; spray-oil spread > +${so.diff_warn} °C.`,
    `- Note: hot lube oil at rated drives bearings to ~107 °C naturally (~112 °C for the hottest of the 11), ` +
      `so the HI band is ${lo.bearing_temp_hi} °C — not 100, which sat BELOW the healthy value and was the ` +
      `real source of the false alarms once blamed on the ${lo.bearing_temp_max} °C shutdown.`,
    `- Spray oil (B77.11–B77.20) is judged ONLY as a difference: how far the hottest of the ten channels ` +
      `sits above their mean. MTU codes no absolute band for it. All ten rising together is not a fault; ` +
      `one channel pulling away is, and it names the crank throw. It trips before HI T-Bearing on the same ` +
      `fault because oil in transit heats faster than the bearing casting.`,
  ].join('\n');
}

// What the system PREDICTS, and how much each prediction can be trusted.
//
// The assistant had no knowledge of this layer at all: it could read every sensor and forecast a
// trend, but could not say that the app also solves an exact time-to-alarm, that the two numbers are
// produced by different methods and routinely disagree, or that each label ships with a
// trustworthiness verdict. Asked "how long until this bearing trips", it had only the naive slope.
function predictionModel(): string {
  const rows = Object.entries(FORECAST_LIMITS)
    .filter(([k]) => k !== 'systemRisk')
    .map(([key, lim]) => {
      const band = lim.dir === 'high'
        ? `HI ${lim.hi}${lim.ss !== undefined ? ` · SS ${lim.ss}` : ''}`
        : `LO ${lim.lo}`;
      return `| \`${key}\` | ${lim.label} | ${lim.unit} | ${lim.dir} | ${band} |`;
    });
  return [
    'Two independent time-to-alarm numbers exist per metric, and they answer different questions:',
    '',
    '- **`minsToAlarm_*` — the OBSERVABLE.** A linear extrapolation of the recent slope of the live',
    `  series (last ${SLOPE_TICKS} ticks). Needs no knowledge of what is wrong. This is what the`,
    '  `forecast_metric` tool returns, and it is what an operator could work out from the trend.',
    '- **`rulTrue_*` — the ANALYTIC label.** Solved exactly, not extrapolated: given the injected fault,',
    '  the degradation model is linear, so the severity at which the sensor crosses its coded band is',
    '  `(threshold − healthyValue) / (weight · rootMax)`, and severity grows at a known rate. Ground',
    '  truth for training; it exists only in the simulator, where the fault is known.',
    '',
    'They can disagree sharply, and the disagreement is informative rather than a bug: the analytic',
    'label knows the fault will stop at its intensity cap, while the slope extrapolation does not and',
    'will happily project through it.',
    '',
    '| Forecast key | Metric | Unit | Direction | Coded band |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    `**Label trustworthiness (\`rulQuality_*\`).** \`rulTrue_*\` is solved from the LAGGED baseline, which`,
    'is a filtered estimate — and one that gets re-seeded onto the live (possibly faulted) reading',
    'whenever RPM drops below 300. Labels produced while that filter is recovering are wrong',
    '*directionally*, so every row carries a verdict:',
    '',
    '- `OK` — settled baseline, real crossing. Trustworthy.',
    '- `SETTLING` — baseline not converged; the label is poison, filter it out.',
    '- `ALREADY_BREACHED` — the fault-free value is already in the band. Legitimate at idle, where LO',
    '  pressure genuinely sits below the rated-point running minimum.',
    '- `NO_CROSS` — the fault cannot reach the band at its intensity cap.',
    '- `WRONG_DIRECTION` — the fault moves this sensor away from the band.',
    '- `NOT_DRIVEN` / `NO_FAULT` / `NO_BAND` — structurally no label to give.',
    '',
    `\`rulLabelErrMin_*\` records the continuous quantity that verdict is thresholded from: how many`,
    `minutes of label error the current baseline gap implies. The cut is`,
    `${LABEL_ERROR_TOLERANCE_MIN} min. On settled data it measures ~0; a value above the cut is what`,
    'turns a row `SETTLING`.',
    '',
    '**Known blind spot, worth stating plainly.** `rulQuality` compares the LAGGED baseline against the',
    'INSTANT one, so it detects an unconverged filter but is structurally blind to a *bias in the',
    'baseline curve itself* — that error is present in both sides and cancels. Such a bias shifts every',
    'label in one direction while every row still reports `OK`. If a `rulTrue_*` label contradicts the',
    'live sensor (for example `NO_CROSS` while the reading is already past the band), suspect the',
    'baseline curve, not the quality flag.',
  ].join('\n');
}

const CAUSALITY_PRIMER = `## How the engine behaves (causality primer)

- **Independent root factors** a fault sets directly on the engine: injector severity, HT cooling-eff
  drop, TC-eff drop, lube degradation, bearing severity, piston blow-by. Everything else is a
  *dependent* sensor that moves because the physics propagates one of these.
- **Load follows RPM** via the fixed-pitch propeller cube law once the clutch is engaged
  (${MTU8000.LOAD.cruise}% at rated ${MTU8000.RATED_RPM} RPM); it is never set independently. Declutched → 0% load.
- **Exhaust temp** = base + load + rpm terms; HT-cooler fouling and TC fouling both raise it.
- **SFOC (efficiency)** rises with lower load/RPM (part-load penalty), cooler fouling, TC fouling, and
  blow-by. At idle it is naturally high (~270+ g/kWh) because of the large RPM part-load penalty — that
  is normal, not a fault.
- **F05 HT-cooler fouling raises ALL 20 cylinders** (system-wide); **F01 raises exactly ONE** — that is
  the key discriminator between a systemic cooling issue and a single injector.
- **Charge air temp is LT-cooled (~36 °C seawater circuit)** so HT-cooler fouling does NOT raise it.
- **Bearings** heat from friction; F03 lube-pressure loss reaches them via pressure starvation, F05 via
  hotter oil — different paths, same symptom, which is why combined faults superpose.`;

export function buildEngineKnowledge(): string {
  return `# MTU 8000 Engine Reference (for the on-board AI assistant)

## Engine identity
${MTU8000.MODEL} — ${MTU8000.CYLINDERS} cylinders (V${MTU8000.V_ANGLE_DEG}°), bore ${MTU8000.BORE_MM} × stroke ${MTU8000.STROKE_MM} mm.
Rated ${MTU8000.RATED_RPM} RPM, ${MTU8000.MAX_POWER_KW} kW. Normal operating point: ${MTU8000.LOAD_PROFILE.nominalLoad}% load.
B-side cylinders run ~4 °C hotter (48° V-angle heat accumulation).

## Sensor catalogue (rated values + alarm bands)
${sensorCatalogue()}

## Fault catalogue (F01–F09)
${faultCatalogue()}

## Sensor ↔ root-factor causal matrix (excursion at severity 1.0)
Effect on a sensor = \`weight · severity · rootMax\`. Intensity appears exactly ONCE, as the cap on
\`severity(t) = min(growthRate · t, intensity/100)\` — it is never a second multiplier on the effect.
${causalMatrix()}

## Decision engine — safety thresholds
${safetyThresholds()}

## Prediction model — what the system forecasts, and how far to trust it
${predictionModel()}

${CAUSALITY_PRIMER}`;
}

// Built once — cheap, deterministic, no live state.
export const ENGINE_KNOWLEDGE = buildEngineKnowledge();
