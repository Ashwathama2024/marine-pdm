// LoadRPM baseline curve service — LocalStorage-backed, bilinear interpolation

export interface CurvePoint {
  load: number;
  rpm: number;
  expected: number;
}

export interface LoadRPMCurve {
  sensorId: string;
  displayName: string;
  unit: string;
  points: CurvePoint[];
  idleRPM: number;
  maxRPM: number;
  source: string;
  lastModified: string;
  version: number;
}

const STORAGE_KEY = 'marine-pdm-baseline-curves';
// Bump this whenever the default curve equations change — forces localStorage refresh.
const SCHEMA_VERSION = 3;
const SCHEMA_KEY = 'marine-pdm-curve-schema';

// Bilinear interpolation within the (load, rpm) grid
export function interpolateCurve(
  curve: LoadRPMCurve,
  load: number,
  rpm: number,
): number | null {
  if (curve.points.length < 2) return null;

  const rpms  = [...new Set(curve.points.map(p => p.rpm))].sort((a, b) => a - b);
  const loads = [...new Set(curve.points.map(p => p.load))].sort((a, b) => a - b);

  if (rpms.length < 2 || loads.length < 2) return null;

  const clampedRpm  = Math.max(rpms[0]!, Math.min(rpms[rpms.length - 1]!, rpm));
  const clampedLoad = Math.max(loads[0]!, Math.min(loads[loads.length - 1]!, load));

  // ES2020-compatible lastIndex search
  const findLastIdx = (arr: number[], pred: (v: number) => boolean): number => {
    for (let i = arr.length - 1; i >= 0; i--) { if (pred(arr[i]!)) return i; }
    return 0;
  };
  const r1i = findLastIdx(rpms,  r => r <= clampedRpm);
  const r2i = Math.min(r1i + 1, rpms.length - 1);
  const l1i = findLastIdx(loads, l => l <= clampedLoad);
  const l2i = Math.min(l1i + 1, loads.length - 1);

  const r1 = rpms[r1i]!, r2 = rpms[r2i]!;
  const l1 = loads[l1i]!, l2 = loads[l2i]!;

  const getV = (r: number, l: number) =>
    curve.points.find(p => p.rpm === r && p.load === l)?.expected ?? null;

  const v11 = getV(r1, l1); const v21 = getV(r2, l1);
  const v12 = getV(r1, l2); const v22 = getV(r2, l2);
  if (v11 == null || v21 == null || v12 == null || v22 == null) return null;

  const tr = r1 === r2 ? 0 : (clampedRpm - r1) / (r2 - r1);
  const tl = l1 === l2 ? 0 : (clampedLoad - l1) / (l2 - l1);

  return (1-tr)*(1-tl)*v11 + tr*(1-tl)*v21 + (1-tr)*tl*v12 + tr*tl*v22;
}

// ── Seeded curves — equations mirror mtu8000-physics.ts exactly.
// Rated operating point: 1150 RPM / 85% load (MTU 8000 M71L Group 1B).
// Validation: exhaustTemp→440°C, LO→6.82 bar, chargeAir→3.04 bar, jacket→76.75°C.
const RPMS  = [400, 500, 600, 700, 800, 900, 1000, 1100, 1150];
const LOADS = [10, 25, 40, 55, 70, 85, 100];

function pts(fn: (rpm: number, load: number) => number): CurvePoint[] {
  return RPMS.flatMap(rpm => LOADS.map(load => ({ rpm, load, expected: Math.round(fn(rpm, load) * 100) / 100 })));
}

// Mirrors exhaustTemp_MTU8000(load, rpm) — base=276, rated→440°C
const _exhaust = (rpm: number, load: number) => 276 + (load / 100) * 160 + (rpm / 1150) * 28;
// Mirrors lubeOilPressure_MTU8000(rpm, load) — pump curve, rated→6.82 bar
const _lube    = (rpm: number, load: number) => 3.5 + (rpm / 1150) * 4.0 - (load / 100) * 0.8;

const DEFAULT_CURVES: Omit<LoadRPMCurve, 'lastModified' | 'version'>[] = [
  {
    sensorId: 'ME.ExhaustTemp', displayName: 'Exhaust Temperature', unit: '°C',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated 1150 RPM / 85% load → 440°C)',
    points: pts(_exhaust),
  },
  {
    sensorId: 'ME.LubeOilPressure', displayName: 'Lube Oil Pressure', unit: 'bar',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 6.82 bar)',
    points: pts(_lube),
  },
  {
    sensorId: 'ME.ScavengeAirPressure', displayName: 'Charge Air Pressure', unit: 'bar',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 3.04 bar)',
    // Mirrors chargeAirPressure_MTU8000(rpm, load, tcEff=1.0)
    points: pts((rpm, load) => 1.0 + (load / 100) * 2.4 * (rpm / 1150)),
  },
  {
    sensorId: 'ME.TCSpeed', displayName: 'Turbocharger Speed', unit: 'RPM',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 21100 RPM, alarm > 24000)',
    // Mirrors tcSpeed_MTU8000(rpm, load, tcEff=1.0)
    points: pts((rpm, load) => 4000 + (rpm / 1150) * 12000 + (load / 100) * 6000),
  },
  {
    sensorId: 'ME.JacketCoolingOutlet', displayName: 'Jacket Cooling Outlet', unit: '°C',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 76.75°C)',
    // Mirrors tickPhysics coolant target
    points: pts((rpm, load) => 30 + (load / 100) * 55),
  },
  {
    sensorId: 'ME.SFOC', displayName: 'Specific Fuel Oil Consumption', unit: 'g/kWh',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 185 g/kWh)',
    // Mirrors sfoc_MTU8000(load, rpm, {}, 1.0)
    points: pts((rpm, load) => 180 + (100 - load) * 0.333 + (1150 - rpm) * 0.08),
  },
  {
    sensorId: 'ME.ChargeAirTemp', displayName: 'Charge Air Temperature', unit: '°C',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3',
    // Mirrors chargeAirTemp_MTU8000(load, rpm, coolant=36): (36+12) + load*0.18
    points: pts((rpm, load) => 48 + (load / 100) * 18),
  },
  {
    sensorId: 'ME.FuelOilPressure', displayName: 'Fuel Oil Supply Pressure', unit: 'bar',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (fuel supply circuit, not rail)',
    // Matches engine.ts inline formula: 6.0 + (load/100)*1.8
    points: pts((rpm, load) => 6.0 + (load / 100) * 1.8),
  },
  {
    sensorId: 'ME.FuelOilTemp', displayName: 'Fuel Oil Temperature', unit: '°C',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 41°C, stays below pre-alarm 45°C)',
    // Mirrors fuelTemp_MTU8000(load) updated formula
    points: pts((rpm, load) => 30 + (load / 100) * 13),
  },
  {
    sensorId: 'ME.LOFilterDP', displayName: 'LO Filter Differential Pressure', unit: 'bar',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (healthy filter = 0.15 bar constant)',
    // Healthy filter DP is load/RPM independent — rises only with fouling
    points: pts(() => 0.15),
  },
  {
    sensorId: 'ME.PistonCoolingPress', displayName: 'Piston Cooling Oil Pressure', unit: 'bar',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L Physics Model v3 (rated → 4.64 bar, alarm < 4.5)',
    // ~68% of main lube gallery pressure
    points: pts((rpm, load) => _lube(rpm, load) * 0.68),
  },
  {
    sensorId: 'ME.ShaftPower', displayName: 'Shaft Power', unit: 'kW',
    idleRPM: 400, maxRPM: 1150,
    source: 'MTU 8000 M71L — 9100 kW max (M71L rating)',
    points: pts((rpm, load) => 9100 * (load / 100)),
  },
];

export function getDefaultCurves(): LoadRPMCurve[] {
  return DEFAULT_CURVES.map(c => ({
    ...c,
    lastModified: new Date().toISOString(),
    version: 1,
  }));
}

// ── Persistence ───────────────────────────────────────────────────────────
export function loadCurves(): LoadRPMCurve[] {
  try {
    const storedVersion = parseInt(localStorage.getItem(SCHEMA_KEY) ?? '0', 10);
    if (storedVersion >= SCHEMA_VERSION) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as LoadRPMCurve[];
    }
  } catch { /* ignore */ }
  // First run or schema upgraded — write fresh defaults
  const defaults = getDefaultCurves();
  saveCurves(defaults);
  return defaults;
}

export function saveCurves(curves: LoadRPMCurve[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(curves));
  localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
}

export function upsertCurve(curves: LoadRPMCurve[], updated: LoadRPMCurve): LoadRPMCurve[] {
  const idx = curves.findIndex(c => c.sensorId === updated.sensorId);
  const next = { ...updated, lastModified: new Date().toISOString(), version: updated.version + 1 };
  if (idx >= 0) {
    const copy = [...curves];
    copy[idx] = next;
    return copy;
  }
  return [...curves, next];
}
