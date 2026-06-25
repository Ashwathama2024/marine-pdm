# Ingestion Package — CLAUDE.md
> OPC-UA client + 52-tag MTU 8000 → snapshot field mapping. See root `CLAUDE.md` for monorepo rules.

---

## Tag Map Overview — `src/tag-map.ts`

52 tags covering all monitored parameters. Each `TagMapping` has:
- `nodeId` — OPC-UA NodeId string
- `field` — target field on `EngineSnapshot` / `MTU8000Snapshot`
- `scale` / `offset` — unit conversion for IPMS that return ×10 values

### Tag Groups

| Group | Tags | Fields |
|-------|------|--------|
| B4.1–B4.20 | 20 cylinder exhaust temps | `cylExhaustTemps[0–19]` |
| B4.30, B41.1 | Exhaust mean, back pressure | `exhaustMeanTemp`, `exhaustBackPressure` |
| B5.1, B5.2, B5.5, B5.3/4 | LO pressures (main gallery, after filter, piston cooling, last bearing) | `lubeOilPressure`, `lubeFilterOutletPressure`, `lubePistonCoolingPressure`, `lubeLastBearingPressure` |
| B7 | LO temperature | `lubeOilTemp` |
| B57.1–B57.11 | 11 bearing temps (#11 = free end, runs +5°C) | `bearingTemps[0–10]` |
| B6.1, B16.1 | Coolant temp after engine, coolant pressure | `coolantTempAfterEngine`, `coolantPressure` |
| B9, B10 | Charge air temp, charge air pressure | `chargeAirTemp`, `chargeAirPressure` |
| B44.A1/A2/B1/B2 | 4 TC speeds | `tcSpeeds[0–3]` |
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
