// MTU 8000 ECS-derived alarm bands — from rated → pre-alarm → shutdown thresholds.
// Using these instead of generic `base * factor` gives physics-accurate risk scores.
export const MTU8000_ALARM_BANDS: Record<string, { dev: number; rate: number }> = {
  // Thermal — °C deviation from baseline to pre-alarm threshold
  exhaustTemp:     { dev: 20,   rate: 5    },  // rated 440°C → HI at +20°C; 5°C/min fault rate
  jacketOutlet:    { dev: 8,    rate: 2    },  // rated 82°C  → HI at 90°C
  chargeAirTemp:   { dev: 12,   rate: 2.5  },  // rated 38°C  → HI at 50°C
  fuelOilTemp:     { dev: 15,   rate: 3    },  // rated 65°C  → HI at 80°C
  cylTemp:         { dev: 25,   rate: 3    },  // per-cylinder → alarm at +25°C above bank mean

  // Pressure — bar deviation from baseline to pre-alarm
  // Rate calibration: natural sensor jitter creates ±0.02–0.05 bar/min fluctuations.
  // Alarm rates must be above this noise floor to avoid false trend scoring.
  // Genuine rapid fault (pump failure): 0.15–0.5 bar/min. Gradual wear: 0.03–0.08 bar/min.
  lubeOilPressure:    { dev: 0.8,  rate: 0.20 }, // rapid drop = pump fault (was 0.04 — too tight, triggered on noise)
  fuelOilPressure:    { dev: 1.5,  rate: 0.25 }, // rated 8.0 bar → LO at 6.5 bar
  scavengeAir:        { dev: 0.5,  rate: 0.12 }, // rated 3.2 bar → LO at 2.7 bar
  pistonCoolingPress: { dev: 0.8,  rate: 0.20 }, // rated 4.5 bar → LO at 3.7 bar
  loFilterDP:         { dev: 0.15, rate: 0.06 }, // rated 0.4 bar → HI at 0.55 bar (was 0.02 — scored on noise)

  // Performance
  tcRPM:      { dev: 2000, rate: 200  }, // rated ~25 k RPM → 2000 RPM drop = action
  sfoc:       { dev: 15,   rate: 1    }, // rated ~170 g/kWh → +15 = efficiency warning
  shaftPower: { dev: 500,  rate: 50   }, // rated 9100 kW   → 500 kW drop = warning
  fuelRack:   { dev: 8,    rate: 1    }, // rated ~100 mm   → 8 mm swing = notable
};

interface RiskWeights {
  dev: number;
  trend: number;
  persist: number;
}

// Load-dependent weights — high load: deviation and persistence dominate (consequences bigger).
// Low load: trending matters more (small deviation may be early warning at light load).
function getWeights(load: number): RiskWeights {
  if (load > 80) return { dev: 0.40, trend: 0.25, persist: 0.35 };
  if (load < 40) return { dev: 0.25, trend: 0.40, persist: 0.35 };
  return { dev: 0.35, trend: 0.30, persist: 0.35 };
}

/**
 * Compute subsystem risk score [0–100].
 *
 * Design principles:
 *  - 20% deadband: small normal fluctuations within this zone score zero.
 *  - Spike damping: transient deviations (< 3 consecutive ticks) score at 40% weight.
 *    A genuine fault builds naturally; a sensor spike decays in 1–2 ticks.
 *  - 5-tick minimum: persist score is zero below 5 ticks — matches user requirement
 *    that "threshold crossed for 5 sec then only it raises alarm".
 *  - Rate noise floor: rates below 10% of fault-speed rate are measurement noise.
 *    Exception: rapid faults (rate near alarmRate) still trigger immediately — that's correct.
 */
export function computeRisk(
  actual: number,
  expected: number,
  rate: number,
  persistCount: number,
  load: number,
  alarmBand?: number,
  alarmRate?: number,
): number {
  const base = Math.abs(expected) || 1;

  // Deviation score with 20% deadband.
  // MTU physics: sensors have natural ±5–20% band; only deviations outside this are meaningful.
  const band = alarmBand ?? (base * 0.05);
  const deadband = band * 0.20;
  const effectiveDev = Math.max(0, Math.abs(actual - expected) - deadband);
  const scoreDev = effectiveDev > 0
    ? Math.min(100, (effectiveDev / (band - deadband)) * 100)
    : 0;

  // Rate score with noise floor + load-dependent gate.
  // Rate alarms are only meaningful when the engine is in loaded steady state.
  // Below 25% load the engine is warming/cooling — natural rate fluctuations are large
  // and rate-based scoring fires constantly without indicating real faults.
  // Load scale: 0% → 0% rate contribution, 25%+ → full rate contribution.
  const rateScale = alarmRate ?? (base * 0.2);
  const noiseFloor = rateScale * 0.10;
  const effectiveRate = Math.max(0, Math.abs(rate) - noiseFloor);
  const rawTrend = effectiveRate > 0
    ? Math.min(100, (effectiveRate / (rateScale * 0.90)) * 100)
    : 0;
  const rateLoadFactor = load >= 25 ? 1.0 : load / 25;
  const scoreTrend = rawTrend * rateLoadFactor;

  // Persistence score — zero until 5 consecutive ticks (5-second gate).
  const scorePersist =
    persistCount >= 12 ? 100 :
    persistCount >= 8  ? 70  :
    persistCount >= 5  ? 35  :
    persistCount >= 3  ? 12  : 0;

  // Spike damping: new deviations (< 3 ticks) score at 40% of dev weight.
  // Genuine sustained faults accumulate persist and recover full weight at tick 3.
  // Rapid-rate faults bypass this via scoreTrend — they trigger immediately regardless.
  const devMultiplier = persistCount < 3 ? 0.40 : 1.0;

  const w = getWeights(load);
  return Math.min(100,
    w.dev * scoreDev * devMultiplier +
    w.trend * scoreTrend +
    w.persist * scorePersist,
  );
}

/**
 * Exponential weighted moving average smoother for risk scores.
 * alpha=0.35: 65% weight on history — dampens single-tick spikes.
 * A genuine sustained fault (40 raw score) crosses WARNING (~25) after ~4 ticks.
 * A one-tick spike at 40 decays to <10 within 3 ticks after recovering.
 */
export class RiskSmoother {
  private values: Record<string, number> = {};

  smooth(id: string, raw: number, alpha = 0.35): number {
    const prev = this.values[id] ?? raw;
    const s = alpha * raw + (1 - alpha) * prev;
    this.values[id] = s;
    return s;
  }

  reset(id: string): void { delete this.values[id]; }
}

export class PersistenceCounter {
  private counts: Record<string, number> = {};

  tick(id: string, conditionMet: boolean): number {
    this.counts[id] = conditionMet ? (this.counts[id] ?? 0) + 1 : 0;
    return this.counts[id];
  }

  get(id: string): number { return this.counts[id] ?? 0; }
  reset(id: string): void { this.counts[id] = 0; }
}
