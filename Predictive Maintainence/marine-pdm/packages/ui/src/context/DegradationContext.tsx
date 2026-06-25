// Degradation detection: monitors slow, progressive sensor decline over time.
// Distinct from alert spikes — degradation is consistent drift over 60+ consecutive ticks.
// Workflow: ACTIVE (on dashboard) → ACKNOWLEDGED → RESOLVED (on degradation log).

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useEngine } from './EngineContext';
import type { SensorHistory } from './EngineContext';

export type DegradationSeverity = 'WATCH' | 'CAUTION' | 'ACTION';
export type DegradationStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface DegradationEvent {
  id: string;
  sensor: string;
  label: string;
  unit: string;
  detectedAt: number;
  severity: DegradationSeverity;
  status: DegradationStatus;
  direction: 'rising' | 'falling';
  trendRatePerTick: number;
  trendRatePer100Ticks: number;
  currentValue: number;
  baselineValue: number;
  totalDeviation: number;
  consecutiveTicks: number;
  rootCause: string;
  reasoning: string;
  checkItems: string[];
  historySnapshot: number[];
  acknowledgedAt?: number;
  resolvedAt?: number;
  repairNotes?: string;
  simRunTicks: number;
}

interface TrendTracker {
  consecutiveTicks: number;
  trendSum: number;
  prevValue: number;
}

interface DegradationCtx {
  events: DegradationEvent[];
  activeEvents: DegradationEvent[];
  acknowledgedEvents: DegradationEvent[];
  acknowledge: (id: string) => void;
  resolve: (id: string, repairNotes: string) => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<DegradationCtx | null>(null);

// ── MTU 8000 sensor degradation configurations ────────────────────────────────
interface SensorConfig {
  histKey: keyof SensorHistory;
  baseKey: keyof SensorHistory;
  label: string;
  unit: string;
  direction: 'falling' | 'rising';
  minRatePerTick: number;
  maxRatePerTick: number;
  minDevFromBase: number;
  requiredTicks: number;
  severity: (dev: number) => DegradationSeverity;
  rootCause: string;
  reasoning: string;
  checkItems: string[];
}

const SENSOR_CONFIGS: SensorConfig[] = [
  {
    histKey: 'lubeOilPressure',
    baseKey: 'baseLube',
    label: 'Lube Oil Pressure',
    unit: 'bar',
    direction: 'falling',
    minRatePerTick: 0.0003,
    maxRatePerTick: 0.008,
    minDevFromBase: 0.15,
    requiredTicks: 60,
    severity: dev => Math.abs(dev) > 0.5 ? 'ACTION' : Math.abs(dev) > 0.25 ? 'CAUTION' : 'WATCH',
    rootCause: 'Gradual lube oil pressure loss',
    reasoning:
      'Progressive pressure decline after extended running suggests oil pump wear, ' +
      'increasing filter restriction, or early bearing clearance growth raising internal leakage. ' +
      'Oil viscosity may be degrading due to thermal breakdown or fuel dilution. ' +
      'After restart the pressure returns to nominal — confirming the decline is load/time-dependent, ' +
      'not a cold-start condition.',
    checkItems: [
      'Check lube oil level in sump — top up if low',
      'Inspect LO filter ΔP trend — schedule element change if rising (W1047)',
      'Measure pump output pressure at outlet vs main gallery',
      'Send oil sample for viscosity, particle count, and fuel dilution analysis',
      'Inspect visible pipework and flange connections for seepage',
      'Check bearing clearances at next planned entry (W1609)',
    ],
  },
  {
    histKey: 'exhaustTemp',
    baseKey: 'baseExhaust',
    label: 'Exhaust Temperature',
    unit: '°C',
    direction: 'rising',
    minRatePerTick: 0.015,
    maxRatePerTick: 0.4,
    minDevFromBase: 5,
    requiredTicks: 60,
    severity: dev => dev > 15 ? 'ACTION' : dev > 8 ? 'CAUTION' : 'WATCH',
    rootCause: 'Gradual exhaust temperature elevation',
    reasoning:
      'Slow exhaust temp rise over extended operation indicates injector nozzle wear or erosion ' +
      'affecting spray pattern quality. Alternatively, turbocharger fouling reduces charge air density, ' +
      'causing elevated combustion temperatures across all cylinders. ' +
      'The gradual nature (not a step change) rules out a single injector failure — ' +
      'this is a systemic efficiency loss building over running hours.',
    checkItems: [
      'Compare charge air pressure against baseline — low pressure confirms TC fouling',
      'Inspect turbocharger compressor wheel for fouling (W1038)',
      'Review fuel injector spray pattern — schedule W1011 endoscopic inspection',
      'Review fuel quality — sulphur content, viscosity at injection temperature',
      'Check timing of last injector overhaul and plan W1006 replacement',
    ],
  },
  {
    histKey: 'loFilterDP',
    baseKey: 'baseLoFilterDP',
    label: 'LO Filter Differential Pressure',
    unit: 'bar',
    direction: 'rising',
    minRatePerTick: 0.00008,
    maxRatePerTick: 0.001,
    minDevFromBase: 0.04,
    requiredTicks: 80,
    severity: dev => dev > 0.1 ? 'ACTION' : dev > 0.06 ? 'CAUTION' : 'WATCH',
    rootCause: 'LO filter contamination progressively building up',
    reasoning:
      'Rising LO filter differential pressure indicates progressive particulate accumulation. ' +
      'Sources include bearing wear debris, combustion carbon from piston blow-by, or external ingestion. ' +
      'If filter ΔP reaches bypass threshold, unfiltered oil reaches bearings directly — ' +
      'accelerating wear and potentially causing bearing overtemperature.',
    checkItems: [
      'Inspect centrifugal and automatic filter elements (W1047)',
      'Send oil sample for particle count and spectrographic analysis',
      'Check crankcase pressure for blow-by — elevated = piston ring wear',
      'Review last filter element replacement date vs operating hours',
      'Inspect oil sight glass for discolouration or metallic sheen',
    ],
  },
  {
    histKey: 'sfoc',
    baseKey: 'baseSfoc',
    label: 'Specific Fuel Oil Consumption',
    unit: 'g/kWh',
    direction: 'rising',
    minRatePerTick: 0.003,
    maxRatePerTick: 0.06,
    minDevFromBase: 4,
    requiredTicks: 70,
    severity: dev => dev > 12 ? 'ACTION' : dev > 7 ? 'CAUTION' : 'WATCH',
    rootCause: 'Thermal efficiency loss — fuel consumption increasing',
    reasoning:
      'Rising SFOC indicates progressive combustion efficiency degradation. ' +
      'Primary causes: injector nozzle wear reducing atomisation quality, ' +
      'turbocharger efficiency loss reducing charge air pressure and density, ' +
      'or piston ring wear increasing blow-by losses. ' +
      'Fuel quality variation (cetane index, viscosity) can also contribute.',
    checkItems: [
      'Compare charge air pressure against baseline — key TC health indicator',
      'Review injector performance (W1006) — worn nozzles cause poor atomisation',
      'Cross-check SFOC trend vs running hours since last piston/ring overhaul',
      'Sample current fuel for quality parameters (cetane, viscosity, sulphur)',
      'Check piston ring blow-by via crankcase pressure monitoring',
    ],
  },
  {
    histKey: 'tcRPM',
    baseKey: 'baseTcRPM',
    label: 'Turbocharger Speed',
    unit: 'RPM',
    direction: 'falling',
    minRatePerTick: 0.8,
    maxRatePerTick: 18,
    minDevFromBase: 800,
    requiredTicks: 60,
    severity: dev => Math.abs(dev) > 2000 ? 'ACTION' : Math.abs(dev) > 1200 ? 'CAUTION' : 'WATCH',
    rootCause: 'Turbocharger efficiency degradation',
    reasoning:
      'Progressive TC speed decline at constant engine load indicates turbine or compressor fouling. ' +
      'Exhaust-side deposits (sulphate scaling, carbon) reduce turbine efficiency. ' +
      'Air-side compressor fouling reduces volumetric flow and compression ratio. ' +
      'Both effects raise exhaust temperatures and reduce charge air pressure, ' +
      'compounding SFOC increases. TC bearing wear produces an identical signature.',
    checkItems: [
      'Cross-check charge air pressure — should track TC speed proportionally',
      'Inspect compressor inlet filter for restriction',
      'Schedule TC wet and dry washing per vendor procedure (W1038)',
      'Check TC bearing housing for oil leakage or overheating',
      'Verify TC wash log compliance',
    ],
  },
  {
    histKey: 'jacketOutlet',
    baseKey: 'baseJacket',
    label: 'Jacket Cooling Outlet Temperature',
    unit: '°C',
    direction: 'rising',
    minRatePerTick: 0.008,
    maxRatePerTick: 0.15,
    minDevFromBase: 2.5,
    requiredTicks: 80,
    severity: dev => dev > 6 ? 'ACTION' : dev > 3.5 ? 'CAUTION' : 'WATCH',
    rootCause: 'HT cooling circuit fouling or reduced flow capacity',
    reasoning:
      'Gradual jacket outlet temperature rise at constant load points to HT cooler fouling ' +
      '(scale, biofilm, or corrosion deposits reducing heat transfer), ' +
      'or cooling water pump capacity reduction due to impeller wear. ' +
      'System-wide elevation affects all cylinders equally, distinguishing this ' +
      'from single-cylinder faults. Out-of-spec jacket water treatment accelerates scale formation.',
    checkItems: [
      'Schedule HT cooler cleaning — Hakutex 50 chemical flush (W1254)',
      'Verify fresh water cooling pump delivery pressure',
      'Check expansion tank for crystalline limescale deposits',
      'Test jacket water chemistry — nitrite concentration, pH, hardness',
      'Inspect thermostat valve — sticking thermostat mimics fouling',
    ],
  },
];

export function DegradationProvider({ children }: { children: React.ReactNode }) {
  const { history, snapshot, baseline } = useEngine();
  const [events, setEvents] = useState<DegradationEvent[]>([]);
  const trackers = useRef<Record<string, TrendTracker>>({});
  const firedKeys = useRef<Set<string>>(new Set());
  const tickCount = useRef(0);

  useEffect(() => {
    if (!snapshot || !baseline) return;
    tickCount.current++;

    for (const cfg of SENSOR_CONFIGS) {
      const hist = history[cfg.histKey] as number[];
      const baseHist = history[cfg.baseKey] as number[];
      if (!hist || hist.length < 5) continue;

      const current = hist[hist.length - 1]!;
      const baseVal = (baseHist && baseHist.length > 0)
        ? baseHist[baseHist.length - 1]!
        : current;
      const dev = current - baseVal;

      // Initialise tracker on first encounter
      if (!trackers.current[cfg.histKey]) {
        trackers.current[cfg.histKey] = { consecutiveTicks: 0, trendSum: 0, prevValue: current };
      }
      const tracker = trackers.current[cfg.histKey]!;

      const delta = current - tracker.prevValue;
      const absDelta = Math.abs(delta);
      const isInDirection = cfg.direction === 'falling' ? delta < 0 : delta > 0;
      const inRateBand = absDelta >= cfg.minRatePerTick && absDelta <= cfg.maxRatePerTick;
      const devSignificant = cfg.direction === 'falling'
        ? dev < -cfg.minDevFromBase
        : dev > cfg.minDevFromBase;

      if (isInDirection && inRateBand && devSignificant) {
        tracker.consecutiveTicks++;
        tracker.trendSum += delta;
      } else if (absDelta > cfg.maxRatePerTick * 2) {
        // Fault-speed jump — reset (not degradation)
        tracker.consecutiveTicks = Math.max(0, tracker.consecutiveTicks - 5);
        tracker.trendSum = 0;
      }
      // Small noise ticks leave counter intact (graceful tolerance)

      tracker.prevValue = current;

      const fireKey = `${cfg.histKey}_degrade`;

      // Fire event when threshold reached and not already fired
      if (tracker.consecutiveTicks >= cfg.requiredTicks && !firedKeys.current.has(fireKey)) {
        firedKeys.current.add(fireKey);
        const avgRate = tracker.consecutiveTicks > 0 ? tracker.trendSum / tracker.consecutiveTicks : 0;

        const event: DegradationEvent = {
          id: `${fireKey}_${Date.now()}`,
          sensor: cfg.histKey,
          label: cfg.label,
          unit: cfg.unit,
          detectedAt: Date.now(),
          severity: cfg.severity(dev),
          status: 'ACTIVE',
          direction: cfg.direction,
          trendRatePerTick: avgRate,
          trendRatePer100Ticks: avgRate * 100,
          currentValue: current,
          baselineValue: baseVal,
          totalDeviation: dev,
          consecutiveTicks: tracker.consecutiveTicks,
          rootCause: cfg.rootCause,
          reasoning: cfg.reasoning,
          checkItems: cfg.checkItems,
          historySnapshot: hist.slice(-60),
          simRunTicks: tickCount.current,
        };

        setEvents(prev => [event, ...prev]);
      }

      // Reset fire gate when sensor fully recovers (returns within 50% of threshold)
      const recovered = cfg.direction === 'falling'
        ? dev > -(cfg.minDevFromBase * 0.5)
        : dev < cfg.minDevFromBase * 0.5;

      if (recovered && firedKeys.current.has(fireKey)) {
        firedKeys.current.delete(fireKey);
        tracker.consecutiveTicks = 0;
        tracker.trendSum = 0;
      }
    }
  });

  const acknowledge = useCallback((id: string) => {
    setEvents(prev => prev.map(e =>
      e.id === id ? { ...e, status: 'ACKNOWLEDGED' as DegradationStatus, acknowledgedAt: Date.now() } : e
    ));
  }, []);

  const resolve = useCallback((id: string, repairNotes: string) => {
    setEvents(prev => prev.map(e =>
      e.id === id
        ? { ...e, status: 'RESOLVED' as DegradationStatus, resolvedAt: Date.now(), repairNotes }
        : e
    ));
    const ev = events.find(e => e.id === id);
    if (ev) {
      const fireKey = `${ev.sensor}_degrade`;
      firedKeys.current.delete(fireKey);
      if (trackers.current[ev.sensor]) {
        trackers.current[ev.sensor]!.consecutiveTicks = 0;
        trackers.current[ev.sensor]!.trendSum = 0;
      }
    }
  }, [events]);

  const dismiss = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const activeEvents       = events.filter(e => e.status === 'ACTIVE');
  const acknowledgedEvents = events.filter(e => e.status !== 'ACTIVE');

  return (
    <Ctx.Provider value={{ events, activeEvents, acknowledgedEvents, acknowledge, resolve, dismiss }}>
      {children}
    </Ctx.Provider>
  );
}

const EMPTY_CTX: DegradationCtx = {
  events: [],
  activeEvents: [],
  acknowledgedEvents: [],
  acknowledge: () => {},
  resolve: () => {},
  dismiss: () => {},
};

export function useDegradation(): DegradationCtx {
  return useContext(Ctx) ?? EMPTY_CTX;
}
