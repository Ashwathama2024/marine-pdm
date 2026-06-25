# MarineGPT Predictive Maintenance Platform
## Technical Whitepaper — May 2026

**Version:** 1.0  
**Status:** System 1 in active development · System 2 in design phase  
**Engine Target:** 20-cylinder 4-stroke medium-speed marine diesel · Wärtsilä/MAN B&W 8000 Series · 5,113 kW MCR

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Technical Architecture: System 1 — MarineGPT Living PDM](#4-technical-architecture-system-1--marinegpt-living-pdm)
5. [Technical Architecture: System 2 — Manual Diagnostic AI](#5-technical-architecture-system-2--manual-diagnostic-ai)
6. [AI/ML Approach and Design Principles](#6-aiml-approach-and-design-principles)
7. [Real-World Use Cases](#7-real-world-use-cases)
8. [Phases and Timeline](#8-phases-and-timeline)
9. [Competitive Differentiation](#9-competitive-differentiation)
10. [Business Value and ROI](#10-business-value-and-roi)
11. [Future Roadmap](#11-future-roadmap)
12. [Conclusion](#12-conclusion)
- [Appendix A — Sensor Reference Table](#appendix-a--sensor-reference-table)
- [Appendix B — Fault Pattern Specifications](#appendix-b--fault-pattern-specifications)
- [Appendix C — Physics Baseline Equations](#appendix-c--physics-baseline-equations)
- [Appendix D — Risk Score Reference](#appendix-d--risk-score-reference)
- [Appendix E — Glossary](#appendix-e--glossary)

---

## 1. Executive Summary

The maritime industry loses hundreds of millions of dollars annually to unplanned main engine downtime. A Capesize bulk carrier off-hire for five days while awaiting emergency parts costs its operator $125,000–$225,000 in missed time-charter revenue — before accounting for port detention fees, class attendance, and emergency procurement. These failures are not random events. They are the product of early degradation that goes undetected because existing monitoring systems are not designed to detect it: they alarm only when a hard threshold is crossed, by which point damage is already done.

**MarineGPT** is a two-system predictive maintenance platform built to close this gap.

**System 1 — MarineGPT Living PDM** is a real-time, physics-first AI monitoring engine for large marine diesel engines. It runs continuously, evaluating every sensor reading against a load- and RPM-aware physics model — not a fixed alarm threshold — and synthesizes a continuous risk score from three independent layers of evidence: physics deviation, statistical trend analysis, and rule-based fault pattern matching. The system is calibrated to a 20-cylinder 4-stroke medium-speed engine (Wärtsilä/MAN B&W 8000 Series, 5,113 kW MCR) at a real operating point of 885 RPM and 61.37% load. It integrates directly with Kongsberg K-Chief automation systems via OPC-UA, and its four-level safety override layer mirrors the K-Chief alarm group 2400 escalation structure from Pre-alarm through to Shutdown.

**System 2 — Manual Diagnostic AI** is an on-premise, conversational diagnostic assistant. When a watch engineer observes something unusual — a sound, an unexpected gauge reading, an anomalous log entry — they describe the symptom in plain language. The system retrieves relevant sections from the vessel's equipment manuals using hybrid search, reasons over the retrieved context using a locally-deployed large language model (no cloud, no internet dependency), and returns a structured differential diagnosis with ranked probable causes, step-by-step repair procedures, part numbers, an ISO 14224-aligned severity rating, and a draft work order.

Together, the two systems cover what no existing solution does: automated proactive detection of developing faults, plus human-guided reactive investigation when something unexpected occurs, all within a single integrated platform that improves in accuracy with every sea trial and every operator interaction.

**Current status as of May 2026:** System 1 core architecture is complete — simulator, three-layer decision engine, 15 active sensors plus 20 per-cylinder exhaust temperatures, React dashboard, and PostgreSQL/TimescaleDB persistence. System 2 design is finalised and enters development in June 2026. Full fleet deployment readiness is targeted for Q1 2027.

---

## 2. Problem Statement

### 2.1 The Cost of Reactive Maintenance in Marine Operations

Unplanned main engine failures are the single largest driver of vessel off-hire time. Across the commercial shipping fleet, main engine faults account for approximately 60–70% of unscheduled downtime events. For a large bulk carrier or container feeder operating on time-charter, a single main engine event can trigger a cascade of costs that far exceed the cost of the repair itself: off-hire revenue loss, emergency port call fees, class surveyor attendance, expedited freight for spare parts, and potential port state control (PSC) detention if the vessel is found deficient during inspection.

The economics are stark. A Capesize bulk carrier earning $30,000–$45,000 per day on time-charter that is off-hire for five days due to a failed fuel injector or lube oil system fault will generate $150,000–$225,000 in direct revenue loss. A VLCC in a similar scenario at $60,000–$80,000 per day incurs $300,000–$400,000 in off-hire cost for the same five-day window — before accounting for cargo claims, deviation costs, or reputational impact with the charterer.

Classification societies (DNV GL, Lloyd's Register, Bureau Veritas) increasingly tie Enhanced Survey Programme (ESP) outcomes and condition monitoring credits to the quality and continuity of a vessel's planned maintenance system records. Operators running demonstrably data-driven maintenance programmes are beginning to receive tangible commercial benefits: extended dry-docking intervals, reduced class survey scope, and preferred insurer terms. The inverse is also becoming true: operators whose maintenance records are thin or reactive face greater scrutiny.

### 2.2 The Gap in Existing Monitoring Tools

Modern vessels are equipped with Computerised Alarm and Monitoring Systems (CAMS) — Kongsberg K-Chief, Wartsila NACOS, ABB Ability Marine, and others. These systems are mature, reliable, and safety-critical. They are also fundamentally reactive in design.

A CAMS raises an alarm when a sensor value crosses a hard-coded threshold. If lube oil pressure falls below 5.0 bar, an L2 alarm fires. If exhaust temperature exceeds 545°C, an L2 alarm fires. These thresholds were set at commissioning, calibrated to the OEM's general specification for the engine type, and have not changed since. They do not account for the actual operating point — an exhaust temperature that is alarming at 40% load may be completely normal at 85% load. They do not account for trends — a pressure that is well above the alarm threshold but has been declining at 0.08 bar per minute for the last 20 minutes is flagged by no existing system. They do not distinguish between a sensor that is malfunctioning and equipment that is genuinely degrading.

OEM condition monitoring services (MAN PrimeServ Remote Diagnostic Services, Wärtsilä Expert Insight) address some of these limitations through cloud-based analytics. But they require continuous satellite connectivity to upload engine data to OEM servers, they are proprietary to the OEM's own engine range, and they create data sovereignty concerns for operators who are not comfortable with engine performance data leaving the vessel. They also carry significant subscription costs on a per-vessel basis and provide diagnostic outputs — when they provide them at all — through emailed reports rather than real-time bridge or engine control room displays.

The result is a monitoring gap that is almost entirely invisible during normal operations: the slow development of fault conditions that are detectable against a physics-informed baseline, but that fall below hard-threshold alarms until they have already caused meaningful damage.

### 2.3 The Knowledge Capture Problem

An experienced Chief Engineer has accumulated thousands of hours of observation of a specific engine type. They know that a 6°C rise in cylinder exhaust spread on a MAN B&W 20-cylinder at 61% load is worth watching, but is not a cause for alarm. They know that a 12°C rise in the same parameter combined with a slight increase in specific fuel oil consumption probably means an injector is beginning to wear. They know the diagnostic procedure from the MAN B&W maintenance manual by heart: bench-test the injector, measure needle valve lift, check nozzle wear pattern.

This knowledge is tacit. It lives in the heads of experienced officers and in 500-page OEM maintenance manuals. It does not live in the CAMS. When a Chief Engineer retires or signs off, that knowledge leaves with them. A junior Second Engineer alone on watch at 02:00 does not have access to it.

This problem will worsen. The maritime engineering workforce is aging. Industry estimates suggest that approximately 30% of experienced marine engineers (15+ years of sea service) will retire before 2032. Recruitment and retention of engineering officers remains a significant challenge across all major flag states and manning centres. The knowledge held by the current generation of experienced engineers is not being systematically captured or transferred.

### 2.4 Why Now

Three technology developments have converged to make this platform feasible in 2026 in a way that would not have been practical five years ago.

**OPC-UA standardization** has made real-time programmatic access to shipboard automation data practical and vendor-neutral. Kongsberg K-Chief, ABB, and most modern CAMS now expose their data via OPC-UA endpoints, meaning a single client implementation can connect to diverse hardware without proprietary middleware. This is the plumbing that makes System 1 possible without hardware modifications to the vessel's existing automation systems.

**Local large language models** are now capable enough to run on vessel-grade server hardware — Intel Xeon processors with 32–64GB RAM — and produce reliable structured reasoning outputs. LLaMA 3.1 8B at Q4 quantization (4.7GB model weight, approximately 5–8 tokens per second on CPU) is sufficient for the diagnostic reasoning task System 2 requires. No GPU is needed, no cloud connection is needed, and the model operates in fully air-gapped environments.

**Physics-based digital twin modelling** has matured to the point where a marine diesel engine's steady-state thermal and mechanical behaviour can be expressed as a set of parametric equations, calibrated to a real operating point, and evaluated in real time with negligible computational overhead. This eliminates the cold-start problem that has historically made pure ML approaches unworkable for rare marine fault detection: physics models do not require historical failure data to produce a useful baseline.

---

## 3. Solution Overview

### 3.1 The Two-System Architecture

The platform is architecturally two systems that operate independently but are designed for integration:

```
┌─────────────────────────────────────────────────────────────┐
│                     SYSTEM 1 (Always On)                     │
│           MarineGPT Living PDM — Real-Time Monitor           │
│                                                              │
│  OPC-UA ──► Ingestion ──► Features ──► Decision Engine ──►  │
│   (or Simulator)                        3-Layer Evidence      │
│                                         Risk Score 0-100     │
│                                         Safety Overrides      │
│                                              │               │
│                                         React Dashboard       │
└─────────────────────────────────────────┬───────────────────┘
                                          │ Anomaly detected
                                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     SYSTEM 2 (On Demand)                     │
│              Manual Diagnostic AI — Conversational           │
│                                                              │
│  Engineer describes symptoms in natural language             │
│       │                                                      │
│       ▼                                                      │
│  Hybrid RAG ──► Retrieved manual sections + FMEA data        │
│       │                                                      │
│       ▼                                                      │
│  LLaMA 3.1 8B (Ollama, on-premise)                          │
│       │                                                      │
│       ▼                                                      │
│  Structured Output: Root cause · Repair steps · BOM          │
│                     RPN score · Draft work order             │
│                                                              │
│                          ──► CMMS (AMOS / ShipNet)          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 System 1 — The Living PDM Concept

The word "living" in MarineGPT Living PDM is the key to understanding what makes System 1 different from a CAMS upgrade.

At commissioning, the system's baseline equations are seeded with OEM physics models derived from MAN B&W shop test data. These equations predict expected sensor values at any given combination of engine load, RPM, and cooling efficiency. The prediction adapts in real time to operating conditions: the expected exhaust temperature at 40% load and 720 RPM is a different number to the expected exhaust temperature at 85% load and 850 RPM, and the system knows this.

Over the vessel's operational life, the baseline evolves. After sea trials, regression analysis over measured data produces a sea-trial-calibrated curve version that is stored alongside the OEM model, with the new version activated and the OEM model retained as audit history. After six months of confirmed operational data and operator feedback, the baseline reflects vessel-specific behaviour: the effects of hull fouling on cooling efficiency, the characteristic cylinder spread of this specific engine build, the normal SFOC envelope for this vessel's typical trading pattern.

This means the system gets more accurate over time, not less. It is a strategic asset that compounds in value with every sea trial and every operator interaction.

### 3.3 System 2 — The Conversational Diagnostic Concept

System 2 addresses the knowledge capture problem directly. It is not a search engine for maintenance manuals. It is a reasoning system that takes a symptom description, grounds its reasoning in retrieved manual content, applies structured fault diagnosis methodology (ISO 14224 failure taxonomy, FMEA risk priority scoring), and produces an output that an engineer can act on immediately.

The output is not freeform text. Every diagnosis follows a fixed schema: the primary failure hypothesis, confidence level and supporting evidence, two to four differential diagnoses with discriminating diagnostic actions, a step-by-step repair procedure (sourced from the retrieved manual sections), identified part numbers and consumables, an FMEA-derived RPN (Risk Priority Number) score, and a pre-populated work order draft ready for entry into the vessel's CMMS.

The system runs entirely on the vessel. The OEM manuals, FMEA libraries, and the LLM weights are all stored locally. No sensor data, no maintenance records, and no proprietary operational information leaves the vessel network.

### 3.4 The Complete Maintenance Loop

The power of the combined system is best illustrated as a narrative.

At 02:15, the watch alarm system is quiet. System 1 has been operating continuously for 14 days since departure. The risk score for the main engine is currently 31 (WARNING range), driven by a developing deviation in cylinder A8 exhaust temperature: +14°C above the expected value at the current operating point of 67% load and 830 RPM. The deviation has been growing slowly for the past 6 hours. The system's statistical layer has flagged a rate of change of +0.35°C per minute. The injector degradation pattern has matched two of its three conditions for the past 22 ticks. No hard-threshold alarm has fired.

At 06:00, the Chief Engineer reviews the overnight dashboard during handover. The risk trend chart shows the slow climb from 18 to 31 over the past 8 hours. The evidence chain panel reads:

> **PHYSICS:** Exhaust temp +14.2°C vs expected 503.8°C · Cylinder imbalance 16.7°C spread  
> **STATISTICS:** Exhaust trend +0.35°C/min (6-hour) · Std dev 4.1°C rolling 30-tick  
> **RULES:** Injector Degradation pattern: cylDev > 14°C ✓ · imbalance > 15°C ✓ · rising rate ✓

The Chief opens the diagnostic AI on the engine control room terminal and describes: *"Cylinder A8 exhaust running 14 degrees high. Imbalance 17 degrees. SFOC up 1.2%. Other cylinders normal. Fuel rack position normal."*

System 2 retrieves five sections from the MAN B&W maintenance manual: the injector inspection procedure, the injector bench test specification, the fuel valve nozzle wear table, the cylinder balance troubleshooting flowchart, and the injector replacement procedure. The LLM reasons over the retrieved context and produces:

**Primary diagnosis:** Injector nozzle wear (Cylinder A8) — confidence 78%. Evidence: isolated single-cylinder exhaust elevation, normal fuel rack, rising SFOC, consistent with gradual nozzle orifice enlargement.

**Differentials:** Fuel valve needle valve sticking (12%), faulty exhaust valve (10%).

**Recommended actions:**
1. Bench-test A8 injector at next opportunity (45 minutes, no shutdown required)
2. Replace A8 injector if opening pressure below 280 bar (4 hours, shutdown required)
3. Monitor remaining cylinders for spread progression

**Spare parts:** A-series injector nozzle set (MAN part ref XXXXXXXXXXX), injector O-ring set

**Work order draft:** Pre-populated with fault description, procedure reference, estimated hours, parts required, and safety notes.

The Chief orders the spare injector from the engine room stores, confirms the part is in inventory, and schedules the replacement for next port — 18 hours away. The injector is replaced during the port call in 3.5 hours. The post-replacement exhaust spread returns to baseline within two operating hours.

No unplanned downtime. No emergency part procurement. No hard-threshold alarm fired.

---

## 4. Technical Architecture: System 1 — MarineGPT Living PDM

### 4.1 Monorepo Package Architecture

System 1 is implemented as a TypeScript monorepo using pnpm workspaces. Six packages with clear, non-overlapping responsibilities, plus a shared type contract layer and a database layer.

```
marine-pdm/
├── shared/          → Canonical interfaces, constants, physics coefficients
├── packages/
│   ├── simulator/   → Physics-based engine model with fault injection
│   ├── ingestion/   → OPC-UA client, IDataSource abstraction
│   ├── features/    → Statistical feature extraction (deviations, rates, windows)
│   ├── knowledge/   → Baseline store, sensor registry, pattern library, dependency map
│   ├── decision/    → 3-layer AI decision engine
│   └── ui/          → React 18 + Vite dashboard
└── db/              → PostgreSQL + TimescaleDB schema and seed data
```

**The `IDataSource` interface is the central architectural decision.** By abstracting the data source behind a single interface, the entire AI stack — feature extraction, baseline comparison, decision engine, dashboard — is source-agnostic. Switching from simulator to real OPC-UA hardware is a single line of code:

```typescript
// Development / testing
const src: IDataSource = new SimulatorEngine(885, 61);

// Production — real K-Chief hardware
const src: IDataSource = new OPCUADataSource('opc.tcp://ipms:4840');
```

This also means the system can be demonstrated, tested, and validated on land — before the vessel is available — using the physics simulator, and deployed to the vessel with the OPC-UA client without any changes to the AI stack.

### 4.2 Sensor Coverage

The system monitors 35 data points per second tick, organized into three tiers.

**9 Primary Sensors — Active from Day 1:**

| Tag ID | Display Name | Unit | Alarm High | Alarm Low |
|--------|-------------|------|-----------|-----------|
| ME.RPM | Main Engine RPM | RPM | 765 | — |
| ME.Load | Engine Load | % | 100 | — |
| ME.ExhaustTemp | Mean Exhaust Temp | °C | 455 | 200 |
| ME.LubeOilPressure | Lube Oil Pressure | bar | 6.0 | 3.2 |
| ME.FuelRack | Fuel Rack Position | mm | 100 | — |
| ME.ScavengeAirPressure | Scavenge Air Pressure | bar | 3.2 | 0.5 |
| ME.TCSpeed | Turbocharger Speed | RPM | 18,500 | — |
| ME.JacketCoolingOutlet | Jacket Cooling Water Outlet | °C | 90 | — |
| ME.SFOC | Specific Fuel Oil Consumption | g/kWh | 218 | — |

**6 Extended Sensors — Active from Day 1:**

| Tag ID | Display Name | Unit | Key Alarm |
|--------|-------------|------|-----------|
| ME.ChargeAirTemp | Charge Air Temperature | °C | High: 78°C (L2) |
| ME.FuelOilPressure | Fuel Oil Pressure | bar | Low: 5.0 bar (L2) |
| ME.FuelOilTemp | Fuel Oil Temperature | °C | High: 50°C (L2) |
| ME.LOFilterDP | LO Filter Differential Pressure | bar | High: 1.2 bar (L2) |
| ME.PistonCoolingPress | Piston Cooling Oil Pressure | bar | Low: 4.0 bar (L2) |
| ME.ShaftPower | Shaft Power | kW | High: 5,500 kW (L2) |

**20 Per-Cylinder Exhaust Temperatures (ME.Cyl1–ME.Cyl20):**

Bank A (A1–A10) and Bank B (B1–B10), each measured independently. The natural manufacturing spread of the real engine is encoded in the `CYL_SPREAD` array, calibrated to actual data at 61% load / 885 RPM:

```
Bank A: A1(−2°C), A2(−3°C), A3(−5°C), A4(−6°C), A5(−9°C),
        A6(−7°C), A7(−5°C), A8(+9°C), A9(0°C),  A10(+4°C)
Bank B: B1(+2°C), B2(+3°C), B3(+5°C), B4(−1°C), B5(+1°C),
        B6(+4°C), B7(+6°C), B8(0°C),  B9(+4°C), B10(+2°C)
```

This spread is applied to the computed mean exhaust baseline, so each cylinder's expected temperature is specific to its position — not a single engine-wide mean. Cylinder A5 being 9°C below mean is normal for this engine; a sudden shift in that relationship is a genuine anomaly.

**New Sensor Observation Gate:**

Sensors that are added after initial commissioning — sensors from retrofit equipment, new instrumentation, or additional monitoring points — enter `OBSERVATION` status. They cannot be activated for scoring until two conditions are satisfied: 30 consecutive observation days have elapsed, and a baseline curve has been defined for the sensor. This prevents spurious early alerts from sensors whose baseline behaviour has not yet been characterised.

### 4.3 The Living Baseline System

Every sensor's expected value is computed from a parametric equation stored in the baseline store — not a lookup table, and not a fixed number.

Equations are stored as human-readable mathematical strings and evaluated at runtime using the `mathjs` library:

| Sensor | Baseline Equation | Source |
|--------|-------------------|--------|
| ME.ExhaustTemp | `250 + load * 1.4 + rpm / 700 * 10 / coolingEff` | MAN B&W Physics Model v1 |
| ME.LubeOilPressure | `4.2 + rpm / 700 * 0.8 - load * 0.005` | MAN B&W Physics Model v1 |
| ME.FuelRack | `20 + load * 0.6 + (rpm - 600) * 0.02` | MAN B&W Physics Model v1 |
| ME.ScavengeAirPressure | `0.8 + load / 100 * 1.4 + rpm / 700 * 0.3` | MAN B&W Physics Model v1 |
| ME.TCSpeed | `8000 + load * 80 + (rpm - 600) * 20` | MAN B&W Physics Model v1 |
| ME.JacketCoolingOutlet | `(65 + load * 0.28) / coolingEff` | MAN B&W Physics Model v1 |
| ME.SFOC | `185 + (100 - load) * 0.4 + (700 - rpm) * 0.1 + (1 - coolingEff) * 20` | MAN B&W Physics Model v1 |

Note three architectural features of these equations:

1. **Variables, not constants.** Load, RPM, and cooling efficiency (`coolingEff`) are evaluated in real time from the current snapshot. The expected exhaust temperature at 85% load is automatically different to the expected value at 40% load, with no configuration change required.

2. **Mandatory provenance.** Every baseline curve carries a `source` field that is mandatory. "MAN B&W Physics Model v1" documents the origin. Future versions will carry "Sea Trial October 2026" or "Operational Data Regression Q1 2027." This creates an unambiguous audit trail for every prediction the system makes.

3. **Immutable version history.** Baseline curves are never deleted. When a sea-trial regression produces a better curve, a new curve is created with `isActive: true` and the previous curve becomes `isActive: false`. Both are retained indefinitely. The history of how the baseline evolved is a first-class record.

4. **Load validity range.** Each curve declares a `validLoadMin` and `validLoadMax`. Outside this range, the baseline returns `null` rather than extrapolating into uncalibrated territory. The decision engine handles a null baseline by suspending scoring for that sensor rather than producing a misleading deviation value.

### 4.4 The 3-Layer Evidence Stack

The decision engine is the intellectual core of System 1. It processes every engine snapshot through three independent analytical layers, each producing human-readable findings and contributing to a risk score.

#### Layer 1: PHYSICS

For each sensor, the engine computes the deviation between the actual reading and the baseline-predicted expected value:

```
devNorm = |actual − expected| / |expected|
scoreDev = min(100, devNorm × 200)
```

The deviation is normalized against the expected magnitude, so a 15°C deviation on a sensor expected at 500°C (3% deviation, scoreDev ≈ 6) has very different meaning to a 0.3 bar deviation on a sensor expected at 5.0 bar (6% deviation, scoreDev ≈ 12). Normalization prevents high-range sensors from systematically dominating the risk score.

Per-cylinder risk is computed individually for all 20 cylinders, with each cylinder's persist counter tracked independently. A single cylinder developing an anomaly produces a targeted per-cylinder risk elevation while the system risk remains moderate — precisely the signal that matters for injector diagnostics.

Physics findings are logged as human-readable strings: *"Exhaust temp +14.2°C vs expected 503.8°C"* or *"Lube pressure −0.38 bar vs expected 5.42 bar."* These strings appear verbatim in the dashboard and are stored in the database with each decision record.

#### Layer 2: STATISTICS

The statistical layer operates on the rolling 30-tick window maintained for each sensor:

- **Variability:** `stdDev > 5°C` for exhaust → flagged as high variability, indicating unstable combustion or intermittent sensor noise.
- **Trend:** Rate of change computed via 5-point linear regression over the last 5 ticks → converted to per-minute units. `|exhaustRate| > 1°C/min` is flagged. `lubeRate < −0.05 bar/min` is a key condition in the lube system failure pattern.
- **Cylinder imbalance:** `cylImbalance = max(cylTemps) − min(cylTemps)`. Imbalance `> 15°C` flagged. Imbalance `> 35°C` triggers an L2 safety override.

The rate component of the risk score is:

```
rateNorm = |rate| / (|expected| × 0.001)
scoreTrend = min(100, rateNorm × 150)
```

Statistical findings: *"Exhaust trend: +0.35°C/min"* or *"Cylinder imbalance: 16.7°C spread."*

#### Layer 3: RULES (Fault Pattern Matching)

The rules layer matches current sensor features against a library of fault patterns. Each pattern defines a set of conditions that must simultaneously be met for a specified number of consecutive ticks (persistence gate).

The three seeded patterns, with their exact threshold conditions:

**Injector Degradation:**
- `cylDev > 20°C` (any cylinder deviation exceeds 20°C above baseline)
- `cylRate > 0` (cylinder temperature is rising)
- `cylImbalance > 15°C` (temperature spread across 20 cylinders exceeds 15°C)
- Action window: **4–8 hours**

**Lube System Failure:**
- `lubeDev < −0.4 bar` (LO pressure more than 0.4 bar below expected)
- `lubeRate < −0.05 bar/min` (LO pressure falling at more than 0.05 bar per minute)
- Action window: **Immediate**

**Cooling Fouling:**
- `cylsAllRising > 5°C` (all 20 cylinders elevated more than 5°C above their individual baselines)
- `jacketDev > 5°C` (jacket cooling outlet more than 5°C above expected)
- `coolingEff < −0.08` (cooling efficiency factor has dropped more than 8% below nominal)
- Action window: **Next port**

Rules findings appear as: *"Injector Degradation: cylDev 14.2°C ✓ — rising rate ✓ — imbalance 16.7°C ✓"*

#### Risk Aggregation and Confidence

The system risk is the maximum of all individual sensor and cylinder risks, after all three layers have contributed to each sensor's composite score:

```
Risk = min(100, w_dev × scoreDev + w_trend × scoreTrend + w_persist × scorePersist)
```

The weights are **load-adaptive** — the relative importance of deviation, trend, and persistence signals changes with engine operating point:

| Load Range | w_dev | w_trend | w_persist | Reasoning |
|-----------|-------|---------|-----------|-----------|
| High (> 80%) | 0.35 | 0.30 | 0.35 | Under stress, persistence of anomaly matters as much as its magnitude |
| Normal (40–80%) | 0.40 | 0.25 | 0.35 | Deviation dominates; trends are informative but not decisive |
| Low (< 40%) | 0.25 | 0.35 | 0.40 | At light load, rate and persistence are more diagnostic than absolute deviation |

The persistence score captures how many consecutive ticks the anomaly condition has been met:

| Consecutive Ticks | scorePersist |
|------------------|-------------|
| > 8 | 100 |
| > 4 | 60 |
| > 2 | 30 |
| ≤ 2 | 0 |

**Confidence** is computed separately and is bounded by specification at a maximum of 0.97. No AI decision claims certainty:

```
confidence = min(0.97, (evidenceCount / 5) × dataQuality × patternStrength)
```

Where:
- `evidenceCount`: number of independent signals contributing (0–5)
- `dataQuality`: freshness × sensor completeness (degrades to 0 if data is > 30 seconds old)
- `patternStrength`: degree to which pattern conditions are met (0.0–1.0)

#### Operator Feedback Loop

Every alert has CONFIRM and FALSE POSITIVE buttons in the dashboard. Operator feedback updates counters per pattern (`timesConfirmed`, `timesFalsePositive`). The `getSuggestedThresholdAdjustment()` function monitors these counters and produces threshold recommendations when:

- False-positive rate exceeds 30% → suggest raising the triggering threshold
- Under-detection rate exceeds 20% → suggest lowering the threshold

This creates a closed loop: the pattern library learns from the operator's experience and becomes more calibrated over time. No retraining, no ML pipeline — just structured feedback applied to threshold parameters.

### 4.5 Safety Override Layer

The safety override layer is applied **after** all AI scoring. Hard limits always win. The override maps to Kongsberg K-Chief alarm group 2400:

| Level | Name | Lube Oil Pressure | Mean Exhaust Temp | Jacket Outlet | Risk Forced To |
|-------|------|-------------------|-------------------|--------------|----------------|
| L1 | Pre-Alarm | < 5.5 bar | > 530°C | > 87°C | min 50 |
| L2 | Alarm | < 5.0 bar | > 545°C | > 90°C | min 85 |
| L3 | Slowdown | < 4.5 bar | > 560°C | > 93°C | min 95 |
| L4 | Shutdown | < 4.0 bar | > 575°C | > 97°C | 100 |

Cylinder imbalance overrides are applied independently:
- Imbalance > 35°C → L2 override (risk minimum 80)
- Imbalance > 45°C → L3 override (risk minimum 95)

When a hard limit fires, the alert carries a distinguishing tag: *"[L2 ALARM] LO pressure 4.87 bar < 5.0 bar. Safety override activated — AI score overridden."* This ensures that safety-critical events are always visually distinguishable from AI-generated risk alerts in the dashboard.

The status thresholds:
- Risk ≥ 75 → **CRITICAL** (red)
- Risk 50–74 → **HIGH** (orange)
- Risk 25–49 → **WARNING** (amber)
- Risk < 25 → **NORMAL** (green)

### 4.6 Fault Source Classification

A critical feature that reduces unnecessary interventions: before an alert is presented to the operator, the decision engine classifies the fault source by examining sensor correlations.

The `DependencyMap` stores correlation coefficients between sensors, derived from real engine operating data:

| Sensor | Correlated With | Correlation Coefficient |
|--------|----------------|------------------------|
| ME.ExhaustTemp | Load | 0.96 |
| ME.ExhaustTemp | RPM | 0.88 |
| ME.JacketCoolingOutlet | Load | 0.91 |
| ME.JacketCoolingOutlet | ME.ExhaustTemp | 0.85 |
| ME.TCSpeed | Load | 0.97 |
| ME.TCSpeed | RPM | 0.93 |
| ME.SFOC | Load | −0.82 (inverse) |
| ME.SFOC | ME.JacketCoolingOutlet | 0.71 |
| ME.LubeOilPressure | RPM | 0.78 |

When ME.ExhaustTemp deviates, the engine checks whether correlated sensors (Load, RPM) are also moving in the expected direction. If they are, the deviation is classified **EQUIPMENT** — something is genuinely wrong with the equipment. If ME.ExhaustTemp deviates but its correlated sensors are stable, and the sensor's health score is below 0.7, the fault is classified **SENSOR_SUSPECT** — the sensor is likely malfunctioning, and the engineer should verify the reading before acting. If the pattern is ambiguous, the fault is classified **ISOLATED** — investigate further.

This classification appears prominently in each alert and prevents the most expensive false positive: dispatching engineering crew to investigate equipment that is fine because a sensor has developed a drift fault.

### 4.7 Database Layer

PostgreSQL with the TimescaleDB extension provides the persistence and time-series query capabilities the system requires.

**Hypertables (time-series, high write throughput):**
- `readings`: raw sensor values from every tick, with quality score 0–100 and a `manualOverride` flag. This is the complete operational record — approximately 1 million rows per vessel per year at 1-second tick rate.
- `features`: computed deviations, rates, rolling statistics, cylinder imbalance — one row per tick.
- `decisions`: system risk, component risks, status string — one row per decision cycle.

**Configuration tables (immutable audit trail):**
- `sensors`: the sensor registry with status lifecycle column. UNIQUE constraint on `id`.
- `baseline_curves`: versioned curve history with mandatory `source` field. A database constraint enforces that only one curve is active per sensor at any time.
- `fault_patterns`: the pattern library, stored with JSONB condition arrays and integer feedback counters.
- `sensor_dependencies`: cross-correlation coefficients.
- `alerts`: complete alert log with `operatorFeedback` column (NULL / CONFIRMED / FALSE_POSITIVE) and timestamp.

The TimescaleDB hypertable design means time-range queries against `readings` — for example, *retrieve all exhaust temperature readings from the last 6 hours* — use optimized chunk-based storage and remain fast even as the table grows to hundreds of millions of rows over multiple voyages.

### 4.8 Real-Time Dashboard

The React 18 + Vite dashboard provides seven distinct views:

1. **Dashboard (/):** The primary operational view. GaugeGrid showing all 15 extended sensors. AIDecisionPanel showing the system risk ring (0–100), current status badge, active alerts with CONFIRM/DISPUTE buttons, and the full three-layer evidence chain. CylinderView rendering a heatmap of all 20 per-cylinder temperatures with deviation highlighting. TrendChart showing 30-minute sparklines for key sensors.

2. **Deviation Overview (/deviations):** Scatter plot of actual vs. expected values by operating point. Identifies sensors that are consistently off-baseline across all load conditions — a systematic bias indicating equipment degradation rather than measurement noise.

3. **Analysis Table (/table):** Tabular per-sensor view with raw values, expected values, deviation, rate, and risk contribution. Full snapshot drill-down.

4. **Alert Analytics (/alerts):** Pattern performance dashboard. For each fault pattern: times triggered, times confirmed, times flagged as false positive, false-positive rate, and the system's current threshold adjustment suggestion.

5. **Knowledge Base (/knowledge):** Read-only browser for the fault pattern library and sensor dependency visualisation.

6. **Baseline Editor (/baselines):** Interactive baseline curve management. Engineers can view the current active equation for any sensor, see the historical curve versions, enter a new equation and validate it against current snapshot data using live mathjs evaluation before committing.

7. **Management (/management):** Sensor lifecycle management. Add new sensors, check observation progress (days elapsed vs. days required), activate sensors that have completed their observation period, disable sensors that are being decommissioned.

---

## 5. Technical Architecture: System 2 — Manual Diagnostic AI

### 5.1 Design Philosophy

Three constraints drove every architecture decision in System 2:

**On-premise, data-sovereignty-first.** No sensor data, no maintenance records, no fault descriptions, and no diagnostic outputs leave the vessel's local network. This is a non-negotiable requirement for operators in the defence sector, operators with confidential cargo, and operators in regions with strict data localisation requirements. It also makes the system operational during satellite outages — which are inevitable on any long ocean passage.

**Structured output, not freeform text.** The value of a diagnostic tool is not in generating interesting text. It is in producing an output that an engineer can hand to a crew member, enter into a CMMS, or attach to a defect report. Every diagnosis follows a fixed schema, validated by the backend before it is returned.

**Manual-grounded, not hallucinated.** Every repair step, every part number, and every procedure reference in the output is retrieved from the vessel's own indexed documents. The LLM's role is to reason over retrieved content and structure its output — not to generate facts from its training data. Part numbers that cannot be verified against the indexed corpus are explicitly flagged as `UNVERIFIED — confirm with manual`.

### 5.2 Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Backend API | Python FastAPI | Async, Python-native for AI stack, easy REST + streaming SSE |
| Vector store | ChromaDB (persistent) | Embedded in process, metadata filtering, BM25 support, no separate Docker service required |
| LLM runtime | Ollama + LLaMA 3.1 8B Q4 | On-premise, 4.7GB, runs on Intel Xeon 32GB, 128K context window |
| Retrieval | Hybrid BM25 + dense embeddings | BM25 for exact part numbers; dense for symptom semantic matching |
| Embedding model | BAAI/bge-m3 (1024 dims) | Best multilingual technical retrieval, 8192 token context |
| Output schema | Pydantic + instructor | ~98% schema compliance; retry logic on schema violation |
| Chunking | unstructured + semantic chunking | Section-boundary-aware; never splits numbered procedure steps |

**Critical configuration:** ChromaDB is initialized with `anonymized_telemetry=False` — essential for air-gapped networks where DNS lookups to telemetry endpoints cause 3–10 second startup delays. Ollama is always called with `options={"num_ctx": 8192}` — the default 2048 token context silently truncates retrieved manual content, producing degraded diagnostic quality.

### 5.3 Query Flow

```
Engineer input (symptom description)
           │
           ▼
    [Symptom Parser]
    Extracts structured fields:
    equipment_id, equipment_type, symptom_type,
    location, behavior, operating_context
           │
           ▼
    [Hybrid Retrieval — ChromaDB]
    BM25 weight 0.40 + Dense weight 0.60
    Filter: equipment_class, doc_type
    Retrieve top-20, rerank to top-5
           │
           ▼
    [Context Assembly]
    Retrieved manual sections + FMEA entries
    + K-Chief alarm code cross-reference
    + Historical confirmed cases (if any)
           │
           ▼
    [LLaMA 3.1 8B via Ollama]
    Structured prompt: symptoms + context + schema
    num_ctx: 8192, temperature: 0.1
           │
           ▼
    [Output Validation — instructor + Pydantic]
    Schema enforcement, part number verification
    Retry on schema violation (max 2 retries)
           │
           ▼
    Structured diagnostic output:
    · Primary diagnosis + confidence
    · Differential diagnoses (2–4)
    · Step-by-step repair procedure
    · Part numbers + BOM (verified)
    · FMEA RPN score
    · ISO 14224 failure mode code
    · Work order draft
```

### 5.4 Knowledge Base Structure

The knowledge base is built from the vessel's own documents, ingested at installation and updated whenever new OEM service letters or revised manuals are received.

**Ingestion pipeline:**
```
PDF / DOCX documents
       │
       ▼
[OCR / Extraction]       ← PyMuPDF (fast, clean PDFs) + unstructured (scanned)
       │
       ▼
[Structure Detection]    ← Identify tables, numbered procedures, fault code sections
       │
       ▼
[Semantic Chunking]      ← Respect section/procedure boundaries; never split numbered sequences
       │
       ▼
[Metadata Enrichment]    ← equipment_class, doc_type, failure_modes_covered, page_range
       │
       ▼
[Embedding + Indexing]   ← BAAI/bge-m3 → ChromaDB with BM25 hybrid support
       │
       ▼
[Structured Extraction]  ← Fault code tables → relational lookup; part number index
```

**Chunk size by content type:**
- Narrative sections: 512–800 tokens, 80–100 token overlap
- Numbered procedures: 300–600 tokens, zero overlap (keep steps atomic)
- Fault code / specification tables: one table per chunk
- Parts catalog entries: 400 tokens, 50 token overlap

**Pre-loaded structured data:**
- FMEA RPN library for common marine equipment failure modes (ISO 14224 taxonomy)
- K-Chief alarm code cross-reference: maps K-Chief alarm IDs to equipment categories and suggested diagnostic pathways
- Sensor dependency map (mirrored from System 1) for context-aware diagnosis

### 5.5 Equipment Scope

System 2 covers six equipment families — the full scope of typical machinery space equipment — not just the main engine:

| Equipment Family | Representative Fault Modes |
|-----------------|---------------------------|
| Centrifugal / gear / screw pumps | Cavitation, mechanical seal failure, impeller wear, bearing failure |
| Compressors (air, refrigerant) | Valve plate failure, intercooler fouling, piston ring wear, bearing failure |
| Heat exchangers (shell & tube, plate) | Tube-side fouling, tube leak, shell-side corrosion, baffle damage |
| Valves (control, isolation, safety/relief) | Seat erosion, actuator failure, stem packing leak, positioner drift |
| Electrical distribution (MV/LV) | Insulation degradation, protection relay mis-coordination, motor winding fault, busbar contamination |
| Rotating equipment (motors, fans, gearboxes, shafts) | Imbalance, misalignment, bearing defect, coupling wear, gear mesh failure |

---

## 6. AI/ML Approach and Design Principles

### 6.1 Why Physics-First, Not Pure ML

The most natural question from engineers familiar with modern machine learning is: why not train a neural network on engine sensor data and let it learn the fault signatures directly?

The answer has three parts.

**The cold-start problem.** A supervised ML model for rare fault detection requires a labelled dataset of fault events — sensor readings taken before, during, and after each fault type. For a marine diesel engine in commercial operation, serious fault events are rare by design: a well-maintained engine might experience a significant lube system fault once every few years. Building a training dataset requires either collecting data from a large fleet over a long period, or synthesizing fault scenarios. Both approaches require substantial time and resources before the system produces any value. A physics-first approach works on day one, calibrated to OEM specifications.

**Interpretability is not optional.** When the system flags a risk score of 73 and recommends immediate investigation of the lube oil system, a Chief Engineer with 25 years of experience will want to understand why before acting. A neural network that produces an anomaly score with no accompanying reasoning will be dismissed. The three-layer evidence chain — which shows exactly which deviation contributed to the physics score, which trend drove the statistical score, and which pattern conditions were met — is not a nice-to-have feature. It is the feature that makes the system usable by experienced engineers who rightly maintain healthy scepticism toward automated diagnostics.

**Robustness at distribution shift.** Real engine operating conditions change: hull fouling affects the cooling efficiency factor, different fuel grades affect combustion temperatures, seasonal temperature changes affect charge air density. A physics model parameterized on load and RPM handles these changes gracefully because the underlying equations remain valid. A neural network trained on one operating regime may degrade in accuracy when the engine operates differently — without providing any signal that its predictions have become unreliable.

### 6.2 The Living Baseline as a Strategic Asset

The physics baseline is the foundation, but it is not the ceiling. The "living" characteristic of the baseline is what creates compounding long-term value.

At commissioning, the baseline is seeded with OEM-derived equations calibrated to the engine type (MAN B&W Physics Model v1, sourced from shop test data). These equations are accurate to within approximately ±5–8% across the operating envelope — sufficient for coarse anomaly detection, but not calibrated to the specific vessel's hull form, propeller pitch, or engine build variations.

After the first sea trial, measured sensor data is collected at multiple operating points and a regression is run to fit updated equation coefficients. The resulting sea-trial-calibrated baseline typically reduces prediction error to ±2–3%. This version is stored as a new baseline curve entry with source "Sea Trial [Month Year]" and becomes the active curve. The OEM version is retained as historical record.

After six to twelve months of operational data with operator feedback confirming and disputing alerts, a third regression refines the model further — incorporating the vessel's actual loading profile, seasonal environmental conditions, and the engine's real wear characteristics. By this stage, the system is predicting expected sensor values at a precision that no OEM general specification can match. This vessel-specific accuracy is the data asset that makes early fault detection genuinely reliable, and it does not exist in any off-the-shelf product.

### 6.3 Human-in-the-Loop Design

The system is designed with explicit humility about the limits of automated reasoning.

The confidence score is bounded at 0.97 by specification. No alert claims certainty. The rationale: in a safety-critical environment, a system that expresses 100% confidence in a diagnosis has miscalibrated its users. Engineers who trust a system completely stop applying their own judgment, which is precisely what the system relies on to catch the cases it gets wrong.

The CONFIRM / FALSE POSITIVE buttons on every alert are not cosmetic features. Every press of FALSE POSITIVE is data that the system uses — via the `getSuggestedThresholdAdjustment()` function — to recommend threshold changes for the relevant pattern. The system is explicit about this recommendation: *"Injector Degradation pattern: 4 false positives in last 20 triggers (20%). Current cylDev threshold: 20°C. Suggested: raise to 23°C."* The engineer can accept or reject the suggestion; either way, the system has surfaced the calibration opportunity.

Manual override is supported at the sensor level via `ManualOverrideContext`. An engineer who knows that a specific temperature sensor has developed a known drift fault can flag that sensor as suspect, supplying a manually corrected value. The decision engine uses the corrected value for scoring while logging the override with timestamp — maintaining the audit trail.

### 6.4 Evidence Chain Transparency

Every `DecisionOutput` produced by the decision engine carries a three-layer evidence chain:

```typescript
evidenceChain: [
  { layer: 'PHYSICS',    findings: ['Exhaust temp +14.2°C vs expected 503.8°C', ...] },
  { layer: 'STATISTICS', findings: ['Exhaust trend: +0.35°C/min', 'Cylinder imbalance: 16.7°C spread'] },
  { layer: 'RULES',      findings: ['Injector Degradation: cylDev 14.2°C ✓ — rising rate ✓ — imbalance 16.7°C ✓'] },
]
```

These strings are generated at decision time from the actual computed values — not template text. They are displayed verbatim in the dashboard, stored verbatim in the `decisions` database table, and attached verbatim to any alert that fires. When an incident investigation is conducted three months later, the exact reasoning that generated each alert is available in the database, with timestamp.

### 6.5 RAG Over Fine-Tuning for System 2

The choice between retrieval-augmented generation (RAG) and fine-tuning for System 2 is unambiguous in this context.

OEM maintenance manuals are updated regularly through service letters, technical bulletins, and periodic manual revisions. A fine-tuned model incorporates training data at a point in time and cannot update when a new service letter is issued — without a full retraining cycle that requires GPU infrastructure. A RAG system updates by re-ingesting the new document: embed the new content, upsert into ChromaDB, done. The system reflects updated content at the next query.

Fine-tuned models produce training-data hallucinations: the model "knows" part numbers from its training but cannot distinguish between part numbers that apply to the specific engine variant on this vessel and part numbers from related engine types in its training corpus. RAG retrieval is scoped to the indexed documents, which are the specific manuals for the specific equipment on the vessel.

An 8B parameter model at Q4 quantization is not capable of reliable standalone domain expertise across the breadth of marine equipment failure modes. But it is capable of reliable structured reasoning when provided with good context. RAG provides the context; the LLM provides the reasoning structure.

---

## 7. Real-World Use Cases

### 7.1 Injector Degradation — Caught in Time

**Situation:** A 20-cylinder vessel is on a 4-day North Atlantic passage at a steady 67% load, 830 RPM. On Day 2 at 14:30, the watch engineer notices nothing unusual — the CAMS is quiet. System 1 has been running continuously and has begun tracking a developing deviation on Cylinder A8.

**System response:** At 14:30, cylinder A8 reads 519°C. The baseline equation at 67% load, 830 RPM predicts 505°C for that cylinder (mean exhaust expected at 496°C plus the A8 spread component of +9°C). Deviation: +14°C. The persist counter for A8 has been incrementing for 18 consecutive ticks. Cylinder imbalance across all 20 cylinders is 17.2°C. The exhaust rate for A8 is +0.28°C/min.

The risk score for the cylinder: scoreDev = min(100, (14/505) × 200) = 5.5; scoreTrend = min(100, 0.28/(505×0.001) × 150) = 8.3; scorePersist (18 ticks > 8) = 100. At 67% load weights (dev: 0.40, trend: 0.25, persist: 0.35): Risk = 0.40×5.5 + 0.25×8.3 + 0.35×100 = **38.3 (WARNING)**.

The injector degradation pattern evaluates: cylDev > 20°C — **NOT YET MET** (14°C). But the system is already tracking the trend and showing WARNING status with findings: *"Exhaust temp +14.0°C vs expected 505.0°C. Cylinder imbalance 17.2°C spread. Exhaust trend: +0.28°C/min."*

By 20:00 (5.5 hours later), A8 reads 527°C. Deviation now +22°C. Persist count: 38 ticks. Imbalance: 19.4°C. Pattern conditions: cylDev > 20°C ✓ · rising rate ✓ · imbalance > 15°C ✓. Risk: **62 (HIGH)**. Alert fires: **Injector Degradation · action window 4–8 hours.**

The Chief Engineer on the 20:00 watch sees the HIGH alert immediately. He opens System 2.

**Diagnostic AI exchange:** Input — *"Cylinder A8 exhaust running 22 degrees high. Imbalance 19 degrees. Other cylinders normal. Fuel rack position normal. SFOC up 1.8%."*

Retrieved context: MAN B&W maintenance manual Section 8.3 (Injector Inspection), Section 8.4 (Injector Bench Test Procedure), injector wear tolerance table, cylinder balance troubleshooting guide.

Output:
- **Primary:** Injector nozzle wear (Cylinder A8), confidence 81%. Evidence: isolated single-cylinder elevation, normal fuel rack, rising SFOC, 38-tick persistence.
- **Differentials:** Fuel valve needle valve sticking (12%), exhaust valve degradation (7%).
- **Recommended actions:** (1) Bench-test A8 injector (45 min, no shutdown). (2) Replace if opening pressure < 280 bar (3.5 hrs, planned shutdown).
- **Parts:** A8 injector nozzle set, injector O-ring set. Both flagged as VERIFIED against indexed inventory.
- **RPN:** Severity 6 × Occurrence 4 × Detectability 2 = 48 (moderate, manageable).

**Outcome:** Spare injector confirmed in stores. Planned replacement during next port call (16 hours away). Job completed in 3.5 hours alongside port activities. Post-replacement exhaust spread returns to baseline within 2 operating hours. No unplanned deviation. No off-hire. No emergency procurement.

### 7.2 Lube Oil System Failure — Imminent Shutdown Prevented

**Situation:** The vessel has been operating normally at 72% load. At 03:40, the LO filter differential pressure sensor (ME.LOFilterDP) begins rising — from the baseline value of approximately 0.14 bar at this operating point toward 0.60 bar over 8 minutes. Simultaneously, LO pressure begins a slow decline: 5.9 bar → 5.7 bar → 5.4 bar.

**System response:** The LO filter DP deviation fires a physics finding: *"LO filter DP +0.46 bar vs expected 0.14 bar."* The lube pressure deviation is now: lubeDev = −0.52 bar (5.4 bar actual vs. 5.92 bar expected at this operating point). lubeRate = −0.038 bar/min over the last 5 ticks.

Lube system failure pattern check: lubeDev < −0.4 bar ✓ · lubeRate < −0.05 bar/min — **NOT YET MET** (−0.038). Status: **WARNING (32).** Evidence: *"Lube pressure −0.52 bar vs expected 5.92 bar · LO filter DP elevated."*

At 03:53, LO pressure is 4.93 bar. lubeRate has steepened to −0.062 bar/min. Pattern conditions: lubeDev < −0.4 bar ✓ · lubeRate < −0.05 bar/min ✓. Pattern alert fires: **Lube System Failure · action window: Immediate.** 

Simultaneously — LO pressure 4.93 bar < 5.0 bar. **L2 safety override activates.** Risk forced to minimum 85 regardless of AI score. Status: **CRITICAL.**

Alert text: *"[L2 ALARM] LO pressure 4.93 bar < 5.0 bar limit. Safety override activated. Immediate action: Check LO duplex filter. Reduce engine load if pressure continues falling."*

The alarm activates on the bridge and in the engine control room. The duty engineer reaches the ECR within 90 seconds.

**Outcome:** LO duplex filter is on the port side element. The engineer switches to starboard element while the port element is removed and inspected: completely blocked filter element, consistent with rapid contamination (later identified as disintegrating LO cooler gasket material). Port element replaced, filter housing cleaned, back in service. LO pressure recovers to 5.7 bar within 4 minutes.

Total elapsed time from L2 alarm to pressure recovery: 11 minutes. LO pressure at its lowest point: 4.87 bar — 0.87 bar above the L4 shutdown threshold of 4.0 bar. The developing fault was detected at WARNING status (lubeDev −0.52 bar) approximately 6 minutes before the L2 hard alarm would have fired on the CAMS alone — time that compressed the response window and gave the duty engineer context (LO filter DP elevated) that the CAMS alarm alone would not have provided.

### 7.3 Cooling Fouling — Planned Maintenance at Next Port

**Situation:** Over a 96-hour passage in the South China Sea in August, all 20 cylinder exhaust temperatures have been drifting upward. The drift is gradual — approximately 0.5°C per hour on average — making it invisible to the CAMS (which will not alarm until the mean exhaust crosses 455°C, a value the engine is still well below). The jacket cooling outlet has risen from 78.4°C to 86.1°C. SFOC has risen from 192.4 g/kWh to 201.8 g/kWh. The coolingEff factor computed by the system has declined from 1.00 to 0.91.

**System response:** On Day 2, the cooling fouling pattern evaluates: all cylinders elevated > 5°C ✓ · jacketDev > 5°C (86.1 − 82.3 expected = +3.8°C) — **NOT YET MET.** Risk: WARNING, driven by cooling persistence and SFOC deviation.

On Day 3, jacketDev has reached +7.2°C. coolingEff = 0.91, deviation = −0.09. Pattern: cylsAllRising > 5°C ✓ · jacketDev > 5°C ✓ · coolingEff < −0.08 ✓. Alert fires: **Cooling Fouling · action window: Next port.**

Risk score: 41 (WARNING). Evidence: *"Cooling efficiency 91.0% — all temps elevated. Mean cylinder deviation +7.1°C. Jacket outlet +7.2°C vs expected. SFOC +9.4 g/kWh vs expected."*

**Diagnostic AI:** The Chief queries System 2: *"All cylinders running high. Jacket outlet 86 degrees, normally around 79. SFOC 3% above normal. No single cylinder standing out."*

Retrieved context: Shell & tube heat exchanger maintenance section, cooling water treatment log review, HX cleaning procedure, biofouling risk assessment for tropical operation.

Output:
- **Primary:** Cooling water side biofouling of main engine jacket water cooler (HX), confidence 74%. Evidence: all-cylinder elevation (systematic, not localised), jacket outlet elevated, SFOC rise proportional to cooling efficiency loss. Tropical anchorage (last port: Singapore) elevates biofouling probability.
- **Differentials:** Coolant quality degradation / scaling (19%), reduced seawater flow (7%).
- **Recommended actions:** (1) Review cooling water treatment log — check inhibitor concentration (30 min, no shutdown). (2) Mechanical or chemical cleaning of jacket water cooler at next port (6–8 hrs, shutdown).
- **Parts/consumables:** HX cleaning chemical (descaler/biocide formulation), replacement HX gasket set as precaution.
- **RPN:** Severity 4 × Occurrence 5 × Detectability 3 = 60 (moderate, plan within 72 hours).
- **Work order draft:** Pre-populated with fault description, HX cleaning procedure reference, estimated 7 hours, required skills, safety notes.

**Outcome:** Chemical cleaning of the jacket water cooler is scheduled and completed at next port (38 hours away). CoolingEff returns to 0.97 within 12 hours of departure. SFOC returns to baseline within 24 hours. The 9.4 g/kWh SFOC excess over 96 hours at 5,113 kW represents approximately 2.1 MT of excess HFO consumption — at $500/MT, approximately $1,050 in avoidable fuel cost, plus any charterer SFOC warranty implication. The cooler cleaning costs approximately $800 in materials and crew time. Net benefit of early detection: measurable even for a single voyage.

---

## 8. Phases and Timeline

### Phase 1 — Foundation (Completed, April 2026)

The foundational architecture is complete and operational.

**Delivered:**
- Complete TypeScript monorepo: 6 packages (simulator, ingestion, features, knowledge, decision, UI) plus shared interfaces and database schema
- Physics-based engine simulator calibrated to 885 RPM / 61.37% load operating point, with three seeded fault types (injector degradation, lube system failure, cooling fouling) exhibiting realistic progressive severity growth
- Three-layer AI decision engine: PHYSICS layer (per-sensor and per-cylinder deviation scoring), STATISTICS layer (30-tick rolling window, 5-point rate regression), RULES layer (fault pattern matching with persistence gating)
- 9 primary sensors + 6 extended sensors with calibrated baseline equations
- 20 per-cylinder exhaust temperature channels with real CYL_SPREAD calibration data
- Living baseline system with versioned curve history, mandatory provenance tracking, and mathjs-based equation evaluation
- Sensor observation period gate (30-day requirement with baseline prerequisite)
- Dependency map with real correlation coefficients for cross-sensor fault classification
- Safety override layer mapped to Kongsberg K-Chief alarm group 2400 (L1–L4 escalation)
- Operator feedback loop (CONFIRM / FALSE POSITIVE with threshold recommendation engine)
- PostgreSQL + TimescaleDB schema with hypertable partitioning
- React 18 + Vite dashboard with 7 pages (Dashboard, Deviations, Table, Alert Analytics, Knowledge Base, Baseline Editor, Management)
- OPC-UA client implementation (`node-opcua`), tag map for 30 sensor node IDs, `IDataSource` abstraction

### Phase 2 — Production Hardening (In Progress → Complete July 2026)

**Scope:**
- OPC-UA hardware integration testing against real K-Chief hardware (shipyard or simulator environment)
- Extended fault pattern library: expand from 3 seeded patterns to 15+ covering turbocharger fouling, fuel valve failure, charge air cooler fouling, bearing degradation, exhaust valve burn-through, and auxiliary system faults
- Alert and decision persistence to database (currently in-memory per session)
- Baseline regression tooling: Python utility to fit new curve coefficients from historian CSV exports, producing a new `BaselineCurve` entry ready for import
- Operator authentication and role management (Chief Engineer vs. Watch Officer permissions)
- REST API for alert export to CMMS (AMOS / ShipNet / Danaos) via standard JSON format
- Comprehensive unit and integration test suite for the decision engine

**Key milestone: July 2026** — System 1 ready for pilot deployment on a live vessel.

### Phase 3 — System 2 Development (June 2026 → October 2026)

**Scope:**
- FastAPI backend scaffolding with REST and streaming SSE endpoints
- Manual ingestion pipeline: PDF/DOCX → OCR → semantic chunking → metadata enrichment → ChromaDB indexing
- Hybrid BM25 + dense retrieval with cross-encoder reranking (top-20 → top-5)
- LLaMA 3.1 8B Q4 deployment via Ollama on vessel-grade server hardware
- Structured output schema implementation with Pydantic + instructor validation
- ISO 14224 failure mode taxonomy mapping and FMEA RPN scoring library
- K-Chief alarm code cross-reference (pre-loaded for K-Chief 2400 group codes)
- Initial knowledge base: MAN B&W and Wärtsilä maintenance manual corpus for primary engine family
- Part number verification against indexed corpus
- Basic web UI for engineer symptom entry and diagnostic output display

**Key milestone: October 2026** — System 2 alpha deployed alongside System 1 pilot vessel.

### Phase 4 — Integration and Fleet Deployment (November 2026 → Q1 2027)

**Scope:**
- Unified UI: seamless handoff from System 1 PDM alert to System 2 diagnostic session (one click from alert panel to pre-populated diagnostic query)
- Multi-vessel fleet management dashboard: aggregate risk view, cross-vessel pattern performance, fleet-wide alert trends
- Two-way CMMS integration: work orders created in System 2 appear in AMOS/ShipNet automatically; work order closure feeds back against the originating PDM alert
- Regulatory reporting module: CII/SEEMP Phase III continuous SFOC tracking, PMS audit trail export for class surveys
- Full operational documentation and crew training materials
- Commercial deployment on 3–5 pilot vessels with active fleet operator

**Key milestone: Q1 2027** — Multi-vessel fleet deployment. Commercial operation begins.

---

## 9. Competitive Differentiation

The predictive maintenance landscape for maritime contains three categories of existing solutions. None provides what MarineGPT provides.

**Category 1: CAMS / SCADA (Kongsberg K-Chief, ABB Ability, Wartsila NACOS)**
These are the installed base. They are excellent at what they are designed to do — monitoring hard limits and providing a reliable alarm response. They do not do: physics-aware baseline comparison, trend analysis, statistical anomaly detection, fault pattern matching, or conversational diagnosis. They alarm reactively, when damage is already developing.

**Category 2: OEM Condition Monitoring Services (MAN PrimeServ Remote Diagnostic, Wärtsilä Expert Insight)**
These services apply analytics to uploaded engine data and produce periodic condition reports. They require: continuous satellite connectivity, data transmission to OEM servers (data sovereignty concern), OEM-proprietary sensor interfaces, and separate subscription fees per engine brand. Their diagnostic outputs are emailed reports, not real-time dashboard data. They cover only their own engine family, and their baselines are fixed to OEM-general specifications — not calibrated to the specific vessel's sea trial data.

**Category 3: Generic Industrial AI / Predictive Maintenance Platforms (Aspentech Aspen Mtell, C3.ai, SparkCognition)**
These platforms are enterprise-grade and capable. They are also: extremely expensive to deploy (professional services costs in the hundreds of thousands), not designed for maritime-specific physics, not equipped with marine equipment fault libraries, not integrated with K-Chief / OPC-UA data structures, and not equipped with conversational diagnostic capability.

| Capability | MarineGPT | OEM Cloud Services | Generic CAMS | Industrial AI Platforms |
|-----------|-----------|-------------------|-------------|------------------------|
| Real-time physics-aware baseline | Yes | Partial (OEM general) | No (fixed thresholds) | Varies |
| Load / RPM adaptive scoring | Yes | No | No | No |
| Living baseline (sea trial refinement) | Yes | Limited | No | No |
| Operator feedback loop | Yes (self-calibrating) | No | No | No |
| No cloud dependency | Yes | No | Yes | No |
| OPC-UA native | Yes | Proprietary | Yes | Varies |
| Multi-OEM engine support | Yes | No (OEM-only) | Yes | Yes |
| Conversational diagnostic AI | Yes (System 2) | No | No | No |
| ISO 14224 structured output | Yes | No | No | No |
| Full loop: detection → diagnosis → work order | Yes | No | No | No |
| Explainable evidence chain | Yes (3-layer, verbatim) | Black box | N/A | Black box |
| On-premise LLM | Yes (LLaMA 3.1 8B) | No | No | No |

**The differentiating statement:** MarineGPT is the only system that covers the complete maintenance intelligence loop — automated physics-based fault detection, real-time operator-facing evidence chain, conversational AI-guided investigation against vessel-specific manual content, structured work order output, and CMMS integration — in a single platform that operates without cloud dependency, improves over time through operator feedback, and works with any OEM engine.

---

## 10. Business Value and ROI

### 10.1 Downtime Avoidance

The primary value proposition of any predictive maintenance system is the prevention of unplanned downtime events. The numbers involved are large.

A single unplanned main engine failure requiring emergency port call on a Capesize bulk carrier in commercial service generates:
- Off-hire revenue loss: 4–7 days × $30,000–$45,000/day = **$120,000–$315,000**
- Emergency port call fees: $15,000–$40,000
- Class surveyor attendance: $5,000–$15,000
- Emergency part freight (if parts not in stores): $5,000–$20,000
- Cargo claim exposure (depending on charter terms): variable

Total cost per incident: **$145,000–$390,000**, conservatively.

Industry data consistently shows that structured predictive maintenance programmes reduce unplanned downtime events by 25–40%. Applied conservatively at 25%:

- A 10-vessel fleet experiencing 4 main engine events per year (historically) → 3 events per year with the platform
- 1 avoided event per year × $145,000 minimum cost = **$145,000 annual value**
- On a 10-vessel fleet: **$1.45M annual downtime cost avoidance** at minimum conservatism

At the 40% reduction rate: **$2.3M annual savings** on the same 10-vessel fleet.

### 10.2 Fuel Efficiency

SFOC is monitored continuously. The cooling fouling use case (Section 7.3) illustrated a real and quantifiable fuel impact: a 9.4 g/kWh SFOC excess at 5,113 kW over 96 hours represents approximately 2.1 MT of excess HFO at $500/MT = $1,050 per voyage leg. Early detection limits the fouling period; undetected fouling compounds over a full charter period.

More systematically: a 1% SFOC improvement on a 5,113 kW engine running at 65% average load for 6,000 operating hours per year:

```
Fuel consumption reduction: 5,113 × 0.65 × 6,000 × 0.01 × (190 g/kWh ÷ 1,000,000) = ~19 MT HFO/year
Fuel saving at $500/MT HFO: ~$9,500/year per vessel
```

Across a 10-vessel fleet, a 1% SFOC improvement sustained through early cooling and combustion fault detection: **$95,000 annual fuel saving.** This scales significantly with fuel price and fleet size.

The SFOC tracking also feeds directly into IMO CII (Carbon Intensity Indicator) calculations for SEEMP Phase III compliance, with a direct regulatory benefit to CII rating.

### 10.3 Crew Efficiency and Knowledge Retention

A Chief Engineer earning $8,000–$12,000 per month spends a meaningful fraction of sea time on manual log analysis and reactive fault investigation. The diagnostic AI reduces the time from symptom observation to structured repair plan from hours (manual search through OEM documentation, consultation with colleagues, remote OEM support call) to minutes. That is not an efficiency argument — it is a safety argument. Faster, more confident diagnosis means faster response, and faster response is the primary driver of fault containment before it becomes shutdown-forcing.

On the knowledge retention front: every fault pattern that is confirmed by an operator becomes part of the knowledge base. Every diagnostic session in System 2 is logged with the engineer's symptom description, the retrieved manual sections, and the output. This creates an institutional record of diagnostic decisions that persists independent of crew turnover. The knowledge held by the current Chief Engineer does not leave with them — it is captured in the pattern library and the diagnostic session history.

### 10.4 Class Society Compliance and Regulatory Value

IMO SEEMP Phase III (effective 2023, with increasing enforcement through 2026) requires vessels to maintain a continuous operational Carbon Intensity Indicator (CII) below their assigned annual rating. SFOC tracking is a direct input to CII calculation. The platform provides continuous SFOC monitoring against a physics-based baseline, making CII data available at voyage-resolution rather than relying on fuel consumption estimates from bunker receipts.

The complete audit trail — every alert, every evidence chain, every baseline curve change, every operator feedback decision, with timestamps — provides class surveyor-ready documentation for Enhanced Survey Programme (ESP) audits and condition monitoring credit applications. Class societies (DNV, Lloyd's Register) are actively developing frameworks for crediting operators who demonstrate data-driven continuous condition monitoring. The platform's audit trail is directly aligned with this direction.

### 10.5 Commercial Model

OEM condition monitoring services are currently priced at $50,000–$150,000 per vessel per year, with multi-year contracts and OEM lock-in. This establishes market willingness to pay for ship-level condition monitoring intelligence.

MarineGPT's on-premise model enables a different pricing structure: a one-time deployment and integration fee (per vessel) plus an annual support and update subscription covering pattern library updates, model updates, and technical support. This is structurally more attractive to operators who are sceptical of recurring cloud costs and data sovereignty implications.

Fleet licensing compounds the value: the multi-vessel dashboard, cross-fleet pattern sharing, and fleet-level reporting features become more valuable with each additional vessel. This creates natural expansion revenue within existing fleet operator relationships.

---

## 11. Future Roadmap

### Near-Term (Q4 2026 – Q2 2027)

**Expanded fault pattern library (target: 25+ patterns).** Beyond the 3 seeded patterns, the fault library will cover: turbocharger fouling (charge air cooler), turbocharger bearing failure, fuel valve sticking, exhaust valve degradation, charge air cooler leakage, intercooler biofouling, bearing oil feed restriction, cylinder liner wear (via SFOC progression modelling), and piston ring blowby.

**Automated baseline regression tooling.** A Python utility that accepts historian CSV exports (from OSIsoft PI, Yokogawa, or any time-series export), identifies stable operating points, runs weighted regression against the target equations, and produces a new `BaselineCurve` JSON file ready for import. This eliminates manual coefficient entry and makes sea-trial recalibration a routine 20-minute procedure rather than an engineering project.

**Fleet-wide pattern sharing.** When an injector degradation pattern fires and is confirmed on three vessels of the same class within a 90-day window, the pattern's prior probability is elevated fleet-wide — and fleet managers are notified. This is the early signal for a systemic issue: an injector batch quality problem, a fuel quality issue affecting a specific trading route, or a maintenance procedure that is consistently under-specified.

**Mobile companion app.** An Engine Room Notebook replacement: structured log entry (rounds, readings, observations), sensor gauge popup for quick spot-check, alert acknowledgement, and access to diagnostic AI from a handheld device in the machinery space.

### Medium-Term (Q3 2027 – Q1 2028)

**Two-way CMMS integration.** Work orders generated in System 2 flow directly into AMOS, ShipNet, or Danaos with full field population. When the work order is closed in the CMMS, the closure is reflected against the originating PDM alert — completing the loop and providing a closed-loop reliability dataset for pattern refinement.

**Remaining Useful Life (RUL) estimation.** Once sufficient historical fault progression data is accumulated from confirmed fault events (injector wear rates, bearing degradation curves, cooling fouling accumulation rates), degradation trajectory modelling will produce time-to-failure estimates for slow-developing faults. An injector showing a consistent +0.28°C/min rate can be projected to reach the alarm threshold in a calculable timeframe — giving planned maintenance scheduling a data-driven input.

**Multi-engine support.** Extend coverage from the main propulsion engine to the full machinery space: auxiliary engines (diesel generators), shaft generator, bow thruster, emergency fire pump. The architecture already supports multiple independent engine instances; the knowledge base and pattern library require extension.

**Class society approval pathway.** Engagement with DNV and Lloyd's Register toward type approval or Recognition in Principle (RIP) for the condition monitoring system, opening the way for class survey credits and reduced dry-docking interval eligibility.

### Long-Term (2028+)

**Fleet-level AI.** Aggregate sensor data across entire fleets to identify systematic effects invisible at the individual vessel level: the impact of specific fuel supply chains on SFOC across multiple vessels, the performance delta between two hull coating types on sister ships, the maintenance interval optimisation for a specific engine variant across the whole class. This is the data product that fleet managers need but cannot currently build — they have the data, but not the analysis infrastructure.

**Digital twin integration.** A full 3D model of the engine linked to live sensor data, enabling visual fault localisation: highlight the specific cylinder, turbocharger, or cooler associated with the active alert. This reduces the cognitive load on the duty engineer when receiving an alert, particularly for officers who are relatively new to the specific engine type.

**CII/SEEMP reporting automation.** Direct generation of SEEMP-compliant voyage reports, CII calculation with supporting SFOC data, and pre-populated reporting templates for flag state and class submission. Remove this administrative burden from the operator entirely.

---

## 12. Conclusion

The maritime predictive maintenance problem is not a data problem. Modern vessels generate abundant sensor data. It is not a connectivity problem — OPC-UA provides standardised real-time access to that data. It is not a computational problem — the processing requirements of the decision engine described in this document are negligible on any server hardware manufactured in the last decade.

It is a reasoning and knowledge problem. The sensor data exists; the physics knowledge to interpret it exists; the maintenance procedures to act on it exist in OEM manuals. What has been missing is a system that brings these three things together in real time, presents its reasoning transparently, operates without cloud dependency, learns from operator feedback, and extends from automated monitoring all the way to structured work order output.

MarineGPT addresses all of these gaps in a single coherent architecture.

The living baseline is not just a technical feature — it is a strategic asset that compounds in value over the vessel's operational life. An OEM baseline equation is accurate to ±5–8% across the operating envelope. A sea-trial-calibrated baseline is accurate to ±2–3%. A baseline refined by 18 months of operational data and operator feedback is accurate to ±1–1.5%. At that precision, the difference between normal variability and a developing fault that will become an alarm within 4 hours is detectable, consistently. That precision is not achievable with a fixed-threshold CAMS, an OEM cloud service, or an AI system that lacks the domain-specific physics grounding this platform provides.

The evidence chain is not just a UI feature — it is the mechanism by which an experienced Chief Engineer can trust the system. The system does not ask engineers to accept its conclusions. It shows its working: *here is the deviation, here is the trend, here is the pattern condition that matched, here is the confidence calculation.* The engineer can agree, disagree, or investigate further. That relationship — human oversight of AI reasoning, not AI replacement of human judgment — is the design that makes predictive maintenance systems actually used, rather than ignored.

The platform is ready. The technology is mature. The commercial case is quantifiable. The next step is deployment.

---

## Appendix A — Sensor Reference Table

Full sensor reference for the 15 primary + extended sensors. Per-cylinder temperatures (ME.Cyl1–ME.Cyl20) share the exhaust temp physical range and use individual baseline equations derived from the mean exhaust equation plus CYL_SPREAD offset.

| Tag ID | Display Name | Unit | Phys Min | Phys Max | Pre-Alarm (L1) | Alarm (L2) | Slowdown (L3) | Shutdown (L4) |
|--------|-------------|------|---------|---------|----------------|-----------|--------------|--------------|
| ME.RPM | Main Engine RPM | RPM | 0 | 850 | — | 765 overspeed | — | — |
| ME.Load | Engine Load | % | 0 | 110 | — | 100 | — | — |
| ME.ExhaustTemp | Mean Exhaust Temp | °C | 150 | 510 | 530 | 455 (L2 hi), 200 (L2 lo) | 560 | 575 |
| ME.LubeOilPressure | Lube Oil Pressure | bar | 1.5 | 7.0 | 5.5 lo | 5.0 lo, 6.0 hi | 4.5 lo | 4.0 lo |
| ME.FuelRack | Fuel Rack Position | mm | 0 | 115 | — | 100 | — | — |
| ME.ScavengeAirPressure | Scavenge Air Pressure | bar | 0 | 4.5 | — | 3.2 hi, 0.5 lo | — | — |
| ME.TCSpeed | Turbocharger Speed | RPM | 0 | 22,000 | 24,000 | 18,500 | — | 28,500 |
| ME.JacketCoolingOutlet | Jacket Cooling Outlet | °C | 50 | 102 | 87 | 90 | 93 | 97 |
| ME.SFOC | Specific Fuel Oil Consumption | g/kWh | 155 | 240 | 210 | 218 | — | — |
| ME.ChargeAirTemp | Charge Air Temperature | °C | 15 | 90 | 72 hi | 78 hi, 25 lo | — | 85 hi |
| ME.FuelOilPressure | Fuel Oil Pressure | bar | 3.0 | 12.0 | 5.5 lo | 5.0 lo, 10.5 hi | — | 3.5 lo |
| ME.FuelOilTemp | Fuel Oil Temperature | °C | 20 | 55 | 45 | 50 hi, 25 lo | — | — |
| ME.LOFilterDP | LO Filter Differential Pressure | bar | 0 | 2.0 | 0.8 | 1.2 | — | 1.8 |
| ME.PistonCoolingPress | Piston Cooling Oil Pressure | bar | 2.0 | 10.0 | 4.5 lo | 4.0 lo, 8.5 hi | — | 3.0 lo |
| ME.ShaftPower | Shaft Power | kW | 0 | 6,000 | — | 5,500 | — | — |

Engine MCR: **5,113 kW** at 100% load. Nominal calibration point: **885 RPM / 61.37% load** (3,138 kW shaft power).

---

## Appendix B — Fault Pattern Specifications

The three seeded fault patterns in full detail. The pattern library is extensible — additional patterns are added via the Knowledge Base management interface or directly via the seed utility.

### Pattern 1: Injector Degradation

| Field | Value |
|-------|-------|
| Pattern ID | `injector_degradation` |
| Condition 1 | `cylDev` deviation `>` **20°C** (any cylinder deviation above baseline) |
| Condition 2 | `cylRate` rate `>` **0** (cylinder temperature is rising) |
| Condition 3 | `cylImbalance` imbalance `>` **15°C** (spread across 20 cylinders) |
| Action window | **4–8 hours** |
| Affected tags | ME.Cyl1–ME.Cyl6.ExhaustTemp (extendable to all 20) |
| Feedback mechanism | CONFIRMED increments `timesConfirmed`; FALSE_POSITIVE increments `timesFalsePositive`. Threshold review suggested when FP rate > 30%. |

**Physical interpretation:** A worn injector nozzle allows excessive fuel flow through enlarged orifices, producing higher combustion temperatures in that cylinder. The deviation must be rising (not a stable offset, which would suggest a sensor drift) and must produce visible cylinder-to-cylinder imbalance. The 4–8 hour window reflects that the injector can typically operate through the current watch before requiring attention.

### Pattern 2: Lube System Failure

| Field | Value |
|-------|-------|
| Pattern ID | `lube_system_failure` |
| Condition 1 | `lubeDev` deviation `<` **−0.4 bar** (LO pressure below expected by 0.4 bar or more) |
| Condition 2 | `lubeRate` rate `<` **−0.05 bar/min** (LO pressure falling at more than 0.05 bar per minute) |
| Action window | **Immediate** |
| Affected tags | ME.LubeOilPressure |
| Safety override | L2 hard limit at 5.0 bar; L3 at 4.5 bar; L4 at 4.0 bar — override fires regardless of AI pattern match. |

**Physical interpretation:** Both conditions together distinguish a genuine system failure (pressure below expected AND actively declining) from a normal low-pressure episode at light load or after a load change. The rate condition is critical: a static deviation might be a calibration issue, but a declining rate indicates active fluid loss, blockage, or pump performance degradation.

### Pattern 3: Cooling Fouling

| Field | Value |
|-------|-------|
| Pattern ID | `cooling_fouling` |
| Condition 1 | `cylsAllRising` deviation `>` **5°C** (ALL 20 cylinders elevated above their individual baselines by more than 5°C) |
| Condition 2 | `jacketDev` deviation `>` **5°C** (jacket cooling outlet above expected) |
| Condition 3 | `coolingEff` deviation `<` **−0.08** (cooling efficiency factor dropped more than 8% below nominal 1.0) |
| Action window | **Next port** |
| Affected tags | ME.ExhaustTemp, ME.JacketCoolingOutlet, ME.SFOC, ME.CoolingEfficiency |

**Physical interpretation:** Fouling of the jacket water cooler reduces the heat transfer efficiency of the cooling circuit. The result is that all combustion temperatures rise together — unlike injector degradation where a single cylinder is affected. The three-condition gate ensures the pattern does not fire on localised anomalies or short-term load transients: all 20 cylinders must be simultaneously elevated, the jacket outlet must confirm the cooling circuit is under-performing, and the cooling efficiency factor (computed from the relationship between load and temperature) must show a persistent degradation.

---

## Appendix C — Physics Baseline Equations

The 13 target equations implemented in the physics simulator (`packages/simulator/src/physics.ts`), calibrated to 885 RPM / 61.37% load. These are the high-fidelity equations used by the simulator. The baseline store equations (from `seed.ts`) are simplified forms of these, suitable for real-time evaluation against live sensor data.

| Sensor | Simulator Target Equation | Lag Alpha (α) | Noise Amplitude |
|--------|--------------------------|--------------|----------------|
| Exhaust Temp | `(350 + load × 2.3 + (rpm/700) × 16) / coolingEff` | 0.08 | ±1.5°C |
| LO Pressure | `5.6 + (rpm/700) × 1.4 − load × 0.004 − lubeFault × 2.5` | 0.05 | ±0.05 bar |
| Fuel Rack | `18 + load × 0.62 + (rpm − 600) × 0.02` | 0.12 | ±0.3 mm |
| Scavenge Air | `1.0 + (load/100) × 2.0 + (rpm/700) × 0.45` | 0.10 | ±0.025 bar |
| TC Speed | `9000 + load × 100 + (rpm − 600) × 20` | 0.06 | ±100 RPM |
| Jacket Outlet | `(62 + load × 0.26) / coolingEff` | 0.04 | ±0.3°C |
| SFOC | `190 + (100 − load) × 0.38 + (700 − rpm) × 0.08 + (1 − coolingEff) × 18` | 0.03 | ±0.8 g/kWh |
| Cyl Temp (i) | `exhaustTemp + CYL_SPREAD[i] + injFaults[i] × 55` | 0.08 | ±1.5°C |
| Charge Air Temp | `29.5 + (rpm/700) × 2.5 + load × 0.18` | 0.06 | ±0.4°C |
| Fuel Oil Pressure | `6.0 + load × 0.018` | 0.08 | ±0.08 bar |
| Fuel Oil Temp | `29.5 + (rpm/700) × 2.5` | 0.04 | ±0.15°C |
| LO Filter DP | `0.08 + (rpm/700) × 0.09 + lubeFault × 0.8` | 0.05 | ±0.008 bar |
| Piston Cooling Press | `3.7 + (rpm/700) × 2.1` | 0.05 | ±0.06 bar |

**Lag application:** `lagged_value = previous + α × (target − previous)`. The lag alpha determines how quickly the sensor responds to a step change in the underlying physical quantity — exhaust temperature with α=0.08 responds slowly (realistic thermal inertia), while fuel rack with α=0.12 responds faster (mechanical response). This exponential lag model is applied per-tick, giving realistic transient behaviour.

**Verification at calibration point (885 RPM, 61.37% load, coolingEff=1.0):**

| Sensor | Predicted | Notes |
|--------|-----------|-------|
| Exhaust Temp | **504.0°C** | Matches real engine data |
| LO Pressure | **7.21 bar** | Matches real engine data |
| Charge Air | **2.79 bar** (scavenge) | Matches real engine data |
| Jacket Outlet | **77.76°C** | Matches real engine data |

---

## Appendix D — Risk Score Reference

### Score-to-Status Mapping

| Risk Score | Status | Dashboard Colour | Operator Action |
|-----------|--------|-----------------|-----------------|
| 0–24 | NORMAL | Green | No action required |
| 25–49 | WARNING | Amber | Monitor; investigate if trend continues |
| 50–74 | HIGH | Orange | Investigate promptly; prepare maintenance action |
| 75–99 | CRITICAL | Red | Immediate investigation required |
| 100 | CRITICAL (Override) | Red + flash | Hard safety limit breached; follow K-Chief alarm procedure |

### Load-Adaptive Risk Weights

| Load Range | w_dev | w_trend | w_persist |
|-----------|-------|---------|-----------|
| High: > 80% | 0.35 | 0.30 | 0.35 |
| Normal: 40–80% | 0.40 | 0.25 | 0.35 |
| Low: < 40% | 0.25 | 0.35 | 0.40 |

### Persistence Score Lookup

| Consecutive Ticks Anomaly Met | scorePersist |
|------------------------------|-------------|
| > 8 | 100 |
| 5–8 | 60 |
| 3–4 | 30 |
| 1–2 | 0 |

### Example Risk Calculation

Scenario: Exhaust temp 527°C, expected 505°C, rate +0.35°C/min, 22 consecutive ticks, load 67%:

```
devNorm = |527 − 505| / 505 = 0.0436
scoreDev = min(100, 0.0436 × 200) = 8.71

rateNorm = 0.35 / (505 × 0.001) = 0.693
scoreTrend = min(100, 0.693 × 150) = 10.39

scorePersist (22 ticks > 8) = 100

Weights at 67% load: dev=0.40, trend=0.25, persist=0.35

Risk = 0.40×8.71 + 0.25×10.39 + 0.35×100
     = 3.48 + 2.60 + 35.0
     = 41.1 → WARNING
```

---

## Appendix E — Glossary

| Term | Definition |
|------|-----------|
| **CAMS** | Computerised Alarm and Monitoring System. The onboard automation platform that monitors sensors and raises alarms against fixed thresholds. Examples: Kongsberg K-Chief, ABB Ability, Wartsila NACOS. |
| **CII** | Carbon Intensity Indicator. An IMO metric (g CO₂ per capacity-mile) used to rate a vessel's carbon efficiency under SEEMP Phase III. Continuous SFOC monitoring is a key input. |
| **CMMS** | Computerised Maintenance Management System. Software used to manage planned and corrective maintenance records, work orders, and spare parts. Examples: AMOS, ShipNet, Danaos Planned Maintenance. |
| **coolingEff** | Cooling Efficiency Factor. A dimensionless parameter (nominal 1.0) derived from the ratio of observed to expected cooling performance. Values below 1.0 indicate cooler fouling; values below 0.92 trigger the Cooling Fouling pattern. |
| **CYL_SPREAD** | The array of per-cylinder exhaust temperature offsets from the engine mean, derived from real engine data at 885 RPM / 61.37% load. Encodes the natural manufacturing variation of the specific engine build. |
| **FMEA** | Failure Mode and Effects Analysis. A structured methodology for identifying potential failure modes, their effects, and risk priority. RPN = Severity × Occurrence × Detectability. |
| **IDataSource** | The TypeScript interface that abstracts the engine data source. Implemented by both `SimulatorEngine` (development) and `OPCUADataSource` (production), making the entire AI stack source-agnostic. |
| **ISO 14224** | International standard defining a taxonomy for equipment reliability and maintenance data in the oil, gas, and petrochemical industries — widely adopted in maritime. Defines failure modes, mechanisms, causes, detection methods, and consequence classes. |
| **LLM** | Large Language Model. A neural network trained on large text corpora capable of generating and reasoning about natural language. System 2 uses LLaMA 3.1 8B, a 8-billion parameter open-source LLM, deployed locally via Ollama. |
| **MCR** | Maximum Continuous Rating. The maximum sustained output power of a marine engine. The calibration engine has an MCR of 5,113 kW. |
| **OPC-UA** | Open Platform Communications Unified Architecture. A machine-to-machine communication protocol standard widely adopted in industrial automation. Used by Kongsberg K-Chief and other CAMS to expose sensor data to external systems. |
| **RAG** | Retrieval-Augmented Generation. An LLM architecture where relevant documents are retrieved from a knowledge base and provided as context to the LLM before generation. Ensures outputs are grounded in retrieved source material rather than LLM training data. |
| **RPN** | Risk Priority Number. In FMEA: Severity × Occurrence × Detectability, each scored 1–10. RPN > 200: immediate action. RPN 100–200: high priority. RPN 50–100: medium. RPN < 50: low. |
| **SEEMP** | Ship Energy Efficiency Management Plan. IMO-mandated plan (Phase III from 2023) requiring vessels to monitor, report, and continuously improve their carbon efficiency, including SFOC and CII tracking. |
| **SFOC** | Specific Fuel Oil Consumption. Fuel efficiency metric expressed in grams of fuel per kilowatt-hour of shaft power (g/kWh). Baseline at calibration point: approximately 192 g/kWh at 61% load. |
| **TimescaleDB** | A PostgreSQL extension that adds time-series optimizations: automatic hypertable partitioning by time, chunk-based indexing for fast time-range queries, and compression. Used for the `readings`, `features`, and `decisions` tables. |
| **BM25** | Best Match 25. A ranking function for keyword-based document retrieval. In System 2, it provides exact-match retrieval capability for part numbers, fault codes, and technical terms that lack semantic neighborhood in embedding space. |
