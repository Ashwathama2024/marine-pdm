// shared/interfaces.ts — THE contract. All packages import from here.

export const CYLINDER_COUNT = 20;
// Bank A = indices 0–9 (A1–A10), Bank B = indices 10–19 (B1–B10)
export const CYL_BANK_A = 10;  // cylinders per bank
export const CYL_BANK_B = 10;

// ── SENSOR SNAPSHOT (what the engine produces each tick) ──────────────────
export interface EngineSnapshot {
  timestamp: number;
  rpm: number;                  // RPM — engine crankshaft
  load: number;                 // 0–100 %
  exhaustTemp: number;          // °C — mean exhaust gas temp
  lubeOilPressure: number;      // bar — main LO pressure
  fuelRack: number;             // mm — fuel rack / index
  scavengeAir: number;          // bar — charge air pressure
  tcRPM: number;                // RPM — turbocharger speed
  jacketOutlet: number;         // °C — jacket cooling water outlet
  sfoc: number;                 // g/kWh — specific fuel oil consumption
  cylTemps: number[];           // length = CYLINDER_COUNT (20); 0-9=BankA, 10-19=BankB
  coolingEff: number;           // 0.75–1.0 internal efficiency factor
  // Extended sensors — real engine parameters
  chargeAirTemp: number;        // °C — charge air temperature after cooler
  fuelOilPressure: number;      // bar — fuel oil supply pressure
  fuelOilTemp: number;          // °C — fuel oil temperature
  loFilterDP: number;           // bar — LO filter differential pressure
  pistonCoolingPress: number;   // bar — piston cooling oil pressure
  shaftPower: number;           // kW — calculated shaft power
  [key: string]: number | number[];
}

// ── BASELINE (expected values at current operating point) ─────────────────
export interface BaselineSnapshot {
  expectedExhaust: number;
  expectedLube: number;
  expectedCyls: number[];
  expectedJacket: number;
  expectedFuelRack: number;
  expectedScavenge: number;
  expectedTcRPM: number;
  expectedSfoc: number;
  // Extended baselines for new sensors
  expectedChargeAirTemp: number;
  expectedFuelOilPressure: number;
  expectedFuelOilTemp: number;
  expectedLoFilterDP: number;
  expectedPistonCoolingPress: number;
  expectedShaftPower: number;
  [key: string]: number | number[];
}

// ── FEATURES (derived from snapshot vs baseline) ──────────────────────────
export interface FeatureSnapshot {
  exhaustDev: number;     // actual − expected °C
  lubeDev: number;        // actual − expected bar
  cylDevs: number[];      // per-cylinder deviation from expected
  cylImbalance: number;   // max − min cylinder temp
  exhaustRate: number;    // °C/min (linear regression)
  lubeRate: number;       // bar/min
  rollingAvg: number;     // 30-tick exhaust rolling mean
  stdDev: number;         // 30-tick exhaust std dev
  sfocDev: number;        // actual − expected SFOC (g/kWh)
  fuelRackDev: number;    // actual − expected fuel rack (mm)
  [key: string]: number | number[];
}

// ── DECISION OUTPUT ────────────────────────────────────────────────────────
export type AlertStatus = 'NORMAL' | 'WARNING' | 'HIGH' | 'CRITICAL';
export type FaultSource = 'EQUIPMENT' | 'SENSOR_SUSPECT' | 'ISOLATED';

export interface FaultAlert {
  component: string;
  issue: string;
  riskScore: number;          // 0–100
  confidence: number;         // 0.0–1.0 (defined formula only)
  evidence: string[];         // human-readable chain, minimum 2 items
  recommendedAction: string;
  faultSource: FaultSource;
  patternName?: string;
  ecsAlarmCode?: string;      // MTU ECS 8000 alarm code e.g. 'HI T-Exhaust Cyl A4'
  maintenanceTask?: string;   // MTU work order code e.g. 'W1006 — Replace fuel injector'
}

export interface EvidenceLayer {
  layer: 'PHYSICS' | 'STATISTICS' | 'RULES';
  findings: string[];
}

export interface DecisionOutput {
  systemRisk: number;
  exhaustRisk: number;
  lubeRisk: number;
  coolingRisk: number;
  cylRisks: number[];
  status: AlertStatus;
  alerts: FaultAlert[];
  evidenceChain: EvidenceLayer[];
}

// ── SENSOR REGISTRY ────────────────────────────────────────────────────────
export type SensorStatus = 'OBSERVATION' | 'ACTIVE' | 'DISABLED' | 'FAULT_SUSPECT';

export interface SensorDefinition {
  id: string;                    // e.g. 'ME.Cyl1.ExhaustTemp'
  displayName: string;
  unit: string;
  minPhysical: number;
  maxPhysical: number;
  alarmHigh?: number;
  alarmLow?: number;
  status: SensorStatus;
  observationStartDate?: string;
  observationDaysRequired: number; // default 30
  baselineSource?: string;         // 'sea_trial' | 'oem_manual' | 'observed'
  addedBy: string;
  addedDate: string;
}

// ── BASELINE CURVE ─────────────────────────────────────────────────────────
export interface BaselineCurve {
  sensorId: string;
  equation: string;              // human-readable: '250 + load*1.4 + rpm/700*10'
  coefficients: Record<string, number>;
  dependsOn: string[];           // ['load', 'rpm', 'coolingEff']
  validLoadMin: number;
  validLoadMax: number;
  source: string;                // 'MAN B&W Shop Test 2019' etc.
  r2Score?: number;
  addedDate: string;
  isActive: boolean;
}

// ── FAULT PATTERN ──────────────────────────────────────────────────────────
export interface PatternCondition {
  tag: string;
  metric: 'deviation' | 'rate' | 'imbalance' | 'persistence' | 'stdDev';
  operator: '>' | '<' | '>=' | '<=';
  threshold: number;
}

export interface FaultPattern {
  id: string;
  name: string;
  conditions: PatternCondition[];
  affectedTags: string[];
  actionWindow: string;
  timesTriggered: number;
  timesConfirmed: number;
  timesFalsePositive: number;
  isActive: boolean;
  ecsAlarmCode?: string;
  maintenanceTask?: string;
}

// ── MTU 8000 SNAPSHOT (v2.0 — replaces EngineSnapshot for MTU 8000 engine) ──
// EngineSnapshot is kept for backwards compatibility during migration.
export interface MTU8000Snapshot {
  timestamp: number;

  // Control inputs
  rpm: number;    // 600–1150
  load: number;   // 10–100 %

  // Exhaust (B4.1–B4.20, B4.30)
  cylExhaustTemps: number[];      // [20] — A1..A10, B1..B10
  exhaustMeanTemp: number;        // B4.30 °C
  exhaustBackPressure: number;    // B41.1 mbar

  // Lube oil
  lubeOilPressureBeforeFilter: number;   // B5.1 bar
  lubeOilPressureAfterFilter: number;    // B5.5 bar
  lubeOilPressurePistonCooling: number;  // B5.2 bar
  lubeLastBearingPressure: number;       // B5.3/B5.4 bar — SS trigger
  lubeOilTemp: number;                   // B7 °C
  bearingTemps: number[];                // [11] — B57.1–B57.11

  // Cooling
  coolantTempAfterEngine: number;  // B6.1 °C
  coolantPressure: number;         // B16.1 bar

  // Charge air
  chargeAirPressure: number;  // B10 bar
  chargeAirTemp: number;      // B9 °C
  tcSpeeds: number[];         // [4] — A1,A2,B1,B2 RPM

  // Fuel
  fuelRailPressure: number;  // B48 bar
  fuelTemp: number;          // B33 °C

  // Crankcase & misc
  crankcasePressure: number;  // B50 mbar
  rpmPrimary: number;         // B13.1 ECU
  rpmRedundant: number;       // B13.2 EMU

  // Derived / decision inputs
  sfoc: number;               // calculated g/kWh
  cylImbalance: number;       // max − min cylinder spread °C
  aSideMeanExhaust: number;   // mean A1–A10
  bSideMeanExhaust: number;   // mean B1–B10
  filterDifferentialP: number; // B5.1 − B5.5 bar

  // Sensor health
  sensorHealth: Record<string, number>;    // 0–100 per tag
  dataFreshness: Record<string, number>;   // seconds since last valid reading
}

// ── DATA SOURCE INTERFACE (simulator + real OPC-UA both implement this) ───
export interface IDataSource {
  subscribe(cb: (snap: EngineSnapshot) => void): void;
  unsubscribe(): void;
  getLatest(): EngineSnapshot | null;
}
