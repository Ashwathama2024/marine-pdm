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
3. **Exhaust probes: both `B4A1`–`B4B10` and flat `B4.1`–`B4.20` appear in the OEM set.** The
   sensor-location deck labels each physical probe by bank; the alarm/limit list (ZNG00028788) writes
   the range flat. We follow the location deck everywhere, including `tag-map.ts`, which used to
   disagree. This is safe regardless of which form a vessel's IPMS uses, because `mtuDesignation` is a
   **label with no consumer** — subscription goes through `nodeId`. `topology.test.ts` joins the two
   registries on the snapshot field so they cannot drift apart again.
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

`GaugeGrid.tsx` used to hold its own copy of the severity function *and* repeat every per-sensor band
width at its twelve call sites. It now passes a `sensorId` and paints `severityTier(sensorSeverity(…))`,
so the rule exists once. Its `dynamicPressBand` helper is gone — that logic is `bandFor` in
`sensor-severity.ts`, and `sensor-severity.test.ts` now pins it along with the four tier boundaries.

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

- ~~**Spray-oil temperatures**~~ — **DONE.** And the note above was wrong on two counts: there are
  **ten**, not twenty, and they are per **crank throw**, not per cylinder (a 20V shares each throw
  between two opposing con-rods). `B77.11`–`B77.20`, ECS channels `B1`–`B10`, on the B-side crankcase
  wall — MS15082/00E p38, drawing TD0000012616_096. The alarm is a **difference**, not a band: MTU
  codes no absolute limit for spray oil anywhere, only T-Splash Oil Difference Lim1 +4 °C warning /
  Lim2 +6 °C shutdown against the mean of the ten. Modelled in `mtu8000-physics.ts`, coupled to F04
  through the two throws either side of a hot bearing, displayed by `dashboard/SprayOilPanel.tsx`.
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

### D. Full-screen immersive mode — **BUILT**
`useFullscreen.ts` takes the real Fullscreen API on the page's own shell element, not a `position:
fixed` overlay, so the sidebar and header genuinely leave the screen and Escape works without us
binding a key. The ⤢ button is in the controls pill; it hides itself entirely when the browser cannot
do fullscreen rather than dead-ending.

**Selecting and travelling are separate decisions, in both modes.** Clicking a part — on the canvas or
in the dock — only opens its detail panel. The ▶ FLY button on that panel is the *only* thing that
moves the camera. A first cut flew on any canvas click while full screen and it read as the view
lurching away the moment you touched anything; do not reintroduce it.

Both spellings of the API are handled (Safari is still webkit-prefixed) and the state is driven by the
`fullscreenchange` event rather than by the outcome of our own call, because Escape and F11 bypass us.
`requestFullscreen` **rejects** rather than throws when refused, so it is caught — verified in the app
by clicking the button programmatically, which has no user gesture: refused, no unhandled rejection.

### C. Stage 3 — cable fly-through — **BUILT**
`fly-through.ts` plans the flight (pure, 17 tests), `FlyCamera.tsx` flies it, and the ▶ FLY button on
the detail panel is its single trigger. Routing was extracted to `cable-route.ts` so the camera
follows the **same** polyline `Network.tsx` draws the harness along — two readings of "where does this
cable go" would have drifted invisibly until the camera flew through the block.

**It follows a cable for 42 of the 90 parts** (was 26). Everything else takes a direct framing arc.
Both paths are tested. The rest is missing survey data, not missing code — see §8 for where it is and
how to read it; populating `CABLES` upgrades those parts automatically with no change to the flight.

⚠ **Never seen move.** The Browser pane does not composite in this environment (§6), so `useFrame`
never runs and the flight cannot be observed here — `document.hidden` is true and the canvas stays at
the 300×150 default. The planner was verified against the live registry through the page's own module
graph, and the geometry is pinned by tests, but the *motion* is unverified. Ask for a screen recording.

---

## 7b. The engine harness — where the rest of `CABLES` comes from

The connector drawings in `D:\ECS 8K MTU I 2024\` are the authority for sensor → unit → pin. They are
**image-only**: no text layer worth decoding, so rasterise at ~185 dpi and read. Each is a handful of
A3 sheets and each sheet lays out 8 runs side by side — sensor symbol at the bottom with its
designation and range, pin letters along the connector strip at the top.

| Drawing | Connector | Carries |
|---|---|---|
| `5695393600_a` | EMU 2-I **X5.1** | the 20 exhaust probes ✅ *done* |
| `XZ00E50000575_3_b` | EMU 2-I **X5.2** | air before booster B1/B2, coolant after cooler |
| `XZ00E50000106_c` | EMU 2-I **X5.3** | ✅ bearings B57.1–11, TC A1/A2 · **not yet**: B5.1/B5.4/B5.5 LO pressures, B6.2 coolant, B13.2/B13.3 speeds, B16.2, B19 starting air, B21 raw water, B24.1/B24.2 oil pan level |
| `X00013729_L`, `XZ00E50000199_R` | EMU 2-II **X5.3** | spray oil B77.11–B77.20 (T-SPRITZÖL A6–A10, B6–B10) |
| `XZ00E50000105_f` | ECU-4 **X2** | ✅ TC B1/B2 · **not yet**: lube oil temp, charge-air temp, fuel after filter |
| `5695393400_b` | ECU-4 **X3** | HP pump, start interlock, starting air |
| `5695392600_a` | ECU-4 **X4** | **the 20 injection valves** — the largest remaining block |

Pin pairs read so far, for the format: `B57.1` → X5.3 NN/PP · `B57.2` → LL/MM · `B57.3` → JJ/KK ·
`B44.1` → E/F · `B44.2` → C/D · `B4A1` → X5.1 PP/NN through `B4A8` → z/y.

**Only write a terminal you have actually read.** Rows here carry `X5.3 NN/PP` where the pins were
seen and bare `X5.3` where only the connector is known. A pin number nobody has verified is worse
than no pin number.

⚠ The two **wiring diagrams** (`BZ599001`, `BZ599002`) are a red herring for this: they *do* have a
text layer, but it is drawing-frame furniture, and the drawings themselves are **ship** wiring —
unit-to-vessel (LOP, CB, PIM, power), not the engine sensor harness. Their equipment-code table on
sheet 2 is still the best reference for what `+A001`…`+X020` mean.

## 8. Immediate state

Dev server: `preview_start` with name `marine-pdm-ui`. **Binds 5173, not the 5174 in launch.json.**
Engine starts at `ENGINE_OFF` — the model renders dimmed and static until started, by design.
