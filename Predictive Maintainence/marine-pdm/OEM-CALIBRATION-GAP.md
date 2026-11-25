# OEM Calibration Gap — diagnosis and correction plan

> **Status: CLOSED 2026-11-25. Phases 0–8 complete.**
> Opened 2026-08-06 from the MTU manual set. Closed on branch `claude/epic-blackwell-7f2044`,
> eight commits, one per phase.
> Linked from root `CLAUDE.md`, `packages/simulator/CLAUDE.md`, `shared/CLAUDE.md`.
>
> **The ground truth now lives in code**, not in this document: `shared/src/oem-limits.ts` holds all
> 41 rows of ZNG00028788 sheet 1 and all 13 curves of sheet 2, and every threshold in the app is
> DERIVED from it. The drawing was re-read at 340 dpi before any code changed — §2 below was correct
> in every value; see [`ZNG00028788-VERIFICATION.md`](./ZNG00028788-VERIFICATION.md).
>
> This file is kept as the record of what was wrong and why. §4 is the account of how the envelope
> drifted, and §8's Progress Log is the only place that says which numbers moved and on whose
> authority — read both before changing a threshold.

---

## 0. The finding in one paragraph

The simulator's physics is **not calibrated to the MTU 8000's own alarm envelope**. On five
parameters a *healthy* engine in this simulator sits on the wrong side of a limit the real ECS would
act on — three of them past a **shutdown** threshold. On two others the app enforces limits several
times tighter than the OEM codes. Every number downstream of the physics — the `seed.ts` baselines,
the degradation weight matrix, the risk scores, the analytic RUL labels and therefore **every training
row already written to IndexedDB** — inherits the error. This is not a limits problem that can be
fixed by editing thresholds; the thresholds are the only part we now have OEM proof for.

---

## 0b. The baseline, stated plainly

So there is no ambiguity about what this model is calibrated to — for a reader of the paper as much
as for the next person editing the code.

**This is a proof of concept for the prognosis method, not a certified MTU digital twin.** The
structure is meant to be right and every number traceable, so that re-pointing it at a different
engine, build state or hull is a change to `oem-limits.ts` — data — and not a change to the
physics, the matrix or the decision layer. That is a design goal, not an excuse: the numbers below
are the OEM ones.

Three categories, and the code says which is which:

| | Where it comes from | How it is written | How to recalibrate |
|---|---|---|---|
| **Coded limits** | MTU drawing `ZNG00028788`, verified at 340 dpi | `oemCurve(n, rpm)` / `oemScalar(id)` — derived, never typed | Edit `shared/src/oem-limits.ts` only. Everything downstream follows |
| **Physics coefficients** | Fitted so a healthy engine clears those limits with margin at every speed | Literals in `mtu8000-physics.ts`, each with the limit it clears in the comment | Refit, then re-run `oem-envelope.test.ts`; the matrix must move with it |
| **App-only thresholds** | No OEM counterpart exists | Marked **`NOT OEM`** in the comment | Free to change — but say so |

**The healthy rated point (85 % load, 1150 RPM)** is the reference every residual in this system is
measured from. `seed.ts`'s `PRIMARY_BASELINES` are exact mirrors of the physics at that point, so a
healthy engine produces a residual of ~0 by construction, and any deviation is signal:

| Sensor | Healthy at rated | Nearest OEM limit | Margin |
|---|---|---|---|
| Mean exhaust temp | 440 °C | 700 °C warn (curve 10) | 260 °C |
| Lube-oil temp | 78.3 °C | 83 °C warn (T-Oil Lim1) | 4.7 °C |
| LO gallery pressure | 7.16 bar | no coded limit | — |
| Last-bearing pressure | 6.59 bar | 5.8 warn / 5.3 **SS** (curves 3, 4) | 0.79 bar |
| Piston-cooling pressure | 6.09 bar | 5.2 warn / 4.7 **SS** (curves 1, 2) | 0.89 bar |
| Bearing temp (hottest of 11) | ~100 °C | 115 warn / 120 **SS** | 15 °C |
| Coolant temp | 76.8 °C | 95 warn / 97 power reduction | 18 °C |
| Coolant pressure | 5.00 bar | 4.1 warn (curve 0) | 0.9 bar |
| Charge-air temp | 63 °C | 75 UL / 20 LL | 12 °C |
| Exhaust back pressure | 38.3 mbar | 50 warn / >70 fuel limitation | 11.7 mbar |
| Crankcase pressure | −0.725 mbar | 27 warn (curve 9) | 27.7 mbar |
| Fuel temp | 43 °C | 45 warn / 50 power reduction | 2 °C |
| Spray-oil spread | 2.2 °C | 4 warn / 6 **SS** (difference) | 1.8 °C |
| TC speed | 28 000 rpm | 40 500 / 41 000 | 12 500 rpm |

Two numbers in that table are knowingly NOT referenced to the manual, and the paper should say so:

- **SFOC ~185 g/kWh.** No SFOC table has been located in this manual set. The figure is the
  simulator's own, unsourced. (§3.4.)
- **Rail pressure 1200 bar floor.** MTU codes a *deviation* limit (50 bar from setpoint, MDEC 18),
  not an absolute floor. Different concept, so the absolute band is ours. (§3.4.)

---

## 1. Where the data comes from

### 1.1 The manual set

```
D:\1 Work\05 Engines\ECS 8K MTU I 2024\
```

> **Path corrected 2026-11-25.** This read `D:\ECS 8K MTU I 2024\`, which no longer exists. Two
> further copies sit under `D:\1 Work\05 Engines\_Duplicates\` — ignore those.

46 entries, 40 of them PDFs. The ones that matter for calibration, in priority order:

| File | Holds | Extractable? |
|---|---|---|
| `4e_ Alarm Limit XZ56900100007.pdf` | **The master limit list.** MTU drawing `ZNG00028788`, 2 sheets: sheet 1 = every coded alarm with value/unit/delay/action/sensor; sheet 2 = the 13 RPM-indexed limit *curves* those entries reference | **Image only — no text layer.** Must rasterise and read |
| `4a_Sensor location_ECS-8000.pdf` | 85 sensors across 4 views with OEM designations and positions | Text, shift **+29** |
| `4b_Sensor location.pdf` | Same family | Text, shift **+29** |
| `4c_Sensor measurment setup & Tables.pdf` | Sensor measurement setup, characteristic tables | Text, pages 3–6 |
| `4d_Pressure Sensor Calculation.pdf` | Pressure sensor scaling / raw→engineering conversion | Not yet read |
| `3_ECS 8000 Intro.pdf` | System overview, CAN, cylinder cutout | Text, **mixed +29 and −29 per font** |
| `4_2300 LOP fault message_ECS-5 8000.pdf` | LOP fault messages incl. per-sensor wiring checks (confirms B77.11–B77.20) | Text, shift +29 |
| `4_2500 ECU-4 fault code_ECS-5 8000.pdf` | ECU-4 fault codes | Not yet read |
| `X00013729_L_(EMU II X5.3).pdf` | EMU II connector X5.3 — where the B77 splash-oil sensors land | Text p1 only |
| `5695393600_a (EMU I X5.1).pdf` | EMU I connector X5.1 — the 20 exhaust probes | Text p1 only |

### 1.2 Reading the obfuscated text

The decks shift every glyph by ±29, and **it varies per font within a single page**. `pdftotext` is
unusable: digits land on control characters `0x13`–`0x1C` and it silently drops them, taking every
item and cylinder number with it. Use PyMuPDF (`fitz`, installed, v1.26.7):

```python
import fitz

def dec(s, k):                      # k = +29 or -29
    out = []
    for ch in s:
        if ch in ' \n\t\r':
            out.append(ch)
        else:
            n = ord(ch) + k
            out.append(chr(n) if 0x20 <= n <= 0x7e else ch)
    return ''.join(out)
```

Decode **both** directions and keep whichever section is legible. A working scanner is reproduced in
§9 — recreate it in the session scratchpad, it is not checked in.

### 1.3 Reading the image-only drawings

`4e` and most connector sheets have no text layer. Rasterise and read the PNG:

```python
page.get_pixmap(dpi=340, clip=fitz.Rect(x0, y0, x1, y1)).save('out.png')
```

150 dpi is enough to find a table; **340 dpi on a clipped region** is what makes the digits reliable.
Every number in §2 below was read at 340 dpi. Do not trust a full-page render for values.

### 1.4 Provenance rule

> **Every limit, threshold, baseline target and model coefficient must trace to a manual page.**

When adding or changing one, cite the drawing number and sheet in the code comment, as
`MTU8000_LIMITS.lubeOil.bearing_temp_max` now does. A value with no citation is a guess and must be
marked as such so it can be found later. This is the rule the gap below came from breaking.

---

## 2. The OEM ground truth (transcribed, 340 dpi, verified)

### 2.1 Limit list — ZNG00028788 sheet 1

Header: *"Valid for 20V8000BM00, 20V8000BM01, 16V8000BM01"*. Stamped **ONLY FOR TRAINING PURPOSE**.

| Monitored value | MDEC par. | Limit | Unit | Delay s | Action | Sensor |
|---|---|---|---|---|---|---|
| P-Coolant Lim1 | 2D-16 | curve 0 ↓ | bar | 5.0 | warning | B16.1 |
| P-Coolant Lim2 | 90,05 | offset 0.5 ↓ | bar | 1.0 | power reduction | B16.1 |
| Oil Pressure Piston Cooling Lim1 | 2D-26 | curve 1 ↓ | bar | 5.0 | warning | B5.2 |
| Oil Pressure Piston Cooling Lim2 | 2D-27 | curve 2 ↓ | bar | 2.0 | **shut down** | B5.2 |
| P-Oil last bearing Lim1 | 2D-17 | curve 3 ↓ | bar | 3.0 | warning | B5.3/B5.4 |
| P-Oil last bearing Lim2 | 2D-29 | curve 4 ↓ | bar | 1.0 | **shut down** | B5.3/B5.4 |
| P-Lube Oil Filter Difference | 2D-53 | curve 5 ↑ | bar | 3.0 | warning | B5.1/B5.5 |
| P-Fuel after Filter Lim1 | 2D-15 | curve 6 ↓ | bar | 5.0 | warning | B34.2 |
| P-Fuel Difference Lim1 | 2D-28 | curve 7 ↑ | bar | 10.0 | warning | B34.1/B34.2 |
| P-Raw Water after Pump Lim1 | 2D-47 | curve 8 ↓ | bar | 10.0 | warning | B21 |
| P-Raw Water after Pump Lim2 * | 233.02 | offset −0.1 ↓ | bar | 3.0 | fuel limitation | B21 |
| P-Crankcase Lim1 | 2D-18 | curve 9 ↑ | mbar | 5.0 | warning | B50 |
| P-Crankcase Lim2 | 91,05 | offset 10 ↑ | mbar | 1.0 | **shut down** | B50 |
| Deviation Limit P-Rail | 18 | 50 | bar | 20.0 | fuel limitation | B48 |
| T-Coolant Lim1 | 65,01 | 95 ↑ | °C | 5.0 | warning | B6.1/B6.2 |
| T-Coolant Lim2 | 65,03 | 97 ↑ | °C | 3.0 | power reduction | B6.1/B6.2 |
| T-Charge Air LL | 66,03 | 20 ↓ | °C | 5.0 | warning | B9 |
| T-Charge Air UL | 66,01 | 75 ↑ | °C | 5.0 | warning | B9 |
| T-Oil Lim1 | 72,01 | 83 ↑ | °C | 5.0 | warning | B7 |
| T-Oil Lim2 | 72,03 | 85 ↑ | °C | 3.0 | power reduction | B7 |
| T-Bearing Mean | 50,03 | 112 ↑ | °C | 3.0 | warning | B57.1–B57.11 |
| T-Bearing Diff | 49,03 | 20 | °C | 3.0 | warning | B57.1–B57.11 |
| T-Bearing Lim1 | 49,04 | 115 ↑ | °C | 3.0 | warning | B57.1–B57.11 |
| T-Bearing Lim2 | 49,05 | 120 ↑ | °C | 1.0 | **shut down** | B57.1–B57.11 |
| T-Splash Oil Difference Lim1 | 39 | 4 ↑ | °C | 3.0 | warning | B77.11–B77.20 |
| T-Splash Oil Difference Lim2 | 39,01 | 6 ↑ | °C | 1.0 | **shut down** | B77.11–B77.20 |
| T-Exhaust Mean | 2D-50 | curve 10 ↑ | °C | 10.0 | warning | B4.1 bis B4.20 |
| ” | 51,03 | offset 20 °C | °C | 10.0 | warning | ” |
| Single T-Exhaust LL | 2D-51 | curve 11 ↓ | °C | 10.0 | warning | ” |
| ” | 52 | offset 10 °C | °C | 10.0 | power reduction | ” |
| Single T-Exhaust UL | 2D-52 | curve 12 ↑ | °C | 10.0 | warning | ” |
| ” | 52,01 | offset 10 °C | °C | 10.0 | power reduction | ” |
| T-Fuel Lim1 | 70,01 | 45 ↑ | °C | 3.0 | warning | B33 |
| T-Fuel Lim2 | 70,03 | 50 ↑ | °C | 3.0 | power reduction | B33 |
| Leakage Fuel Level High Lim1 | 62,02 | x | digits | 15.0 | warning | F46.1/F46.2 |
| T-Raw Water before Cooler | 143,01 | 32.5 ↑ | °C | 0.0 | warning | B008.2 |
| T-Raw Water before Cooler | 2D-58 | >33 ↑ | °C | 0.0 | fuel limitation | B008.2 |
| T-Raw Water after Cooler | 53.00 | 47 ↑ | °C | 0.0 | warning | B008 |
| T-Raw Water after Cooler | 2D-59 | >48 ↑ | °C | 0.0 | fuel limitation | B008 |
| Exhaust Gas Back Pressure | 3D-107 | >70 ↑ | mbar | 0.0 | fuel limitation | — |
| Emergency Stop - Local | — | — | — | — | **shut down** | — |

\* only external sea water pump.

**Per-variant block (same sheet, right column).** The project targets a 20V M71/M71L; the build state
is an open question (§7).

| Variant | Engine overspeed | ETC overspeed Lim1 | Lim2 | Exh. back press. |
|---|---|---|---|---|
| 20V8000 BM00 | 1240 shut down | 40 700 warning | 40 900 power red. | 50 mbar warning |
| 20V8000 BM01 (except M91L) | 1323 shut down | 40 500 | 41 000 | 50 mbar |
| 20V8000 M91L | 1323 shut down | 40 800 | 41 000 | 50 mbar |
| 16V8000 BM01 | 1323 shut down | 41 300 | 41 800 | 55 mbar |

Sensors: overspeed `B13.1`; ETC `B44.1 / B44.2 / B44.11 / B44.12`; back pressure `B41.1`.

### 2.2 Limit curves — ZNG00028788 sheet 2

All for 20V8000BM00 / 20V8000BM01 / 16V8000BM01. Curves 0–9 are indexed by **engine RPM**;
curves 11–12 are 2D maps indexed by the **mean exhaust temperature**.

| # | Curve | Index | Values |
|---|---|---|---|
| 0 | Coolant Pressure Lim1 (bar) | 300, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500 | 0, 0, 0.2, 0.6, 1.6, 2.4, 3.2, **4.1**, 4.1, 4.1 |
| 1 | Oil Press. Piston Cooling Lim1 (bar) | 0, 300, 400, 500, 600, 800, 900, 1000, 1150, 1400 | 0, 0.4, 0.7, 1.1, 1.5, 3.5, 4.5, 5.2, **5.2**, 5.2 |
| 2 | Oil Press. Piston Cooling Lim2 (bar) | 0, 300, 400, 500, 600, 800, 900, 1000, 1150, 1400 | 0, 0.2, 0.4, 0.7, 1, 3, 4, 4.7, **4.7**, 4.7 |
| 3 | Oil Press. Last Bearing Lim1 (bar) | 0, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500 | 0, 2.3, 2.7, 3, 4, 4.5, 5, **5.8**, 5.8, 5.8 |
| 4 | Oil Press. Last Bearing Lim2 (bar) | 100, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500 | 0, 2, 2.4, 2.5, 3.5, 4, 4.5, **5.3**, 5.3, 5.3 |
| 5 | Oil Filter ΔP Lim1 (bar) | 300, 380, 500, 600, 800, 900, 1000, 1150, 1400, 1500 | 0.3, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, **0.8**, 0.9, 1 |
| 6 | Fuel Press. After Filter Lim1 (bar) | 300, 380, 500, 600, 800, 900, 1000, 1200, 1400, 1500 | 0, 4.5, 4.7, 4.7, 4.7, 5, 5, **5**, 5, 5 |
| 7 | Fuel Filter ΔP Lim1 (bar) | 100, 300, 400, 500, 600, 700, 800, 900, 1150, 1500 | 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, **1**, 1 |
| 8 | Raw Water Press. After Pump Lim1 (bar) | 100, 380, 500, 600, 800, 900, 1000, 1100, 1150, 1200 | 0.2, 0.2, 0.3, 0.5, 0.8, 1.2, 1.4, 1.6, **1.8**, 1.8 |
| 9 | Crankcase Air Pressure Lim1 (mbar) | 100 → 1500 | **27** at every point (flat) |
| 10 | Exhaust Temp. Mean Lim1 (°C) | 100, 300, 500, 600, 800, 900, 1000, 1100, 1150, 1200 | 400, 600, 640, 640, 640, 660, 700, 700, **700**, 700 |
| 11 | Single Cyl. Exhaust LL (°C) | mean 100, 200, 300, 400, 500, 600, 650, 670, 680, 700 | 10, 100, 200, 300, 400, 500, 550, 570, 580, 600 |
| 12 | Single Cyl. Exhaust UL (°C) | mean 100, 200, 300, 400, 500, 600, 650, 670, 680, 700 | 200, 300, 400, 500, 600, 670, 700, 715, 720, 720 |

Bold = the value at rated 1150 RPM, which is what §3 compares against.

---

## 3. The gap

App values are the physics functions evaluated directly at rated (**85 % load, 1150 RPM**), not
UI readings. Reproduce with the snippet in §9.2.

### 3.1 Class A — the simulator's *healthy* engine violates an OEM limit

These are the serious ones. A limit is not a target; being on the wrong side of one at healthy load
means the **physics** is wrong, not the limit.

| Parameter | App healthy @ rated | OEM limit | Gap | Severity |
|---|---|---|---|---|
| LO temperature `B7` | **98.2 °C** | Lim1 83 warn / Lim2 85 power reduction | **+13.2 °C past Lim2** | power reduction on a healthy engine |
| Exhaust back pressure `B41.1` | **99.5 mbar** | 50 warn / >70 fuel limitation | **+29.5 mbar past the fuel-limitation point** | fuel limitation on a healthy engine |
| Piston cooling pressure `B5.2` | **~4.35 bar** | Lim1 5.2 warn / Lim2 4.7 **shutdown** | **−0.35 bar below shutdown** | engine would not run |
| Last-bearing LO pressure `B5.3/B5.4` | **~3.51 bar** | Lim1 5.8 warn / Lim2 5.3 **shutdown** | **−1.79 bar below shutdown** | engine would not run |
| Coolant pressure `B16.1` | **~2.0 bar** | Lim1 4.1 warn | −2.1 bar below warning | permanent warning |

### 3.2 Class B — app limits far tighter than the OEM codes

Here the physics may be fine but the threshold was invented. These make the model alarm on things
the real ECS ignores, which inflates risk and mislabels training rows.

| Parameter | App limit | OEM | Ratio |
|---|---|---|---|
| Exhaust mean HI (`exhaust.mean_hi`) | 460 °C | curve 10 → **700 °C** @1150 | app fires 240 °C early |
| Crankcase HI (`crankcase.pressure_hi`) | 5 mbar | curve 9 → **27 mbar** | app fires at 19 % of the OEM limit; F08 blow-by at `rootMax = 1` peaks at **7.28 mbar**, so it can never reach 27 |
| Raw water pressure min | 1.0 bar | curve 8 → 1.8 bar | not modelled yet |
| Fuel filter ΔP warn | 0.8 bar | curve 7 → 1.0 bar | app conservative |
| FO pressure pre-alarm | 5.5 bar | curve 6 → 5.0 bar | app conservative — acceptable |

### 3.3 What already agrees — do not "fix" these

| Parameter | App | OEM | |
|---|---|---|---|
| LO filter ΔP pre-alarm | 0.8 bar | curve 5 @1150 = **0.8** | exact |
| Single-cylinder exhaust UL | `cylinderTemp.preAlarmHigh` 540 °C | curve 12 at the app's own mean (440 → 540 by interpolation) | exact — the *relative* exhaust logic is right even though the absolute scale is not |
| Charge air UL | 75 °C | T-Charge Air UL 75 | exact |
| TC overspeed | 40 500 / 41 000 | BM01 40 500 / 41 000 | exact |
| Bearing HI | 115 °C | T-Bearing Lim1 115 | exact |
| Exhaust probe designations | `B4A1`–`B4B10` | location deck; limit list writes the range flat as `B4.1 bis B4.20` — **both are OEM** | see §7 |

### 3.4 Unreconciled, no OEM source found yet

- **SFOC.** `mtu8000-physics.ts` comments claim ~185 g/kWh nominal at 85 %; the live dashboard reads
  ~247 g/kWh. Neither is sourced. No SFOC table located in this deck — check `E531439_08E_FAL 5.pdf`.
- **Deviation Limit P-Rail** is a **50 bar deviation from setpoint**; the app models an absolute band
  (1450 / 1300 / 1200). Different concept, not a different number.
- **Engine overspeed**: app 1200/1210 vs OEM 1240 (BM00) or 1323 (BM01). Blocked on §7.

---

## 4. Why this happened

1. **Limits were tuned against the physics instead of the physics against the manual.** The comment
   trail says so explicitly — `pistonCoolingPress.preAlarmLow` reads *"was 4.5 — physics gives ~4.35
   bar at rated"*, and `bearing_temp_hi` *"was 100, too low for hot oil at rated"*. Each was a
   reasonable local fix for a false alarm; together they walked the whole envelope away from the OEM.
2. **The master limit list was never consulted.** `4e_ Alarm Limit XZ56900100007.pdf` is image-only,
   so text search never surfaced it, and the previous calibration passes worked from the sensor
   location decks alone.
3. **Nothing enforced provenance.** There was no rule that a threshold must cite a drawing, so
   invented values and OEM values are indistinguishable in the source today.

---

## 5. Blast radius

Everything below is calibrated to the current envelope and moves when it moves. This is why the fix
cannot be a threshold edit.

```
mtu8000-physics.ts  (rated operating point)
  └─> knowledge/src/seed.ts PRIMARY_BASELINES   — mathjs curves that MIRROR the physics
        └─> BaselineStore -> FeatureEngine -> baseline + instantBaseline
              ├─> decision/  risk scoring, patterns P01–P08, override-mtu8000.ts
              ├─> degradation-matrix.ts          — weights MUST equal the physics partials
              │     └─> rul.ts analyticRul()     — inverts that matrix
              │           ├─> rul-quality.ts
              │           └─> training-recorder.ts  -> IndexedDB  ** ML TRAINING LABELS **
              ├─> forecast.ts FORECAST_LIMITS    — coded alarm bands, currently scalars
              ├─> services/sensor-severity.ts    — gauges AND the 3D engine view
              └─> /help, /about, jarvis-self-knowledge.ts  — live-import the numbers
```

**The machine-learning consequence is the sharpest one.** `analyticRul()` computes the ground-truth
label by dividing by the baseline and inverting the degradation model. Both are wrong, so **every
row already in IndexedDB is mislabelled**. `rulQuality` cannot detect it — it compares the lagged
baseline against the instant one, so an error in the curve itself sits in both and cancels
(`ui/CLAUDE.md` gotcha 7). Stored training data must be treated as poison and discarded, not
migrated.

---

## 6. Correction plan

Phased and ordered by dependency. **Do not start a phase before the one above it is green** — the
degradation matrix is a finite-difference check against the physics, so recalibrating physics while
the matrix is stale produces test failures that hide real errors.

### Phase 0 — Freeze the ground truth — **DONE** (`42666d9`)
- Create `packages/knowledge/src/oem-limits.ts`: the §2.1 table and all 13 curves of §2.2 as data,
  each row carrying `{ drawing: 'ZNG00028788', sheet, mdecParam }`.
- Add a linear interpolator `oemCurve(id, x)` and a test pinning every bold rated value in §2.2.
- **Exit:** every OEM number lives in exactly one place, cited, and is queryable.

### Phase 1 — Teach the app curve-valued limits — **DONE** (`90cec9e`)
- The limit model is scalar today; OEM limits are RPM-indexed curves and 2D maps.
- Extend `ALARM_LIMITS` entries to accept `(rpm) => number` alongside plain numbers; update
  `sensor-severity.ts` `getAlarmBand`, the gauge alarm ticks, and `forecast.ts` `FORECAST_LIMITS`.
- **Exit:** a limit can be expressed as a curve; scalar entries still work; 240 tests green.

### Phase 2 — Recalibrate the physics to the OEM envelope — **DONE** (`86593cc`)
Order matters — bearing temperature depends on LO pressure and oil temperature.
1. `coolantPressure_MTU8000` → clear curve 0 (4.1 bar @1150) with margin.
2. `lubeOilPressure_MTU8000` (gallery) → re-derive; it drives 3 and 4.
3. piston-cooling pressure → clear curve 1 (5.2 bar), never approach curve 2 (4.7).
4. last-bearing pressure → clear curve 3 (5.8 bar), never approach curve 4 (5.3).
5. `lubeOilTemp_MTU8000` → healthy rated must sit below T-Oil Lim1 83 °C, so target ≈ 75–80 °C.
6. `exhaustBackPressure_MTU8000` → healthy rated below 50 mbar.
7. `bearingTemp_MTU8000` → re-derive from the new oil temp/pressure; hottest must clear
   T-Bearing Lim1 115 and the mean must clear T-Bearing Mean 112.
- Rewrite `physics.test.ts` rated targets **from the manual first**, then make the physics meet them.
- **Exit:** no healthy-rated value violates any OEM limit; every rated target cites a drawing.

### Phase 3 — Rebaseline — **DONE** (`29dd628`)
- `knowledge/src/seed.ts` `PRIMARY_BASELINES` mirror the physics — regenerate all 15 curves.
- Re-verify the two-stage lag cascade (`baseline-lag-convention.test.ts`, `bearing-baseline.test.ts`)
  and the `ME.BearingTemp.Mean` positionBias exclusion (`ui/CLAUDE.md` gotcha 6).
- **Exit:** `rulQuality` reports OK for the right reason; baseline settling test still passes.

### Phase 4 — Re-derive the degradation matrix — **DONE** (`694bd35`)
- `degradation-matrix.ts` weights must equal the new `mtu8000-physics.ts` partials.
- `tests/degradation-matrix.test.ts` is a finite-difference check and will fail until they agree —
  that failure is the acceptance signal, do not silence it.
- **Exit:** finite-difference test green against the new physics.

### Phase 5 — Re-tune decision and safety overrides onto OEM values — **DONE** (`9997ef8`)
- `override-mtu8000.ts`: SS/HI thresholds straight from §2.1, now that physics is in range.
- `MTU8000_LIMITS` Class B entries corrected: `exhaust.mean_hi` → curve 10, `crankcase.pressure_hi`
  → 27 mbar, `cooling.raw_water_pressure_min` → curve 8, `fuel.filter_dp_warn` → curve 7.
- **Re-check every fault can still reach its alarm.** `crankcasePressure_MTU8000(85, 1)` = **7.28
  mbar** against a 27 mbar OEM limit — `FAULT_MAX_EFFECTS.F08` must grow, or the fault becomes
  undetectable the moment the limit is corrected. Same audit for F01–F09 against their new thresholds.
- **Exit:** each of P01–P08 still fires from its fault at full severity; no override fires at healthy.

### Phase 6 — Forecast and RUL — **DONE** (`34b9049`)
- `FORECAST_LIMITS` onto the Phase 0 curves (`hi`/`lo`/`ss` become curve lookups).
- `rul.ts` `analyticRul()` follows Phase 4 automatically but its `matrixSensorIds` ordering must be
  re-checked — the first match wins and drives the label.
- `rul-quality.ts` `BASELINE_FIELD` and `training-recorder.ts` `HEALTHY_REF` re-pointed.
- **Exit:** `rul.test.ts` and `rul-quality.test.ts` green against hand-computed OEM cases.

### Phase 7 — Discard the poisoned training set — **DONE** (`1fcfb28`)
- Bump `SCHEMA_VERSION` in `services/training-store.ts` so existing IndexedDB rows are dropped, not
  migrated. They were labelled against the wrong baselines and the wrong limits.
- Add a one-line provenance field to each row recording the calibration revision that produced it,
  so this is detectable next time.
- Re-record from scratch. Re-check class balance on `/training`.
- **Exit:** no row predating this document survives; `/training` shows a clean run list.

### Phase 8 — Documentation — **DONE**
- `/help` (`SectionsPhysics.tsx` equations), `/about` (`dossier-data.tsx` cascade prose) and
  `services/jarvis-self-knowledge.ts`. Most numbers live-import and follow automatically; the
  **hand-authored prose explaining why a number matters does not** and must be re-read (root
  `CLAUDE.md` → "Keeping /help, /about and JARVIS in sync").
- Update this file's status header and the Progress Log.

---

## 7. Open questions — must be answered before Phase 2 finishes

1. **Which build state is this vessel?** BM00 and BM01 differ on engine overspeed (1240 vs 1323) and
   ETC overspeed. The app currently matches **BM01** on ETC (40 500 / 41 000) but neither on engine
   overspeed. Source: nameplate or `5a_ECS Node Settings.pdf`.
2. **20V M71L is not named on the limit list.** The sheet covers 20V8000BM00/BM01 and 16V8000BM01,
   with separate blocks for 20V M91L, 16V M91L and 16V M71L. Confirm the 20V M71L uses the main
   block.
3. **Is `exhaustTemp` before or after the turbine?** The app targets 440 °C at rated; OEM limits the
   *mean* at 700 °C. If the app models after-turbine, the OEM mean curve does not apply to it and a
   before-turbine series is missing entirely. This decides whether §3.2 row 1 is a limit error or a
   missing sensor.
4. ~~**B77 count.**~~ **RESOLVED 2026-08-06 — ten, and they are now modelled.** MS15082/00E p38
   (drawing `TD0000012616_096`) lists items 5–16 on the right engine side as `B77.11`–`B77.20`,
   "Spray oil temperature B1"–"B10", and the LOP fault messages map `SD T-Splash Oil B1` → `B77.11`
   through `B10` → `B77.20`. One per crank throw, not per cylinder — a 20V shares each throw between
   two opposing con-rods. The handover's "twenty per-cylinder" was wrong. The `B77.B1`–`B77.B8` on
   p6 is the 16V arrangement (eight throws). Implemented as a differential alarm; the absolute scale
   inherits the §3.1 lube-oil error but cannot reach the alarm, since a common offset cancels.
5. **The drawing is stamped ONLY FOR TRAINING PURPOSE.** Adequate for this model; if the system ever
   goes near a real vessel, re-verify against the released limit list for that hull.

---

## 8. Progress log

### Entries from the earlier passes, before the phased work

These were the limit corrections that could be made in isolation. Everything in §3.1 and §3.2 was
**untouched** by them — those needed the phased plan, not an edit.

| Date | Change | Evidence |
|---|---|---|
| 2026-08-06 | `lubeOil.bearing_temp_max` 130 → **120 °C** | T-Bearing Lim2. Healthy hottest ≈112 °C leaves 8 °C headroom; the old 120/100 false alarm came from the HI at 100, not the SS |
| 2026-08-06 | `cooling.coolant_temp_ss` 100 → **97 °C** | T-Coolant Lim2 |
| 2026-08-06 | `fuel.temp_max` 70 → **50 °C** | T-Fuel Lim2 |
| 2026-08-06 | `chargeAirTemp.alarmLow` 25 → **20 °C** | T-Charge Air LL |
| 2026-08-06 | TC speed tags `alarmHi`/`ssLimit` — / 8000 → **40 500 / 41 000** | Turbo Overspeed. `ssLimit: 8000` sat below the 17 800 rpm idle — a plain bug |
| 2026-08-06 | Exhaust probe `mtuDesignation` flat → `B4A1`–`B4B10` | Location deck; both forms are OEM. Label only, no consumer |
| 2026-08-06 | Bearing tag `alarmHi` 100 → 115, `ssLimit` 120, both sourced from `MTU8000_LIMITS` | Same stale-hardcode class as the TC tags; 100 was the pre-correction HI that fired false |
| 2026-08-06 | **Added B77 spray-oil temperature** — 10 channels, physics, tag map, SS/HI trips, dashboard panel | T-Splash Oil Difference Lim1 4 °C / Lim2 6 °C. Differential, so unaffected by §3.1 |
| 2026-08-06 | Swept the prose the limit changes invalidated | `/help` still printed "SS 130 °C" and "SS 100 °C"; `/about` still explained *why* the shutdown had been raised to 130. Both now read the constants |
| 2026-08-06 | `part-risk.ts` `BEARING_RISK_SPAN_C` hardcoded 35 → derived from the SS limit | **Behavioural.** Floor 95 + span 35 saturated the 3D bearing ramp at 130, so once the shutdown moved to 120 a bearing showed as less-than-critical while the ECS was already stopping the engine |
| 2026-08-06 | `SensorFailurePanel` tag list derived from `TAG_MAP` | It kept a hand-copied second list, so the ten new B77 channels were sensors the failure simulator could not fail |

### The calibration itself — 2026-11-25, branch `claude/epic-blackwell-7f2044`

**Class A — the five violations of §3.1, all cleared.** Healthy at 85 % load / 1150 RPM:

| Parameter | Was | Now | OEM limit cleared |
|---|---|---|---|
| LO temperature `B7` | 98.2 °C | **78.3 °C** | T-Oil Lim1 83 warn / Lim2 85 power reduction |
| Exhaust back pressure `B41.1` | 99.5 mbar | **38.3 mbar** | 50 warn / >70 fuel limitation |
| Piston-cooling pressure `B5.2` | 4.35 bar | **6.09 bar** | curve 1 warn 5.2 / curve 2 **SS 4.7** |
| Last-bearing pressure `B5.3/B5.4` | 3.51 bar | **6.59 bar** | curve 3 warn 5.8 / curve 4 **SS 5.3** |
| Coolant pressure `B16.1` | 2.0 bar | **5.00 bar** | curve 0 warn 4.1 |

Checked at 400/500/600/800/900/1000/1150 RPM, not only at rated — these limits are RPM-indexed, so
a curve of the wrong SHAPE passes at 1150 and fails at 600. Tightest point in the range is piston
cooling at 1000 RPM (0.25 bar, ~4× sensor noise), where curve 1 steps 4.5 → 5.2; asserted explicitly.

| Date | Change | Evidence |
|---|---|---|
| 2026-11-25 | **`oem-limits.ts` created** — ZNG00028788 as data: 41 rows, 13 curves, `oemCurve()` | Both sheets re-read at 340 dpi. §2 above was correct in every value, so this added citations, not corrections |
| 2026-11-25 | Placed in `shared`, not `packages/knowledge` as Phase 0 proposed | `constants.ts` and the decision overrides both consume it, and knowledge depends on shared — the proposed placement was a dependency cycle |
| 2026-11-25 | Limits may be `number \| (rpm) => number` | Most MTU limits are curves; writing one as a scalar silently picks a speed, which is part of how this drifted |
| 2026-11-25 | `lubeOilTemp_MTU8000` 98.2 → **78.3 °C** at rated | T-Oil Lim1. The root of three of the five — the bearing and spray-oil models both hang off it |
| 2026-11-25 | **Lube takeoff ratios 0.55/0.68 → 0.92/0.85**, and the right way round | ZNG00028788 warns on the last bearing at 5.8 bar but on piston cooling at 5.2, so the last bearing is the HIGHER of the two. The old pair had them inverted and so low that clearing 5.8 through 0.55 would have needed an 11.8 bar gallery — a pump no MTU 8000 has. **The ratios were the error, not the pump.** Now `MTU8000.LUBE_CIRCUIT`, one definition for the three modules that had drifted to two different pairs |
| 2026-11-25 | `coolantPressure_MTU8000` linear → **centrifugal head (∝ rpm²)** | Curve 0 has that shape, so the margin stays proportional across the range instead of closing at one end |
| 2026-11-25 | `exhaustBackPressure_MTU8000` rescaled; fouling term 40 → 16 | Keeps the same FRACTIONAL response to a fouled turbine on a 38 mbar base |
| 2026-11-25 | `bearingTemp_MTU8000` and `lubeOilPressure_MTU8000` references rebased onto the rated point | Were 85 °C / 65 °C / 6.5 bar — none of which is the rated value of anything. Each term is now zero at healthy rather than a standing offset |
| 2026-11-25 | `seed.ts` — 4 of 15 curves regenerated, now **exact** mirrors | `analyticRul()` divides by these, so a standing bias moves every label one way. `ME.BearingTemp.Mean` now carries `pressureDef` too (~17 °C at idle against the corrected gallery) |
| 2026-11-25 | Matrix weights re-derived: F06→backP 40→16, F03→lastBearing −2.37→−3.956, F03→pistonCooling −3.08→−3.73 | Finite-difference test. F03→bearingTemps stays 17.1 — Phase 2 moved that term's REFERENCE, not its slope |
| 2026-11-25 | **Every `MTU8000_LIMITS` threshold derived from the drawing**; non-OEM entries marked `NOT OEM` | Class B: `exhaust.mean_hi` 460→700, `crankcase.pressure_hi` 5→27, `raw_water_pressure_min` 1.0→1.8, `fuel.filter_dp_warn` 0.8→1.0. Plus `pressure_last_bearing_min` 2.0→5.3 and `piston_cooling_min` 4.0→5.2 |
| 2026-11-25 | Curve limits resolved at `snap.rpm` in the override | **Essential, not cosmetic.** The last-bearing SS is 5.3 bar at rated and 2.07 at 400 RPM — the rated scalar would trip an Emergency Stop on a healthy idling engine at 3.11 bar |
| 2026-11-25 | **`FAULT_MAX_EFFECTS.F08_blowby_pressure` 8 → 45 mbar** | Against the real 27 mbar limit its 7.28 mbar ceiling could never fire. **The fault was grown to match the envelope, not the limit tuned to the fault.** F07's coupling stays sub-alarm (12.8 vs 27, was 1.68 vs 5), so P07/P08 discrimination survives |
| 2026-11-25 | Gallery pre-alarm: flat 5.5 bar → curve 3 over the takeoff ratio | A fixed floor cannot work on a pressure running 3.4 bar at idle and 7.2 at rated; after Phase 2 a healthy engine at 800 RPM / 45 % sat at 5.41 and tripped it. The `load >= 25` guard went with it — it existed to suppress the symptom |
| 2026-11-25 | `FORECAST_LIMITS` onto the curves; `ss` now applies in both directions | A pressure collapse — the one fault class here that reaches a shutdown — reported no time-to-shutdown at all. `lubeLastBearing.lo` moved from the shutdown to the **warning**: "minutes to alarm" should mean the first thing the ECS does |
| 2026-11-25 | **`SCHEMA_VERSION` 3 → 4; pre-v4 runs DELETED at startup** | Labels were biased, not noisy, and `rulQuality` cannot see it (gotcha 7) — a poisoned row reports OK. Filtering was not enough: an export carries sample rows only |
| 2026-11-25 | `CALIBRATION_REVISION` stamped on every run and row | `schemaVersion` says what columns; this says against what truth. Next time the envelope moves, affected rows are identifiable from the export alone |
| 2026-11-25 | `ALARM_LIMITS.bearingTemp` comments said "122.5 °C" and "130 °C" against values that were 117.5 and 120 | The L3 expression had silently moved the slowdown 5 °C. **Comments now name each number's SOURCE instead of restating it** — a comment repeating a derived value is a second source of truth, which is this document's §4 in miniature |
| 2026-11-25 | `decision`'s `healthySnapshot()` fixture derived from the physics | It hand-wrote the old equations, so after Phase 2 a fixture named "healthy" described an engine 3.08 bar under the last-bearing shutdown. Its tests only assert pattern behaviour, so nothing failed |
| 2026-11-25 | `simulator`'s `package.json` `main` → `./dist/src/index.js` | Pointed at `./dist/engine.js`, which has never existed. The UI resolves it through a Vite alias, so the first consumer to use node resolution was the first to notice |

**Decision recorded, not silently taken: HI T-Exhaust Mean is now unreachable by any modelled fault.**
The OEM limit is 700 °C against a healthy 440; F02 at full severity lifts the mean to ~472 °C. That
is faithful to the real ECS, which catches a single-bank injector fault through its RELATIVE limits
— single-cylinder UL (curve 12, against the running mean) and the mean's own 20 °C offset step
(MDEC 51,03) — which in this app is the job of the deviation scoring and patterns P01/P02/P09. The
limit had been coded at 460 °C, 20 °C above healthy, which is exactly how it became the de-facto
detector for everything exhaust-related. Lowering it again would re-create this defect.

**Still open: §7.1, the build state.** BM00 vs BM01 moves only engine overspeed (1240 vs 1323) and
ETC overspeed. `5a_ECS Node Settings.pdf` is about CAN addressing, and nothing in the 46-file set
carries the nameplate. The code targets BM01 via `OEM_TARGET_VARIANT`, and **no Class A parameter
depends on the answer**. §7.2 and §7.3 are closed — see §2.2 and the Phase 2 commit.


---

## 9. Reproduction snippets

### 9.1 Scan the decks

```python
# scratchpad/decode.py  —  python decode.py "B77" "D:\1 Work\05 Engines\ECS 8K MTU I 2024\*.pdf"
import sys, re, fitz

def dec(s, k):
    out = []
    for ch in s:
        if ch in ' \n\t\r': out.append(ch)
        else:
            n = ord(ch) + k
            out.append(chr(n) if 0x20 <= n <= 0x7e else ch)
    return ''.join(out)

def scan(path, pattern):
    rx = re.compile(pattern, re.I)
    doc = fitz.open(path)
    for pno in range(len(doc)):
        txt = doc[pno].get_text()
        for tag, v in {'raw': txt, '+29': dec(txt, 29), '-29': dec(txt, -29)}.items():
            for line in v.splitlines():
                if rx.search(line):
                    print(f'p{pno+1} [{tag}] {line.strip()}')

for p in sys.argv[2:]:
    scan(p, sys.argv[1])
```

### 9.2 Read the app's rated operating point

With the dev server running (`preview_start` → `marine-pdm-ui`, binds **5173** not the 5174 in
`launch.json`), in the page console:

```js
const P = await import('/@fs/D:/MASTER_PROJECTS/Predictive Maintainence/marine-pdm/packages/simulator/src/mtu8000-physics.ts');
P.lubeOilTemp_MTU8000(85, 1150);        // 98.2  — OEM T-Oil Lim2 is 85
P.exhaustBackPressure_MTU8000(85, 1150); // 99.5 — OEM fuel limitation at >70
```

Calling the physics directly is the only reliable way to get the rated point. **`engine.setLoad()` does
not work from the console** — verified with the engine running at 1150 RPM, `load` stays 0 and
`shaftPower` stays 0, leaving the UI at part load (exhaust ≈ 323 °C, LO temp ≈ 68 °C) and nowhere near
the rated figures in §3. Drive load from the `/simulator` page controls, or read the physics directly.

### 9.3 Rasterise a drawing region

```python
import fitz
d = fitz.open(r'D:\1 Work\05 Engines\ECS 8K MTU I 2024\4e_ Alarm Limit XZ56900100007.pdf')
p = d[1]; r = p.rect
p.get_pixmap(dpi=340, clip=fitz.Rect(r.x0+40, r.y0+30, r.x0+r.width*0.52, r.y0+r.height*0.46)).save('out.png')
```
