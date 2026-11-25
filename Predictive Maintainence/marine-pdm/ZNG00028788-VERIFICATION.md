# OEM calibration — Phase 0 input verified, and a base-branch blocker

Session: `epic-blackwell-7f2044` (worktree off `master`).
Date: 2026-11-25.

---

## 1. ZNG00028788 re-read at 340 dpi — §2 of the gap doc is CORRECT

I rasterised both sheets of `4e_ Alarm Limit XZ56900100007.pdf` and read every value visually
(no text extraction — the text layer is control characters `0x01`–`0x0F`, as §1.2 warns).

**Result: every value in OEM-CALIBRATION-GAP.md §2.1 and §2.2 matches the drawing. No corrections.**

- Drawing `ZNG00028788`, material no. `XZ56900100007`, title *ALARM/GRENZWERTLISTE / Alarm/Limit
  val.list*, rev `j.5`, notice `PR067960`, lifecycle **Released**, format A3, 2 sheets.
- Sheet 1: 41-row limit list, header *"Valid for 20V8000BM00, 20V8000BM01, 16V8000BM01"*,
  plus four per-variant blocks. Stamped ONLY FOR TRAINING PURPOSE.
- Sheet 2: curves 0–12 for the main block, plus exception curve sets for 20V8000 M91L,
  16V8000 M91L and 16V8000 M71L.

Verified tiles kept at:
`C:\Users\ICG385\AppData\Local\Temp\claude\b43289a34527a9a0\0212f3f0-54a1-49f8-b48f-2648238653ac\scratchpad\oem\`
(`s1_left_1.png`, `s1_left_2.png`, `s2_c1.png`, `s2_c2.png`, `s2_c3.png`, `s2_c12.png`) — scratch,
will not survive cleanup. Re-render with §9.3's snippet against the corrected path below.

Spot-confirmations that matter most for Phase 2 (all read at 340 dpi):

| Parameter | Drawing | Confirms |
|---|---|---|
| Oil Press. Piston Cooling Lim1 / Lim2 | 2D-26 curve 1 / 2D-27 curve 2, 5.0 s warn / 2.0 s **shut down**, B5.2 | curve 1 @1150 = **5.2**, curve 2 @1150 = **4.7** |
| P-Oil last bearing Lim1 / Lim2 | 2D-17 curve 3 / 2D-29 curve 4, 3.0 s warn / 1.0 s **shut down**, B5.3/B5.4 | curve 3 @1150 = **5.8**, curve 4 @1150 = **5.3** |
| T-Oil Lim1 / Lim2 | 72,01 = **83** ↑ warn / 72,03 = **85** ↑ power reduction, B7 | Class A row 1 |
| Exhaust Gas Back Pressure | 3D-107 **>70** ↑ mbar, 0.0 s, fuel limitation (main table); per-variant 2D-45 **50** ↑ mbar, 5.0 s, warning, B41.1 | Class A row 2 |
| P-Coolant Lim1 | 2D-16 curve 0 ↓, 5.0 s warn, B16.1 | curve 0 @1150 = **4.1** |
| Crankcase Air Pressure Lim1 | curve 9 = **27 mbar flat**, 100→1500 rpm | Class B row 2 |
| Exhaust Temp. Mean Lim1 | curve 10 @1150 = **700 °C** | Class B row 1 |

## 2. Two corrections to the gap document itself

1. **§1.1's manual path is stale.** `D:\ECS 8K MTU I 2024\` no longer exists. The set is now at
   **`D:\1 Work\05 Engines\ECS 8K MTU I 2024\`** (46 entries; `4e_…pdf` byte-identical at 264 300 B).
   Two further copies exist under `D:\1 Work\05 Engines\_Duplicates\` — ignore those.
2. **§7 Q2 is partly answerable from the drawing.** Sheet 2 carries exception curve blocks for
   20V8000 M91L, 16V8000 M91L and 16V8000 M71L — but **no 20V8000 M71L block**. Since MTU wrote
   out an exception for every other M-designation on this sheet, the absence of one for the 20V M71L
   is positive evidence it takes the main block. §7 Q1 (BM00 vs BM01 build state) remains open, but
   it only moves engine overspeed (1240 vs 1323) and ETC overspeed — **no Class A parameter depends
   on it**, so Phase 2 is not blocked by it.

## 3. BLOCKER — the gap document is on `claude/display`, not on `master`

`OEM-CALIBRATION-GAP.md` was committed in `161d557`, which is reachable only from `claude/display`
(PR #1). My worktree branches off `master` and does not contain it.

This matters because **the document's diagnosis describes the `claude/display` tree**, not master:

| | master | claude/display | gap doc assumes |
|---|---|---|---|
| `lubeOil.bearing_temp_max` | 130 | 120 | 120 (§8) |
| `lubeOil.bearing_temp_hi` | 115 | 115 | 115 — §3.3 "already agrees" |
| `cooling.coolant_temp_ss` | 100 | 97 | 97 (§8) |
| `fuel.temp_max` | 70 | 50 | 50 (§8) |
| `chargeAirTemp.alarmLow` | 25 | 20 | 20 (§8) |
| `sprayOil` B77 block + `CRANK_THROWS` | absent | present | present (§7 Q4 resolved) |
| `ui/src/services/sensor-severity.ts` | **does not exist** | exists | Phase 1 exit criterion names it |
| `ui/src/engine3d/part-risk.ts` | **does not exist** | exists | §8 last rows |

So on master: Phase 1's stated exit criterion cannot be met (the file is on the other branch), §3.3's
"do not fix these" premises are false, and §8's completed work would have to be redone — landing
duplicate, conflicting edits in `shared/src/mtu8000.constants.ts`, which `claude/display` already owns.

There is also a real physics coupling, not just a merge nuisance: `claude/display`'s B77 spray-oil
physics is derived from `lubeOilTemp_MTU8000`, and Phase 2 step 5 moves that curve from ~98 °C to
~75–80 °C. Whoever merges second has to re-derive the spray-oil channels.

No other session is currently working on `claude/display` (checked — nothing running), so this is a
base-branch decision, not a live write race.

**Recommendation: base the calibration on `claude/display`** (branch from it, leave every
`engine3d/*` file untouched, open the PR against `claude/display` or hold it until PR #1 merges).
That is the only base on which the spec's eight phases are executable as written. Awaiting the
owner's call before starting Phase 0.
