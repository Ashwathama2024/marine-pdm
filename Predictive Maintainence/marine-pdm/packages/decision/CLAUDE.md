# Decision Package — CLAUDE.md
> AI decision engine: pattern matching, risk scoring, safety overrides. See root `CLAUDE.md` for monorepo rules.

---

## Decision Pipeline (3 layers)

1. **Physics** — deviation checks against baselines → raw risk scores per system
2. **Statistics** — trend rates, rolling averages, StdDev, cylinder imbalance
3. **Rules** — pattern matching (P01–P08) → alerts with ECS codes + W-numbers
4. **Override** — MTU safety hard limits → `systemRisk = 100` immediately (bypasses all above)

---

## Safety Override Triggers — `src/override-mtu8000.ts`

### Shutdown (SS) — `systemRisk = 100` immediately
| Condition | ECS Code |
|-----------|---------|
| `lubeLastBearingPressure < 2.0 bar` | SS P-Oil Last Bearing |
| `bearingTemps[i] > 130°C` | SS T-Bearing N |
| `coolantTempAfterEngine > 100°C` | SS T-Coolant |

### High-priority floors
| Condition | Risk floor | ECS Code |
|-----------|-----------|---------|
| `exhaustMeanTemp > 460°C` | ≥80 | HI T-Exhaust Mean |
| `fuelRailPressure < 1200 bar` | ≥85 | SD P-Fuel Rail |
| `bearingTemps[i] > 115°C` | ≥75 | HI T-Bearing N |

**Why 130°C SS / 115°C HI (not 120/100)?**
Hot lube oil at rated (105°C oil temp, 85% load) naturally drives bearing temps to ~107°C via `bearingTemp_MTU8000()`. Old thresholds fired false overrides during normal operation. Raised to match real MTU 8000 operational data.

---

## Patterns — `src/patterns-mtu8000.ts`

8 patterns (P01–P08) map to fault scenarios F01–F08 with real ECS alarm codes and MTU maintenance work orders (W-numbers like W1006, W1047, W1073, W1609).

---

## Key Gotchas

**LO pressure HI check uses `lubeOilPressure`, not `lubeLastBearingPressure`**
The "LO Pressure before filter" ECS alarm checks the main gallery (`snap.lubeOilPressure`, ~6.3 bar at rated) against 5.5 bar. Old code checked `lubeLastBearingPressure` (~3.5 bar) — always below 5.5 bar → false alert every tick.

**`computeRisk` normalization: `base*0.2` for rate scores**
`base*0.001` was impossibly tight: any exhaust rate >0.44°C/min saturated `scoreTrend=100`. With `base*0.2` (denominator=88°C/min for exhaust), only fault-speed rates (>30°C/min) produce high trend scores. Pair with 15-sample RateCalculator window for lube (see simulator CLAUDE.md).
