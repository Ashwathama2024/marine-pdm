# Decision Package — CLAUDE.md
> AI decision engine: pattern matching, risk scoring, safety overrides. See root `CLAUDE.md` for monorepo rules.

---

## Decision Pipeline (3 layers)

1. **Physics** — deviation checks against baselines → raw risk scores per system
2. **Statistics** — trend rates, rolling averages, StdDev, cylinder imbalance
3. **Rules** — pattern matching (P01–P08) → alerts with ECS codes + W-numbers
4. **Override** — MTU safety hard limits → `systemRisk = 100` immediately (bypasses all above)

---

> Every threshold below is DERIVED from `shared/src/oem-limits.ts` (MTU drawing ZNG00028788), not
> typed. **Several are RPM curves**, resolved at `snap.rpm` through `MTU8000_LIMIT_CURVES` — the
> last-bearing shutdown is 5.3 bar at rated and 2.07 at 400 RPM, so comparing a live reading to the
> rated-point scalar fires an Emergency Stop on a healthy idling engine. `tests/override-oem.test.ts`
> pins that, and that no override fires at healthy from idle to full power.

## Safety Override Triggers — `src/override-mtu8000.ts`

### Shutdown (SS) — `systemRisk = 100` immediately
| Condition | ECS Code |
|-----------|---------|
| `lubeLastBearingPressure <` curve 4 (5.3 bar at rated) | SS P-Oil Last Bearing |
| `pistonCoolingPress <` curve 2 (4.7 bar at rated) | SS P-Oil Piston Cooling |
| `bearingTemps[i] > 120°C` | SS T-Bearing N |
| `coolantTempAfterEngine > 97°C` | SS T-Coolant |
| `sprayOilDeviation(snap).dev > 6°C` | SS T-Splash Oil Bn |

### High-priority floors
| Condition | Risk floor | ECS Code |
|-----------|-----------|---------|
| `exhaustMeanTemp >` curve 10 (700°C at rated) | ≥80 | HI T-Exhaust Mean — **unreachable by any modelled fault, deliberately; see below** |
| `lubeLastBearingPressure <` curve 3 (5.8 bar at rated) | ≥80 | LO P-Oil Last Bearing |
| `pistonCoolingPress <` curve 1 (5.2 bar at rated) | ≥80 | LO P-Oil Piston Cooling |
| `fuelRailPressure < 1200 bar` | ≥85 | SD P-Fuel Rail |
| `bearingTemps[i] > 115°C` | ≥75 | HI T-Bearing N |
| `sprayOilDeviation(snap).dev > 4°C` | ≥75 | HI T-Splash Oil Bn |

**Spray oil is a DIFFERENCE, not a value.** `sprayOilDeviation` (in `shared/utils.ts`, not here) returns
how far the hottest of the ten B77 channels sits above their mean. MTU codes no absolute band for it
anywhere in ZNG00028788 — only Lim1 4 °C / Lim2 6 °C on the spread — so there is nothing to compare a
single channel against. Two consequences worth keeping in mind: a common-mode shift (hot oil, high
load, a cold start) cancels and cannot alarm, which is what insulates this trip from the calibration
defect in `OEM-CALIBRATION-GAP.md`; and the trip fires BEFORE `HI T-Bearing` on the same fault,
because oil in transit responds faster than the bearing casting it came off.

**Why HI T-Exhaust Mean no longer fires — and must not be "fixed"**
The OEM limit is 700°C (curve 10 at rated) against a healthy mean of 440°C. F02 at full severity — ten
cylinders at +55°C — lifts the mean to ~472°C, so no modelled fault reaches it. That is faithful to
the real ECS, which catches a single-bank injector fault through its RELATIVE limits: the
single-cylinder UL (curve 12, against the running mean) and the mean's own 20°C offset step (MDEC
51,03). In this app that relative job belongs to the deviation-based risk scoring and to patterns
P01/P02/P09, not to this absolute override. Lowering the limit to make it fire would re-create the
exact defect `OEM-CALIBRATION-GAP.md` was written about — it had been coded at 460°C, 20°C above
healthy, which is how it became the de-facto detector for everything exhaust-related.

**Why 120°C SS / 115°C HI**
MTU ZNG00028788 codes T-Bearing Lim1 = 115 warning and **Lim2 = 120 shutdown**. The hottest bearing at
healthy rated now sits ~100°C, 15°C clear of the warning. This parameter has been misread twice in
opposite directions: once with the HI at 100°C, *below* the healthy value, which produced constant
false alarms; then by raising the SS to 130°C to chase them, past the OEM figure. The real culprit was
upstream — the lube-oil temperature was running 98°C, past the point the ECS reduces power, dragging
every bearing up with it. Fix the physics, not the threshold. The same drawing codes T-Coolant
Lim2 = 97°C.

---

## Patterns — data in `knowledge`, matching logic in `decision`

8 patterns (P01–P08) map to fault scenarios F01–F08 with real ECS alarm codes and MTU maintenance
work orders (W-numbers like W1006, W1047, W1073, W1609). **Split across two packages** because
`decision` depends on `knowledge`, not the reverse:
- **Data** (`id`, `name`, `ecsAlarmCode`, `maintenanceTask`, `actionWindow`) — `MTU8000_PATTERNS` in
  `packages/knowledge/src/patterns-mtu8000-data.ts`, registered into the shared `patternLibrary`
  singleton by `seedKnowledgeBase()` with `matchedExternally: true`.
- **Matching logic** — `matchMTU8000Patterns(features: MTU8000Features): string[]` in
  `src/patterns-mtu8000.ts`. Hardcoded per-pattern conditions (not a generic tag evaluator — the
  `conditions` arrays on the data side are documentation-only, not read by the matcher).
  `MTU8000Features` itself lives in `shared/src/interfaces.ts`, built each tick by
  `packages/features/src/mtu8000-feature-builder.ts` from the generic `FeatureSnapshot` +
  `BaselineSnapshot` `decision-engine.ts` already has, reusing existing lagged baselines wherever
  an MTU8000-named field is the same physical sensor as a generically-named one already tracked
  (see that file's header comment for the full reuse list). Two genuinely new baseline curves
  (`ME.BearingTemp.Mean`, `ME.FuelRailPressure`) were added to `PRIMARY_BASELINES` in
  `knowledge/src/seed.ts` for the two quantities nothing tracked before.
- `decision-engine.ts` calls `matchMTU8000Patterns()`, then reports every one of the 8 pattern ids
  (matched or not) to `patternLibrary.recordMatch(id, allMet)` — this is the same
  rising-edge/persistence bookkeeping `PatternLibrary.matchPatterns()` itself uses for the generic
  path, extracted into a shared method so both matching styles get identical `timesTriggered`
  semantics. Alert construction (evidence text, heuristic risk score, component name) is in
  `src/mtu8000-alerts.ts`, kept separate from `decision-engine.ts` to keep that file orchestration-only.
- The 3 legacy generic patterns that used to seed `patternLibrary` (`injector_degradation` /
  `lube_system_failure` / `cooling_fouling`) have been **retired**, not merely superseded —
  registering both would produce two competing alerts for the same physical fault. The generic
  `PatternLibrary.matchPatterns()` path itself is untouched and still fully functional for any
  custom pattern added later via `knowledge-api.ts`'s `addPattern` endpoint.

---

## Key Gotchas

**LO pressure HI check uses `lubeOilPressure`, not `lubeLastBearingPressure`**
The "LO Pressure before filter" ECS alarm checks the main gallery (`snap.lubeOilPressure`, ~6.3 bar at rated) against 5.5 bar. Old code checked `lubeLastBearingPressure` (~3.5 bar) — always below 5.5 bar → false alert every tick.

**`computeRisk` normalization: `base*0.2` for rate scores**
`base*0.001` was impossibly tight: any exhaust rate >0.44°C/min saturated `scoreTrend=100`. With `base*0.2` (denominator=88°C/min for exhaust), only fault-speed rates (>30°C/min) produce high trend scores. Pair with 15-sample RateCalculator window for lube (see simulator CLAUDE.md).

**Confirm/False-Alarm must use `FaultAlert.patternId`, never `patternName`**
`PatternLibrary.recordOutcome()` looks up by `id` (snake_case / `P0x`), not the human-readable
`name`. The UI (`AlertBar.tsx`, `AIDecisionPanel.tsx`) used to pass `alert.patternName!` — since
name ≠ id, every Confirm/False-Alarm click threw `Error: Pattern '<name>' not found` and silently
recorded nothing. Fixed by adding `patternId` to `FaultAlert` and switching both UI call sites —
see `packages/decision/tests/patterns.test.ts`'s "recordOutcome(alert.patternId) succeeds" test,
which also asserts recording by `patternName` still throws (proof the fix is specifically about
which field, not an accidental side effect).

**`PatternLibrary.matchPatterns()`/`recordMatch()` count episodes, not ticks**
`timesTriggered` only increments on the persistence-counter rising edge (`prev===0 -> current===1`),
not every tick a condition continues to hold — a fault sustained for 5 minutes previously inflated
`timesTriggered` to ~300 instead of 1, which corrupted `getSuggestedThresholdAdjustment()`'s
false-positive/miss-rate math (dividing a real one-off `timesConfirmed` click by a tick-inflated
denominator manufactured a false "under-detection" signal). `cylPersist`/`lubePersist` condition
tags reference a separate `corePersistenceCounters` map (ticks the *non-persist-tag* conditions
alone have held) rather than the pattern's own gated match streak — referencing the gated streak
would be circular (a fixed point permanently stuck at 0, since advancing it requires the persist
condition to already be true).
