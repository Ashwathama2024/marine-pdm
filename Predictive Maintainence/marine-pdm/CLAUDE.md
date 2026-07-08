# MarineGPT PDM — CLAUDE.md
> Root project guide. Package-specific details live in each `packages/*/CLAUDE.md`.

---

## Project Identity

**Marine Predictive Maintenance System** — MTU 8000 20V M71/M71L (9100 kW, 20 cylinders).
Version: **v2.0** (all blocks U0–U8 complete).

- Working dir: `D:\MASTER_PROJECTS\Predictive Maintainence\marine-pdm\`
- Dev server: `cd packages/ui && pnpm dev` → `http://localhost:5173`
- Preview tool config: `.claude/launch.json` → `marine-pdm-ui`

---

## Monorepo Structure

```
marine-pdm/
├── shared/src/              # Shared types + constants (see shared/CLAUDE.md)
├── packages/simulator/src/  # Engine physics + faults + sensor failures (see simulator/CLAUDE.md)
├── packages/features/src/   # Feature extraction: EngineSnapshot → FeatureSnapshot
├── packages/decision/src/   # AI decision: patterns, risk, safety overrides (see decision/CLAUDE.md)
├── packages/knowledge/src/  # Baseline curves + sensor registry
├── packages/ingestion/src/  # OPC-UA client + 52-tag map (see ingestion/CLAUDE.md)
└── packages/ui/src/         # React frontend — Vite + Recharts (see ui/CLAUDE.md)
```

---

## Data Flow

```
SimulatorEngine (or OpcUaClient)
  → EngineSnapshot (every TICK_MS = 1000ms)
  → FeatureEngine  → FeatureSnapshot
  → DecisionEngine → DecisionOutput (systemRisk, alerts, evidenceChain)
  → React UI via useEffect + engine.subscribe()
```

One-line real-IPMS swap: change `packages/ui/src/context/EngineContext.ts` from `SimulatorEngine` to `OpcUaClient`.

---

## Import Rules (read before touching any imports)

All cross-package imports use Vite aliases — **never** relative deep paths:
```typescript
// CORRECT
import { MTU8000 } from '@marine-pdm/shared';
import { SimulatorEngine } from '@marine-pdm/simulator';

// WRONG — breaks Vite alias resolution
import { SensorFailureRegistry } from '@marine-pdm/simulator/src/sensor-failure';
```

Aliases (defined in `packages/ui/vite.config.ts`):
```
@marine-pdm/shared    → shared/src/index.ts
@marine-pdm/simulator → packages/simulator/src/index.ts
@marine-pdm/decision  → packages/decision/src/index.ts
@marine-pdm/features  → packages/features/src/index.ts
@marine-pdm/knowledge → packages/knowledge/src/index.ts
@marine-pdm/ingestion → packages/ingestion/src/index.ts
```
New exports must be added to the package's `src/index.ts` barrel.

---

## Dev Commands

```bash
# Start UI dev server
cd packages/ui && pnpm dev

# TypeScript check all packages
pnpm tsc --noEmit

# Run unit tests (all packages)
pnpm -r test                    # simulator: physics + degradation-matrix (finite-diff) ; ui: regression math
cd packages/simulator && pnpm test   # simulator only
cd packages/ui && pnpm test          # ui only (regression OLS/linregress)

# Rebuild shared (required when shared types change)
cd shared && pnpm build
```

---

## Adding New Features

### New fault scenario
1. Add to `FAULT_DEFINITIONS` in `packages/simulator/src/faults-mtu8000.ts`
2. Add physics case to `tickFaultsMTU8000()` switch
3. Add ECS preview + impact preview cases
4. Add pattern `P0x` data (id, name, ecsAlarmCode, maintenanceTask) to `MTU8000_PATTERNS` in
   `packages/knowledge/src/patterns-mtu8000-data.ts`, registered via `seedKnowledgeBase()` with
   `matchedExternally: true`. Add the matching LOGIC (what makes it fire) to
   `matchMTU8000Patterns()` in `packages/decision/src/patterns-mtu8000.ts` — the two are split
   across packages because `decision` depends on `knowledge`, not the reverse, so pattern data
   (knowledge-base content) can't live in `decision` alongside the matcher that consumes it. If the
   new pattern needs an `MTU8000Features` field the matcher doesn't have yet, add it to the
   `MTU8000Features` interface in `shared/src/interfaces.ts` and compute it in
   `packages/features/src/mtu8000-feature-builder.ts`.
5. Update `/help` (Fault System section — usually automatic, it derives from `FAULT_DEFINITIONS`) AND
   `/about` (`packages/ui/src/about/dossier-data.tsx` — `relatedFaults`/`coupledParams` for any affected
   entries, plus `SectionsInterconnect.tsx`'s edge list, which derives from `DEGRADATION_MODES`)

### New sensor
1. Add field to `EngineSnapshot` + `MTU8000Snapshot` in `shared/src/interfaces.ts`
2. Add `TagMapping` entry in `packages/ingestion/src/tag-map.ts`
3. Add physics equation in `packages/simulator/src/mtu8000-physics.ts`
4. Wire into `engine.ts` tick output
5. Add `SensorDefinition` in knowledge base
6. Update `/help` (add an `EquationBlock` in `packages/ui/src/help/sections/SectionsPhysics.tsx`) AND
   `/about` (add a `ParameterDossier` entry in `packages/ui/src/about/dossier-data.tsx`, which
   automatically feeds the reference table and the interconnection diagram if `sensorIds` overlaps an
   existing `DEGRADATION_MODES` effect)

### Keeping `/help` and `/about` in sync
Both are living, drift-resistant documentation pages, not static write-once docs — this is why both
maximize live-imports from the actual source constants/functions (`@marine-pdm/simulator`,
`@marine-pdm/shared`, `@marine-pdm/decision`) rather than hand-typed numbers: most numeric content
updates itself automatically on rebuild. What does **not** update itself is hand-authored prose that
describes *why* a number matters (`/about`'s cascade-consequence paragraphs, `/help`'s `expect` fields)
— when a coefficient change alters the qualitative story (a sensor becomes coupled/decoupled from a
fault, a threshold crosses from "never fires" to "fires normally"), that prose must be re-read and
updated by hand in both pages, not just left to the live numbers to silently reinterpret. Treat "did I
update `/help` and `/about`" as a mandatory step alongside any new fault, new sensor, changed physics
coefficient, changed alarm threshold, or changed algorithm weight.

---

## Critical Gotchas (quick index — details in sub-package CLAUDEs)

| # | Where | Gotcha |
|---|-------|--------|
| 1 | `packages/ui` | Port 5173 sometimes stuck — run `pkill -f vite && pkill -f node` |
| 2 | `packages/ui` | TWO baseline systems — only `seed.ts` affects live risk. See `ui/CLAUDE.md` |
| 3 | `shared` | `EngineSnapshot` has `[key: string]` index signature — use `MTU8000Snapshot` for type-safe access |
| 4 | `packages/simulator` | `exhaustTemp_MTU8000` uses `base=276` (not 320) to hit 440°C rated target |
| 5 | `packages/simulator` | `chargeAirTemp_MTU8000` must receive constant `LT_COOLANT=36`, never `lagCoolantTemp` |
| 6 | `packages/simulator` | `makeInitialPhysicsState()` must use rated steady-state values or false alarms at startup |
| 7 | `packages/simulator` | Cylinder persistence threshold = 20°C (B5 natural spread is +17°C from mean) |
| 8 | `packages/decision` | Bearing thresholds: SS=130°C / HI=115°C (hot oil at rated = 107°C — old 120/100 fired false) |
| 9 | `packages/decision` | LO pressure HI check uses `lubeOilPressure` (main gallery), not `lubeLastBearingPressure` |
| 10 | root | Parent-level `vite.config.ts` exists only for preview tool CWD workaround — canonical is `packages/ui/vite.config.ts` |
| 11 | `packages/simulator` | `degradation-matrix.ts` is the model SPEC — its `weight`s must equal the `mtu8000-physics.ts` partials. `tests/degradation-matrix.test.ts` (finite-difference) fails on drift. See `simulator/CLAUDE.md` → Degradation Model |
| 12 | `shared` / `packages/simulator` | `chargeAirTemp_MTU8000` rated ≈ 63°C is intended (LT-cooled). `MTU8000_LIMITS.chargeAir` alarm band is hi 75 / max 80 (above rated), NOT 50/55. Don't lower the physics to match old limits — it desyncs the `seed.ts` baseline mirror. See `simulator/CLAUDE.md` |

---

## Package Dependency Graph

```
shared ←────────────── simulator
  ↑                        ↑
  └──── features ──────── decision
           ↑
        knowledge ← ingestion
           ↑
          UI
```
Nothing depends on `ui`. Simulator has no UI deps. Decision depends only on `shared`.
