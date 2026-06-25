# Shared Package — CLAUDE.md
> Shared types, constants, utils. No framework dependencies. See root `CLAUDE.md` for monorepo rules.

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

// Post-calibration alarm limits (constants.ts)
cylImbalance.preAlarmHigh = 30°C   // was 25 — natural spread ~27°C, gives margin
cylImbalance.alarmHigh    = 40°C
pistonCoolingPress.preAlarmLow = 4.0 bar  // physics gives ~4.34 bar at rated
ENGINE_MCR_KW = 9100              // was 5113 — matches MTU8000.MAX_POWER_KW
```
