# UI Package — CLAUDE.md
> React frontend (Vite + Recharts). See root `CLAUDE.md` for monorepo rules and import aliases.

---

## Pages & Routes

| Route | File | Key Components |
|-------|------|----------------|
| `/` | `pages/Dashboard.tsx` | GaugeGrid, CylinderView, AIDecisionPanel, TrendChart, AlertBar |
| `/deviations` | `pages/DeviationDashboard.tsx` + `DeviationTable.tsx` | Per-sensor delta table |
| `/analysis` | — | Full sensor table with baselines |
| `/alert-analytics` | `pages/AlertAnalytics.tsx` | Alert history and patterns |
| `/knowledge` | `pages/KnowledgeBase.tsx` | Sensor definitions, baseline curves |
| `/baseline-editor` | `pages/BaselineEditorPage.tsx` | Edit UI-only baselines (see gotcha below) |
| `/management` | `pages/Management.tsx` | SensorManager, PatternLibraryView |
| `/simulator` | `pages/Simulator.tsx` | FaultInjector + SensorFailurePanel |

---

## Component Map

```
src/
├── App.tsx                        # Router — 8 routes
├── main.tsx
├── context/
│   ├── EngineContext.tsx           # Singleton engine (SimulatorEngine or OpcUaClient)
│   ├── AlertContext.tsx            # Alert history state
│   └── ManualOverrideContext.tsx   # Manual risk override state
├── layout/
│   └── Sidebar.tsx                # Nav sidebar with route links
├── dashboard/
│   ├── GaugeGrid.tsx              # 6 main gauges (exhaust, LO, coolant, etc.)
│   ├── CylinderView.tsx           # 20-cyl A/B bar chart (collapsible)
│   ├── AIDecisionPanel.tsx        # Risk gauges + evidence chain + active alerts
│   ├── AlertBar.tsx               # Bottom strip — ECS codes + W-numbers
│   ├── TrendChart.tsx             # Rolling time-series Recharts
│   └── SensorPopup.tsx            # Click-on-gauge detail popup
├── simulator/
│   ├── FaultInjector.tsx          # F01–F08 fault panel (dropdown, intensity, speed)
│   ├── SensorFailurePanel.tsx     # 52-tag search, 5 failure modes, health badges
│   ├── ControlPanel.tsx           # RPM / load sliders
│   └── CylinderDegradationPopup.tsx
├── management/
│   ├── BaselineEditor.tsx         # UI-only baseline editor (NOT the live pipeline)
│   ├── PatternLibraryView.tsx
│   └── SensorManager.tsx
├── hooks/
│   ├── useDataSource.ts           # Subscribes to engine ticks → EngineSnapshot
│   ├── useDecision.ts             # Runs DecisionEngine on each snapshot
│   ├── useGPTAnalysis.ts          # OpenAI GPT analysis hook
│   └── useKnowledge.ts            # Reads sensor definitions + baselines
└── services/
    ├── baseline-curves.ts         # UI display curves (NOT live pipeline)
    ├── cause-chains.ts            # Symptom → cause explanations
    ├── knowledge-store.ts         # Local sensor definition store
    ├── openai-client.ts           # GPT API wrapper
    ├── pdf-extract.ts             # PDF text extraction
    └── prompts.ts                 # GPT prompt templates
```

---

## CylinderView Behavior

- **Collapsed**: 2 rows (A and B) of 10 mini bars with cylinder numbers
- **Expanded** (click header): full bar chart per bank with temp values + deviations
- Header: `CYLINDER EXHAUST TEMPS — 20V | BANK A | BANK B | Δ°C`
- `HOTTEST` badge highlights the hottest cylinder at current tick

---

## Hooks Flow

```
useDataSource → engine.subscribe() → raw EngineSnapshot each 1s
useDecision   → FeatureEngine + DecisionEngine → DecisionOutput (risk, alerts)
useKnowledge  → BaselineStore → expected values for deviation display
```

---

## UI-Specific Gotchas

**1. Port 5173 sometimes stuck**
WSL background process may hold it. Run `pkill -f vite && pkill -f node` in bash, then restart. Vite auto-increments to 5174.

**2. TWO baseline systems — only `seed.ts` affects live risk**
- `packages/knowledge/src/seed.ts` PRIMARY_BASELINES → mathjs strings → `BaselineStore` → risk scoring pipeline. **This is what matters.**
- `src/services/baseline-curves.ts` → UI Baselines editor page display only. Edits here have NO effect on risk scores.
- Always calibrate `seed.ts`, not `baseline-curves.ts`.

**3. CSS variables**
Global CSS vars in `src/styles/global.css`: `var(--risk-critical)`, `var(--bg-card)`, etc.
