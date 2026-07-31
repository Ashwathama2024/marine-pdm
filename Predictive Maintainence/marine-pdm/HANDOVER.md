# Handover — for the audit session

**Written:** 2026-07-31 · **HEAD:** `c07731e` on `master` (local == `origin/master`) · working tree clean

Read this before auditing. The most important sections are **§3 Verification status** (what is
genuinely proven vs. assumed) and **§4 Deliberate decisions** (things that look like bugs and are not
— please don't "fix" them without reading the rationale).

---

## 1. Repo state

Single line of development. Every other branch was merged and deleted this session.

```
LOCAL    master  c07731e  [origin/master]     ← the only branch
REMOTE   origin/master  c07731e               ← in sync, nothing else
```

History:

```
*   c07731e  Merge branch 'claude/jolly-khorana-4d5854'
|\
| * defadec  fix(simulator): correct predictEffect() magnitude and document rootMax
* | c18a5dd  fix: flag RUL labels solved from an unsettled baseline
* | 128b951  feat: physics-strict AI diagnosis + persistent labelled training capture
* | 4b9468f  feat(ui): upgrade JARVIS (icon, agentic tools, self-knowledge)
* | bbf775f  feat(ui): add JARVIS engine assistant + Degradation BI fixes
|/
* e5b31ec  (previous master)
```

**Backup ref, not a branch:** `refs/backup/expense-tracker-pwa` → `eaa6e9a` holds a deleted, unrelated
expense-tracker PWA (59 files, ~10.8k lines) that was created in this repo by mistake. It existed only
on the remote. Restore with
`git push origin refs/backup/expense-tracker-pwa:refs/heads/expense-tracker`, or purge with
`git update-ref -d refs/backup/expense-tracker-pwa`. Leave it until the user confirms the project
lives elsewhere.

**Disk leftover:** `.claude/worktrees/{eager-tesla-ff7d63,epic-mccarthy-4a4a9f}` are git-deregistered
but still on disk — `rm` reports "Device or resource busy" (a lingering node/vite process). They are
inert; contents are `node_modules`. Delete once that process exits.

---

## 2. What was built (three workstreams)

### A. Physics-strict AI diagnosis — `128b951`

"Analyze with AI" was on a dead stack: `useGPTAnalysis` hardcoded `gpt-4o` with `temperature` +
`max_tokens`, all three of which GPT-5 reasoning models reject with a 400. It also passed the trend
`rate` as a literal `0`.

| File | Role |
|---|---|
| `ui/src/hooks/useSensorAnalysis.ts` | replaces the deleted `useGPTAnalysis`; goes through `openai-client.createChatCompletion` |
| `ui/src/services/sensor-evidence.ts` | assembles the deterministic DATA block |
| `ui/src/services/forecast.ts` | series stats + ETA math, extracted from `jarvis-tools.ts` (3 consumers now) |
| `ui/src/services/sensor-map.ts` | `SENSOR_META`, moved out of `Dashboard.tsx`, extended with matrix + forecast joins |
| `ui/src/services/prompts.ts` | four-line contract, ≤90 words, `INSUFFICIENT:` refusal path |

### B. Persistent labelled training capture — `128b951`

| File | Role |
|---|---|
| `ui/src/services/training-store.ts` | IndexedDB `marine-pdm-training`; samples keyed `['runId','t']` |
| `ui/src/services/training-recorder.ts` | one row per running tick; ~100-scalar features + 6 root factors + ground truth |
| `ui/src/services/rul.ts` | analytic RUL solved from the linear model |
| `ui/src/services/ramp-mode.ts` | severity ramp toggle (default ON) |
| `ui/src/pages/TrainingData.tsx` | `/training` — runs, class balance, CSV/JSONL export, wipe |

### C. RUL label-quality flags — `c18a5dd`

`rulTrue_*` was solved from the **lagged** baseline, which `FeatureEngine.actualAsBaseline()` re-seeds
onto the live *faulted* reading whenever rpm drops below `RUN_RPM` (300). Labels produced during the
recovery are wrong **directionally** — RUL appears to *increase* as the fault develops.

| File | Role |
|---|---|
| `ui/src/services/rul-quality.ts` | `rulQuality_<key>` classifier; stateless |
| `ui/src/services/baseline-settling.test.ts` | reproduces the poisoning; discriminates the two candidate causes |
| `features/src/feature-engine.ts` | now also returns `instantBaseline` (additive only) |

---

## 3. Verification status — READ THIS FIRST

Three confidence tiers. I have been deliberately strict: "verified by me" means I ran it and saw the
evidence *this session*.

### ✅ Verified by me, with evidence

| Claim | Evidence |
|---|---|
| All test suites pass | ui 54/54, simulator 46/46, decision 10/10 — **110 total**, all run this session |
| All packages typecheck | `tsc --noEmit` clean on ui / features / simulator / decision / knowledge |
| App boots clean | cold dev-server restart + fresh tab → zero console errors |
| Severity ramp works | severity climbs from ~0; `rf_*` tracks it; requires engine **CLUTCHED or LOADED** |
| RUL falls correctly | `rulTrue_lube` 1.19 → 1.01 as severity 0.003 → 0.045 on a settled baseline |
| `rulQuality` catches poisoning | stop/restart with F03 active → first 7 rows `SETTLING` (`lubeDev −0.82`), tail correctly `ALREADY_BREACHED` once settled (`lubeDev −0.34`) |
| Per-key discrimination | same row: `lube`/`pistonCoolingPress` driven, `exhaust`/`jacket`/`chargeAirTemp`/`tcSpeed` = `NOT_DRIVEN` |
| Schema versioning | new runs `schemaVersion: 2`; older runs correctly still `1` |
| Run lifecycle + recovery | orphaned runs repaired: 4 runs → 2, durations corrected from 223 min to true 0.5 min |
| Data survives reload | runs + rows present after browser reload |
| JARVIS self-knowledge | 16,315 chars; ramp table generated live from `GROWTH_RATES`; concept routing returns correct subsections |

### ⚠️ Marked complete in an earlier (context-summarised) part of the session — **not re-verified by me**

Treat these as *claimed*, not proven. Good first audit targets.

- **Task 9 — alert-episode + pattern-feedback persistence.** `pattern-feedback.ts` and the
  `AlertHistoryContext` changes exist and typecheck, but I never observed an episode surviving a
  reload.
- **CSV export end-to-end.** I verified the column-union logic reads `Object.keys` (so new columns
  appear automatically) and the escaping is unit-tested, but **no CSV was ever actually downloaded
  and opened.** The plan called for this and it did not happen.
- **`dataQuality: 'DEGRADED'` path.** Never exercised — no sensor failure or manual override was
  injected, so the `degradedSensors` column has never been non-empty.

### ❌ Never verified — known unknowns

- **The live OpenAI request path has never been exercised.** No API key is configured
  (`resolveApiKey()` returns empty, no `.env.local`). Everything up to the network call is verified;
  the call itself is not. Specifically unknown: whether `gpt-5.4-mini` is a valid model id for this
  account, whether the four-line contract actually holds in practice, and whether
  `reasoning_effort` / `max_completion_tokens` are accepted. **This is the single largest untested
  surface.**
- **`/about` has not been reconciled** with today's changes. `about/dossier-data.tsx` was modified by
  another session and I never checked it. The root `CLAUDE.md` treats `/help` + `/about` sync as
  mandatory. `/help` *was* updated (by `defadec`, for `predictEffect`/`rootMax`) — `/about` was not.
- **Existing recorded data is mixed-quality and probably not trainable.** ~4.4 MB in IndexedDB spans:
  pre-RAMP runs (instant severity, no incipient phase), `schemaVersion: 1` runs (no `rulQuality`), and
  runs recorded with the poisoned baseline. **Recommend wiping and re-collecting** before any training.

---

## 4. Deliberate decisions — do NOT "fix" these

Each of these looks like a bug at a glance. They are documented in-code; this is the index.

| Looks wrong | Why it is correct |
|---|---|
| AI diagnosis is not told the injected fault | Blind by design. JARVIS sees it; the diagnosis must not, or accuracy is meaningless. The recorded `faultClass` is the scorecard. `sensor-evidence.ts` header |
| `rulTrue_* = null` | Legitimate: the fault genuinely cannot reach that band at its intensity cap. F05 alone cannot reach the 95 °C coolant alarm at **any** intensity |
| `ALREADY_BREACHED` with `rulTrue = 0` | Legitimate at idle — LO pressure really does sit below the rated-point running minimum. `SETTLING` is the flag for the *fabricated* ones |
| F07's matrix weights aren't bare `∂sensor/∂rootFactor` | F07 drives root factors to a *fraction* of severity (0.8, 0.3); those are folded into the weights. Must **not** be fed to the finite-difference test. `degradation-matrix.ts` F07 block |
| F07 can never trip `HI P-Crankcase` | Sub-alarm by design — it's a *rate* tell (P07), not an alarm (P08). Raising the coupling collapses P07/P08 discrimination |
| `chargeAirTemp` rated ≈ 63 °C | Correct — charge air is LT-cooled. Alarm band is 75/80, above rated. Don't lower the physics |
| `rul.ts` does not call `predictEffect()` | *Was* correct while `predictEffect` was broken. **Now stale — see §5** |
| Faults don't advance unless `CLUTCHED`/`LOADED` | `engine.ts:397`. A fault injected while declutched stays inert at severity 0. Correct, but it will look broken |

---

## 5. Known gaps / ranked audit targets

Ordered by where I have least confidence.

1. **Live OpenAI path.** Add a key on `/ai`, click a gauge → Analyze. Confirm via
   `read_network_requests` that the body carries `max_completion_tokens` and **no** `temperature`, and
   that the reply obeys VERDICT/MECHANISM/CAUSE/ACTION at ≤90 words. Also confirm `gpt-5.4-mini`
   resolves — `ai-settings.ts` pins only that and `gpt-5.4-nano`.
2. **`rul.ts` now duplicates `predictEffect()`.** The comment at `rul.ts:19-23` says the local
   arithmetic was deliberate "until the spawned task fixes it". `defadec` fixed it. The
   `weight · severity · rootMax` math is now written twice — reconcile so they cannot drift.
3. **`LABEL_ERROR_TOLERANCE_MIN = 0.5` min is my judgement call**, not measured. Too tight discards
   good rows, too loose passes poison. Collect a run and plot the actual `labelErrorMinutes`
   distribution before trusting it.
4. **Wipe and re-collect training data** (see §3). Then check class balance on `/training`.
5. **`/about` reconciliation** — mandatory per root `CLAUDE.md`, not done.
6. **StrictMode + stateful feature builders.** `useDecision`'s `useMemo` calls
   `featureEngine.process()`, which is stateful (`RollingWindow`, lagged baseline). React double-invokes
   in dev. The training recorder has a `lastT` guard; **`useDecision` does not.** Pre-existing, but I
   never measured the impact — it could be perturbing live deviations in dev only.
7. **The two-stage lag cascade.** `BLAG` (features) and `BASELINE_LAG` (EngineContext) hold duplicated
   alphas (lube 0.06, jacket 0.02 in both) and stage 2's input is stage 1's output. Settling is much
   slower than either alpha suggests. Worth a design decision — but changing it moves **every**
   deviation and risk score in the app, so do not touch casually.
8. **`pistonCoolingPress` alpha mismatch** — 0.06 in `BLAG`, 0.05 in `BASELINE_LAG`. Cosmetic; noted
   rather than "fixed" for the same reason as (7).

---

## 6. How to run things

```bash
# All tests (110 total)
cd marine-pdm/packages/ui && npx vitest run          # 54
cd marine-pdm/packages/simulator && npx vitest run   # 46  (physics.test.ts takes ~45 s)
cd marine-pdm/packages/decision && npx vitest run    # 10

# Typecheck
cd marine-pdm && npx tsc --noEmit -p packages/ui/tsconfig.json
```

Dev server: use the preview tool with `.claude/launch.json` → `marine-pdm-ui` (port 5173).
**Never** run vite via Bash.

**To reach a state where faults actually develop:** QUICK START → CLUTCH → speed lever to 1150.
Phase must read `LOADED` or `CLUTCHED`, otherwise `tickFaultsMTU8000` never runs and severity stays 0.

**To inspect recorded data**, open devtools on the app and query IndexedDB `marine-pdm-training`
(stores: `runs`, `samples`, `episodes`, `meta`).

---

## 7. Open questions for the user

1. Should the mixed-schema training data be wiped? (My recommendation: yes.)
2. Is the expense-tracker backup ref safe to purge, i.e. does that project live elsewhere?
3. Is `gpt-5.4-mini` the intended model, and is there a key to test with?
4. Delete this file after the audit, or keep it updated as a rolling handover?
