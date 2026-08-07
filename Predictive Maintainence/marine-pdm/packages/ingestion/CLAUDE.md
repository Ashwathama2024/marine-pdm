# Ingestion Package — CLAUDE.md
> OPC-UA client + 62-tag MTU 8000 → snapshot field mapping. See root `CLAUDE.md` for monorepo rules.

> ⚠ `alarmHi` / `ssLimit` on a `TagMapping` must come from MTU `ZNG00028788`, not from what the
> simulator happens to produce — see [`../../OEM-CALIBRATION-GAP.md`](../../OEM-CALIBRATION-GAP.md).
> The TC speed tags carried `ssLimit: 8000` against a turbo that idles at 17 800 rpm. Source these
> from `MTU8000_LIMITS` rather than retyping them.

---

## Tag Map Overview — `src/tag-map.ts`

62 tags covering all monitored parameters. Each `TagMapping` has:
- `nodeId` — OPC-UA NodeId string
- `field` — target field on `EngineSnapshot` / `MTU8000Snapshot`
- `scale` / `offset` — unit conversion for IPMS that return ×10 values

### Tag Groups

| Group | Tags | Fields |
|-------|------|--------|
| B4A1–B4A10, B4B1–B4B10 | 20 cylinder exhaust temps (bank letter is part of the designation — see MS15082/00E) | `cylExhaustTemps[0–19]` |
| B4.30, B41.1 | Exhaust mean, back pressure | `exhaustMeanTemp`, `exhaustBackPressure` |
| B5.1, B5.2, B5.5, B5.3/4 | LO pressures (main gallery, after filter, piston cooling, last bearing) | `lubeOilPressure`, `lubeFilterOutletPressure`, `lubePistonCoolingPressure`, `lubeLastBearingPressure` |
| B7 | LO temperature | `lubeOilTemp` |
| B57.1–B57.11 | 11 bearing temps (#11 = free end, runs +5°C) | `bearingTemps[0–10]` |
| B77.11–B77.20 | 10 spray-oil temps, one per crank throw (ECS channels B1–B10, EMU II X5.3). **The only tags with no `alarmHi`/`ssLimit`** — MTU codes a difference limit, not an absolute band | `sprayOilTemps[0–9]` |
| B6.1, B16.1 | Coolant temp after engine, coolant pressure | `coolantTempAfterEngine`, `coolantPressure` |
| B9, B10 | Charge air temp, charge air pressure | `chargeAirTemp`, `chargeAirPressure` |
| B44.1/2/11/12 | 4 TC speeds (A1, A2, B1, B2 — B-bank turbos are .11/.12) | `tcSpeeds[0–3]` |
| B48, B33 | Fuel rail pressure (1800 bar nominal), fuel temp | `fuelRailPressure`, `fuelTemp` |
| B50, B13.1, B13.2 | Crankcase pressure, RPM primary (ECU), RPM redundant (EMU) | `crankcasePressure`, `rpm`, `rpmRedundant` |

---

## OPC-UA Client — `src/opcua-client.ts`

- Handles `null` values from DROPOUT sensor failures (passes through as null/undefined)
- Uses `MTU8000.CYLINDERS` (20) for array field handling — not hardcoded
- `applyTagValue(snapshot, tag, rawValue)` applies `scale`/`offset` on ingest

### Swapping to real IPMS

Only `packages/ui/src/context/EngineContext.tsx` changes:
```typescript
// Current (simulator)
export const engine = new SimulatorEngine();

// Real IPMS
export const engine = new OpcUaClient('opc.tcp://your-ipms:4840');
```
Replace Kongsberg K-Chief NodeIds in `tag-map.ts` to match the vessel's IPMS address space.
