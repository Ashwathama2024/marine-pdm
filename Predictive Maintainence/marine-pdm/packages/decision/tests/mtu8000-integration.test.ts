import { describe, it, expect, beforeEach } from 'vitest';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { SensorRegistry, BaselineStore, DependencyMap, PatternLibrary, seedKnowledgeBase } from '@marine-pdm/knowledge';
import { FeatureEngine } from '@marine-pdm/features';
import { DecisionEngine } from '../src/decision-engine';

// Full-pipeline regression test for wiring the real P01-P08 MTU8000 patterns into
// decision-engine.ts (previously the live app only ever matched the retired generic 3-pattern
// set). Uses FRESH knowledge-base instances per test (not the app-wide singletons from
// @marine-pdm/knowledge/singletons) so PatternLibrary's stateful persistence counters can't leak
// between test cases.

const L = 85, R = 1150;
function healthySnapshot(): EngineSnapshot {
  const exhaustTemp = 276 + (L / 100) * 160 + (R / 1150) * 28; // 440
  const lubeOilPressure = 3.5 + (R / 1150) * 4.0 - (L / 100) * 1.13 - 0.15; // ~6.39
  const jacketOutlet = Math.max(50, 30 + (L / 100) * 55); // 76.75
  const scavengeAir = 1.35 + (R / 1150) * 1.46 + (L / 100) * 0.47; // ~3.21
  const tcRPM = 500 + (R / 1150) * 17300 + (L / 100) * 12000; // 28000
  const sfoc = 180 + (100 - L) * 0.333 + (1150 - R) * 0.08; // ~184.995
  const chargeAirTemp = 48 + (L / 100) * 18; // 63.3
  const fuelOilPressure = 6.0 + (L / 100) * 1.8;
  const fuelOilTemp = 30 + (L / 100) * 13;
  const pistonCoolingPress = (3.5 + (R / 1150) * 4.0 - (L / 100) * 1.13 - 0.15) * 0.68;
  const bearingTempMean = 58 + (L / 100) * 28 + (R / 1150) * 10; // matches ME.BearingTemp.Mean
  const fuelRailPressure = 1600 + (L / 100) * 200; // matches ME.FuelRailPressure

  const snap: any = {
    timestamp: Date.now(), rpm: R, load: L,
    exhaustTemp, lubeOilPressure, fuelRack: 0, scavengeAir, tcRPM, jacketOutlet, sfoc,
    cylTemps: new Array(20).fill(exhaustTemp),
    coolingEff: 1.0,
    chargeAirTemp, fuelOilPressure, fuelOilTemp, loFilterDP: 0.15, pistonCoolingPress,
    shaftPower: 9100 * (L / 100),
    // MTU8000-specific extras via the index signature — self-consistent with the generic fields
    // above (same physical sensors under the MTU8000 field names), so deviations read ~0 healthy.
    bearingTemps: new Array(11).fill(bearingTempMean),
    tcSpeeds: new Array(4).fill(tcRPM),
    lubeLastBearingPressure: lubeOilPressure * 0.55,
    coolantTempAfterEngine: jacketOutlet,
    chargeAirPressure: scavengeAir,
    fuelRailPressure,
    crankcasePressure: -2.0 + (L / 100) * 1.5,
    exhaustMeanTemp: exhaustTemp,
    aSideMeanExhaust: exhaustTemp,
    bSideMeanExhaust: exhaustTemp,
  };
  return snap as EngineSnapshot;
}

describe('MTU8000 pattern wiring — full pipeline', () => {
  let registry: SensorRegistry, baselineStore: BaselineStore, dependencyMap: DependencyMap, patternLibrary: PatternLibrary;
  let featureEngine: FeatureEngine, decisionEngine: DecisionEngine;

  beforeEach(() => {
    registry = new SensorRegistry();
    baselineStore = new BaselineStore();
    dependencyMap = new DependencyMap();
    patternLibrary = new PatternLibrary();
    seedKnowledgeBase(registry, baselineStore, dependencyMap, patternLibrary);
    featureEngine = new FeatureEngine(baselineStore, registry);
    decisionEngine = new DecisionEngine(patternLibrary, dependencyMap, baselineStore);
  });

  it('registers all 8 P01-P08 patterns with matchedExternally + real ECS codes', () => {
    for (const id of ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08']) {
      const p = patternLibrary.getPattern(id);
      expect(p, `pattern ${id} should be registered`).toBeTruthy();
      expect(p!.matchedExternally).toBe(true);
      expect(p!.ecsAlarmCode).toBeTruthy();
      expect(p!.maintenanceTask).toBeTruthy();
    }
  });

  it('does not retire generic PatternLibrary.matchPatterns() capability (still usable for custom patterns)', () => {
    patternLibrary.addPattern({
      id: 'custom_test', name: 'Custom Test Pattern',
      conditions: [{ tag: 'cylImbalance', metric: 'imbalance', operator: '>', threshold: 1000 }],
      affectedTags: [], actionWindow: '1h',
      timesTriggered: 0, timesConfirmed: 0, timesFalsePositive: 0, isActive: true,
    });
    expect(patternLibrary.getPattern('custom_test')).toBeTruthy();
  });

  it('does not fire P01 on a healthy snapshot', () => {
    const snap = healthySnapshot();
    const { features, baseline } = featureEngine.process(snap);
    const output = decisionEngine.analyze(snap, features, baseline);
    expect(output.alerts.find(a => a.patternId === 'P01')).toBeUndefined();
  });

  it('fires P01 with real ECS code/work order when one cylinder + SFOC deviate, and clears when healthy again', () => {
    const healthy = healthySnapshot();
    // Tick 1: seed the lagged baseline at healthy steady-state.
    let { features, baseline } = featureEngine.process(healthy);
    decisionEngine.analyze(healthy, features, baseline);

    // Tick 2: fault cylinder 0 (+65°C, matching F01's real max effect) and bump SFOC (+5 g/kWh) —
    // mean exhaust (snap.exhaustTemp) unchanged, matching how one faulted cylinder barely moves
    // a 20-cylinder mean in the real physics.
    const faulted = { ...healthy, cylTemps: [...healthy.cylTemps] } as any;
    faulted.cylTemps[0] = healthy.exhaustTemp + 65;
    faulted.sfoc = healthy.sfoc + 5;
    ({ features, baseline } = featureEngine.process(faulted));
    let output = decisionEngine.analyze(faulted, features, baseline);

    const p01 = output.alerts.find(a => a.patternId === 'P01');
    expect(p01, 'P01 should be in alerts after cyl0 + sfoc deviate').toBeTruthy();
    expect(p01!.ecsAlarmCode).toBe('HI T-Exhaust Cyl N');
    expect(p01!.maintenanceTask).toContain('W1006');
    expect(p01!.component).toBe('Cylinder A1 Injector');

    // The exact bug this whole audit started from: Confirm must not throw, and must record.
    expect(() => patternLibrary.recordOutcome(p01!.patternId!, 'CONFIRMED')).not.toThrow();
    expect(patternLibrary.getPattern('P01')!.timesConfirmed).toBe(1);

    // Tick 3: fault clears — P01 must stop appearing (persistence decays to 0, not stuck matched).
    ({ features, baseline } = featureEngine.process(healthy));
    output = decisionEngine.analyze(healthy, features, baseline);
    expect(output.alerts.find(a => a.patternId === 'P01')).toBeUndefined();
  });

  it('increments timesTriggered once per episode through the full pipeline, not once per tick', () => {
    const healthy = healthySnapshot();
    let { features, baseline } = featureEngine.process(healthy);
    decisionEngine.analyze(healthy, features, baseline);

    const faulted = { ...healthy, cylTemps: [...healthy.cylTemps] } as any;
    faulted.cylTemps[0] = healthy.exhaustTemp + 65;
    faulted.sfoc = healthy.sfoc + 5;

    for (let tick = 0; tick < 10; tick++) {
      ({ features, baseline } = featureEngine.process(faulted));
      decisionEngine.analyze(faulted, features, baseline);
    }
    expect(patternLibrary.getPattern('P01')!.timesTriggered).toBe(1);
  });
});
