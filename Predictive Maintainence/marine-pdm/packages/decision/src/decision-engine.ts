import type {
  EngineSnapshot, FeatureSnapshot, BaselineSnapshot,
  DecisionOutput, AlertStatus, EvidenceLayer, FaultAlert,
} from '@marine-pdm/shared';
import { CYLINDER_COUNT } from '@marine-pdm/shared';
import type { PatternLibrary, DependencyMap } from '@marine-pdm/knowledge';
import { computeRisk, PersistenceCounter, RiskSmoother, MTU8000_ALARM_BANDS } from './risk';
import { computeConfidence, computeDataQuality } from './confidence';
import { getCylinderOverrideRisk } from './override';
import { applyMTU8000SafetyOverride, getMTU8000HardLimitViolations } from './override-mtu8000';
import { buildPatternAlerts } from './patterns';

export class DecisionEngine {
  private persist  = new PersistenceCounter();
  private smoother = new RiskSmoother();
  private patternLibrary: PatternLibrary;
  private dependencyMap: DependencyMap;
  private ticksSinceLastSnap = 0;

  constructor(patternLibrary: PatternLibrary, dependencyMap: DependencyMap) {
    this.patternLibrary = patternLibrary;
    this.dependencyMap = dependencyMap;
  }

  analyze(
    snap: EngineSnapshot,
    features: FeatureSnapshot,
    baseline: BaselineSnapshot,
  ): DecisionOutput {
    this.ticksSinceLastSnap = 0;
    const load = snap.load;

    // ── PERSISTENCE COUNTERS ──────────────────────────────────────────────
    // Thresholds set at 60% of alarm band — only genuine exceedances start accruing ticks.
    // Physics: MTU 8000 has natural ±10-30% variation at load transients; these gates
    // prevent thermal noise and load-settling from accumulating false persist counts.
    const exhaustPersist = this.persist.tick('exhaust', Math.abs(features.exhaustDev) > 12);  // 60% of 20°C band
    const lubePersist    = this.persist.tick('lube',    Math.abs(features.lubeDev) > 0.35);   // 44% of 0.8 bar band
    const coolingPersist = this.persist.tick('cooling', snap.coolingEff < 0.88);               // 12% drop from rated

    // ── LAYER 1: PHYSICS — MTU 8000 calibrated alarm bands ───────────────
    const physicsFindings: string[] = [];

    // Exhaust: alarm at +20°C above baseline, fault rate 5°C/min
    const exhaustRaw = computeRisk(
      snap.exhaustTemp, baseline.expectedExhaust,
      features.exhaustRate, exhaustPersist, load,
      MTU8000_ALARM_BANDS.exhaustTemp.dev,
      MTU8000_ALARM_BANDS.exhaustTemp.rate,
    );
    if (Math.abs(features.exhaustDev) > 3) {
      physicsFindings.push(
        `Exhaust temp ${features.exhaustDev > 0 ? '+' : ''}${features.exhaustDev.toFixed(1)}°C vs expected ${baseline.expectedExhaust.toFixed(1)}°C`,
      );
    }

    // Lube oil: alarm at -0.8 bar from baseline, fault rate 0.04 bar/min
    const lubeRaw = computeRisk(
      snap.lubeOilPressure, baseline.expectedLube,
      features.lubeRate, lubePersist, load,
      MTU8000_ALARM_BANDS.lubeOilPressure.dev,
      MTU8000_ALARM_BANDS.lubeOilPressure.rate,
    );
    if (Math.abs(features.lubeDev) > 0.1) {
      physicsFindings.push(
        `Lube pressure ${features.lubeDev > 0 ? '+' : ''}${features.lubeDev.toFixed(2)} bar vs expected ${baseline.expectedLube.toFixed(2)} bar`,
      );
    }

    // Jacket cooling: alarm at +8°C above baseline
    const coolingRaw = computeRisk(
      snap.jacketOutlet, baseline.expectedJacket,
      0, coolingPersist, load,
      MTU8000_ALARM_BANDS.jacketOutlet.dev,
      MTU8000_ALARM_BANDS.jacketOutlet.rate,
    );
    if (snap.coolingEff < 0.98) {
      physicsFindings.push(
        `Cooling efficiency ${(snap.coolingEff * 100).toFixed(1)}% — all temps elevated`,
      );
    }

    // Charge air pressure (scavengeAir): alarm at -0.5 bar
    const scavDev = snap.scavengeAir - baseline.expectedScavenge;
    if (Math.abs(scavDev) > 0.15) {
      physicsFindings.push(
        `Charge air pressure ${scavDev > 0 ? '+' : ''}${scavDev.toFixed(2)} bar vs expected ${baseline.expectedScavenge.toFixed(2)} bar`,
      );
    }

    // LO Filter ΔP: rising ΔP = filter fouling
    const filterDev = snap.loFilterDP - baseline.expectedLoFilterDP;
    if (filterDev > 0.05) {
      physicsFindings.push(
        `LO filter ΔP +${filterDev.toFixed(3)} bar above baseline — filter loading increasing`,
      );
    }

    // SFOC: efficiency loss detection
    const sfocDev = snap.sfoc - baseline.expectedSfoc;
    if (sfocDev > 5) {
      physicsFindings.push(
        `SFOC +${sfocDev.toFixed(1)} g/kWh above baseline — combustion efficiency loss`,
      );
    }

    // Per-cylinder risks — calibrated to ±25°C alarm band
    // Rate = 0: individual cylinder deviation rates are not tracked in features;
    // using the exhaust-wide rate was causing ALL cylinders to score high during
    // load transients. Risk here is driven by deviation + persistence only.
    const cylRisks: number[] = [];
    for (let i = 0; i < CYLINDER_COUNT; i++) {
      const dev = features.cylDevs[i] ?? 0;
      const cylPersist = this.persist.tick(`cyl${i}`, Math.abs(dev) > 22);
      const rawCylRisk = computeRisk(
        snap.cylTemps[i] ?? 0,
        baseline.expectedCyls[i] ?? snap.exhaustTemp,
        0,
        cylPersist,
        load,
        MTU8000_ALARM_BANDS.cylTemp.dev,
        MTU8000_ALARM_BANDS.cylTemp.rate,
      );
      cylRisks.push(this.smoother.smooth(`cyl${i}`, rawCylRisk));
    }

    if (physicsFindings.length === 0) {
      physicsFindings.push('All parameters within expected MTU 8000 physics envelope');
    }

    // ── LAYER 2: STATISTICS ───────────────────────────────────────────────
    const statsFindings: string[] = [];
    if (features.stdDev > 5) {
      statsFindings.push(`High exhaust variability: σ=${features.stdDev.toFixed(1)}°C (rolling 30 ticks)`);
    }
    if (Math.abs(features.exhaustRate) > 1) {
      statsFindings.push(
        `Exhaust trend: ${features.exhaustRate > 0 ? '+' : ''}${features.exhaustRate.toFixed(2)}°C/min`,
      );
    }
    if (features.cylImbalance > 15) {
      statsFindings.push(`Cylinder imbalance: ${features.cylImbalance.toFixed(1)}°C spread`);
    }
    // Lube rate trend — even slow decline is reported
    if (features.lubeRate < -0.02) {
      statsFindings.push(
        `Lube oil pressure declining: ${features.lubeRate.toFixed(3)} bar/min — monitor closely`,
      );
    }
    if (statsFindings.length === 0) {
      statsFindings.push('Statistical indicators within normal bounds');
    }

    // ── LAYER 3: RULES (pattern matching) ────────────────────────────────
    const dataQuality = computeDataQuality(1, 1.0);
    const sensorHealthScore = 1.0;

    const patternAlerts = buildPatternAlerts(
      snap, features, this.patternLibrary, this.dependencyMap, dataQuality, sensorHealthScore,
    );

    const rulesFindings: string[] = patternAlerts.length > 0
      ? patternAlerts.map(a => `${a.patternName ?? a.issue}: ${a.evidence[0]}`)
      : ['No fault patterns matched current conditions'];

    // ── MTU 8000 A/B-SIDE ANALYSIS ────────────────────────────────────────
    const aSideMean = (snap['aSideMeanExhaust'] as number | undefined) ?? snap.exhaustTemp;
    const bSideMean = (snap['bSideMeanExhaust'] as number | undefined) ?? snap.exhaustTemp;
    const aSideBSideDelta = Math.abs(aSideMean - bSideMean);
    if (aSideBSideDelta > 15) {
      physicsFindings.push(
        `A/B-side exhaust imbalance: ${aSideBSideDelta.toFixed(1)}°C (A=${aSideMean.toFixed(1)}°C, B=${bSideMean.toFixed(1)}°C)`,
      );
    }

    // ── AGGREGATE RISK ────────────────────────────────────────────────────
    // EWM smoothing (α=0.35) on each subsystem before aggregation.
    // Genuine sustained faults build up over ~4 ticks; single-tick spikes decay within 3 ticks.
    const exhaustSmooth = this.smoother.smooth('exhaust', exhaustRaw);
    const lubeSmooth    = this.smoother.smooth('lube',    lubeRaw);
    const coolingSmooth = this.smoother.smooth('cooling', coolingRaw);
    const systemRiskRaw = Math.max(exhaustSmooth, lubeSmooth, coolingSmooth, ...cylRisks);

    // Safety overrides bypass smoothing — hard ECS limits always take immediate effect.
    const exhaustOverride = applyMTU8000SafetyOverride(exhaustSmooth, snap);
    const lubeOverride    = applyMTU8000SafetyOverride(lubeSmooth, snap);
    const coolingOverride = applyMTU8000SafetyOverride(coolingSmooth, snap);
    const systemOverride  = applyMTU8000SafetyOverride(systemRiskRaw, snap);

    const exhaustRisk = exhaustOverride.risk;
    const lubeRisk    = lubeOverride.risk;
    const coolingRisk = coolingOverride.risk;
    const systemRisk  = systemOverride.risk;

    if (systemOverride.triggered) {
      physicsFindings.push(`[ECS OVERRIDE] ${systemOverride.triggered}`);
    }

    // Per-cylinder imbalance floor — only applied to hot cylinders
    const cylOverride = getCylinderOverrideRisk(features.cylImbalance);
    const finalCylRisks = cylRisks.map((r, i) => {
      const dev = features.cylDevs[i] ?? 0;
      return (cylOverride > 0 && dev > 15) ? Math.max(r, cylOverride) : r;
    });

    // ── HARD LIMIT ALERTS (MTU 8000 ECS codes) ────────────────────────────
    const hardLimitAlerts: FaultAlert[] = getMTU8000HardLimitViolations(snap).map(v => {
      const isLube    = v.includes('Oil') || v.includes('Bearing') || v.includes('LO');
      const isCoolant = v.includes('Coolant') || v.includes('T-Cool');
      const isExhaust = v.includes('Exhaust');
      const isFuel    = v.includes('Fuel');
      const component = isLube ? 'Lube Oil System' : isCoolant ? 'Cooling System' :
                        isExhaust ? 'Exhaust System' : isFuel ? 'Fuel System' : 'Engine System';
      const ecsCode = v.match(/\[(.+?)\]\s*([A-Z].+?)(?:\s—|\s\d)/)?.[2] ?? 'ECS Alarm';
      return {
        component,
        issue: 'ECS safety limit exceeded',
        riskScore: 100,
        confidence: 0.99,
        evidence: [v, 'MTU ECS 8000 Safety System override — AI score superseded'],
        recommendedAction: 'Reduce load immediately. Follow ECS alarm response procedure.',
        faultSource: 'EQUIPMENT' as const,
        ecsAlarmCode: ecsCode,
        maintenanceTask: isLube ? 'W1047 — Check oil system; W1073 — Centrifugal filter' :
                         isCoolant ? 'W1254 — Check cooling water system' :
                         isFuel ? 'W1006 — Check fuel injection system' : 'Contact MTU service',
      };
    });

    const allAlerts = [...hardLimitAlerts, ...patternAlerts];

    // ── STATUS ────────────────────────────────────────────────────────────
    const status: AlertStatus =
      systemRisk >= 75 ? 'CRITICAL' :
      systemRisk >= 50 ? 'HIGH' :
      systemRisk >= 25 ? 'WARNING' : 'NORMAL';

    // ── EVIDENCE CHAIN ────────────────────────────────────────────────────
    const evidenceChain: EvidenceLayer[] = [
      { layer: 'PHYSICS',     findings: physicsFindings },
      { layer: 'STATISTICS',  findings: statsFindings },
      { layer: 'RULES',       findings: rulesFindings },
    ];

    return {
      systemRisk,
      exhaustRisk,
      lubeRisk,
      coolingRisk,
      cylRisks: finalCylRisks,
      status,
      alerts: allAlerts,
      evidenceChain,
    };
  }
}
