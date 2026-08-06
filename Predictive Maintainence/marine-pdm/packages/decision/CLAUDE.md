# Decision Package — CLAUDE.md
> AI decision engine: pattern matching, risk scoring, safety overrides. See root `CLAUDE.md` for monorepo rules.

---

## Decision Pipeline (3 layers)

1. **Physics** — deviation checks against baselines → raw risk scores per system
2. **Statistics** — trend rates, rolling averages, StdDev, cylinder imbalance
3. **Rules** — pattern matching (P01–P08) → alerts with ECS codes + W-numbers
4. **Override** — MTU safety hard limits → `systemRisk = 100` immediately (bypasses all above)

---

> ⚠ These thresholds are Phase 5 of an open calibration defect —
> [`../../OEM-CALIBRATION-GAP.md`](../../OEM-CALIBRATION-GAP.md). They cannot be moved onto their OEM
> values until the physics is back inside the OEM envelope (Phase 2), because several healthy rated
> readings currently violate OEM shutdown limits. Phase 5 also re-audits that every fault F01–F09 can
> still *reach* its alarm: F08 blow-by peaks at 7.28 mbar against a 27 mbar OEM crankcase limit.

## Safety Override Triggers — `src/override-mtu8000.ts`

### Shutdown (SS) — `systemRisk = 100` immediately
| Condition | ECS Code |
|-----------|---------|
| `lubeLastBearingPressure < 2.0 bar` | SS P-Oil Last Bearing |
| `bearingTemps[i] > 120°C` | SS T-Bearing N |
| `coolantTempAfterEngine > 97°C` | SS T-Coolant |
| `sprayOilDeviation(snap).dev > 6°C` | SS T-Splash Oil Bn |

### High-priority floors
| Condition | Risk floor | ECS Code |
|-----------|-----------|---------|
| `exhaustMeanTemp > 460°C` | ≥80 | HI T-Exhaust Mean |
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

**Why 120°C SS / 115°C HI (not 120/100, and no longer 130/115)?**
Hot lube oil at rated (105°C oil temp, 85% load) naturally drives bearing temps to ~107°C via
`bearingTemp_MTU8000()`, and the hottest of the 11 carries a further +5°C `positionBias` → ~112°C.
The original 120/100 pair fired false overrides during normal operation, but the culprit was the **HI
at 100**, which sat below that healthy 112 — not the SS. Raising HI to 115 fixed it; the SS was raised
to 130 at the same time, past the OEM figure. MTU ZNG00028788 (ALARM/GRENZWERTLISTE) codes T-Bearing
Lim1 = 115 warning and **Lim2 = 120 shutdown**, so the SS is back on the OEM number with 8°C of
headroom over healthy. The same drawing codes T-Coolant Lim2 = 97°C, hence the SS T-Coolant change.

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
