import React from 'react';
import type { EngineSnapshot, BaselineSnapshot, DecisionOutput } from '@marine-pdm/shared';
import { ALARM_LIMITS, bearingTempMax } from '@marine-pdm/shared';

const CX = 60, CY = 64, R = 48;
const CIRC      = 2 * Math.PI * R;
const SWEEP     = 240;
const GAUGE_LEN = (SWEEP / 360) * CIRC;
const START_DEG = 150;

function riskColor(risk: number): string {
  if (risk >= 75) return 'var(--risk-critical)';
  if (risk >= 50) return 'var(--risk-high)';
  if (risk >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}
function riskGlow(risk: number): string {
  if (risk >= 75) return 'var(--glow-critical-rgb)';
  if (risk >= 50) return 'var(--glow-high-rgb)';
  if (risk >= 25) return 'var(--glow-warning-rgb)';
  return 'var(--glow-normal-rgb)';
}

interface AlarmTick { value: number; color: string; label: string; inner?: boolean }

interface ArcGaugeProps {
  label: string;
  actual: number;
  expected: number;
  unit: string;
  risk: number;
  physMin: number;
  physMax: number;
  alarmTicks?: AlarmTick[];
  decimals?: number;
  ribbonColor?: string;
  gaugeColor?: string;  // value-based color — overrides riskColor(risk) for arc fill
  dimmed?: boolean;     // pre-start mode: grey, no alarm colors
  onClick?: () => void;
}

function valueToAngle(v: number, physMin: number, physMax: number): number {
  const pct = Math.max(0, Math.min(1, (v - physMin) / (physMax - physMin)));
  return START_DEG + pct * SWEEP;
}
function arcPoint(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function ArcGauge({
  label, actual, expected, unit, risk, physMin, physMax,
  alarmTicks = [], decimals = 1, ribbonColor = 'var(--accent-blue)', gaugeColor, dimmed = false, onClick,
}: ArcGaugeProps) {
  const PRE_COLOR = 'rgba(255,255,255,0.18)';
  const color   = dimmed ? PRE_COLOR : (gaugeColor ?? riskColor(risk));
  const glow    = dimmed ? '255,255,255' : riskGlow(risk);
  const pct     = Math.max(0, Math.min(1, (actual - physMin) / (physMax - physMin)));
  const fillLen = pct * GAUGE_LEN;
  const deviation = actual - expected;

  const dotDeg = START_DEG + pct * SWEEP;
  const [dotX, dotY] = arcPoint(dotDeg, R);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-dim)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 10px 10px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        position: 'relative', overflow: 'hidden',
        transition: 'border-color 0.5s ease, box-shadow 0.5s ease, transform 0.15s ease',
        borderColor: !dimmed && risk > 25 ? color : 'var(--border-dim)',
        boxShadow: !dimmed && risk > 25
          ? `0 0 20px rgba(${glow}, 0.15), inset 0 0 40px rgba(${glow}, 0.04)`
          : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.transform = ''; }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: dimmed ? 'rgba(255,255,255,0.08)' : ribbonColor, opacity: 0.75,
      }} />

      <div className="label-xs" style={{ marginBottom: 2, alignSelf: 'flex-start', opacity: dimmed ? 0.5 : 1 }}>
        {label}
      </div>

      <svg width="120" height="108" viewBox="0 0 120 118" style={{ overflow: 'visible' }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth="7"
          strokeDasharray={`${GAUGE_LEN} ${CIRC - GAUGE_LEN}`}
          transform={`rotate(${START_DEG}, ${CX}, ${CY})`} strokeLinecap="round" />

        {/* Hide alarm ticks in pre-start mode */}
        {!dimmed && alarmTicks.map((tick, i) => {
          if (tick.value <= physMin || tick.value >= physMax) return null;
          const ang = valueToAngle(tick.value, physMin, physMax);
          const [ox, oy] = arcPoint(ang, R + 7);
          const [ix, iy] = arcPoint(ang, R - 8);
          const [lx, ly] = arcPoint(ang, R + 14);
          return (
            <g key={i}>
              <line x1={ix} y1={iy} x2={ox} y2={oy} stroke={tick.color} strokeWidth="2" strokeLinecap="round" />
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize="6.5" fill={tick.color}
                fontFamily="'JetBrains Mono', monospace" fontWeight="700">{tick.label}</text>
            </g>
          );
        })}

        <circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${fillLen} ${CIRC - fillLen}`}
          transform={`rotate(${START_DEG}, ${CX}, ${CY})`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.8s ease' }} />

        {!dimmed && risk > 15 && (
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${fillLen} ${CIRC - fillLen}`}
            transform={`rotate(${START_DEG}, ${CX}, ${CY})`}
            opacity="0.3" style={{ filter: 'blur(3px)', transition: 'stroke-dasharray 0.5s ease' }} />
        )}

        <circle cx={dotX} cy={dotY} r={3.5} fill={color} />
        <circle cx={dotX} cy={dotY} r={1.8} fill="var(--bg-main)" />

        <text x={CX} y={CY - 5} textAnchor="middle"
          fill={color} fontSize="19" fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
          style={{ transition: 'fill 0.8s' }}>
          {actual.toFixed(decimals)}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle"
          fill="var(--text-muted)" fontSize="8.5"
          fontFamily="'JetBrains Mono', monospace">
          {unit}
        </text>
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 0 }}>
        {dimmed ? (
          <span style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>PRE-START</span>
        ) : (
          <>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              exp {expected.toFixed(decimals)}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: Math.abs(deviation) < (physMax - physMin) * 0.03
                ? 'var(--text-secondary)' : color,
            }}>
              {deviation >= 0 ? '+' : ''}{deviation.toFixed(decimals)}
            </div>
          </>
        )}
      </div>

      <div style={{
        width: '100%', height: 3, background: 'var(--border-dim)',
        borderRadius: 2, marginTop: 4, overflow: 'hidden',
      }}>
        {!dimmed && (
          <div style={{
            height: '100%',
            width: `${Math.min(100, Math.abs(deviation / ((physMax - physMin) * 0.2)) * 100)}%`,
            background: color, borderRadius: 2,
            transition: 'width 0.5s ease, background 0.5s ease',
          }} />
        )}
      </div>
    </div>
  );
}

const L1 = '#B8D0E8';
const L2 = 'var(--risk-warning)';
const L3 = 'var(--risk-high)';
const L4 = 'var(--risk-critical)';

// SFOC: color based on % deviation from live baseline (5 % = orange, 10 % = red).
// Only high-side deviations are penalised — lower SFOC than baseline stays green.
function sfocBaselineColor(actual: number, expected: number): string {
  if (expected <= 0) return 'var(--risk-normal)';
  const devPct = (actual - expected) / expected * 100;
  if (devPct >= 10) return 'var(--risk-critical)';
  if (devPct >= 5)  return 'var(--risk-high)';
  return 'var(--risk-normal)';
}

// Returns a color based on where `value` sits relative to alarm thresholds.
// When `expected` (load-adjusted baseline) + `alarmBandDev` (MTU pre-alarm gap) are provided,
// uses deviation-from-baseline coloring so gauges read GREEN at low load when values are
// physically correct for that load point (fixes false orange on LO/piston cooling at idle).
//
// Coloring bands (deviation-from-baseline mode):
//   green  — deviation < 20% of alarm band (deadband: normal sensor scatter)
//   yellow — deviation 50–80% toward pre-alarm threshold (trend concern)
//   orange — deviation ≥ 80% toward pre-alarm threshold (approaching alarm)
//   red    — absolute ECS shutdown/alarm limit crossed (always fires regardless of load)
//
// Direction awareness:
//   pressure sensors (preAlarmLow present): only penalise drops below expected
//   temperature / ΔP (preAlarmHigh present): only penalise rises above expected
//   sensors with both limits: use absolute deviation (symmetric)
type AlarmBand = {
  physMin?: number; physMax?: number;
  preAlarmHigh?: number; alarmHigh?: number; slowdownHigh?: number; shutdownHigh?: number;
  preAlarmLow?: number; alarmLow?: number; slowdownLow?: number; shutdownLow?: number;
  normalMin?: number; normalMax?: number;
};
function sensorValueColor(
  value: number,
  physMin: number,
  physMax: number,
  limits: AlarmBand,
  expected?: number,    // load-adjusted baseline (from BaselineSnapshot)
  alarmBandDev?: number, // MTU 8000 deviation from expected to pre-alarm threshold
): string {
  // ── 1. True ECS shutdown limits — unconditional at any load ────────────────
  if (limits.shutdownHigh !== undefined && value >= limits.shutdownHigh) return 'var(--risk-critical)';
  if (limits.shutdownLow  !== undefined && value <= limits.shutdownLow)  return 'var(--risk-critical)';

  // ── 2. Load-aware absolute L1/L2 alarm checks ───────────────────────────────
  // These thresholds are rated-load values. At idle, expected pressure drops BELOW the
  // preAlarmLow → the check would false-alarm every tick. So we only apply them when
  // expected is on the "safe" side of the limit (engine is genuinely in loaded operation).
  //
  // Example: LO preAlarmLow=5.5 bar.
  //   Idle (expected=4.68):  4.68 > 5.5? NO → skip → no false alarm ✓
  //   80% load (expected=6.05): 6.05 > 5.5? YES → if actual=4.80 ≤ 5.5 → orange ✓
  if (expected !== undefined) {
    if (limits.alarmHigh    !== undefined && expected <  limits.alarmHigh    && value >= limits.alarmHigh)    return 'var(--risk-critical)';
    if (limits.slowdownHigh !== undefined && expected <  limits.slowdownHigh && value >= limits.slowdownHigh) return 'var(--risk-critical)';
    if (limits.preAlarmHigh !== undefined && expected <  limits.preAlarmHigh && value >= limits.preAlarmHigh) return 'var(--risk-high)';
    if (limits.alarmLow     !== undefined && expected >  limits.alarmLow     && value <= limits.alarmLow)     return 'var(--risk-critical)';
    if (limits.slowdownLow  !== undefined && expected >  limits.slowdownLow  && value <= limits.slowdownLow)  return 'var(--risk-critical)';
    if (limits.preAlarmLow  !== undefined && expected >  limits.preAlarmLow  && value <= limits.preAlarmLow)  return 'var(--risk-high)';
  }

  // ── 3. Deviation-from-baseline coloring (load-aware) ────────────────────────
  // Ratio tiers (based on effective deviation / alarmBandDev):
  //   ≥ 1.25 → red   (well past pre-alarm into alarm zone)
  //   ≥ 0.80 → orange (at / crossed pre-alarm — ratio=0.80 exactly = preAlarmLow hit)
  //   ≥ 0.50 → yellow (50–80% toward pre-alarm, trend concern)
  //   <  0.50 → green (within normal operating scatter)
  if (expected !== undefined && alarmBandDev !== undefined && alarmBandDev > 0) {
    const hasHighAlarm = limits.preAlarmHigh !== undefined;
    const hasLowAlarm  = limits.preAlarmLow  !== undefined;
    let dev: number;
    if (hasLowAlarm && !hasHighAlarm) {
      dev = Math.max(0, expected - value);   // pressure: only drops below expected are dangerous
    } else if (hasHighAlarm && !hasLowAlarm) {
      dev = Math.max(0, value - expected);   // temperature / ΔP: only rises above expected
    } else {
      dev = Math.abs(value - expected);      // symmetric (both sides alarm)
    }
    const deadband  = alarmBandDev * 0.20;
    const effective = Math.max(0, dev - deadband);
    const ratio     = effective / alarmBandDev;
    if (ratio >= 1.25) return 'var(--risk-critical)'; // deep into alarm zone
    if (ratio >= 0.80) return 'var(--risk-high)';     // at / past pre-alarm → orange
    if (ratio >= 0.50) return 'var(--risk-warning)';  // approaching → yellow
    return 'var(--risk-normal)';
  }

  // ── 4. Fallback: absolute-threshold coloring (no expected provided) ──────────
  // Used when baseline expected is not available (ShaftPower strip, etc.)
  if (limits.slowdownHigh !== undefined && value >= limits.slowdownHigh) return 'var(--risk-critical)';
  if (limits.slowdownLow  !== undefined && value <= limits.slowdownLow)  return 'var(--risk-critical)';
  if (limits.alarmHigh    !== undefined && value >= limits.alarmHigh)    return 'var(--risk-critical)';
  if (limits.alarmLow     !== undefined && value <= limits.alarmLow)     return 'var(--risk-critical)';
  const buf = (physMax - physMin) * 0.05;
  if (limits.preAlarmHigh !== undefined && value >= limits.preAlarmHigh)       return 'var(--risk-high)';
  if (limits.preAlarmHigh !== undefined && value >= limits.preAlarmHigh - buf) return 'var(--risk-warning)';
  if (limits.preAlarmLow  !== undefined && value <= limits.preAlarmLow)        return 'var(--risk-high)';
  if (limits.preAlarmLow  !== undefined && value <= limits.preAlarmLow  + buf) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

// ── Shaft Power Strip (exported for Dashboard layout control) ─────────────────
export function ShaftPowerStrip({ snap, decision, isOperational = true }: { snap: EngineSnapshot; decision: DecisionOutput; isOperational?: boolean }) {
  const AL = ALARM_LIMITS;
  const shaftPowerRisk = derivedRisk(decision.systemRisk, 0.5);
  const shaftPowerPct  = (snap.shaftPower / 9100) * 100;
  const dimColor = isOperational ? undefined : 'var(--text-dim)';
  return (
    <div className="glass-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="label-xs" style={{ opacity: 0.7 }}>SHAFT POWER</div>
        <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: dimColor ?? riskColor(shaftPowerRisk) }}>
          {snap.shaftPower.toFixed(0)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>kW</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>MCR Load</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>{shaftPowerPct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--border-dim)', borderRadius: 3, overflow: 'hidden' }}>
          {isOperational && (
            <div style={{
              height: '100%',
              width: `${Math.min(100, shaftPowerPct)}%`,
              background: sensorValueColor(snap.shaftPower, AL.shaftPower.physMin, AL.shaftPower.physMax, AL.shaftPower),
              borderRadius: 3,
              transition: 'width 0.5s ease, background 0.5s ease',
            }} />
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { label: 'ENGINE RPM', value: snap.rpm.toFixed(0), unit: 'RPM' },
          { label: 'ENGINE LOAD', value: snap.load.toFixed(1), unit: '%' },
        ].map(({ label, value, unit }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div className="label-xs" style={{ marginBottom: 2, opacity: 0.7 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: dimColor ?? 'var(--text-primary)' }}>
              {value} <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  snap: EngineSnapshot;
  baseline: BaselineSnapshot;
  decision: DecisionOutput;
  isOperational?: boolean;
  onGaugeClick?: (sensorId: string) => void;
}

function derivedRisk(base: number, factor: number): number {
  return Math.min(100, base * factor);
}

export function GaugeGrid({ snap, baseline, decision, isOperational = true, onGaugeClick }: Props) {
  const dimmed = !isOperational;
  const AL = ALARM_LIMITS;

  // ── Dynamic alarm band for pressure sensors ───────────────────────────────
  // The MTU8000_ALARM_BANDS dev values were calibrated at rated (100%) load.
  // At partial load, expected pressure drops but absolute preAlarmLow stays fixed,
  // so the gap from expected→preAlarmLow shrinks. dynamicPressBand computes the
  // ACTUAL gap so that orange fires exactly when the sensor hits the ECS L1 level,
  // regardless of current load. Falls back to ratedBand at idle (where expected
  // may sit below preAlarmLow — normal at low load, no alarm is intended).
  const dynamicPressBand = (expected: number, preAlarmLow: number | undefined, ratedBand: number): number => {
    if (preAlarmLow !== undefined) {
      const gap = expected - preAlarmLow;
      if (gap > ratedBand * 0.35) return gap;  // above idle: use actual limit gap
    }
    return ratedBand; // low load / no preAlarmLow → use standard rated band
  };

  // ── Section 1: Core thermodynamic sensors ──────────────────────────────
  const coreGauges: (ArcGaugeProps & { sensorId: string })[] = [
    {
      sensorId: 'ME.ExhaustTemp',
      label: 'Exhaust Temp',
      actual: snap.exhaustTemp, expected: baseline.expectedExhaust,
      unit: '°C', risk: decision.exhaustRisk,
      physMin: AL.exhaustTemp.physMin, physMax: AL.exhaustTemp.physMax,
      ribbonColor: 'var(--risk-high)',
      gaugeColor: sensorValueColor(snap.exhaustTemp, AL.exhaustTemp.physMin, AL.exhaustTemp.physMax, AL.exhaustTemp, baseline.expectedExhaust, 20),
      alarmTicks: [
        { value: AL.exhaustTemp.preAlarmHigh, color: L1, label: 'L1' },
        { value: AL.exhaustTemp.alarmHigh,    color: L2, label: 'L2' },
        { value: AL.exhaustTemp.slowdownHigh, color: L3, label: 'L3' },
        { value: AL.exhaustTemp.shutdownHigh, color: L4, label: 'L4' },
      ],
    },
    {
      sensorId: 'ME.LubeOilPressure',
      label: 'LO Pressure',
      actual: snap.lubeOilPressure, expected: baseline.expectedLube,
      unit: 'bar', risk: decision.lubeRisk, decimals: 2,
      physMin: AL.lubeOilPressure.physMin, physMax: AL.lubeOilPressure.physMax,
      ribbonColor: 'var(--accent-blue)',
      gaugeColor: sensorValueColor(snap.lubeOilPressure, AL.lubeOilPressure.physMin, AL.lubeOilPressure.physMax, AL.lubeOilPressure, baseline.expectedLube, dynamicPressBand(baseline.expectedLube, AL.lubeOilPressure.preAlarmLow, 0.8)),
      alarmTicks: [
        { value: AL.lubeOilPressure.alarmHigh,   color: L2, label: 'L2↑' },
        { value: AL.lubeOilPressure.preAlarmLow, color: L1, label: 'L1↓', inner: true },
        { value: AL.lubeOilPressure.alarmLow,    color: L2, label: 'L2↓', inner: true },
        { value: AL.lubeOilPressure.slowdownLow, color: L3, label: 'L3↓', inner: true },
        { value: AL.lubeOilPressure.shutdownLow, color: L4, label: 'L4↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.ScavengeAirPressure',
      label: 'Charge Air',
      actual: snap.scavengeAir, expected: baseline.expectedScavenge,
      unit: 'bar', risk: derivedRisk(decision.exhaustRisk, 0.5), decimals: 2,
      physMin: AL.scavengeAir.physMin, physMax: AL.scavengeAir.physMax,
      ribbonColor: 'var(--accent-cyan, #22D3EE)',
      gaugeColor: sensorValueColor(snap.scavengeAir, AL.scavengeAir.physMin, AL.scavengeAir.physMax, AL.scavengeAir, baseline.expectedScavenge, 0.5),
      alarmTicks: [
        { value: AL.scavengeAir.alarmHigh, color: L2, label: 'L2↑' },
        { value: AL.scavengeAir.alarmLow,  color: L2, label: 'L2↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.ChargeAirTemp',
      label: 'Charge Air Temp',
      actual: snap.chargeAirTemp, expected: baseline.expectedChargeAirTemp,
      unit: '°C', risk: derivedRisk(decision.exhaustRisk, 0.35), decimals: 1,
      physMin: AL.chargeAirTemp.physMin, physMax: AL.chargeAirTemp.physMax,
      ribbonColor: 'var(--accent-cyan, #22D3EE)',
      gaugeColor: sensorValueColor(snap.chargeAirTemp, AL.chargeAirTemp.physMin, AL.chargeAirTemp.physMax, AL.chargeAirTemp, baseline.expectedChargeAirTemp, 12),
      alarmTicks: [
        { value: AL.chargeAirTemp.preAlarmHigh,  color: L1, label: 'L1' },
        { value: AL.chargeAirTemp.alarmHigh,     color: L2, label: 'L2' },
        { value: AL.chargeAirTemp.shutdownHigh,  color: L4, label: 'L4' },
        { value: AL.chargeAirTemp.alarmLow,      color: L2, label: 'L2↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.JacketCoolingOutlet',
      label: 'Jacket Outlet',
      actual: snap.jacketOutlet, expected: baseline.expectedJacket,
      unit: '°C', risk: decision.coolingRisk,
      physMin: AL.jacketOutlet.physMin, physMax: AL.jacketOutlet.physMax,
      ribbonColor: 'var(--accent-steel, #94A3B8)',
      gaugeColor: sensorValueColor(snap.jacketOutlet, AL.jacketOutlet.physMin, AL.jacketOutlet.physMax, AL.jacketOutlet, baseline.expectedJacket, 8),
      alarmTicks: [
        { value: AL.jacketOutlet.preAlarmHigh,  color: L1, label: 'L1' },
        { value: AL.jacketOutlet.alarmHigh,     color: L2, label: 'L2' },
        { value: AL.jacketOutlet.slowdownHigh,  color: L3, label: 'L3' },
        { value: AL.jacketOutlet.shutdownHigh,  color: L4, label: 'L4' },
      ],
    },
  ];

  // ── Section 2: Fuel & LO system sensors ──────────────────────────────
  const systemGauges: (ArcGaugeProps & { sensorId: string })[] = [
    {
      sensorId: 'ME.FuelOilPressure',
      label: 'FO Pressure',
      actual: snap.fuelOilPressure, expected: baseline.expectedFuelOilPressure,
      unit: 'bar', risk: derivedRisk(decision.lubeRisk, 0.4), decimals: 2,
      physMin: AL.fuelOilPressure.physMin, physMax: AL.fuelOilPressure.physMax,
      ribbonColor: 'var(--risk-warning)',
      gaugeColor: sensorValueColor(snap.fuelOilPressure, AL.fuelOilPressure.physMin, AL.fuelOilPressure.physMax, AL.fuelOilPressure, baseline.expectedFuelOilPressure, dynamicPressBand(baseline.expectedFuelOilPressure, AL.fuelOilPressure.preAlarmLow, 1.5)),
      alarmTicks: [
        { value: AL.fuelOilPressure.alarmHigh,   color: L2, label: 'L2↑' },
        { value: AL.fuelOilPressure.preAlarmLow, color: L1, label: 'L1↓', inner: true },
        { value: AL.fuelOilPressure.alarmLow,    color: L2, label: 'L2↓', inner: true },
        { value: AL.fuelOilPressure.shutdownLow, color: L4, label: 'L4↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.FuelOilTemp',
      label: 'FO Temp',
      actual: snap.fuelOilTemp, expected: baseline.expectedFuelOilTemp,
      unit: '°C', risk: derivedRisk(decision.lubeRisk, 0.2), decimals: 1,
      physMin: AL.fuelOilTemp.physMin, physMax: AL.fuelOilTemp.physMax,
      ribbonColor: 'var(--risk-warning)',
      gaugeColor: sensorValueColor(snap.fuelOilTemp, AL.fuelOilTemp.physMin, AL.fuelOilTemp.physMax, AL.fuelOilTemp, baseline.expectedFuelOilTemp, 15),
      alarmTicks: [
        { value: AL.fuelOilTemp.preAlarmHigh, color: L1, label: 'L1' },
        { value: AL.fuelOilTemp.alarmHigh,    color: L2, label: 'L2' },
        { value: AL.fuelOilTemp.alarmLow,     color: L2, label: 'L2↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.LOFilterDP',
      label: 'LO Filter ΔP',
      actual: snap.loFilterDP, expected: baseline.expectedLoFilterDP,
      unit: 'bar', risk: derivedRisk(decision.lubeRisk, 0.7), decimals: 3,
      physMin: AL.loFilterDP.physMin, physMax: AL.loFilterDP.physMax,
      ribbonColor: 'var(--accent-blue)',
      // loFilterDP: use absolute threshold coloring — filter condition indicator (not load-dependent physics).
      // Healthy clean filter = 0.10–0.30 bar at any load. Absolute alarm: preAlarmHigh=0.55 bar.
      gaugeColor: sensorValueColor(snap.loFilterDP, AL.loFilterDP.physMin, AL.loFilterDP.physMax, AL.loFilterDP),
      alarmTicks: [
        { value: AL.loFilterDP.preAlarmHigh,  color: L1, label: 'L1' },
        { value: AL.loFilterDP.alarmHigh,     color: L2, label: 'L2' },
        { value: AL.loFilterDP.shutdownHigh,  color: L4, label: 'L4' },
      ],
    },
    {
      sensorId: 'ME.PistonCoolingPress',
      label: 'Piston Cool P',
      actual: snap.pistonCoolingPress, expected: baseline.expectedPistonCoolingPress,
      unit: 'bar', risk: derivedRisk(decision.coolingRisk, 0.6), decimals: 2,
      physMin: AL.pistonCoolingPress.physMin, physMax: AL.pistonCoolingPress.physMax,
      ribbonColor: 'var(--accent-steel, #94A3B8)',
      gaugeColor: sensorValueColor(snap.pistonCoolingPress, AL.pistonCoolingPress.physMin, AL.pistonCoolingPress.physMax, AL.pistonCoolingPress, baseline.expectedPistonCoolingPress, dynamicPressBand(baseline.expectedPistonCoolingPress, AL.pistonCoolingPress.preAlarmLow, 0.8)),
      alarmTicks: [
        { value: AL.pistonCoolingPress.alarmHigh,   color: L2, label: 'L2↑' },
        { value: AL.pistonCoolingPress.preAlarmLow, color: L1, label: 'L1↓', inner: true },
        { value: AL.pistonCoolingPress.alarmLow,    color: L2, label: 'L2↓', inner: true },
        { value: AL.pistonCoolingPress.shutdownLow, color: L4, label: 'L4↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.LubeOilPressure.LastBearing',
      label: 'Last Brg Press',
      // Distinct from the LO Pressure gauge above: that is the main gallery, this is the furthest
      // lubrication point (≈55 % of it) and the one carrying the SS Emergency Stop at 2.0 bar.
      actual: (snap.lubeLastBearingPressure as number | undefined) ?? 0,
      expected: baseline.expectedLubeLastBearing,
      unit: 'bar', risk: decision.lubeRisk, decimals: 2,
      physMin: AL.lubeLastBearingPressure.physMin, physMax: AL.lubeLastBearingPressure.physMax,
      ribbonColor: 'var(--risk-warning)',
      gaugeColor: sensorValueColor(
        (snap.lubeLastBearingPressure as number | undefined) ?? 0,
        AL.lubeLastBearingPressure.physMin, AL.lubeLastBearingPressure.physMax,
        AL.lubeLastBearingPressure, baseline.expectedLubeLastBearing, 0.5,
      ),
      alarmTicks: [
        { value: AL.lubeLastBearingPressure.preAlarmLow, color: L1, label: 'L1↓', inner: true },
        { value: AL.lubeLastBearingPressure.alarmLow,    color: L2, label: 'L2↓', inner: true },
        { value: AL.lubeLastBearingPressure.shutdownLow, color: L4, label: 'L4↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.FuelRailPressure',
      label: 'Fuel Rail Press',
      // NOT the "FO Pressure" gauge above — that is the ~8 bar supply. This is the ~1770 bar common
      // rail, whose collapse below 1200 bar is the SD → Emergency Operation trip.
      actual: (snap.fuelRailPressure as number | undefined) ?? 0,
      expected: baseline.expectedFuelRailPressure,
      unit: 'bar', risk: derivedRisk(Math.max(...decision.cylRisks), 0.5), decimals: 0,
      physMin: AL.fuelRailPressure.physMin, physMax: AL.fuelRailPressure.physMax,
      ribbonColor: 'var(--accent-blue)',
      gaugeColor: sensorValueColor(
        (snap.fuelRailPressure as number | undefined) ?? 0,
        AL.fuelRailPressure.physMin, AL.fuelRailPressure.physMax,
        AL.fuelRailPressure, baseline.expectedFuelRailPressure, 120,
      ),
      alarmTicks: [
        { value: AL.fuelRailPressure.preAlarmLow, color: L1, label: 'L1↓', inner: true },
        { value: AL.fuelRailPressure.alarmLow,    color: L2, label: 'L2↓', inner: true },
        { value: AL.fuelRailPressure.shutdownLow, color: L4, label: 'L4↓', inner: true },
      ],
    },
    {
      sensorId: 'ME.BearingTemp',
      label: 'Bearing Temp',
      // The HOTTEST of the 11 mains, not a mean: applyMTU8000SafetyOverride raises HI T-Bearing and
      // an SS Emergency Stop on ANY single bearing, so averaging would hide the single-bearing case
      // F04 produces — which is the whole reason the limit exists.
      actual: bearingTempMax(snap, baseline.expectedBearingTemp),
      expected: baseline.expectedBearingTemp,
      unit: '°C', risk: derivedRisk(decision.lubeRisk, 0.8), decimals: 1,
      physMin: AL.bearingTemp.physMin, physMax: AL.bearingTemp.physMax,
      ribbonColor: 'var(--risk-high)',
      gaugeColor: sensorValueColor(
        bearingTempMax(snap, baseline.expectedBearingTemp),
        AL.bearingTemp.physMin, AL.bearingTemp.physMax, AL.bearingTemp, baseline.expectedBearingTemp, 8,
      ),
      alarmTicks: [
        { value: AL.bearingTemp.preAlarmHigh, color: L1, label: 'L1' },
        { value: AL.bearingTemp.alarmHigh,    color: L2, label: 'L2' },
        { value: AL.bearingTemp.slowdownHigh, color: L3, label: 'L3' },
        { value: AL.bearingTemp.shutdownHigh, color: L4, label: 'L4' },
      ],
    },
    {
      sensorId: 'ME.CrankcasePressure',
      label: 'Crankcase Press',
      actual: (snap.crankcasePressure as number | undefined) ?? 0,
      expected: 0,
      unit: 'mbar', risk: derivedRisk(Math.max(...decision.cylRisks), 0.5),
      physMin: -2, physMax: 20,
      ribbonColor: 'var(--risk-normal)',
      gaugeColor: (() => {
        const v = (snap.crankcasePressure as number | undefined) ?? 0;
        if (v > 10) return 'var(--risk-critical)';
        if (v > 6)  return 'var(--risk-warning)';
        return 'var(--risk-normal)';
      })(),
      alarmTicks: [
        { value: 6,  color: L1, label: 'L1' },
        { value: 10, color: L2, label: 'L2' },
      ],
    },
    {
      sensorId: 'ME.SFOC',
      label: 'SFOC',
      actual: snap.sfoc, expected: baseline.expectedSfoc,
      unit: 'g/kWh', risk: derivedRisk(decision.coolingRisk, 0.6),
      physMin: AL.sfoc.physMin, physMax: AL.sfoc.physMax,
      ribbonColor: 'var(--accent-pink)',
      gaugeColor: sfocBaselineColor(snap.sfoc, baseline.expectedSfoc),
      alarmTicks: [
        { value: baseline.expectedSfoc * 1.05, color: 'var(--risk-high)',     label: '+5%' },
        { value: baseline.expectedSfoc * 1.10, color: 'var(--risk-critical)', label: '+10%' },
      ],
    },
  ];

  const renderSection = (title: string, gauges: (ArcGaugeProps & { sensorId: string })[]) => (
    <div>
      <div className="label-xs" style={{ marginBottom: 8, opacity: 0.7 }}>{title}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
        gap: 10,
      }}>
        {gauges.map(g => (
          <ArcGauge
            key={g.label}
            {...g}
            dimmed={dimmed}
            onClick={onGaugeClick ? () => onGaugeClick(g.sensorId) : undefined}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {renderSection('THERMODYNAMIC — EXHAUST / LO / CHARGE AIR / COOLING', coreGauges)}
      {renderSection('FUEL OIL / LO FILTER / PISTON COOLING / PERFORMANCE', systemGauges)}
    </div>
  );
}
