# Shared Package — CLAUDE.md
> Shared types, constants, utils. No framework dependencies. See root `CLAUDE.md` for monorepo rules.

> **`src/oem-limits.ts` is the single source of truth for every coded MTU limit** — drawing
> `ZNG00028788`, all 41 rows of sheet 1 and all 13 curves of sheet 2, verified at 340 dpi. Thresholds in
> `constants.ts` and `mtu8000.constants.ts` are DERIVED from it (`oemCurve(...)`, `oemScalar(...)`),
> never typed. Anything that is not an OEM value is marked **`NOT OEM`** in its comment.
>
> Before editing any threshold: derive it from the drawing, never loosen or tighten one merely to stop
> an alarm firing, and **never restate a derived number in a comment** — that is a second source of
> truth and it is how the bearing band silently drifted 5°C. See [`../OEM-CALIBRATION-GAP.md`](../OEM-CALIBRATION-GAP.md).

---

## Source Files

| File | Purpose |
|------|---------|
| `src/interfaces.ts` | ALL TypeScript interfaces — the contract |
| `src/constants.ts` | Alarm limits, physics coefficients, TAG ids |
| `src/mtu8000.constants.ts` | MTU 8000 engine spec: `CYLINDERS`, `RATED_RPM`, `MTU8000_LIMITS`, `CYL_SPREAD`, `BSIDE_TEMP_BIAS` |
| `src/utils.ts` | `addNoise()`, `clamp()`, `lag()` |
| `src/index.ts` | Re-exports everything |

---

## Interface Rules

**`EngineSnapshot` vs `MTU8000Snapshot`**
- `EngineSnapshot` has `[key: string]: number | number[]` index signature for backwards compatibility. TypeScript won't catch missing field names on dynamic assignment.
- `MTU8000Snapshot` is the clean, properly typed interface for MTU v2 fields — use it for new code.
- Full migration from `EngineSnapshot` to `MTU8000Snapshot` is a planned v2.1 step.

**Adding a field**
Always add to both `EngineSnapshot` AND `MTU8000Snapshot` in `interfaces.ts`, then wire into `engine.ts` tick output.

---

## Key Constants (quick reference)

```typescript
MTU8000.CYLINDERS = 20
MTU8000.RATED_RPM = 1150
MTU8000.MAX_POWER_KW = 9100
BSIDE_TEMP_BIAS = +4  // °C

// CYL_SPREAD — natural healthy spread across 20 cylinders
MTU8000_CYL_SPREAD = [-8,+12,-4,+16,-6,+10,-3,+14,-9,+7, +5,-11,+9,-5,+13,-7,+11,-2,+8,-4]
// Max spread ~27°C. B5 (index 14) = mean + 13 + 4 bias = +17°C from mean.

// Alarm limits (constants.ts) — derived, not typed
cylImbalance.preAlarmHigh = 30°C   // NOT OEM — natural spread ~27°C, gives margin
pistonCoolingPress.preAlarmLow = (rpm) => oemCurve(1, rpm)   // 5.2 bar at rated, MDEC 2D-26
pistonCoolingPress.shutdownLow = (rpm) => oemCurve(2, rpm)   // 4.7 bar at rated, MDEC 2D-27
lubeLastBearingPressure.preAlarmLow = (rpm) => oemCurve(3, rpm)  // 5.8 bar at rated
lubeLastBearingPressure.shutdownLow = (rpm) => oemCurve(4, rpm)  // 5.3 bar at rated
ENGINE_MCR_KW = 9100              // matches MTU8000.MAX_POWER_KW

// A limit may be a number OR an (rpm) => number. resolveLimit / resolveAlarmBand /
// resolveLimitSet collapse a band at one speed; getAlarmBand(id, rpm) is the UI entry point.
```
