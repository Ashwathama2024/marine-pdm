# PMDS Technical Blueprint: Industry-Grade Decision Support
**Project Name:** Predictive Maintenance Decision Support (PMDS) Prototype  
**Target Asset:** MTU 8000 20V M71L Marine Engine  
**Maturity Level:** Level 4 (Decision Support)

---

## 1. Executive Summary
The PMDS is a physics-informed diagnostic framework designed to bridge the gap between raw condition monitoring and operational maintenance command. Unlike generic AI solutions, PMDS utilizes a "Physics-First" architecture, encoding specific machinery relationships and MTU ECS 8000 alarm logic into its core decision-engine.

---

## 2. System Architecture & Topology
The system is a distributed, multi-service application:

### A. The Knowledge API (The Memory)
- **Stack:** Node.js / Express / mathjs.
- **Role:** Stores baseline curves, machinery dependency maps, and the pattern library.
- **Key Logic:** Real-time evaluation of multivariate physics equations to determine "Expected Behaviour."

### B. The Physics-Informed Simulator (The Heart)
- **Stack:** Python / OPC-UA / TypeScript Physics Model.
- **Role:** Generates high-fidelity engine telemetry.
- **Realism Logic:** 
  - **Deterministic Physics:** Calibrated to MTU 8000 commissioning data.
  - **Thermal Inertia:** First-order exponential lag filters simulate physical mass.
  - **Stochastic Observation:** Uniform random noise simulates sensor jitter.

### C. The Decision Engine (The Brain)
- **Stack:** TypeScript.
- **Logic Layers:**
  - **Layer 1 (Physics):** Calibrated MTU 8000 alarm bands.
  - **Layer 2 (Statistics):** Rolling windows, standard deviation, and linear regression rates.
  - **Layer 3 (Rules):** Pattern matching against established mechanical failure modes.

---

## 3. Core Engineering Logic & Features

### 3.1 Expected Behaviour Generation
PMDS uses a **Hybrid Baseline Model**:
- **Bilinear Interpolation:** Translates engineering lookup tables into a continuous grid.
- **Multivariate Equations:** $T_{exh} = f(Load, RPM, CoolingEff)$.
- **Validation Envelopes:** Gated operating ranges to prevent false baselines during transients.

### 3.2 Feature Extraction Formulas
- **Cylinder Imbalance ($i$):** $i = T_i - \bar{T}_{fleet}$.
- **Fault Rate ($R$):** 15-point linear regression scaled to units/minute.
- **Confidence ($C$):** $C = \frac{EvidenceCount}{5} \times Quality \times Strength$.

### 3.3 The Dependency Map (Explicit Causality)
A "hidden ability" that distinguishes PMDS from standard anomaly detection. It encodes machinery relationships (e.g., *Injector → EGT → SFOC*). 
- **Logic:** `areCorrelatedTagsMoving()` prevents misdiagnosis of sensor failures by requiring physically related parameters to move in unison.

---

## 4. Decision Support Hierarchy
The system classifies risk on a [0–100] scale, mapped to four operational states:

1. **NORMAL (< 25):** Continuous monitoring.
2. **WARNING (25–50):** Increased observation; statistical drift detected.
3. **HIGH (50–75):** Maintenance planning required; pattern matched.
4. **CRITICAL (> 75):** Immediate intervention; safety system (SS) overrides active.

---

## 5. SWOT Analysis (Industry Positioning)

### Strengths
- **Physics-First:** Alerts are grounded in mechanical reality, not just statistical outliers.
- **Explainable AI:** Evidence chains clearly state *why* a diagnosis was made.
- **Standardized Output:** Direct mapping to MTU $W$-codes (Work Orders).
- **Sensor Robustness:** Multi-layered defense against drift, spikes, and freezes.

### Weaknesses
- **Closed-Loop Simulation:** Currently lacks a live bi-directional link to a physical engine (Digital Twin gap).
- **Logistics Blindness:** Does not know if spare parts are on board or the ship’s current mission profile.

### Opportunities (Roadmap to Level 5)
- **RUL Estimation:** Projecting current rates to predict Remaining Useful Life.
- **Fleet-Wide Benchmarking:** Comparing cylinder health across multiple vessels.
- **CMMS Integration:** Automated work order generation in systems like AMOS or PlanMaintenance.

### Threats
- **Transient Noise:** Extreme engine maneuvers (e.g., crash astern) can produce momentary "physics violations" if lag filters aren't perfectly tuned.

---

## 6. Functional Scenarios (Validation Matrix)

| Failure Mode | Primary Indicator | Maintenance Task |
| :--- | :--- | :--- |
| **Injector Degradation** | Cylinder Imbalance | W1006 (Replace Injector) |
| **Cooler Fouling** | Global Thermal Rise | W1254 (Clean Cooler) |
| **Lube Pressure Loss** | Rate of Change | W1047 (Check Filter) |
| **Bearing Overtemp** | Local Bearing Heat | W1609 (Replace Shells) |

---

## 7. Technical Conclusion
PMDS represents a high-maturity **Level 4 Decision Support System**. Its ability to transform raw, noisy telemetry into engineering-validated maintenance recommendations makes it an industry-level model for next-generation marine engine management.
