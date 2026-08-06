# `/engine3d` — Handover

Branch `claude/display`. 13 commits, **none pushed**. 176 UI specs pass, `pnpm typecheck` clean.

An interactive 3D view of the MTU 20V 8000 at `/engine3d`: green wireframe on black, every part
clickable and bound to live data, with the ECS 8000 control network drawn over it in yellow.

---

## 1. What exists

| File | Owns |
|---|---|
| `topology.ts` | **The data contract.** `PartDef` + `CableDef`, the ~90-part registry, the cable registry, `resolvePick`, `partsInside`. Edit this when drawings arrive. |
| `engine-layout.ts` | All procedural geometry maths. Every layout number lives here and nowhere else. |
| `ecs-network.ts` | ECS 8000 buses + node numbers. |
| `ecs-units.ts` | Reference prose for each control unit (the control-side equivalent of `DOSSIER_ENTRIES`). |
| `unit-models.ts` | Surface detail for the 8 ECS units — connectors, keypad, lids. |
| `part-risk.ts` | Pure severity logic, kept out of React so it is testable without WebGL. |
| `Scene.tsx` · `Parts.tsx` · `Network.tsx` | Canvas/bloom · meshes + frame loop · buses and harness. |
| `Hud.tsx` · `MagButton.tsx` · `PartDetailPanel.tsx` | Overlay chrome · magnetic buttons · click-to-identify. |
| `useLiveBridge.ts` | 1 Hz tick → refs, so the R3F tree never re-renders on data. |
| `useReducedMotion.ts` | Gates all decorative motion. |
| `pages/Engine3D.tsx` | Layout only. |
| `services/sensor-severity.ts` · `services/turbo-state.ts` | **Shared with the dashboard** — see §4. |

Registered in the four mandatory places: `App.tsx` (lazy route — the only one), `Sidebar.tsx`,
`jarvis-self-knowledge.ts` `APP_MAP`, and `global.css` (`--accent-green`, `.e3d-*`).

---

## 2. Source documents, and how to read them

Three decks in `D:\ECS 8K MTU I 2024\ECS 8K MTU I 2024\`. **They are text-obfuscated.**

- `4a_Sensor location_ECS-8000.pdf` — 85 sensors across 4 views, with OEM designations. Shift **+29**.
- `4b_Sensor location.pdf` — same family. Shift **+29**.
- `3_ECS 8000 Intro.pdf` — system overview, CAN, cylinder cutout. **Mixed +29 and −29 per font.**

`pdftotext` is **not** usable: digits land on control characters (0x13–0x1C) and it silently drops
them, taking every item number and cylinder number with it. Use PyMuPDF (`fitz`, already installed):

```python
import fitz
def dec(s, k):                      # k = +29 or -29
    out = []
    for ch in s:
        o = ord(ch)
        if ch in ' \n\t\r': out.append(ch)
        else:
            n = o + k
            out.append(chr(n) if 0x20 <= n <= 0x7e else ch)
    return ''.join(out)
```

`fitz` also rasterises pages (`page.get_pixmap(dpi=140).save(...)`), which is how the drawings were
read. Decode both directions and use whichever section is legible.

**Also available:** the MTU 8000 data sheet (envelope + displacement) and the ECS 8000 unit slides
(ECU 4, EMU 2-1/2-2, LOP 8, MEU 1, X11, GCU 3/6, PIM 4) — these came in as pasted images.

---

## 3. What the documents corrected

Each of these was a wrong guess the drawings overturned. Do not re-introduce them.

1. **Cylinder pitch is 470 mm**, derived from 16V 5682 mm vs 20V 6622 mm (940 mm ÷ 2 cylinders).
   An earlier guess of 1.40 × bore = 371 mm was 27% short and moved every position.
2. **The turbochargers are at the DRIVING end**, with cylinder 1 and bearing 1 — not the free end.
   The free end is the gear train: camshaft speed, HP fuel pumps, coolant and raw-water pumps.
3. **Exhaust probes are `B4A1`–`B4A10` / `B4B1`–`B4B10`**, not flat `B4.1`–`B4.20`.
   ⚠ `packages/ingestion/src/tag-map.ts` **still generates the flat form.** The two disagree and one
   is wrong. Left alone deliberately — it may match what the IPMS actually publishes. Unresolved.
4. **There are no per-bank junction boxes.** One terminal box, CB-X11. All 20 exhaust probes land on
   EMU 2-I connector X5.1.
5. **LO filter ΔP is across B5.1/B5.5**; B5.3/B5.4 are the last-bearing tappings.

---

## 4. Conventions and traps

**Frame:** +X from driving end (x=0) to free end (6.622). +Y up, y=0 = crank axis. +Z = B-side.

**Never invent a second rule.** Two bugs came from exactly that, both user-reported:
- Severity was computed as `|actual−expected|/expected/15%` while the gauges used a direction-aware,
  deadbanded, per-sensor alarm band. Fixed by extracting `services/sensor-severity.ts`.
- Turbochargers read `snapshot.tcSpeeds[i]`; the dashboard derives from `tcRPM × (4/activeCount)`.
  Fixed by extracting `services/turbo-state.ts`.

⚠ **`GaugeGrid.tsx` still holds its own copy of the severity function.** The band table is
single-sourced; the function body is not. This is the remaining drift surface.

**Live data must not re-render the R3F tree.** `useLiveBridge` writes into refs; `useFrame` mutates
materials. `setState` only on selection. R3F v8 does not forward React context into `<Canvas>` —
pass refs as props.

**Enclosures.** A box containing other parts must set `enclosure: true`, or it steals their clicks
and hides them (this made all 4 turbos and all 11 bearings unselectable). A test enforces it.

**`provenance`.** Every cable declares `'seed'` or `'vessel'`. All rows are currently `'vessel'`.
If you add invented routing, mark it `'seed'` — it renders dimmed and badged.

**Off-engine parts** set `offEngine: true` and are excluded from the envelope guard.

---

## 5. Guards worth knowing

- Envelope: assembled AABB must fit **and fill ≥85% of** 6622 × 2279 × 3439.
- Every sensor tag resolves in `SENSOR_META`; every `componentId` in `DEGRADATION_COMPONENTS`.
- OEM designations pinned (`B4A4`, `B57.11`, `B44.1/2/11/12`).
- Turbochargers at the driving end; gear train at the free end.
- Every subassembly reachable from the dock (a 6+6 slice once orphaned Sensor Harness).
- ECS node numbers agree between `ecs-network.ts` and `ecs-units.ts`.
- Unmarked box containing another part → fail, naming both.

---

## 6. Verification — read this before trying

**The Browser pane never composited in this entire session.** `requestAnimationFrame` never fires,
so R3F leaves its canvas at the 300×150 default. Screenshots are impossible. Everything was verified
by DOM measurement and by importing modules through `javascript_tool` against the running app.

Two techniques that worked well:

- **Drive the sim from the page:** `const m = await import('/src/context/EngineContext.tsx')` then
  `m.engine.quickStart()`, `m.engine.setRPM(1150)`. Confirms the live path end to end.
- **Orthographic projection:** dump `PARTS` to JSON via a throwaway vitest spec (vitest resolves the
  `@marine-pdm/*` aliases), then project side/top/end views with PIL and *look* at the PNG. This is
  how the geometry was checked against the drawings. Scripts were in the session scratchpad and are
  **gone** — recreate if needed.

The user's screenshots are the only real visual feedback. Ask for them.

---

## 7. Next aims

### A. Gap analysis: documents → main model
The 3D view consumed the manuals; **the rest of the app has not.** Known gaps found while building:

- **Spray-oil temperatures `B77.1`–`B77.20`** (20 per-cylinder sensors on EMU 2-II / X5.3) are
  **entirely unmodelled** — no `SENSOR_META`, no physics, no baseline, no fault coupling. Probably
  the single largest addition available, and per-cylinder piston-cooling temperature is genuinely
  diagnostic.
- Also undocumented in-app: `B24.1/B24.2` oil level, `F46.1/F46.2` leak-off fuel level, `B19`
  starting air, `S37` start interlock, `B34.1/B34.2` fuel filter ΔP, `B16.1/2/3` coolant pressures,
  `B6.3/B6.4` coolant temps, `B21` raw water, `B78` epsilon lube oil, `B3/B10.2` intake air,
  `Y26/Y29` TC solenoids, `B1` camshaft speed, `B13.3` barring speed.
- `ME.CrankcasePressure`, `ME.ExhaustBackPressure`, `ME.CoolantPressure`, `ME.LubeOilTemp` have
  gauges and/or matrix effects but **no `SENSOR_META` entry**.
- Cylinder cutout (ECU 4 switches off individual injection valves at low load) is in the manual and
  **not in the simulator**.

Adding a sensor is an 8-step process — see root `CLAUDE.md` → "New sensor". Miss step 7 and the RUL
columns go silently null.

### B. Make the engine look more like the photographs
Current geometry is dimensionally correct (envelope, pitch, counts, end orientation) but is
primitive boxes and cylinders. It reads as a correct schematic, not as the engine. Options, in
increasing order of fidelity:

1. More composite detail, as done for the ECS units in `unit-models.ts` — that pattern extends to
   cylinder heads, the TC group, the gear train.
2. A reference photo on a toggleable `PlaneGeometry` behind the model for calibration
   (needs `packages/ui/public/`, which does not exist yet).
3. A real `.glb`. `PartDef.glbNodeName` is reserved for exactly this — the swap was designed to be
   part-for-part without touching interaction, cables or data binding.

Also outstanding: **off-engine cabinet positions are mine, not surveyed.** MEU 1, GCU 6, CB-X11 and
the MCS are placed for legibility. An engine-room GA would make them real.

### C. Stage 3 — cable fly-through
Never built. Camera tweens along a `CatmullRomCurve3` through the cable waypoints to the clicked
subassembly. Data is all in place.

---

## 8. Immediate state

Dev server: `preview_start` with name `marine-pdm-ui`. **Binds 5173, not the 5174 in launch.json.**
Engine starts at `ENGINE_OFF` — the model renders dimmed and static until started, by design.
