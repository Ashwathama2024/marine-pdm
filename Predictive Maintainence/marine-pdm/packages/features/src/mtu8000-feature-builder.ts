// packages/features/src/mtu8000-feature-builder.ts
// Builds MTU8000Features (the richer deviation set packages/decision's matchMTU8000Patterns()
// needs for P01-P08) on top of the generic FeatureEngine's already-computed FeatureSnapshot /
// BaselineSnapshot for a tick — it does not replace FeatureEngine, it extends it.
//
// Reuse strategy: wherever an MTU8000-named field (e.g. coolantTempAfterEngine, chargeAirPressure,
// tcSpeeds) is the SAME physical sensor as an existing generically-named, already-lagged baseline
// (jacketOutlet, scavengeAir, tcRPM), this reuses that baseline directly rather than building a
// second lag state machine for the same quantity — see override-mtu8000.ts's own
// `getField(snap, 'coolantTempAfterEngine', snap.jacketOutlet)` fallback for precedent that these
// are treated as the same value elsewhere in the codebase.
//
// Only two quantities have no existing baseline at all (bearing temps, fuel rail pressure) — those
// get a new BaselineCurve (seed.ts: ME.BearingTemp.Mean, ME.FuelRailPressure) and a lightweight
// single-pole lag here. This is a deliberate, disclosed simplification: FeatureEngine's own
// baselines go through a fuller pre-op-gated state machine (see its class comment) that this does
// not replicate — acceptable because bearing/fuel-rail deviations are always combined with an
// already-properly-gated primary signal in every P0x rule that reads them (never the sole trigger).

import type { EngineSnapshot, FeatureSnapshot, BaselineSnapshot, MTU8000Features } from '@marine-pdm/shared';
import { applyLag, mean } from '@marine-pdm/shared';
import type { BaselineStore } from '@marine-pdm/knowledge';
import { RollingWindow } from './window';

const BEARING_COUNT = 11;
const TC_COUNT = 4;
const TICKS_PER_MINUTE = 60; // TICK_MS = 1000, so one tick's delta *60 approximates a per-minute rate

function numberField(snap: EngineSnapshot, key: string, fallback: number): number {
  const v = snap[key];
  return typeof v === 'number' ? v : fallback;
}
function arrayField(snap: EngineSnapshot, key: string, length: number, fill: number): number[] {
  const v = snap[key];
  return Array.isArray(v) && v.length === length ? (v as number[]) : new Array(length).fill(fill);
}

export class MTU8000FeatureBuilder {
  private store: BaselineStore;
  private cylWindows: RollingWindow[] = Array.from({ length: 20 }, () => new RollingWindow(30));
  private prevCylDevs: number[] = new Array(20).fill(0);
  private prevBearingDevs: number[] = new Array(BEARING_COUNT).fill(0);
  private prevCrankcasePressure = 0;
  private laggedBearingBaseline: number | null = null;
  private laggedFuelRailBaseline: number | null = null;

  constructor(store: BaselineStore) {
    this.store = store;
  }

  process(snap: EngineSnapshot, features: FeatureSnapshot, baseline: BaselineSnapshot): MTU8000Features {
    const load = snap.load, rpm = snap.rpm;

    // ── Cylinders — reuse the generic engine's already-lagged cylDevs/cylImbalance directly. ──
    const cylDevs = features.cylDevs;
    const cylDevRates = cylDevs.map((d, i) => (d - (this.prevCylDevs[i] ?? 0)) * TICKS_PER_MINUTE);
    this.prevCylDevs = [...cylDevs];

    cylDevs.forEach((d, i) => this.cylWindows[i]?.push(d));
    const cylStdDevs = this.cylWindows.map(w => w.getStdDev());

    const aSideMeanDev = mean(cylDevs.slice(0, 10));
    const bSideMeanDev = mean(cylDevs.slice(10, 20));
    const allCylMeanDev = mean(cylDevs);

    // ── Lube — last-bearing pressure derived from the already-lagged gallery baseline via the
    // same ~0.55 ratio the physics itself uses (lastBearing = (gallery - filterDp) * 0.55). ──
    const lubeLastBearingPressure = numberField(snap, 'lubeLastBearingPressure', snap.lubeOilPressure * 0.55);
    const expectedLastBearing = baseline.expectedLube * 0.55;
    const lubeLastBearingDev = lubeLastBearingPressure - expectedLastBearing;

    // ── Bearings — new baseline (ME.BearingTemp.Mean, seed.ts), lightweight lag (see file doc). ──
    const bearingTemps = arrayField(snap, 'bearingTemps', BEARING_COUNT, 0);
    const instantBearingBaseline = this.store.getExpected('ME.BearingTemp.Mean', { load, rpm }) ?? mean(bearingTemps);
    this.laggedBearingBaseline = applyLag(this.laggedBearingBaseline ?? instantBearingBaseline, instantBearingBaseline, 0.02);
    const bearingDevs = bearingTemps.map(t => t - this.laggedBearingBaseline!);
    const bearingRates = bearingDevs.map((d, i) => (d - (this.prevBearingDevs[i] ?? 0)) * TICKS_PER_MINUTE);
    this.prevBearingDevs = [...bearingDevs];

    // ── Cooling / charge-air — reuse existing lagged baselines (same physical sensors under the
    // generic field names FeatureEngine already tracks). ──
    const coolantTemp = numberField(snap, 'coolantTempAfterEngine', snap.jacketOutlet);
    const coolantTempDev = coolantTemp - baseline.expectedJacket;
    const chargeAirTempDev = snap.chargeAirTemp - baseline.expectedChargeAirTemp;
    const chargeAirPressure = numberField(snap, 'chargeAirPressure', snap.scavengeAir);
    const chargeAirPressDev = chargeAirPressure - baseline.expectedScavenge;

    // ── Turbocharger — all 4 TC speeds share the one expectedTcRPM baseline, the same
    // one-baseline-shared-by-many-instances simplification already used for cylinders. ──
    const tcSpeeds = arrayField(snap, 'tcSpeeds', TC_COUNT, baseline.expectedTcRPM);
    const tcSpeedDevs = tcSpeeds.map(s => s - baseline.expectedTcRPM);

    // ── Fuel rail — new baseline (ME.FuelRailPressure, seed.ts), lightweight lag. ──
    const fuelRailPressure = numberField(snap, 'fuelRailPressure', 1800);
    const instantFuelRailBaseline = this.store.getExpected('ME.FuelRailPressure', { load, rpm }) ?? fuelRailPressure;
    this.laggedFuelRailBaseline = applyLag(this.laggedFuelRailBaseline ?? instantFuelRailBaseline, instantFuelRailBaseline, 0.12);
    const fuelRailPressDev = fuelRailPressure - this.laggedFuelRailBaseline;

    // ── Crankcase — read as a raw absolute value (matchMTU8000Patterns thresholds it directly),
    // not a deviation: healthy crankcase pressure is a roughly load-independent small negative
    // number, so an absolute check is physically meaningful without a load-dependent baseline. ──
    const crankcasePressure = numberField(snap, 'crankcasePressure', -2);
    const crankcaseRate = (crankcasePressure - this.prevCrankcasePressure) * TICKS_PER_MINUTE;
    this.prevCrankcasePressure = crankcasePressure;

    // sensorHealth isn't declared on EngineSnapshot's index signature (which types every key as
    // number | number[]), but MTU8000Snapshot's real shape is Record<string,number> — read
    // defensively rather than assuming a shape the static type doesn't promise.
    const rawHealth: unknown = snap['sensorHealth'];
    const sensorHealthScores =
      rawHealth && typeof rawHealth === 'object' && !Array.isArray(rawHealth)
        ? (rawHealth as Record<string, number>)
        : {};

    return {
      cylDevs, cylDevRates, cylStdDevs, aSideMeanDev, bSideMeanDev, allCylMeanDev,
      cylImbalance: features.cylImbalance,
      lubeDev: features.lubeDev, lubeLastBearingDev, lubeRate: features.lubeRate,
      bearingDevs, bearingRates,
      coolantTempDev, chargeAirTempDev, chargeAirPressDev,
      tcSpeedDevs,
      sfocDev: features.sfocDev, fuelRailPressDev, crankcasePressure, crankcaseRate,
      sensorHealthScores,
    };
  }

  reset(): void {
    this.cylWindows.forEach(w => w.reset());
    this.prevCylDevs = new Array(20).fill(0);
    this.prevBearingDevs = new Array(BEARING_COUNT).fill(0);
    this.prevCrankcasePressure = 0;
    this.laggedBearingBaseline = null;
    this.laggedFuelRailBaseline = null;
  }
}
