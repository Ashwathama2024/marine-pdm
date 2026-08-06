# UI Package — CLAUDE.md
> React frontend (Vite + Recharts). See root `CLAUDE.md` for monorepo rules and import aliases.

---

## Pages & Routes

14 routes in `App.tsx`. The **sidebar shows 11** — the other three are standalone entry points to
components that normally live as tabs inside `/analysis`.

| Route | File | Key Components |
|-------|------|----------------|
| `/` | `pages/Dashboard.tsx` | GaugeGrid, CylinderView, TurbochargerPanel, AIDecisionPanel, TrendChart, AlertBar, SensorPopup |
| `/simulator` | `pages/Simulator.tsx` | EngineControlPanel, InterlockPanel, LopDisplay, FaultInjector, CylinderInjectorPanel, SensorFailurePanel, ValueInjectionPanel |
| `/analysis` | `pages/AnalysisWorkspace.tsx` | Focus-rail + 6 tabs: Deviations, Table, Trends, Cylinders, Alerts, Degradation |
| `/degradation` | `pages/DegradationBI.tsx` | KPI header, effect decomposition, weight-matrix heatmap, dependency graph, live regression |
| `/training` | `pages/TrainingData.tsx` | Run list, class balance, CSV/JSONL export, storage, wipe. See `services/training-*.ts` |
| `/knowledge` | `pages/KnowledgeBase.tsx` | Sensor definitions, baseline curves |
| `/baselines` | `pages/BaselineEditorPage.tsx` | Edit UI-only baselines (see gotcha 2) |
| `/management` | `pages/Management.tsx` | SensorManager, PatternLibraryView |
| `/help` | `pages/HelpManual.tsx` | Operator's Manual — 14 sections. See `src/help/` |
| `/about` | `pages/AboutPage.tsx` | System Dossier — 11 sections. See `src/about/` |
| `/ai` | `pages/AIAssistant.tsx` | JARVIS settings — key, model, reasoning effort, narration toggle |
| `/deviations` `/table` `/alerts` | `DeviationDashboard` · `DeviationTable` · `AlertAnalytics` | Not in the sidebar — the same components `/analysis` mounts as tabs |

**Adding a route**: register it in `App.tsx`, add the nav entry in `layout/Sidebar.tsx`, AND add a row to
`APP_MAP` in `services/jarvis-self-knowledge.ts` — that array is what `/help`'s Page-by-Page guide and
JARVIS both render from (see gotcha 4).

---

## Component Map

```
src/
├── App.tsx                        # Router — 14 routes, nested context providers
├── main.tsx                       # StrictMode is ON (see gotcha 5)
├── context/
│   ├── EngineContext.tsx           # Singleton engine + SensorHistory buffers + lagged baselines.
│   │                               #   Its tick effect also drives degradation + training recording.
│   ├── AlertContext.tsx            # Live baseline alerts
│   ├── AlertHistoryContext.tsx     # Cleared-alert history
│   ├── DegradationContext.tsx      # Degradation event log
│   ├── SensorFocusContext.tsx      # Cross-filter selection shared by the Analysis tabs
│   ├── SimulatorControlContext.tsx # Engine controls shared by sidebar + Simulator page
│   └── ManualOverrideContext.tsx   # Manual risk override state
├── layout/Sidebar.tsx             # Nav + ENGINE CONTROL panel
├── components/
│   ├── AssistantWidget.tsx        # JARVIS chat, mounted on every page
│   ├── JarvisIcon.tsx · MessageMarkdown.tsx · AlertTicker.tsx · Tabs.tsx
├── dashboard/
│   ├── GaugeGrid.tsx              # 14 arc gauges in 2 sections; every one opens SensorPopup
│   ├── TrendChart.tsx             # One clickable trend card per gauged sensor + cylinder placards
│   ├── SensorPopup.tsx            # Enlarged view: chart, cause chain, HISTORIC ANALYSIS, AI diagnosis
│   ├── CylinderView.tsx           # 20-cyl A/B bar chart (collapsible)
│   ├── TurbochargerPanel.tsx      # 4 ETCs — speed + cut-in state
│   ├── AIDecisionPanel.tsx        # Risk orb (JarvisOrb) + evidence chain + active alerts
│   ├── AlertBar.tsx               # Bottom strip — ECS codes + W-numbers
│   └── CylinderTrendPopup.tsx · SfocPopup.tsx · PhaseTimeline.tsx · StateBadge.tsx
├── simulator/
│   ├── FaultInjector.tsx          # F02–F06/F08/F09 + intensity/speed + SEVERITY RAMP toggle
│   ├── CylinderInjectorPanel.tsx  # F01/F07 per-cylinder
│   ├── SensorFailurePanel.tsx     # 52-tag search, 5 failure modes, health badges
│   ├── EngineControlPanel.tsx · InterlockPanel.tsx · LopDisplay.tsx · StartAirGauge.tsx
│   └── ValueInjectionPanel.tsx · FaultPlacard.tsx · registry.ts
├── management/                    # BaselineEditor (UI-only) · PatternLibraryView · SensorManager
├── help/  ├── about/              # The two documentation pages — see gotcha 4
├── hooks/
│   ├── useDataSource.ts           # engine.subscribe() → EngineSnapshot each 1 s
│   ├── useDecision.ts             # FeatureEngine + DecisionEngine → DecisionOutput
│   ├── useKnowledge.ts            # BaselineStore → expected values
│   ├── useSensorAnalysis.ts       # One-shot AI diagnosis for the sensor popup
│   └── useAssistantChat.ts · useAssistantNarration.ts     # JARVIS chat + proactive notes
└── services/
    ├── sensor-map.ts              # SENSOR_META — the join between UI ids, snapshot keys,
    │                              #   forecast keys and degradation-matrix sensor ids
    ├── forecast.ts                # FORECAST_LIMITS + slope stats + observable ETA
    ├── rul.ts                     # Analytic RUL — inverts the degradation model
    ├── rul-quality.ts             # Per-label trustworthiness flag + error-in-minutes
    ├── training-recorder.ts       # Per-tick sample writer (has module state + side effects)
    ├── training-store.ts          # IndexedDB schema (SCHEMA_VERSION) — pure
    ├── jarvis-tools.ts            # 11 READ-ONLY agentic tools
    ├── jarvis-self-knowledge.ts   # APP_MAP + capability/prompt text (see gotcha 4)
    ├── live-context.ts · prompts.ts · sensor-evidence.ts · engine-knowledge.ts
    ├── ai-settings.ts · openai-client.ts · chat-history.ts
    ├── ramp-mode.ts               # Severity-ramp toggle shared by BOTH fault injectors
    ├── degradation-regression.ts · csv.ts · cause-chains.ts · pattern-feedback.ts
    ├── baseline-curves.ts         # UI display curves (NOT live pipeline)
    └── knowledge-store.ts · pdf-extract.ts
```

Tests live beside their subject as `*.test.ts` in `services/` (`pnpm test` → vitest). Several are
**coverage guards** rather than unit tests — `dashboard-coverage.test.ts` fails if a gauged sensor has no
trend card or no `SENSOR_META` entry; `baseline-lag-convention.test.ts` and `bearing-baseline.test.ts`
pin baseline conventions that nothing else compares.

---

## CylinderView Behavior

- **Collapsed**: 2 rows (A and B) of 10 mini bars with cylinder numbers
- **Expanded** (click header): full bar chart per bank with temp values + deviations
- Header: `CYLINDER EXHAUST TEMPS — 20V | BANK A | BANK B | Δ°C`
- `HOTTEST` badge highlights the hottest cylinder at current tick

---

## Hooks Flow

```
useDataSource → engine.subscribe() → raw EngineSnapshot each 1 s
useDecision   → FeatureEngine + DecisionEngine → { output, baseline, instantBaseline, features }
useKnowledge  → BaselineStore → expected values for deviation display
```

`EngineContext`'s tick effect is the hub — everything per-tick hangs off it, in this order:

```
snapshot → push 120-sample SensorHistory buffers (MAX_HISTORY)
         → applyLag(lagged baselines, BASELINE_LAG)     # stage 2 of the lag cascade
         → recordDegradationSample()                    # Degradation-BI regression series
         → recordTrainingSample()                       # one labelled training row
         → startRun() / endRun() on the pre-op ↔ running edge
```

Two baseline objects come out of `useDecision` and the difference matters: `baseline` is **lagged**
(what deviation scoring and the RUL labels use), `instantBaseline` is the **un-lagged** curve, used only
to measure how far the lagged one is from converged — that gap is what `rul-quality.ts` thresholds. The
lag is a **two-stage cascade**: `FeatureEngine` lags the curve, then `EngineContext` lags that output
again with the same alphas. Comparing only one stage measures half the error.

---

## Prediction & Training Layer

```
sensor-map.ts  SENSOR_META[uiId].forecastKey ──┐
                                               ├─→ forecast.ts   minutesToAlarm()  (observable ETA)
FORECAST_LIMITS[key] (coded MTU alarm band) ───┤
                                               └─→ rul.ts        analyticRul()     (ground-truth label)
                                                        ↓
                                                   rul-quality.ts classifyRulQuality()
                                                        ↓
                                                   training-recorder.ts → 4 columns per metric
```

**Adding a forecastable metric touches five files** — miss one and the column is silently absent or null:

1. `services/sensor-map.ts` — `forecastKey` + `matrixSensorIds` on the `SENSOR_META` entry.
   *Declared order of `matrixSensorIds` is load-bearing*: `analyticRul()` picks the FIRST match, so the
   effect that actually drives the observed series must be listed first (bearing max → `bearingTemps[i]`
   before `bearingTemps[all]`; exhaust mean → the mean effect before `cylTemps[n]`).
2. `services/forecast.ts` — the `FORECAST_LIMITS` entry (history key, unit, `dir`, `hi`/`lo`/`ss`).
3. `services/rul-quality.ts` — `BASELINE_FIELD` mapping to the `BaselineSnapshot` field.
4. `services/training-recorder.ts` — `HEALTHY_REF` mapping to the lagged-baseline key.
5. `context/EngineContext.tsx` — the `SensorHistory` series + a `BASELINE_LAG` entry, plus the
   `BaselineSnapshot` field in `shared` and the curve in `knowledge/src/seed.ts`.

Recording is automatic (no arm step) and writes to IndexedDB. `forecast.ts` and `training-store.ts` are
pure; **`training-recorder.ts` is not** — importing it registers `pagehide`/`visibilitychange` listeners
and kicks off run reconciliation, so never import it just to read a constant. `jarvis-self-knowledge.ts`
reads `FORECAST_LIMITS` from `forecast.ts` and `help/sections/SectionsPredict.tsx` reads
`SCHEMA_VERSION` from `training-store.ts` for exactly this reason.

---

## UI-Specific Gotchas

**1. Port 5173 sometimes stuck**
A previous dev server may still hold it; Vite then auto-increments to 5174. On Windows find the holder
with `netstat -ano | findstr :5173` and stop that PID (`pkill -f vite` only works from a POSIX shell).
Note `.claude/launch.json` passes `--port 5174`, but the flag does not reach Vite through the `cmd /c`
+ `pnpm dev` wrapper — the preview server binds **5173** regardless.

**2. TWO baseline systems — only `seed.ts` affects live risk**
- `packages/knowledge/src/seed.ts` PRIMARY_BASELINES → mathjs strings → `BaselineStore` → risk scoring pipeline. **This is what matters.**
- `src/services/baseline-curves.ts` → UI Baselines editor page display only. Edits here have NO effect on risk scores.
- Always calibrate `seed.ts`, not `baseline-curves.ts`.

**3. CSS variables**
Global CSS vars in `src/styles/global.css`: `var(--risk-critical)`, `var(--bg-card)`, etc.

**4. `/help` and `/about` are two layers of one documentation system, not independent docs**
`src/help/` is the Operator's Manual (how to run the plant). `src/about/` is the System Dossier (why every
reading means what it means) and explicitly cross-links to `/help` rather than repeating it — glossary,
ECS code prefixes, and the page/graph-by-graph guides live ONLY in `/help`; `/about` links to them.
`src/about/AboutPrimitives.tsx` re-exports `src/help/HelpPrimitives.tsx`'s generic components (`Section`,
`Callout`, `DataTable`, etc.) rather than duplicating them — the dependency direction is `about → help`,
never the reverse. `src/about/dossier-data.tsx` is the single computed array (live-imported from
`@marine-pdm/simulator`/`@marine-pdm/shared`) that feeds the parameter cards (§3), the interconnection
diagram (§4), AND the reference table (§10) — update facts there once, not in three places.
The ROUTE LIST is likewise single-sourced: `/help`'s Page-by-Page guide renders from `APP_MAP` in
`src/services/jarvis-self-knowledge.ts` (the same list JARVIS answers "what pages are there" from), with
per-route operator prose in `PAGE_NOTES` inside `SectionsUI.tsx`. Add a new page to `APP_MAP` and it
appears in both — do not re-introduce a second hardcoded route table in `/help`.

**5. StrictMode is on — every tick effect runs twice in dev**
`main.tsx` enables StrictMode, so anything stateful driven by the tick effect is offered each timestamp
twice. Two guards already exist and must not be removed: `useDecision.ts` (the FeatureEngine carries
prev-tick state, so double-processing zeroes every `*Rate` field) and `training-recorder.ts`'s `lastT`
check (plus the store's compound `['runId','t']` key on the write side). A new per-tick consumer needs
its own guard — `strictmode-double-process.test.ts` quantifies what happens without one.

**6. Bearing temperature is the MAX of 11, never a mean**
`SS T-Bearing` trips on *any single* bearing, so the gauge, the popup, the RUL label and the safety
override all read `bearingTempMax(snap)`. Two consequences: `snap[meta.snapKey] as number` renders NaN
for `ME.BearingTemp` (its snapKey is the 11-element array — use `readSensorValue()`), and the shared
`ME.BearingTemp.Mean` seed curve is per-bearing and deliberately excludes `positionBias`, so whoever
reduces the 11 to a max adds `MTU8000_LIMITS.bearingMaxPositionBias` (+5 °C) back.

**7. `rulQuality` cannot see a wrong baseline curve**
It compares the lagged baseline against the instant one, so an error in the curve itself sits in both
and cancels — the row reports `OK`. When a label contradicts the live sensor, suspect `seed.ts`. This is
how a 10.8 °C bearing-baseline shortfall stayed invisible until `analyticRul()` divided by it.

⚠ **This is currently masking a whole-envelope error, not just one curve.** The physics is not
calibrated to the OEM alarm limits (see [`../../OEM-CALIBRATION-GAP.md`](../../OEM-CALIBRATION-GAP.md)),
so `analyticRul()` divides by wrong baselines against wrong limits and **every training row in
IndexedDB is mislabelled** — silently, with `rulQuality` reporting OK. Treat `/training` exports as
untrusted until Phase 7 of that document bumps `SCHEMA_VERSION` and the set is re-recorded.

**8. Effects that alter the docs**
Root `CLAUDE.md` makes it mandatory: a new fault, a new sensor, a changed physics coefficient, a changed
alarm threshold or a changed algorithm weight requires updating `/help` AND `/about`. Both pages
live-import their numbers, so most of that is automatic — what is NOT is the hand-authored prose that
explains why a number matters. Also check `services/jarvis-self-knowledge.ts`: it is the third consumer
of the same facts, and it drifted independently before (`engine-knowledge.test.ts` now pins it).
