// packages/ui/src/about/dossier-data.tsx
//
// Single computed source of truth for the System Dossier's 13 parameter entries. Feeds:
//   - SectionsDossier.tsx      (§3 — one ParameterDossier card per entry)
//   - SectionsInterconnect.tsx (§4 — node labels/anchors for the causality diagram)
//   - SectionsReference.tsx    (§10 — the all-parameters table)
// Rated values are LIVE-computed by calling the real physics functions at the 85% load / 1150 RPM
// rated point — the same functions and chained-argument pattern already used by
// packages/ui/src/help/sections/SectionsPhysics.tsx — so these numbers can never numerically drift
// from the code. Only `definition` / `howToRead` / `cascadeConsequence` are hand-authored narrative;
// everything else traces to an exported constant or function. .tsx (not .ts) because several fields
// carry inline JSX emphasis (<Hi>, <Code>), matching Help's authoring style.

import React from 'react';
import {
  exhaustTemp_MTU8000, cylExhaustTemp_MTU8000, lubeOilPressure_MTU8000, bearingTemp_MTU8000,
  chargeAirPressure_MTU8000, chargeAirTemp_MTU8000, lubeOilTemp_MTU8000, fuelRailPressure_MTU8000,
  sfoc_MTU8000, crankcasePressure_MTU8000, exhaustBackPressure_MTU8000, tcSpeed_MTU8000,
  coolantPressure_MTU8000, fuelTemp_MTU8000, FAULT_DEFINITIONS, FAULT_MAX_EFFECTS,
  DEGRADATION_MODES, predictEffect,
} from '@marine-pdm/simulator';
import { MTU8000, MTU8000_LIMITS, MTU8000_CYL_SPREAD, BSIDE_TEMP_BIAS } from '@marine-pdm/shared';
import { DataTable, Hi, Code } from './AboutPrimitives';
import type { ParameterDossierProps, CoupledParam } from './AboutPrimitives';

// ── Rated-point live samples (85% load, 1150 RPM) — identical chain to Help's SectionsPhysics.tsx ──
const L = 85, R = 1150;
const n = (x: number, d = 1) => x.toFixed(d);
const sLubeT    = lubeOilTemp_MTU8000(L, R, 36, 1.0);
const sLube     = lubeOilPressure_MTU8000(R, L, sLubeT, 0.15, 0);
const sExhaust  = exhaustTemp_MTU8000(L, R, 1.0, 1.0);
const sBearingMid  = bearingTemp_MTU8000(L, R, sLubeT, sLube, 0, 0);
const sBearingFree = bearingTemp_MTU8000(L, R, sLubeT, sLube, 10, 0);
const sCaP      = chargeAirPressure_MTU8000(R, L, 1.0);
const sCaT      = chargeAirTemp_MTU8000(L, R, 36);
const sFuelRail = fuelRailPressure_MTU8000(L, R, 0);
const sSfoc     = sfoc_MTU8000(L, R, {}, 1.0, 1.0, 0);
const sCrank    = crankcasePressure_MTU8000(L, 0);
const sBackP    = exhaustBackPressure_MTU8000(L, R, 1.0);
const sTc       = tcSpeed_MTU8000(R, L, 1.0);
const sCoolant  = Math.max(50, 30 + (L / 100) * 55); // no dedicated export — replicates Help's own inline formula
const sCoolantP = coolantPressure_MTU8000(R, 0);
const sFuelTemp = fuelTemp_MTU8000(L);

const cylVals = Array.from({ length: 20 }, (_, i) => cylExhaustTemp_MTU8000(sExhaust, i, {}, 1.0));
const sCylMax = Math.max(...cylVals), sCylMin = Math.min(...cylVals);
const sCylMaxDevIdx = cylVals.indexOf(sCylMax);
const CYL_NAMES = MTU8000.CYL_NAMES as readonly string[];

// ── Small local helpers ─────────────────────────────────────────────────────────────
function faultChip(id: string): React.ReactNode {
  const f = FAULT_DEFINITIONS.find(fd => fd.id === id);
  return (
    <span key={id} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-inset)',
      border: '1px solid rgba(249,115,22,0.3)', borderRadius: 5, padding: '3px 8px', fontSize: 11,
    }}>
      <Hi color="var(--risk-high)">{id}</Hi>
      <span style={{ color: 'var(--text-secondary)' }}>{f?.name.replace(/\s*\(.*\)/, '') ?? id}</span>
    </span>
  );
}
function band(rows: (React.ReactNode)[][]): React.ReactNode {
  return <DataTable columns={['Level', 'Threshold']} colWidths={['140px', undefined]} rows={rows} />;
}
function couple(name: string, direction: CoupledParam['direction'], note: string, anchorId?: string): CoupledParam {
  return { name, direction, note, anchorId: anchorId ? `dossier-${anchorId}` : undefined };
}

/**
 * The deviation a fault mode produces on one sensor at severity 1.0, read live from the degradation
 * matrix (`weight · rootMax`) via the same helper the magnitude assertions in
 * `simulator/tests/degradation-matrix.test.ts` pin against a real fault tick.
 *
 * WHY THIS IS A FUNCTION AND NOT A TYPED NUMBER: five entries below used to quote the bare `weight`
 * — F05 coolant "+15 °C", F05 SFOC "+18", F06 SFOC "+25", F06 back-pressure "+40" — which silently
 * drops `rootMax`. That is 1.0 for four of the six root factors, so the shortcut looked right
 * everywhere it was checked; but it is 0.25 for `coolingEff` and 0.40 for `tcEff`, making exactly the
 * F05 and F06 claims 4x and 2.5x too large. It is the same omission that made `predictEffect()`
 * itself wrong until `defadec`. Computing it keeps this file's header promise ("can never numerically
 * drift from the code") true for fault magnitudes, not just rated points.
 *
 * Throws rather than returning 0: a missing effect means a sensorId was renamed, and a dossier that
 * quietly claims "+0 °C at full severity" is worse than one that fails loudly on first render.
 */
function atFullSeverity(modeId: string, sensorId: string): number {
  const mode = DEGRADATION_MODES.find(m => m.id === modeId);
  const effect = mode?.effects.find(e => e.sensorId === sensorId && e.modeled);
  if (!mode || !effect) throw new Error(`dossier-data: no modeled effect for ${modeId} → ${sensorId}`);
  return predictEffect(mode, effect, 1);
}
const f05Coolant = atFullSeverity('F05', 'coolantTempAfterEngine');
const f05Sfoc    = atFullSeverity('F05', 'sfoc');
const f06Sfoc    = atFullSeverity('F06', 'sfoc');
const f06BackP   = atFullSeverity('F06', 'exhaustBackPressure');

// ── The 13 dossier entries ──────────────────────────────────────────────────────────
export interface DossierEntryData extends ParameterDossierProps {
  sensorIds: string[]; // maps to DegradationEffect.sensorId in degradation-matrix.ts, for §4 edges
}

export const DOSSIER_ENTRIES: DossierEntryData[] = [
  // 1 — EXHAUST TEMPERATURE (the exemplar) ...........................................
  {
    id: 'dossier-exhaust', sensorIds: ['exhaustMeanTemp'],
    name: 'Mean Exhaust Temperature', tag: 'B4.30', unit: '°C', exemplary: true,
    definition: <>The average exhaust gas temperature across all 20 cylinders, measured at the exhaust
      manifold outlet. It is the single best proxy for overall combustion health and thermal loading —
      every individual cylinder reading (B4.1–B4.20) is reported as a deviation from this mean.</>,
    howToRead: <>On the dashboard <Code>ArcGauge</Code>, the needle sweeps a 240° arc: green covers the
      normal envelope up to {MTU8000_LIMITS.exhaust.mean_hi}°C, amber is the HI pre-alarm band
      ({MTU8000_LIMITS.exhaust.mean_hi}–{MTU8000_LIMITS.exhaust.critical_max}°C), red is the SS
      emergency-stop band (&gt;{MTU8000_LIMITS.exhaust.critical_max}°C). The mini-sparkline beneath shows the
      last 60 seconds — a steady climb over minutes is degradation; a spike that snaps back within 1–2 ticks
      is sensor noise, not a real fault.</>,
    rated: <>≈{n(sExhaust)}°C at 85% load / 1150 RPM</>,
    risesWhen: [
      <>Load increases — the dominant driver (160°C span from idle to full load)</>,
      <>RPM increases (smaller effect, 28°C span)</>,
      <>An HT cooler fouls — <Code>coolingEff</Code> drops toward 0.75 (F05) — raises <Hi color="var(--risk-warning)">all 20 cylinders together</Hi></>,
      <>A turbocharger fouls — <Code>tcEff</Code> drops (F06) — raises exhaust via reduced charge-air density</>,
      <>A single injector degrades (F01/F07) — raises <Hi color="var(--risk-warning)">only that one cylinder</Hi>, visible as imbalance before the mean moves much</>,
    ],
    fallsWhen: [
      <>Load or RPM is reduced</>,
      <>Cooling and TC systems recover to healthy (<Code>coolingEff</Code>/<Code>tcEff</Code> → 1.0)</>,
      <>Note: exhaust essentially never "falls" as a fault signature in this model — a falling exhaust
        alongside rising other symptoms is itself informative (e.g. a sensor DROPOUT/FREEZE, or a genuinely
        reduced firing cylinder) — cross-check the Cylinder View before concluding anything from a fall alone.</>,
    ],
    cascadeConsequence: <>A sustained <em>whole-engine</em> rise (all 20 cylinders moving together, not just
      one) is the strongest single-gauge indicator of a cooling-system or turbocharger problem, because it is
      the fastest-responding sensor in the thermal group (lag α≈0.08, ~12.5s time constant). Left unchecked it
      cascades: lube-oil temperature rises in parallel (both are downstream of the same <Code>coolingEff</Code>{' '}
      root factor) → gallery pressure falls slightly (hot oil is less viscous) → bearing temperatures climb
      (driven independently by <em>both</em> the hot oil and the pressure drop — a double consequence) → SFOC
      creeps up (the same efficiency-loss term appears in both equations) → eventually crosses the{' '}
      <Hi color="var(--risk-warning)">HI T-Exhaust Mean</Hi> safety-override floor
      ({MTU8000_LIMITS.exhaust.mean_hi}°C, forces risk ≥80 regardless of the AI score) and, in the extreme,
      the {MTU8000_LIMITS.exhaust.critical_max}°C SS emergency-stop. Because it is the fastest thermal sensor,
      exhaust is often the <em>first</em> alarm to fire even when the true root cause (a fouled cooler, which
      shows on <em>coolant</em> temperature too) is slower-moving — firing first does not mean it is the
      broken component.</>,
    coupledParams: [
      couple('Lube Oil Temp', 'raises', 'same coolingEff root', 'lube'),
      couple('Bearing Temp', 'raises', 'via hot oil AND via pressure drop — two paths', 'bearings'),
      couple('SFOC', 'raises', 'combustion/cooling efficiency loss', 'sfoc'),
      couple('Cylinder Imbalance', 'raises', 'only if the cause is single-cylinder (F01), not whole-engine (F05)', 'cylinders'),
      couple('Charge-Air Pressure', 'lowers', 'if the cause is TC fouling (F06)', 'chargeair'),
      couple('TC Speed', 'lowers', 'if the cause is TC fouling (F06)', 'turbo'),
      couple('Exhaust Back-Pressure', 'raises', 'if the cause is TC fouling (F06) — corroborating', 'backpressure'),
    ],
    alarmBand: band([
      ['HI mean (pre-alarm)', <Hi color="var(--risk-warning)">{MTU8000_LIMITS.exhaust.mean_hi}°C</Hi>],
      ['SS (emergency stop)', <Hi color="var(--risk-critical)">{MTU8000_LIMITS.exhaust.critical_max}°C</Hi>],
      ['Cylinder normal max', `${MTU8000_LIMITS.exhaust.normal_max}°C`],
      ['Imbalance warn / alarm', `${MTU8000_LIMITS.exhaust.spread_warn}°C / ${MTU8000_LIMITS.exhaust.spread_alarm}°C`],
    ]),
    relatedFaults: ['F01', 'F02', 'F05', 'F06', 'F07', 'F09'].map(faultChip),
  },

  // 2 — CYLINDER EXHAUST TEMP & IMBALANCE .............................................
  {
    id: 'dossier-cylinders', sensorIds: ['cylTemps[n]', 'cylTemps[all]', 'cylImbalance', 'aSideMeanExhaust', 'bSideMeanExhaust'],
    name: 'Cylinder Exhaust Temp & Imbalance', tag: 'B4.1–B4.20', unit: '°C',
    definition: <>The individual exhaust temperature of each of the 20 cylinders (A1–A10, B1–B10), reported
      as a fixed offset from the mean. <Code>Cylinder Imbalance</Code> is the spread between the hottest and
      coldest cylinder at any instant.</>,
    howToRead: <>The Cylinder View shows two rows of 10 mini-bars (Bank A / Bank B); click to expand into a
      full bar chart with per-cylinder deviation. A <Hi color="var(--risk-warning)">HOTTEST</Hi> badge marks
      the current peak. This is the single most important reading skill in the whole system:{' '}
      <Hi color="var(--risk-warning)">ONE bar climbing away from the pack = an injector fault (F01/F07)</Hi>;{' '}
      <Hi color="var(--risk-warning)">ALL bars rising together = a cooling problem (F05)</Hi>. B-side sits a
      structural {BSIDE_TEMP_BIAS}°C warmer by design (48° V-angle heat accumulation) — that is normal, not a fault.</>,
    rated: <>range ≈{n(sCylMin,0)}–{n(sCylMax,0)}°C (natural spread ≈{n(sCylMax-sCylMin,0)}°C; hottest is{' '}
      {CYL_NAMES[sCylMaxDevIdx]}, +{n(sCylMax-sExhaust,0)}°C from mean)</>,
    risesWhen: [
      <>(single cylinder) An injector degrades — F01 (one cyl, up to +65°C), F02/F09 (whole A- or B-bank), F07 (F01 plus ±30°C oscillation)</>,
      <>(all cylinders together) An HT cooler fouls (F05) — imbalance stays roughly constant while the whole pack shifts up</>,
    ],
    fallsWhen: [
      <>Imbalance falls toward its natural ≈{n(sCylMax-sCylMin,0)}°C baseline as an injected fault is cleared</>,
    ],
    cascadeConsequence: <>Imbalance is the system's <em>discriminator</em> signal: physics gives every healthy
      cylinder a fixed, permanent offset from the mean (<Code>MTU8000_CYL_SPREAD</Code>, max natural spread
      ≈{n(sCylMax-sCylMin,0)}°C), so the decision layer's persistence gate only starts counting once a
      cylinder deviates more than 22°C from its <em>expected</em> value — well outside natural spread. A
      rising imbalance with the mean barely moving means a fault is developing that hasn't yet dragged the
      whole-engine average with it; catching it here, before it shows on the mean exhaust gauge, is the
      earliest possible warning for a single-injector fault.</>,
    coupledParams: [
      couple('Mean Exhaust Temp', 'raises', 'only a small fraction — one of 20 cylinders', 'exhaust'),
      couple('SFOC', 'raises', 'a degrading injector loses combustion efficiency', 'sfoc'),
      couple('Fuel Rail Pressure', 'lowers', 'small drop per faulted injector', 'fuelrail'),
    ],
    alarmBand: band([
      ['Imbalance pre-alarm', `${MTU8000_LIMITS.exhaust.spread_warn}°C`],
      ['Imbalance alarm', `${MTU8000_LIMITS.exhaust.spread_alarm}°C`],
      ['Per-cylinder normal max', `${MTU8000_LIMITS.exhaust.normal_max}°C`],
    ]),
    relatedFaults: ['F01', 'F02', 'F07', 'F09'].map(faultChip),
  },

  // 3 — LUBE OIL PRESSURE ..............................................................
  {
    id: 'dossier-lube', sensorIds: ['lubeOilPressure', 'lubeLastBearingPressure', 'lubeOilPressureAfterFilter', 'pistonCoolingPress', 'filterDifferentialP', 'lubeOilTemp'],
    name: 'Lube Oil Pressure & Temperature', tag: 'B5.1 / B5.5 / B5.2 / B5.3-4 / B7', unit: 'bar / °C',
    definition: <>Five related readings from one circuit: the main gallery pressure (B5.1, before the
      filter), after-filter (B5.5), piston-cooling (B5.2), last-bearing (B5.3/B5.4 — the furthest point from
      the pump, and the one MTU's own safety system watches most closely), and the oil's own temperature
      (B7), which drives its viscosity and therefore its pressure.</>,
    howToRead: <>Gallery and last-bearing pressure now have <em>separate</em> dashboard gauges, and the
      distinction matters: the gallery is the healthier of the two by construction (the last bearing sits at
      ≈55% of it), so watching only the gallery understates how close the worst-lubricated point is to its
      limit. The last-bearing reading is the one that can trigger an immediate emergency stop. A rapid,
      sustained drop across all four readings together (not just noise) is the tell for a pump or filter
      problem.</>,
    rated: <>gallery ≈{n(sLube,2)} bar (at {n(sLubeT,0)}°C oil — hot-oil viscosity already pulls it down from
      the ~6.8 bar cold-oil figure)</>,
    risesWhen: [<>RPM increases (the pump is engine-driven — pump curve spans 3.5→7.5 bar idle→rated)</>],
    fallsWhen: [
      <>Load increases (small effect, 0.8 bar span)</>,
      <>Oil gets hot (viscosity loss) or very cold (high filter ΔP)</>,
      <>The lube system degrades — F03 (pump/filter fault, up to −3.8 bar on the gallery)</>,
    ],
    cascadeConsequence: <>Pressure loss reaches the bearings through <em>pressure starvation</em> — a
      distinct physical mechanism from the hot-oil path that also heats bearings (see the Bearing Temperature
      entry). This is the clearest example in the whole model of two independent causal paths converging on
      one sensor: F03 (lube loss) raises bearing temperature via falling pressure, F05 (cooler fouling) raises
      it via rising oil temperature — a combined fault shows the <em>sum</em> of both contributions. Below{' '}
      {MTU8000_LIMITS.lubeOil.pressure_last_bearing_min} bar at the last bearing, the safety override forces
      system risk to 100 immediately, bypassing the AI score entirely — this is the fastest path to a
      shutdown-severity alert anywhere in the system.</>,
    coupledParams: [
      couple('Bearing Temp', 'raises', 'pressure-starvation path — independent of the oil-heat path', 'bearings'),
      couple('Piston Cooling Pressure', 'lowers', 'same lubeFault root, ~68% of gallery pressure (a sub-reading of this same entry)'),
      couple('LO Filter ΔP', 'raises', 'filter loading term shares the same root', 'lube'),
    ],
    alarmBand: band([
      ['Gallery pre-alarm (LO)', `${MTU8000_LIMITS.lubeOil.pressure_before_filter_min} bar`],
      ['After-filter pre-alarm', `${MTU8000_LIMITS.lubeOil.pressure_after_filter_min} bar`],
      ['Last-bearing SS (shutdown)', <Hi color="var(--risk-critical)">{MTU8000_LIMITS.lubeOil.pressure_last_bearing_min} bar</Hi>],
      ['Piston-cooling pre-alarm', `${MTU8000_LIMITS.lubeOil.piston_cooling_min} bar`],
    ]),
    relatedFaults: ['F03'].map(faultChip),
  },

  // 4 — BEARING TEMPERATURES ...........................................................
  {
    id: 'dossier-bearings', sensorIds: ['bearingTemps[all]', 'bearingTemps[i]'],
    name: 'Bearing Temperatures', tag: 'B57.1–B57.11', unit: '°C',
    definition: <>11 crankshaft main-bearing temperatures. Bearing 11 (index 10, the free end — furthest
      from the drive) runs structurally hotter due to its position in the lubrication circuit.</>,
    howToRead: <>Each bearing has its own reading; the free-end bearing runs a few degrees hotter than the
      rest at rated load — that offset is normal. Watch for <em>one</em> bearing pulling away from its
      siblings (a direct bearing fault) versus <em>all</em> bearings drifting up together (an oil-temperature
      or oil-pressure problem reaching every bearing at once).</>,
    rated: <>≈{n(sBearingMid,0)}°C (mid-engine bearings) to {n(sBearingFree,0)}°C (free-end bearing 11)</>,
    risesWhen: [
      <>Load or RPM increases (loadHeat + rpmHeat terms)</>,
      <>Lube oil runs hot — F05 cooler fouling reaches bearings via <Code>oilHeat = (lubeOilTemp−85)×0.4</Code></>,
      <>Lube pressure drops — F03 reaches bearings via <Code>pressureDef = max(0,6.5−P)×4.5</Code></>,
      <>A direct bearing fault — F04 adds up to +45°C to one specific bearing (<Code>bearingFault×45</Code>)</>,
    ],
    fallsWhen: [<>Oil temperature/pressure return to healthy, or a direct bearing fault clears</>],
    cascadeConsequence: <>Bearings sit at the convergence point of <Hi color="var(--risk-warning)">three
      independent causal paths</Hi> — the longest coupled-parameter list of any entry in this dossier: hot oil
      (F05, via <Code>oilHeat</Code>), low pressure (F03, via <Code>pressureDef</Code>), and a direct fault
      (F04, via <Code>bearingFault</Code>). Because all three routes converge on the same reading, a rising
      bearing temperature alone is genuinely ambiguous — the evidence chain must be read alongside lube
      pressure and lube/coolant temperature to identify which of the three is actually happening. Past{' '}
      {MTU8000_LIMITS.lubeOil.bearing_temp_max}°C the safety override forces risk to 100 immediately: this
      threshold was deliberately raised from an earlier 120°C after real operational data showed hot oil at
      rated load naturally drives bearings to ~{n(sBearingFree,0)}°C, which was tripping the old limit falsely.</>,
    coupledParams: [
      couple('Lube Oil Temp', 'raises', 'F05 path — oil-heat term', 'lube'),
      couple('Lube Oil Pressure', 'lowers', 'F03 path — pressure-starvation term (inverse coupling)', 'lube'),
      couple('Coolant Temp', 'raises', 'upstream of the oil-heat path', 'coolant'),
    ],
    alarmBand: band([
      ['HI pre-alarm', `${MTU8000_LIMITS.lubeOil.bearing_temp_hi}°C`],
      ['SS (emergency stop)', <Hi color="var(--risk-critical)">{MTU8000_LIMITS.lubeOil.bearing_temp_max}°C</Hi>],
    ]),
    relatedFaults: ['F03', 'F04', 'F05'].map(faultChip),
  },

  // 5 — COOLANT / JACKET TEMPERATURE ...................................................
  {
    id: 'dossier-coolant', sensorIds: ['coolantTempAfterEngine'],
    name: 'Coolant / Jacket Temperature', tag: 'B6.1', unit: '°C',
    definition: <>The HT (high-temperature) jacket-water temperature after it leaves the engine block — the
      circuit that carries away combustion heat from the cylinders, distinct from the LT (low-temperature)
      seawater circuit that cools the charge air.</>,
    howToRead: <>A steady value close to rated is normal; a climb here — especially paired with a whole-engine
      (not single-cylinder) exhaust rise — is the <em>true</em> primary signal of HT cooler fouling, even
      though exhaust temperature often crosses its own alarm threshold first because it responds faster.</>,
    rated: <>≈{n(sCoolant,0)}°C at 85% load / 1150 RPM</>,
    risesWhen: [
      <>Load increases (dominant term, 55°C span)</>,
      <>The HT cooler fouls — F05, <Code>coolingEff</Code> drops toward 0.75, worth +{n(f05Coolant, 2)}°C at full severity</>,
    ],
    fallsWhen: [<>Load drops, or HT cooler efficiency recovers</>],
    cascadeConsequence: <>This is the mechanistically <em>true</em> root signal for HT-cooler fouling — every
      other F05 symptom (exhaust rise, lube-oil temp rise, bearing warming, SFOC creep) is downstream of this
      same <Code>coolingEff</Code> root factor. But because coolant has a very slow lag
      (α≈0.02, ~50s time constant — the slowest-responding sensor in the model) while exhaust responds in
      ~12.5s, exhaust usually <em>alarms</em> first even though coolant is the more direct evidence of the
      actual failing component. A good diagnostic habit: when exhaust alarms, check coolant's trend next — if
      it is also climbing (even slowly), that corroborates a cooling-system cause over an injector cause.</>,
    coupledParams: [
      couple('Mean Exhaust Temp', 'raises', 'same coolingEff root, faster-responding so often fires first', 'exhaust'),
      couple('Lube Oil Temp', 'raises', 'same coolingEff root', 'lube'),
      couple('Bearing Temp', 'raises', 'two hops downstream via lube oil temp', 'bearings'),
      couple('SFOC', 'raises', 'same coolingEff root', 'sfoc'),
      couple('Charge-Air Temp', 'both', 'deliberately NOT coupled — see Known Limitations', 'chargeair'),
    ],
    alarmBand: band([
      ['HI pre-alarm', `${MTU8000_LIMITS.cooling.coolant_temp_after_engine_max}°C`],
      ['SS (emergency stop)', <Hi color="var(--risk-critical)">{MTU8000_LIMITS.cooling.coolant_temp_ss}°C</Hi>],
      ['Coolant pressure min', `${MTU8000_LIMITS.cooling.coolant_pressure_min} bar (rated ≈${n(sCoolantP,2)} bar)`],
    ]),
    relatedFaults: ['F05'].map(faultChip),
  },

  // 6 — CHARGE-AIR TEMPERATURE & PRESSURE ..............................................
  {
    id: 'dossier-chargeair', sensorIds: ['chargeAirTemp', 'chargeAirPressure'],
    name: 'Charge-Air Temperature & Pressure', tag: 'B9 / B10', unit: '°C / bar',
    definition: <>Two readings from one subsystem, but with genuinely different root causes. Pressure (B10,
      "boost") comes from the turbochargers. Temperature (B9) comes from the LT intercooler, which is cooled
      by a separate seawater circuit — <em>not</em> the HT jacket-water circuit that cools the cylinders.</>,
    howToRead: <>Read the two together but do not assume they share a cause. Pressure falling is a
      turbocharger story; temperature rising alone (pressure normal) is almost never a turbocharger story.</>,
    rated: <>pressure ≈{n(sCaP,2)} bar · temperature ≈{n(sCaT,0)}°C</>,
    risesWhen: [
      <>(pressure) RPM/load increase — boost scales with both</>,
      <>(temperature) Load increases (18°C span) — LT seawater temperature is held effectively constant at 36°C</>,
    ],
    fallsWhen: [<>(pressure) A turbocharger fouls — F06, <Code>tcEff</Code> drop reduces boost directly</>],
    cascadeConsequence: <>This is the single most counter-intuitive fact in the whole model, and worth
      stating plainly: charge-air <em>temperature</em> is structurally independent of HT-cooler fouling (F05).
      A newcomer's first instinct on seeing "cooler fouled → everything gets hotter" is to expect charge-air
      temp to rise too — it does not, by design, because the intercooler sits on the LT/seawater circuit, held
      near a constant 36°C, not the HT jacket circuit F05 degrades. (See Known Limitations — this was an
      explicit, deliberate modeling decision, not an oversight.) Charge-air <em>pressure</em>, by contrast, is
      a first-class turbocharger-fouling signal: it falls in lockstep with TC speed and rising exhaust
      back-pressure whenever F06 is active — three sensors corroborating the same root cause.</>,
    coupledParams: [
      couple('TC Speed', 'both', 'pressure falls with TC speed under F06; temperature is unrelated', 'turbo'),
      couple('Exhaust Back-Pressure', 'both', 'pressure story only — rises together under F06', 'backpressure'),
      couple('Coolant Temp', 'both', 'deliberately NOT coupled for temperature — see Known Limitations', 'coolant'),
    ],
    alarmBand: band([
      ['Temp HI pre-alarm', `${MTU8000_LIMITS.chargeAir.temp_after_intercooler_hi}°C`],
      ['Temp max', <Hi color="var(--risk-critical)">{MTU8000_LIMITS.chargeAir.temp_after_intercooler_max}°C</Hi>],
      ['Pressure nominal (85%)', `${MTU8000_LIMITS.chargeAir.pressure_nominal_at_85pct} bar`],
    ]),
    relatedFaults: ['F06'].map(faultChip),
  },

  // 7 — TURBOCHARGER SPEED ..............................................................
  {
    id: 'dossier-turbo', sensorIds: ['tcSpeeds[i]'],
    name: 'Turbocharger Speed', tag: 'B44.1–B44.4', unit: 'RPM',
    definition: <>Speed of each of the 4 sequential turbochargers (A1, A2, B1, B2). MTU 8000 uses sequential
      turbocharging: only 2 TCs run at low load, cutting in a 3rd and 4th as speed/load rise.</>,
    howToRead: <>The Turbocharger panel shows 4 animated wheels with a cut-in/cut-out status dot per unit
      (green = active, grey = standby, red = alarm). Watch for one TC's speed falling while its charge-air
      side runs hotter or its exhaust back-pressure rises — that combination is the F06 fouling signature,
      distinct from a TC that is simply cut out because load is low.</>,
    rated: <>≈{n(sTc,0)} RPM per unit at 85% load / 1150 RPM (4 TCs active)</>,
    risesWhen: [<>RPM and load both increase (17,300 + 12,000 RPM span combined)</>],
    fallsWhen: [<>A turbocharger fouls — F06, <Code>tcEff</Code> drops toward 0.60, directly scaling this reading down</>],
    cascadeConsequence: <>Sequential cut-in/cut-out (2→3→4 TCs as speed thresholds are crossed, and back
      down on the way down) is normal operational behavior, not a fault — the key is to compare a TC against
      its <em>own</em> expected speed at the current load, not against a fixed number. A genuinely fouled TC
      shows a sustained deviation from its own baseline while its healthy siblings track normally, corroborated
      by falling charge-air pressure and rising exhaust back-pressure on the same side. Overspeed in the other
      direction (a TC spinning too <em>fast</em>) is a separate, purely mechanical alarm unrelated to fouling.</>,
    coupledParams: [
      couple('Charge-Air Pressure', 'lowers', 'same tcEff root — falls together', 'chargeair'),
      couple('Exhaust Back-Pressure', 'raises', 'restricted flow when TC fouls', 'backpressure'),
      couple('Mean Exhaust Temp', 'raises', 'reduced charge-air density raises combustion temp', 'exhaust'),
      couple('SFOC', 'raises', `TC fouling is a real efficiency loss, up to +${n(f06Sfoc, 0)} g/kWh at full severity`, 'sfoc'),
    ],
    alarmBand: band([
      ['Overspeed L1 (yellow)', `${MTU8000_LIMITS.turbocharger.speed_overspeed_l1.toLocaleString()} RPM`],
      ['Overspeed L2 (power limit)', <Hi color="var(--risk-critical)">{MTU8000_LIMITS.turbocharger.speed_overspeed_l2.toLocaleString()} RPM</Hi>],
      ['Cut-in (3rd/4th TC)', `${MTU8000_LIMITS.turbocharger.speed_cut_in.toLocaleString()} RPM`],
      ['Nominal at 85% load', `${MTU8000_LIMITS.turbocharger.speed_nominal_at_85pct.toLocaleString()} RPM`],
    ]),
    relatedFaults: ['F06'].map(faultChip),
  },

  // 8 — FUEL RAIL PRESSURE ..............................................................
  {
    id: 'dossier-fuelrail', sensorIds: ['fuelRailPressure'],
    name: 'Fuel Rail Pressure', tag: 'B48', unit: 'bar',
    definition: <>Common-rail pressure maintained by the high-pressure fuel pump, shared across all 20
      injectors.</>,
    howToRead: <>A stable, high reading is normal (1600–1800 bar across the load range). Small, gradual drops
      accompany injector faults — this is a <em>secondary</em> corroborating signal, not the first place to
      look for an injector problem.</>,
    rated: <>≈{n(sFuelRail,0)} bar at 85% load / 1150 RPM</>,
    risesWhen: [<>Load increases (200 bar span, 1600→1800 bar)</>],
    fallsWhen: [<>Each faulted injector subtracts 15 bar from rail pressure (F01/F02/F09) — small per-cylinder, cumulative across multiple</>],
    cascadeConsequence: <>Fuel rail pressure teaches an important reading lesson: not every gauge is equally
      diagnostic for every fault. A single injector fault (F01) only moves this reading by 15 bar out of a
      ~1770 bar baseline — under 1% — invisible against normal noise unless you already suspect an injector
      problem and are looking for corroboration alongside the much more sensitive per-cylinder exhaust
      reading. Its real diagnostic value is as a floor: below {MTU8000_LIMITS.fuel.rail_pressure_min} bar the
      safety override forces risk to 100 (fuel-rail shutdown) — a genuinely different failure mode (pump/rail
      fault) from injector wear.</>,
    coupledParams: [
      couple('Cylinder Exhaust Temp', 'both', 'the injector fault shows up far more clearly here than on rail pressure', 'cylinders'),
      couple('SFOC', 'raises', 'shares the injFaultPenalty term', 'sfoc'),
    ],
    alarmBand: band([
      ['Nominal', `${MTU8000_LIMITS.fuel.rail_pressure_nominal.toLocaleString()} bar`],
      ['SD (shutdown)', <Hi color="var(--risk-critical)">&lt;{MTU8000_LIMITS.fuel.rail_pressure_min.toLocaleString()} bar</Hi>],
    ]),
    relatedFaults: ['F01', 'F02', 'F09'].map(faultChip),
  },

  // 9 — FUEL TEMPERATURE ................................................................
  {
    id: 'dossier-fueltemp', sensorIds: ['fuelTemp'],
    name: 'Fuel Temperature', tag: 'B33', unit: '°C',
    definition: <>Fuel oil temperature at the injection system inlet.</>,
    howToRead: <>Tracks load in a narrow, predictable band. There is little else to watch for here in the
      current model — noted honestly below.</>,
    rated: <>≈{n(sFuelTemp,0)}°C at 85% load (range {n(fuelTemp_MTU8000(0),0)}–{n(fuelTemp_MTU8000(100),0)}°C across the full load range)</>,
    risesWhen: [<>Load increases (13°C span, the only driver in the model)</>],
    fallsWhen: [<>Load decreases</>],
    cascadeConsequence: <>In candor: this is comparatively low diagnostic value in the current model — no
      fault mode couples to fuel temperature, and its range is calibrated to stay comfortably below its own
      pre-alarm threshold at every normal load point. It is included for completeness (it is a real monitored
      tag on the actual engine) rather than because it currently carries strong predictive signal in this
      simulation.</>,
    coupledParams: [],
    alarmBand: band([
      ['HI pre-alarm', `${MTU8000_LIMITS.fuel.temp_max}°C`],
    ]),
    relatedFaults: [],
  },

  // 10 — SFOC ............................................................................
  {
    id: 'dossier-sfoc', sensorIds: ['sfoc'],
    name: 'SFOC — Specific Fuel Oil Consumption', tag: 'calculated', unit: 'g/kWh',
    definition: <>Fuel burned per unit of shaft power delivered — the engine's overall efficiency, calculated
      rather than directly sensed.</>,
    howToRead: <>Compare against its load-adjusted baseline, not a fixed number — SFOC naturally varies with
      load and RPM even when perfectly healthy. A slow upward creep relative to baseline, with no single
      obvious cause, is the tell to watch for.</>,
    rated: <>≈{n(sSfoc,0)} g/kWh at 85% load / 1150 RPM</>,
    risesWhen: [
      <>Load or RPM moves away from its efficient point</>,
      <>Cooling loss (F05, +{n(f05Sfoc, 1)} g/kWh at full severity)</>,
      <>TC fouling (F06, +{n(f06Sfoc, 0)} g/kWh — the single largest efficiency penalty in the model)</>,
      <>Piston blow-by (F08, +2 g/kWh)</>,
      <>Any injector fault (+4.5 g/kWh per faulted cylinder)</>,
    ],
    fallsWhen: [<>All efficiency-loss terms return to zero — the engine is running as cleanly as this model allows</>],
    cascadeConsequence: <>SFOC is deliberately built as a <em>summary statistic</em> — nearly every fault mode
      in the system adds its own efficiency-penalty term to the same formula, so a rising SFOC with no other
      single dominant symptom is itself a meaningful signal: something, somewhere, is degrading efficiency,
      even before any individual sensor has crossed its own alarm threshold. This makes it the earliest
      general-purpose "something is wrong" indicator in the dossier — pair it with the evidence chain to
      identify <em>which</em> efficiency loss is actually responsible.</>,
    coupledParams: [
      couple('Mean Exhaust Temp', 'both', 'both share the coolingEff/tcEff roots', 'exhaust'),
      couple('Turbocharger Speed', 'both', 'TC fouling is the single largest SFOC penalty', 'turbo'),
      couple('Fuel Rail Pressure', 'lowers', 'injector faults move both, in opposite directions', 'fuelrail'),
      couple('Crankcase Pressure', 'both', 'piston blow-by moves both together', 'crankcase'),
    ],
    alarmBand: band([
      ['Efficiency warning', '+15 g/kWh above load-adjusted baseline'],
    ]),
    relatedFaults: ['F01', 'F02', 'F05', 'F06', 'F08', 'F09'].map(faultChip),
  },

  // 11 — CRANKCASE PRESSURE .............................................................
  {
    id: 'dossier-crankcase', sensorIds: ['crankcasePressure'],
    name: 'Crankcase Pressure', tag: 'B50', unit: 'mbar',
    definition: <>Internal crankcase pressure, normally slightly negative due to the ventilation system
      drawing a light vacuum.</>,
    howToRead: <>Should sit near zero or slightly negative. Any sustained positive trend is notable — this is
      one of very few readings in the model that is normally negative, so "rising toward and past zero" is
      itself the alarm pattern, not just "rising."</>,
    rated: <>≈{n(sCrank,2)} mbar at 85% load / 1150 RPM (normally negative — ventilation)</>,
    risesWhen: [
      <>Load increases (small effect, 1.5 mbar span)</>,
      <>Piston blow-by — F08, up to +{n(FAULT_MAX_EFFECTS.F08_blowby_pressure, 0)} mbar at full severity
        (the dominant driver, and the only fault that can trip HI P-Crankcase)</>,
      <>Erratic injector spray — F07 carries a secondary blow-by term
        (+{n(FAULT_MAX_EFFECTS.F08_blowby_pressure * FAULT_MAX_EFFECTS.F07_blowby_coupling, 1)} mbar at full
        severity), which peaks around {n(sCrank + FAULT_MAX_EFFECTS.F08_blowby_pressure * FAULT_MAX_EFFECTS.F07_blowby_coupling, 1)} mbar
        — <Hi>deliberately below the {MTU8000_LIMITS.crankcase.pressure_hi} mbar HI limit</Hi>, so it is a
        diagnostic fingerprint, never an alarm</>,
    ],
    fallsWhen: [<>Blow-by severity reduces; ventilation restores the normal slight vacuum</>],
    cascadeConsequence: <>A sustained rise here — especially crossing from negative into positive — is the
      primary tell for piston ring or liner wear (F08), a mechanical failure mode largely independent of the
      thermal/lubrication story that dominates most of the rest of this dossier. It is one of the few readings
      where F07 (an injector fault) leaves a fingerprint on a completely different subsystem (crankcase, via a
      secondary blow-by term) — a reminder that fault "categories" (injector/cooling/lube/TC/bearing/piston)
      are a simplification; some faults have effects that cross those boundaries.</>,
    coupledParams: [
      couple('SFOC', 'raises', 'blow-by loses compression/combustion gas — small efficiency penalty', 'sfoc'),
    ],
    alarmBand: band([
      ['HI pre-alarm', `${MTU8000_LIMITS.crankcase.pressure_hi} mbar`],
      ['Normal (ventilated)', `${MTU8000_LIMITS.crankcase.pressure_normal} mbar`],
    ]),
    relatedFaults: ['F07', 'F08'].map(faultChip),
  },

  // 12 — EXHAUST BACK-PRESSURE ..........................................................
  {
    id: 'dossier-backpressure', sensorIds: ['exhaustBackPressure'],
    name: 'Exhaust Back-Pressure', tag: 'B41.1', unit: 'mbar',
    definition: <>Pressure downstream of the turbochargers, in the exhaust path. Rises when flow is
      restricted.</>,
    howToRead: <>Not a standalone diagnostic gauge — its value is in reading it <em>together</em> with
      turbocharger speed. Two sensors moving in a corroborating pattern (back-pressure up, TC speed down) is
      stronger evidence of TC fouling than either sensor read in isolation.</>,
    rated: <>≈{n(sBackP,0)} mbar at 85% load / 1150 RPM</>,
    risesWhen: [
      <>Load and RPM increase (90 mbar combined span)</>,
      <>A turbocharger fouls — F06, restricted flow adds up to +{n(f06BackP, 0)} mbar at full severity</>,
    ],
    fallsWhen: [<>TC efficiency recovers, or load/RPM decrease</>],
    cascadeConsequence: <>This entry exists in the dossier purely as a corroborator, and is worth including
      for that reason: on its own, a rising back-pressure could plausibly be load-driven. Paired with a
      <em>falling</em> TC speed and a <em>falling</em> charge-air pressure on the same turbocharger, the three
      together become strong, mutually-reinforcing evidence of F06 fouling — exactly the kind of
      cross-correlation the evidence chain (§5 of the Decision Deep-Dive) is built to surface.</>,
    coupledParams: [
      couple('Turbocharger Speed', 'lowers', 'corroborating — falls as back-pressure rises under F06', 'turbo'),
      couple('Charge-Air Pressure', 'lowers', 'corroborating — falls together under F06', 'chargeair'),
    ],
    alarmBand: band([
      ['Alarm', '~150 mbar (operational guideline)'],
    ]),
    relatedFaults: ['F06'].map(faultChip),
  },

  // 13 — SHAFT POWER / LOAD / RPM .......................................................
  {
    id: 'dossier-power', sensorIds: ['load', 'rpm', 'shaftPower'],
    name: 'Shaft Power / Load / RPM', tag: 'B13.1/B13.2', unit: 'kW / % / RPM',
    definition: <>The independent variables that drive nearly everything else in this dossier: engine speed
      (governor-controlled, 400–1150 RPM) and load (propeller-derived once clutched, 0–100% of{' '}
      {MTU8000.MAX_POWER_KW.toLocaleString()} kW MCR).</>,
    howToRead: <>Load is <em>not</em> a free lever — with a fixed-pitch propeller, absorbed power scales with
      the cube of shaft speed: <Code>load% = 85 × (rpm/1150)³</Code>. Raising the speed lever raises RPM
      directly; load follows automatically. This single fact is the key to reading every other gauge in this
      dossier correctly: a rising exhaust temperature at rising load is <em>expected</em>, not a fault — you
      must always mentally subtract the load-driven component first. The deviation/baseline system that
      powers the entire AI risk pipeline does exactly this subtraction mechanically, every tick.</>,
    rated: <>85% load / 1150 RPM is the design operating point (normal-max in the load profile — 82% of
      operating time is spent here)</>,
    risesWhen: [<>The operator raises the speed lever while clutched</>],
    fallsWhen: [<>The operator lowers the speed lever, or declutches (load drops to 0 regardless of RPM)</>],
    cascadeConsequence: <>Every "rises when load increases" line throughout this dossier traces back to this
      one entry. Because load and RPM are the two most dominant terms in nearly every physics equation in the
      model, a step change here produces a brief, synchronized ripple across almost every gauge simultaneously
      — and critically, this ripple is <em>not</em> a fault. The baseline that every deviation is measured
      against is lagged with the same time-constant as the sensor itself, so a load change moves the sensor
      and its expected value together, and the deviation stays near zero throughout the transient. Only a
      genuine fault — a divergence from what load/RPM alone would predict — survives as a deviation worth
      alerting on.</>,
    coupledParams: [
      couple('Mean Exhaust Temp', 'raises', 'dominant driver, 160°C span', 'exhaust'),
      couple('Lube Oil Pressure', 'lowers', 'small effect, 0.8 bar span', 'lube'),
      couple('Turbocharger Speed', 'raises', 'RPM + load combined span ~29,300 RPM', 'turbo'),
      couple('SFOC', 'both', 'efficiency varies with distance from the design point', 'sfoc'),
    ],
    alarmBand: band([
      ['Rated RPM', `${MTU8000.RATED_RPM} RPM`],
      ['Max RPM', `${MTU8000.RPM.max} RPM`],
      ['MCR (100% load)', `${MTU8000.MAX_POWER_KW.toLocaleString()} kW`],
    ]),
    relatedFaults: [],
  },
];

export function getDossierEntry(id: string): DossierEntryData | undefined {
  return DOSSIER_ENTRIES.find(e => e.id === id);
}
