# Simulator Package — CLAUDE.md
> Engine physics, faults, sensor failures. See root `CLAUDE.md` for monorepo rules.

---

## MTU 8000 Engine Specs

| Property | Value |
|----------|-------|
| Model | 20V 8000 M71/M71L |
| Cylinders | 20 (Bank A: A1–A10, Bank B: B1–B10) |
| V-angle | 48° |
| Bore × Stroke | 265 × 315 mm |
| Rated RPM | 1150 |
| Max Power | 9100 kW (M71L) |
| Normal operating point | 85% load, 1150 RPM |
| B-side thermal bias | +4°C (`BSIDE_TEMP_BIAS`) — structurally warmer due to 48° V-angle |
| Firing order | CCW: A1,B6,A6,B8,A8,B2,A2,B4,A4,B10,A10,B5,A5,B3,A3,B9,A9,B7,A7,B1 |

---

## Physics Validation Targets (at 85% load, 1150 RPM)

| Equation | Expected | Tolerance | Notes |
|----------|----------|-----------|-------|
| `exhaustTemp_MTU8000(85, 1150, 1.0, 1.0)` | 440°C | ±5°C | base=276 → 276+136+28=440 |
| `lubeOilPressure_MTU8000(1150, 85, 85, 0, 0)` | 6.7 bar | ±0.2 | Cold oil (85°C). Hot oil (105°C) → ~6.4 bar |
| `chargeAirPressure_MTU8000(1150, 85, 1.0)` | 3.2 bar | ±0.1 | |
| `sfoc_MTU8000(85, 1150, {}, 1.0)` | 185 g/kWh | ±1 | base=180, coef=0.333 |
| `chargeAirTemp_MTU8000(85, 1150, 36)` | ~63°C | ±3°C | Pass LT_COOLANT=36, NOT `lagCoolantTemp` |
| `jacketCoolingOutlet` at steady state | ~76.8°C | ±2°C | `lagCoolantTemp` init = 30 + load/100×55 |

Tests in `tests/physics.test.ts` — run with `pnpm test` from this directory.

---

## Fault System (F01–F08) — `src/faults-mtu8000.ts`

| ID | Name | Key Effect | ECS Code | SS Trigger |
|----|------|-----------|----------|-----------|
| F01 | Injector Degradation (Single Cyl) | One cyl +65°C max | HI T-Exhaust Cyl N | None |
| F02 | Multi-Cyl Injector (A-Side) | All A1–A10 +55°C | HI T-Exhaust Mean | If >3 cyls |
| F03 | Lube Oil Pressure Loss | Last bearing −3.8 bar | SS P-Oil Last Bearing | <3.2 bar |
| F04 | Bearing Overtemperature | Bearing N +45°C | SS T-Bearing N | >130°C |
| F05 | HT Cooler Fouling | ALL 20 cyls hotter | HI T-Coolant | >100°C |
| F06 | TC Fouling (One TC) | TC speed drops, back P rises | SD TC Speed | None |
| F07 | Injector Spray Erratic | F01 + oscillation ±30°C | HI T-Exhaust Cyl N (osc) | >530°C |
| F08 | Piston Blow-by | Crankcase +8 mbar | HI P-Crankcase | None |

**Key discrimination**: F05 raises ALL 20 cylinders; F01 raises exactly ONE.

### Fault Growth Rates
| Speed | Rate | Time to max |
|-------|------|-------------|
| SLOW | 0.0008/s | ~20 min |
| MEDIUM | 0.003/s | ~5 min |
| FAST | 0.012/s | ~80 sec |

---

## Degradation Model — `src/degradation-matrix.ts` (the model SPEC)

`degradation-matrix.ts` is the **typed source of truth** for "what degrades how much, at what
intensity, over what time, in isolation vs combined." The physics in `mtu8000-physics.ts` stays the
runtime engine; the matrix is the SPEC extracted from it, consumed by the UI Degradation-BI page and
validated against the physics by `tests/degradation-matrix.test.ts`.

**Principle (linear → regression-friendly):**
```
effect_on_sensor = severity(t) · rootMax · weight
severity(t)      = min(GROWTH_RATE[speed] · t , intensity/100)
```
`weight` = the physics partial `∂sensor/∂rootFactor` at the rated point (85 % load, 1150 RPM).
`rootMax` = `ROOT_FACTORS[mode.rootFactor].rootMax`, the root factor's span at severity 1.0
(`FAULT_MAX_EFFECTS`) — 1.0 for `injFault`/`lubeFault`/`bearingFault`/`pistonBlowby`, but **0.25** for
`coolingEff` and **0.40** for `tcEff`. Omitting it makes F05/F06 predictions 4× / 2.5× too large.

**Intensity is applied exactly once**, as the cap on `severity(t)`. `tickFaultsMTU8000` uses
`f.currentSeverity` raw, so `predictEffect(mode, effect, severity)` takes no `intensityPct` — passing
intensity as a second multiplier was a real bug (fixed), and a linearity-only test will not catch its
return. `tests/degradation-matrix.test.ts` now pins absolute magnitudes (F05 → coolant +3.75 °C,
exhaust +8.75 °C at s=1.0) against the physics deltas.

**F07 is the documented exception**: its root factors only reach a fraction of severity
(`injFaults = s·0.8`, `pistonBlowby = s·0.3`) and it writes `pistonBlowby` despite declaring
`rootFactor: 'injFault'`. Those fractions are folded into its **weights** (65·0.8 = 52, 8·0.3 = 2.4),
not its `rootMax`, so `predictEffect` is still correct — but F07's weights are "per unit of F07
severity", not bare `∂sensor/∂rootFactor`, and must not be fed to the finite-difference check.

**Independent root factors** (what a fault DIRECTLY sets on `PhysicsState`): `injFault`, `coolingEff`,
`tcEff`, `lubeFault`, `bearingFault`, `pistonBlowby`. Everything else is a *dependent* observable
propagated through the equations. Faults sharing a root factor combine by **max** (worst-case) on that
factor, then superpose through the physics (e.g. F03+F05 both raise bearing temp — via pressure
starvation and via oil heat respectively).

**Sync rule:** if you change a calibrated coefficient in `mtu8000-physics.ts`, update the matching
`weight` in `degradation-matrix.ts`. The finite-difference test (`tests/degradation-matrix.test.ts`,
28 assertions) fails on any drift — every `modeled:true` weight is checked against the physics partial.

**Modeling gap decisions (as of phase close):**
- **F05 → chargeAirTemp = DROPPED** (`modeled:false`, weight 0). Charge air is **LT-cooled** (~36 °C
  seawater circuit), so HT-cooler fouling physically cannot raise it. Old cross-correlation removed.
- **F06/F08 → SFOC = MODELED.** TC fouling (`tcPenalty = drop·25`) and blow-by (`blowbyPenalty = pb·2`)
  are real efficiency losses; both terms are **zero at healthy** so rated SFOC stays 185 g/kWh.
- **F04 → bearingTemps[i] = MODELED at +45 °C** (see gotcha below). Its two secondary claims
  (lube-pressure drop at the bearing, crankcase rise) remain `modeled:false` — a deferred decision.

---

## Sensor Failure Modes (5) — `src/sensor-failure.ts`

| Mode | Behavior | SensorHealth |
|------|----------|-------------|
| DROPOUT | Value → null for duration, then recovers | → 0 during dropout |
| DRIFT | Linear divergence from truth | Drops as drift accumulates |
| SPIKE | Impulse then returns to normal | StdDev spikes |
| INTERMITTENT | Alternates null / valid | dataFreshness tracks on/off |
| FREEZE | Stuck at last value, StdDev → 0 | → ~40 within 60s |

All 52 MTU 8000 tags injectable. `SensorFailureRegistry` manages active failures.

---

## Physics Gotchas

**`base=276` in `exhaustTemp_MTU8000`**
Formula: `base + load×160 + 28`. At 85%/1150: `276+136+28=440°C`. Old `base=320` gave 484°C. Do not change.

**`chargeAirTemp_MTU8000` must use `LT_COOLANT=36`, never `lagCoolantTemp`**
Charge air intercooler uses the LT circuit (~36°C seawater-cooled). `lagCoolantTemp` is the HT jacket water (~77°C). Passing HT temp gives 99°C charge air instead of 63°C.

**`chargeAirTemp_MTU8000` rated ≈ 63°C is intended — alarm band is 75/80°C, not 50/55**
Rated = LT coolant (36) + 12 + load×18 → ~63°C. This is the correct LT-cooled physical value (a real
intercooler can't reach ~38°C — a 2°C approach). The seed baseline `48 + load/100·18` mirrors it, so the
live deviation ≈ 0. The old `MTU8000_LIMITS.chargeAir` (hi 50 / max 55) sat BELOW rated and only avoided
a false alarm because risk is deviation-based; corrected to hi 75 / max 80 (above rated). `risk.ts` keeps
`chargeAirTemp.dev 12` (75−63). Do NOT "fix" the ~63°C by lowering the physics — that desyncs the seed
mirror and the finite-difference discipline.

**`makeInitialPhysicsState()` must use rated steady-state values**
All lagged fields (`lagExhaustTemp`, `lagCoolantTemp`, `lagLubeOilPressure`, etc.) must initialize at rated steady-state (85%/1150 RPM). Cold/zero start causes false deviation alarms for 20–60 seconds after browser refresh.

**Cylinder persistence threshold = 20°C**
Natural `CYL_SPREAD + BSIDE_TEMP_BIAS` gives B5 a permanent +17°C deviation from engine mean in healthy operation. Threshold ≤17°C causes false CYLINDERS: HIGH at startup. Set to 20°C in `decision-engine.ts`.

**`sfoc_MTU8000` coefficients**
`base=180, coef=0.333` → `180 + 15×0.333 = 185 g/kWh`. These are calibrated. Do not adjust without re-running physics tests.

**`bearingTemp_MTU8000` faultHeat = `bearingFault·45` (was 20)**
The 6th param only ever receives `bearingFaults[i]` (F04) — F03 lube loss reaches bearings via
`pressureDef`, F05 cooler fouling via `oilHeat`, never through this term. It was `·20`, so F04 at full
severity only added +20 °C and the **SS T-Bearing >130 °C trip never fired**. Now `·45` (matches
`FAULT_MAX_EFFECTS.F04_bearing_temp_rise` and the matrix weight). Zero at healthy (`fault=0`) so rated
bearing temps and the physics validation targets are unchanged.

**RateCalculator window = 15 samples (not 5)**
With 5 samples, lube pressure noise (±0.05 bar) produces slopes ~0.9 bar/min → `scoreTrend≈100` → false WARNING. 15 samples reduces noise slope to ~0.18 bar/min → NORMAL.
