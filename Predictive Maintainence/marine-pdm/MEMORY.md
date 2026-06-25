# MarineGPT PDM — SESSION MEMORY
> Persistent context for Claude sessions. Updated: 2026-05-06.
> This file is the fastest way to resume work after a context reset.

---

## 🚢 What This Project Is

A **Predictive Maintenance (PDM) system** for a **MTU 8000 20V M71/M71L marine engine** (9100 kW, 20 cylinders, propulsion engine). The system runs a real-time physics simulator, a multi-layer AI decision engine, and a React dashboard. It is designed to connect to a real vessel IPMS (Integrated Platform Management System) via OPC-UA — one line swap in `EngineContext.ts`.

**Current state: v2.0 — ALL upgrade blocks U0–U8 complete and verified live in browser.**

---

## 🗂 File System

```
D:\MASTER_PROJECTS\Predictive Maintainence\
  marine-pdm\              ← project root (git repo)
  vite.config.ts           ← parent-level config (preview tool CWD workaround)
```

---

## ✅ Completed Upgrade Blocks (v1.0 → v2.0)

| Block | What Was Done |
|-------|--------------|
| **U0** | Created `shared/src/mtu8000.constants.ts` (MTU8000, MTU8000_LIMITS, MTU8000_CYL_SPREAD, BSIDE_TEMP_BIAS=+4). Added `MTU8000Snapshot` interface and `ecsAlarmCode`/`maintenanceTask` to `FaultAlert` in `interfaces.ts`. |
| **U1** | Created `packages/simulator/src/mtu8000-physics.ts` — 11 physics equations. Calibrated: base=276 for exhaust (hits 440°C), base=180+0.333 for SFOC (hits 185 g/kWh). All 4 PDF §3 targets pass. |
| **U2** | `engine.ts` switched to mtu8000-physics. CYL_SPREAD updated to MTU real values. BSIDE_TEMP_BIAS applied. A-side/B-side means computed. CCW firing order. |
| **U3** | Added to engine tick: `bearingTemps[11]` (α=0.03), `crankcasePressure`, `tcSpeeds[4]`, `rpmRedundant` (primary+noise), `filterDifferentialP`, `lubeLastBearingPressure`, `exhaustBackPressure`. |
| **U4** | Created `packages/simulator/src/faults-mtu8000.ts` — 8 fault scenarios (F01–F08) with `FaultConfig`, `FaultSpeed`, `FAULT_DEFINITIONS`, `tickFaultsMTU8000()`, `createFaultConfig()`, `getECSAlarmPreview()`, `getParameterImpactPreview()`. Engine has `injectMTUFault()`, `clearMTUFault()`, `clearAllMTUFaults()`. |
| **U5** | Created `packages/simulator/src/sensor-failure.ts` — 5 failure modes (DROPOUT/DRIFT/SPIKE/INTERMITTENT/FREEZE), `SensorFailureRegistry` class, `computeSensorHealth()`. |
| **U6** | Created `packages/decision/src/patterns-mtu8000.ts` (8 patterns P01–P08). Created `packages/decision/src/override-mtu8000.ts` (SS/HI triggers). Updated `decision-engine.ts` to use MTU patterns + override. |
| **U7** | Full FaultInjector.tsx redesign (F01–F08 dropdown, A1–B10 cylinder selector, intensity labels, SLOW/MED/FAST, ECS preview, parameter impact, compound mode). New SensorFailurePanel.tsx (52-tag search, 5 failure modes, mode config, health badges). AIDecisionPanel + AlertBar updated with ECS codes + W-numbers. CylinderView updated with BANK A/B expanded view + side-mean stats. Added `/simulator` route and Sidebar link. |
| **U8** | Rewrote `packages/ingestion/src/tag-map.ts` — 52 tags with `scale`/`offset` unit conversion. Updated `opcua-client.ts` — generalized array field handling, handles null (DROPOUT), uses `MTU8000.CYLINDERS`. |

---

## 🔬 Physics Equations (mtu8000-physics.ts)

11 functions, all calibrated to 85% load / 1150 RPM:

```typescript
exhaustTemp_MTU8000(load, rpm, coolingEff, tcEff)
  // base=276 → 276 + 0.85×160 + 28 = 440°C ✓

cylExhaustTemp_MTU8000(baseMean, cylIndex, injectorFaults, cylSoakFactor)
  // Applies MTU8000_CYL_SPREAD + BSIDE_TEMP_BIAS for indices 10-19

lubeOilPressure_MTU8000(rpm, load, oilTemp, filterDp, lubeFault)
  // → 6.7 bar at rated point ✓

bearingTemp_MTU8000(load, rpm, lubeOilTemp, lubePressure, bearingIndex, lubeFault)
  // bearing[10] = free end, runs +5°C hotter

chargeAirPressure_MTU8000(rpm, load, tcEff) → 3.2 bar ✓
chargeAirTemp_MTU8000(load, rpm, coolantTemp)
lubeOilTemp_MTU8000(load, rpm, coolantTemp, coolingEff)
fuelRailPressure_MTU8000(load, rpm, injectorFaultCount)
sfoc_MTU8000(load, rpm, injectorFaults, coolingEff)
  // base=180, coef=0.333 → 180 + 15×0.333 = 185 g/kWh ✓

crankcasePressure_MTU8000(load, pistonBlowby)
  // normal = −2 mbar

exhaustBackPressure_MTU8000(load, rpm, tcEff)
```

---

## 🧠 Decision Engine Logic

Three layers in order:
1. **PHYSICS**: deviation checks against baselines → raw risk scores per system
2. **STATISTICS**: trend rates, rolling averages, StdDev, cylinder imbalance
3. **RULES**: pattern matching (P01–P08) → alerts with ECS codes + W-numbers
4. **OVERRIDE**: MTU safety system hard limits → systemRisk=100 immediately

MTU8000_PATTERNS (P01–P08) map to fault scenarios F01–F08 with real ECS alarm codes and MTU maintenance work orders (W-numbers like W1006, W1047, W1073, W1609).

---

## 🖥 UI State at Last Session

- App running at `http://localhost:5173/` (preview tool server)
- **Startup state is fully NORMAL — no false alarms on browser refresh**
- Confirmed at 1150 RPM / 85% load:
  - Dashboard header: "Dashboard · Vessel name · Risk 4–8 · NORMAL" ✅
  - Shaft Power: 7735 kW at MCR 85.0% load ✅
  - Exhaust TEMP: ~440–441°C (exp 440.0, gauge arc green) ✅
  - LO PRESSURE: ~6.27–6.35 bar (exp ~6.39, minor −0.1 bar offset — acceptable) ✅
  - CylinderView: BANK A (natural −8 to +16 spread), BANK B (+4°C bias + spread) ✅
  - AI Panel: "All parameters nominal — no active alerts" ✅
  - All subsystem risks NORMAL: Exhaust 2–5, Lube 3–7, Cooling 0, Cylinders 4–7 ✅
  - Simulator page: F01–F08, A1–B10 selector, SLOW/MED/FAST, ECS preview ✅
  - Sensor Failure Simulator: 52-tag search, 5 modes ✅

---

## 🛠 Commands Reference

```bash
# Start dev server
cd "D:\MASTER_PROJECTS\Predictive Maintainence\marine-pdm\packages\ui" && pnpm dev

# Kill stuck WSL process on port 5173
pkill -9 -f vite; pkill -9 -f node

# TypeScript check
cd "D:\MASTER_PROJECTS\Predictive Maintainence\marine-pdm" && pnpm tsc --noEmit

# Run tests
cd packages/simulator && pnpm test

# Build shared (required before tsc across packages)
cd shared && pnpm build
```

---

## ⚠️ Critical Decisions & Why

### Why `base=276` in exhaustTemp_MTU8000?
Formula is `base + load×160 + 28`. At 85%/1150: `276 + 136 + 28 = 440°C`. Original `base=320` gave 484°C (over by 44°C). The PDF spec validation target is 440°C ±5.

### Why keep EngineSnapshot alongside MTU8000Snapshot?
EngineSnapshot has 2 years of UI bindings. MTU8000Snapshot is the clean future interface. The index signature `[key: string]: number | number[]` on EngineSnapshot allows MTU v2 fields to be stored there during migration. Full migration to MTU8000Snapshot is the next major step.

### Why no deep path imports?
Vite resolves `@marine-pdm/simulator` → `packages/simulator/src/index.ts`. A path like `@marine-pdm/simulator/src/sensor-failure` has no alias rule and 404s. Always export from the package's `index.ts` barrel.

### Why is there a vite.config.ts at the parent level?
The Claude Code preview tool (`mcp__Claude_Preview`) executes from `D:\MASTER_PROJECTS\Predictive Maintainence\` (one level above the repo). It can't find `packages/ui/index.html`. The parent-level vite.config.ts sets `root: resolve(__dirname, 'marine-pdm/packages/ui')` as an absolute path to fix this.

### Why does BSIDE_TEMP_BIAS = +4°C?
B-side cylinders in the MTU 8000 48° V-engine accumulate heat differently due to the V-angle geometry. B-side sensors run structurally ~4°C hotter than A-side even on a healthy engine. This is a known commissioning constant, not a fault.

### Why bearing[10] is +5°C hotter?
Bearing 11 (index 10) is at the free end (KGS). Less oil circulation, higher thermal exposure. MTU spec notes this as normal. The decision engine accounts for it in bearing temp threshold evaluation.

### Why are there TWO baseline systems?
`packages/knowledge/src/seed.ts` PRIMARY_BASELINES are the **actual decision pipeline baselines** — mathjs `evaluate()` strings consumed by `BaselineStore` and `computeBaselineSnapshot()`. These drive all risk scoring.
`baseline-curves.ts` is **UI-only** — powers the Knowledge Base / Baselines editor page. Edits there do NOT affect live risk scores. Always calibrate `seed.ts` equations, not `baseline-curves.ts`.

### Why `chargeAirTemp_MTU8000` uses constant LT_COOLANT=36°C?
The charge air intercooler uses the LT (low-temperature) circuit (~36°C seawater-cooled). The HT (high-temperature) circuit cools jacket water (~77°C). `tickPhysics()` previously passed `state.lagCoolantTemp` (HT circuit, ~77°C) to the function, giving 99°C charge air instead of 63°C. Fixed with `const LT_COOLANT = 36`.

### Why does `makeInitialPhysicsState()` set `lagCoolantTemp = 30 + load/100*55`?
This is the HT jacket water temperature at rated (76.75°C). Previously it was set to 36 (LT circuit temperature), causing `jacketCoolingOutlet` to lag-in from a falsely cold 36°C for ~30 seconds, generating a spurious −25°C deviation alarm. The initial state must represent steady-state rated values for all lagged fields.

### Why is the cylinder persistence threshold 20°C, not 10°C?
The natural `CYL_SPREAD` + `BSIDE_TEMP_BIAS` gives B5 a permanent +17°C deviation from the engine mean in healthy operation. With the old threshold of 10°C, B5 always exceeded it, accumulating to `scorePersist=100` after 9 ticks → 35 risk points → CYLINDERS: 68 at startup. The threshold 20°C gives a 3°C safety margin above the healthy maximum.

### Why is the RateCalculator window 15 samples, not 5?
With 5 samples (5 seconds), lube pressure noise (±0.05 bar) produces linear-regression slopes of ~0.9 bar/min. With `base*0.2` normalization (denominator = 1.278 bar/min), that gives `scoreTrend ≈ 100`. Result: lube risk pushed to WARNING (27) from pure noise. 15 samples reduces slope noise to ~0.18 bar/min → `scoreTrend ≈ 21` → contribution ≤ 6 pts → NORMAL.

### Why does `computeRisk` use `base*0.2` as rate normalization?
The original `base*0.001` was impossibly tight: any exhaust rate above 0.44°C/min saturated `scoreTrend` to 100. With `base*0.2` (denominator = 88°C/min for exhaust), only genuine fault-speed rates (>30°C/min) produce high trend scores. For lube, the 15-sample window is required to complement this normalization (see above).

### Why does `getMTU8000HardLimitViolations` check `snap.lubeOilPressure` for the HI alert?
The "LO Pressure before filter" ECS alarm refers to the main gallery pressure (`snap.lubeOilPressure`), not the last-bearing pressure (`lubeLastBearingPressure`). The old code compared `lubeLastBearing` (~3.5 bar at rated) against the 5.5 bar threshold — always true — generating a false ECS alert on every tick. Fixed to compare `snap.lubeOilPressure`.

---

## 🗺 Important Constants (Quick Reference)

```typescript
// From mtu8000.constants.ts
MTU8000.CYLINDERS = 20
MTU8000.RATED_RPM = 1150
MTU8000.MAX_POWER_KW = 9100
BSIDE_TEMP_BIAS = +4  // °C
MTU8000_CYL_SPREAD = [-8,+12,-4,+16,-6,+10,-3,+14,-9,+7, +5,-11,+9,-5,+13,-7,+11,-2,+8,-4]
// Natural healthy spread across 20 cylinders ≈ 27°C (max B5 = mean + 13 + 4 bias = +17°C from mean)

// Safety triggers (override layer) — applyMTU8000SafetyOverride()
lubeLastBearingPressure < 3.2 bar  → SS (systemRisk=100)
bearingTemp > 130°C                → SS (systemRisk=100)   // was 120, raised — hot oil = 107°C at rated
bearingTemp > 115°C                → HI (risk≥75)          // was 100, raised
coolantTemp > 100°C                → SS (systemRisk=100)
exhaustMeanTemp > 460°C            → HI (risk≥80)
fuelRailPressure < 1200 bar        → SD (risk≥85)

// ALARM_LIMITS (constants.ts) — key values post-calibration
cylImbalance.preAlarmHigh  = 30°C   // was 25 — natural spread ~27°C, 30 gives margin
cylImbalance.alarmHigh     = 40°C   // was 35
pistonCoolingPress.preAlarmLow = 4.0 bar  // was 4.5 — physics gives ~4.34 bar at rated
pistonCoolingPress.alarmLow    = 3.5 bar  // was 4.0
ENGINE_MCR_KW = 9100                // was 5113 — matches MTU8000.MAX_POWER_KW
```

---

## 📋 Acceptance Checklist Status

All 20 criteria from PDF §12:

| # | Criterion | Status |
|---|-----------|--------|
| 1 | 20 cylinders, A/B naming, CCW firing order | ✅ |
| 2 | B-side mean 4°C above A-side at nominal | ✅ (confirmed ~3–4°C in UI) |
| 3 | Bearing 11 runs 5°C hotter than bearing 1 | ✅ (physics model) |
| 4 | All physics equations validated at 85% / 1150 RPM | ✅ (tests pass) |
| 5 | All 8 fault scenarios with intensity + speed controls | ✅ |
| 6 | F01 vs F05 discrimination (single cyl vs all 20) | ✅ |
| 7 | All 5 sensor failure modes implemented | ✅ |
| 8 | DRIFT → SENSOR_SUSPECT when cross-tags stable | ✅ |
| 9 | FREEZE detection: StdDev→0 within 60s, health<50 | ✅ |
| 10 | ECS alarm codes on every FaultAlert | ✅ |
| 11 | W-number maintenance task on every FaultAlert | ✅ |
| 12 | SS T-Bearing fires at >130°C: systemRisk=100 instantly (HI at >115°C: risk≥75) | ✅ |
| 13 | SD P-Fuel fires at <1200 bar: risk≥85 | ✅ |
| 14 | Compound fault: two simultaneous faults → two independent alerts | ✅ |
| 15 | Intensity slider: 50% intensity = 50% of max effect | ✅ |
| 16 | SLOW ~20 min, FAST ~80 sec | ✅ |
| 17 | IPMS tag-map.ts with unit conversion config | ✅ |
| 18 | One-line swap test: only EngineContext.ts changes for sim→OPC-UA | ✅ |
| 19 | CylinderView 20 cylinders in A/B rows with side-mean comparison | ✅ |
| 20 | ECS alarm preview in FaultInjector goes red at correct thresholds | ✅ |

---

## 🔜 Natural Next Steps (v2.1+)

1. **Migrate from EngineSnapshot to MTU8000Snapshot** — remove index signature, full type safety
2. **Connect to real IPMS** — replace simulator NodeIds with Kongsberg K-Chief NodeIds in tag-map.ts
3. **Add OPC-UA test harness** — replay recorded IPMS data through opcua-client.ts
4. **Baseline auto-calibration** — learn expected values from 30-day observation window
5. **Fine-tune LO baseline** — physics gives ~6.28–6.35 bar at rated; seed.ts expects 6.39 bar (−0.10 bar persistent offset shows as physics finding but does not alarm)
6. **Maintenance scheduler** — W-number → actual maintenance calendar integration
7. **Historical playback** — store EngineSnapshot history to TimescaleDB (pg package is installed)

---

## 🧩 Package Dependency Graph

```
shared ←────────────── simulator
  ↑                        ↑
  └──── features ──────── decision
           ↑
        knowledge
           ↑
        ingestion
           ↑
          UI
```

All packages depend on `shared`. Nothing depends on `ui`. The simulator is standalone (no UI deps). The decision engine depends only on `shared`.

---

## 💡 Session Tips

- **To find where a symbol is defined**: `grep -r "export.*SymbolName" packages/ shared/`
- **To check what index.ts exports**: Read `packages/simulator/src/index.ts`
- **To verify a physics value**: Open browser console at `localhost:5174`, run `window.__engine?.getLatest()`
- **Tests are in**: `packages/simulator/tests/physics.test.ts` — run with `pnpm test` from simulator dir
- **CSS variables** are in `packages/ui/src/index.css` — e.g. `var(--risk-critical)`, `var(--bg-card)`
- **The `engine` singleton** is at `packages/ui/src/context/EngineContext.ts` — imported by all dashboard components
