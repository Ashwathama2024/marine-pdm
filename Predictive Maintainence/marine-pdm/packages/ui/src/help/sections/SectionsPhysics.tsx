// packages/ui/src/help/sections/SectionsPhysics.tsx
// Manual section: Engine & Physics. Every calibrated equation, with its RATED sample value computed
// live from the real physics function (so the manual can never drift from the code).

import React from 'react';
import {
  exhaustTemp_MTU8000, cylExhaustTemp_MTU8000, lubeOilPressure_MTU8000, bearingTemp_MTU8000,
  chargeAirPressure_MTU8000, chargeAirTemp_MTU8000, lubeOilTemp_MTU8000, fuelRailPressure_MTU8000,
  sfoc_MTU8000, crankcasePressure_MTU8000, exhaustBackPressure_MTU8000, tcSpeed_MTU8000,
} from '@marine-pdm/simulator';
import { MTU8000, MTU8000_CYL_SPREAD, BSIDE_TEMP_BIAS } from '@marine-pdm/shared';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, EquationBlock, Bullets,
} from '../HelpPrimitives';

// Rated operating point (85 % load, 1150 RPM) — sample values from the real functions.
const L = 85, R = 1150;
const n = (x: number, d = 1) => x.toFixed(d);
const sLubeT = lubeOilTemp_MTU8000(L, R, 36, 1.0);
const sLube = lubeOilPressure_MTU8000(R, L, sLubeT, 0.15, 0);
const sExhaust = exhaustTemp_MTU8000(L, R, 1.0, 1.0);
const sBearing = bearingTemp_MTU8000(L, R, sLubeT, sLube, 10, 0);
const sCaP = chargeAirPressure_MTU8000(R, L, 1.0);
const sCaT = chargeAirTemp_MTU8000(L, R, 36);
const sFuelRail = fuelRailPressure_MTU8000(L, R, 0);
const sSfoc = sfoc_MTU8000(L, R, {}, 1.0, 1.0, 0);
const sCrank = crankcasePressure_MTU8000(L, 0);
const sBackP = exhaustBackPressure_MTU8000(L, R, 1.0);
const sTc = tcSpeed_MTU8000(R, L, 1.0);
const sCoolant = Math.max(50, 30 + (L / 100) * 55);

export function PhysicsSection() {
  return (
    <Section id="physics" title="3 · Engine & Physics"
      subtitle="The calibrated equations behind every sensor. Rated values below are computed live from the actual model functions.">
      <P>
        Every reading is produced by a physics function calibrated to the MTU 8000 at its {L}% / {R} RPM
        rated point. Each equation takes the operating point plus a handful of <Hi>root factors</Hi> (fault
        inputs) and returns the sensor value. Understanding these formulas is understanding <em>exactly</em>
        why a gauge reads what it reads and how a fault moves it.
      </P>

      <SubSection title="Engine identity">
        <DataTable columns={['Property', 'Value']} colWidths={['200px', undefined]} rows={[
          ['Model', MTU8000.MODEL],
          ['Cylinders', `${MTU8000.CYLINDERS} (Bank A: A1–A10, Bank B: B1–B10), 48° V`],
          ['Bore × Stroke', `${MTU8000.BORE_MM} × ${MTU8000.STROKE_MM} mm`],
          ['Rated speed / power', `${MTU8000.RATED_RPM} RPM · ${MTU8000.MAX_POWER_KW} kW (M71L)`],
          ['Normal operating point', `${MTU8000.LOAD.cruise}% load, ${MTU8000.RATED_RPM} RPM`],
          ['B-side thermal bias', `+${BSIDE_TEMP_BIAS} °C (structurally warmer — V-angle heat)`],
        ]} />
      </SubSection>

      <SubSection title="Root factors — the only independent fault inputs">
        <P>
          Everything a fault does starts by moving one of six independent <em>root factors</em>. Every other
          sensor change is a <em>dependent</em> consequence propagated through the equations below. This is the
          backbone of the whole model — faults set roots, physics does the rest.
        </P>
        <DataTable columns={['Root factor', 'Range', 'Set by', 'Directly drives']} rows={[
          [<Code>injFault[cyl]</Code>, '0–1 per cyl', 'F01/F02/F07/F09', 'that cylinder’s exhaust temp'],
          [<Code>coolingEff</Code>, '1.0 → 0.75', 'F05', 'all thermal tags (exhaust, oil, coolant)'],
          [<Code>tcEff</Code>, '1.0 → 0.60', 'F06', 'TC speed, charge-air, back-pressure'],
          [<Code>lubeFault</Code>, '0–1', 'F03', 'gallery pressure → bearing temps'],
          [<Code>bearingFault[i]</Code>, '0–1 per brg', 'F04', 'that bearing’s temperature'],
          [<Code>pistonBlowby</Code>, '0–1', 'F08/F07', 'crankcase pressure, SFOC'],
        ]} />
      </SubSection>

      <SubSection title="Thermal & performance equations">
        <EquationBlock name="Mean exhaust temperature" tag="B4.30"
          formula="276 + load·160 + (rpm/1150)·28 + (1−coolingEff)·35 + (1−tcEff)·20"
          rated={`${n(sExhaust)} °C`}
          drivers="load (dominant), RPM, HT-cooling loss, TC fouling"
          expect="Rises with load; a whole-engine rise means cooling or TC, a single-cylinder rise means an injector."
          band="HI mean 460 °C · SS 530 °C" />
        <EquationBlock name="Per-cylinder exhaust temperature" tag="B4.1–B4.20"
          formula="meanExhaust + cylSpread[i] + (i≥10 ? +4 : 0) + injFault[i]·65"
          rated={`mean ± natural spread (max ~${Math.max(...MTU8000_CYL_SPREAD)}°C)`}
          drivers="mean exhaust + fixed natural spread + B-side bias + injector fault"
          expect="Healthy cylinders keep a fixed pattern; one climbing away from the pack = injector (F01)."
          band="imbalance HI 30 °C · alarm 50 °C" />
        <EquationBlock name="SFOC (specific fuel consumption)" tag="performance"
          formula="180 + (100−load)·0.333 + (1150−rpm)·0.08 + (1−coolingEff)·18 + (1−tcEff)·25 + blowby·2 + Σinj·4.5"
          rated={`${n(sSfoc)} g/kWh`}
          drivers="every efficiency loss shows here — cooling, TC, blow-by, injectors"
          expect="A slow creep upward is the earliest efficiency-degradation signal."
          band="+15 g/kWh above baseline = efficiency warning" />
        <EquationBlock name="Charge-air temperature" tag="B9"
          formula="LT_coolant(36) + 12 + load·18"
          rated={`${n(sCaT)} °C`}
          drivers="LT (sea-water) circuit + load heat — independent of HT-cooler fouling by design"
          expect="Tracks load only; unaffected by F05. Monitored as a deviation from its own baseline, so the absolute value is not compared directly to the HI limit."
          band="HI 50 °C (B9) — deviation-based in practice" />
        <EquationBlock name="Lube-oil temperature" tag="B7"
          formula="63 + load·32 + (rpm/1150)·8 + (1−coolingEff)·15"
          rated={`${n(sLubeT)} °C`}
          drivers="load + RPM + HT-cooling loss"
          expect="Climbs with a fouled HT cooler (F05); drags bearing temps up with it."
          band="HI 115 °C" />
        <EquationBlock name="Coolant temp after engine" tag="B6.1"
          formula="max(50, 30 + load·55 + (1−coolingEff)·15)"
          rated={`${n(sCoolant)} °C`}
          drivers="load + HT-cooling efficiency"
          expect="The primary F05 signal — a fouled cooler pushes this up first."
          band="HI 95 °C · SS 100 °C" />
      </SubSection>

      <SubSection title="Pressure & speed equations">
        <EquationBlock name="Lube-oil gallery pressure" tag="B5.1"
          formula="(3.5 + (rpm/1150)·4.0) − load·0.8 − viscosity − filterΔP − lubeFault·3.8"
          rated={`${n(sLube, 2)} bar`}
          drivers="pump speed (RPM), hot-oil viscosity, filter ΔP, lube fault"
          expect="A rapid drop is a pump/lube fault (F03); starves the bearings → they heat up."
          band="LO 5.5 bar (gallery) · last-bearing SS < 2.0 bar" />
        <EquationBlock name="Last-bearing LO pressure" tag="B5.3/B5.4"
          formula="gallery pressure × 0.55"
          rated={`${n(sLube * 0.55, 2)} bar`}
          drivers="whatever moves the gallery — pump speed, viscosity, filter ΔP, lube fault"
          expect="The furthest lubrication point, so it falls first and hardest under F03. Its own gauge — the LO Pressure gauge is the gallery, which stays healthier for longer."
          band="SS < 2.0 bar — Emergency Stop" />
        <EquationBlock name="Bearing temperature" tag="B57.1–B57.11"
          formula="58 + load·28 + (rpm/1150)·10 + (oilTemp−85)·0.4 + max(0,6.5−P)·4.5 + posBias + bearingFault·45"
          rated={`${n(sBearing)} °C (free-end)`}
          drivers="load, oil temp, pressure starvation, per-bearing fault"
          expect="Rises from hot oil (F05) OR low pressure (F03) OR a direct bearing fault (F04)."
          band="HI 115 °C · SS 130 °C" />
        <EquationBlock name="Charge-air pressure (boost)" tag="B10"
          formula="1.35 + ((rpm/1150)·1.46 + load·0.47)·tcEff"
          rated={`${n(sCaP, 2)} bar`}
          drivers="RPM + load boost, scaled by TC efficiency"
          expect="Falls when a turbocharger fouls (F06)."
          band="~3.2 bar nominal at rated" />
        <EquationBlock name="Turbocharger speed" tag="B44.x"
          formula="(500 + (rpm/1150)·17300 + load·12000) · tcEff"
          rated={`${n(sTc, 0)} RPM`}
          drivers="RPM + load, scaled by TC efficiency"
          expect="Drops sharply with TC fouling (F06); overspeed L1 alarm at 40 500 RPM."
          band="SD on abnormal drop · L1 40 500 RPM" />
        <EquationBlock name="Fuel-rail pressure" tag="B48"
          formula="1600 + load·200 − injFaultCount·15"
          rated={`${n(sFuelRail, 0)} bar`}
          drivers="load; small drop per faulted injector"
          expect="Micro-drops accompany injector faults."
          band="SD < 1200 bar" />
        <EquationBlock name="Crankcase pressure" tag="B50"
          formula="−2.0 + load·1.5 + pistonBlowby·8"
          rated={`${n(sCrank, 1)} mbar`}
          drivers="load + piston blow-by"
          expect="Rises with worn rings / blow-by (F08); normally slightly negative."
          band="HI +5 mbar" />
        <EquationBlock name="Exhaust back-pressure" tag="B41.1"
          formula="20 + load·70 + (rpm/1150)·20 + (1−tcEff)·40"
          rated={`${n(sBackP, 0)} mbar`}
          drivers="load, RPM, TC fouling (restricted flow)"
          expect="Rises when a TC fouls — a corroborating F06 signal alongside falling TC speed."
          band="alarm ~150 mbar" />
      </SubSection>

      <SubSection title="The thermal / hydraulic lag model">
        <P>
          Real sensors do not jump — a 20 MW engine has thermal and hydraulic inertia. Every value is passed
          through a first-order lag <Code>new = old + α·(target − old)</Code> each tick, with a per-sensor α
          calibrated to that sensor’s real response speed (exhaust ≈ 0.08, coolant ≈ 0.02 = very slow,
          bearings ≈ 0.02, charge-air ≈ 0.08).
        </P>
        <Callout kind="read" title="WHY IT MATTERS">
          The <em>expected</em> baseline is lagged with the <em>same</em> inertia, so during a load change the
          sensor and its baseline move together and the deviation stays near zero — no false alarm on a
          transient. A genuine fault makes the sensor diverge from its fault-free baseline, and <em>that</em>
          is what the deviation catches.
        </Callout>
      </SubSection>
    </Section>
  );
}
