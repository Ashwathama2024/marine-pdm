import React from 'react';
import type { DecisionOutput } from '@marine-pdm/shared';
import { cylName, riskColor } from './cylinder-utils';
import { useSensorFocus, SENSOR_TO_SPARKLINE } from '../context/SensorFocusContext';

// ── State → border/glow for sparkline cards ───────────────────────────────────
function stateBorder(risk: number): { border: string; boxShadow: string } {
  if (risk >= 75) return {
    border: '1px solid rgba(239,68,68,0.50)',
    boxShadow: '0 0 14px rgba(239,68,68,0.20)',
  };
  if (risk >= 50) return {
    border: '1px solid rgba(249,115,22,0.45)',
    boxShadow: '0 0 14px rgba(249,115,22,0.18)',
  };
  if (risk >= 25) return {
    border: '1px solid rgba(245,158,11,0.40)',
    boxShadow: '0 0 12px rgba(245,158,11,0.15)',
  };
  return {
    border: '1px solid rgba(0,212,170,0.28)',
    boxShadow: '0 0 10px rgba(0,212,170,0.08)',
  };
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
interface SparklineProps {
  values: number[];
  label: string;
  unit: string;
  color?: string;
  height?: number;
  risk?: number;
  baselineValues?: number[];
  decimals?: number;
  dimmed?: boolean;
}

function Sparkline({
  values, label, unit,
  color = 'var(--risk-normal)', height = 50, risk = 0,
  baselineValues = [], decimals = 1, dimmed = false,
}: SparklineProps) {
  const last         = values[values.length - 1] ?? 0;
  const lastBaseline = baselineValues.length > 0 ? baselineValues[baselineValues.length - 1] : null;
  const { border, boxShadow } = stateBorder(risk);

  if (values.length < 2) {
    return (
      <div style={{
        flex: 1, minWidth: 110,
        background: 'var(--bg-inset)', borderRadius: 6,
        border, boxShadow, padding: '8px 10px',
        transition: 'border-color 0.5s, box-shadow 0.5s, opacity 0.3s',
        opacity: dimmed ? 0.32 : 1,
      }}>
        <div className="label-xs">{label}</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>collecting…</div>
      </div>
    );
  }

  // Include baseline in Y-scale so both traces fit within the chart
  const allVals = baselineValues.length > 0 ? [...values, ...baselineValues] : values;
  const min   = Math.min(...allVals);
  const max   = Math.max(...allVals);
  const range = max - min || 1;
  const W = 140, H = height;

  const toXY = (v: number, i: number, len: number): [number, number] => [
    (i / (len - 1)) * W,
    H - ((v - min) / range) * H * 0.86 - H * 0.07,
  ];

  const pts = values.map((v, i) => toXY(v, i, values.length));
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPath =
    `M${pts[0]![0]},${H} ` +
    pts.map(([x, y]) => `L${x},${y}`).join(' ') +
    ` L${pts[pts.length - 1]![0]},${H} Z`;
  const areaId = `area-${label.replace(/[\s/]/g, '')}`;
  const riskColor_ = riskColor(risk);

  // Baseline polyline — same x-domain as actual values
  const basePts = baselineValues.length >= 2
    ? baselineValues.map((v, i) => toXY(v, i, baselineValues.length))
    : [];
  const basePolyline = basePts.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <div style={{
      flex: 1, minWidth: 110,
      background: 'var(--bg-inset)', borderRadius: 6,
      border, boxShadow, padding: '8px 10px',
      transition: 'border-color 0.5s, box-shadow 0.5s, opacity 0.3s',
      opacity: dimmed ? 0.32 : 1,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* State ribbon */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: riskColor_, opacity: 0.7,
        transition: 'background 0.5s',
      }} />
      {/* Header: label + actual value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1, marginTop: 2 }}>
        <span className="label-xs">{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {last.toFixed(decimals)}{unit}
        </span>
      </div>
      {/* Baseline value row */}
      {lastBaseline !== null && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
          <span style={{
            fontSize: 8.5, fontVariantNumeric: 'tabular-nums',
            color: 'rgba(0,212,170,0.75)', letterSpacing: '0.03em',
          }}>
            B:{lastBaseline.toFixed(decimals)}{unit}
          </span>
        </div>
      )}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t} x1="0" y1={H * t} x2={W} y2={H * t}
            stroke="var(--border-dim)" strokeWidth="0.5" />
        ))}
        <path d={areaPath} fill={`url(#${areaId})`} />
        {/* Baseline — dashed teal line behind actual */}
        {basePts.length >= 2 && (
          <polyline points={basePolyline} fill="none"
            stroke="rgba(0,212,170,0.55)" strokeWidth="1.2"
            strokeDasharray="4 3" strokeLinecap="round" />
        )}
        <polyline points={polyline} fill="none" stroke={color}
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]}
          r="3" fill={color} />
      </svg>
    </div>
  );
}

// ── Cylinder stat placard helpers ─────────────────────────────────────────────
function devBorder(dev: number): string {
  if (dev > 20) return 'rgba(239,68,68,0.45)';
  if (dev > 12) return 'rgba(249,115,22,0.40)';
  if (dev > 6)  return 'rgba(245,158,11,0.35)';
  return 'rgba(0,212,170,0.22)';
}
function devColor(dev: number): string {
  if (dev > 20) return 'var(--risk-critical)';
  if (dev > 12) return 'var(--risk-high)';
  if (dev > 6)  return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}
function riskBorder(risk: number): string {
  if (risk >= 75) return 'rgba(239,68,68,0.45)';
  if (risk >= 50) return 'rgba(249,115,22,0.40)';
  if (risk >= 25) return 'rgba(245,158,11,0.35)';
  return 'rgba(0,212,170,0.22)';
}

interface CylStatProps {
  cylTemps: number[][];
  cylRisks: number[];
}

function CylinderStatPlacards({ cylTemps, cylRisks }: CylStatProps) {
  const bankA = Array.from({ length: 10 }, (_, i) =>
    cylTemps[i]?.[cylTemps[i]!.length - 1] ?? 0);
  const bankB = Array.from({ length: 10 }, (_, i) =>
    cylTemps[i + 10]?.[cylTemps[i + 10]!.length - 1] ?? 0);
  const all = [...bankA, ...bankB];

  const bankAMean   = bankA.reduce((a, b) => a + b, 0) / 10;
  const bankBMean   = bankB.reduce((a, b) => a + b, 0) / 10;
  const overallMean = all.reduce((a, b) => a + b, 0) / 20;

  const bankADev    = bankA.reduce((acc, t) => acc + Math.abs(t - bankAMean), 0) / 10;
  const bankBDev    = bankB.reduce((acc, t) => acc + Math.abs(t - bankBMean), 0) / 10;
  const combinedDev = all.reduce((acc, t) => acc + Math.abs(t - overallMean), 0) / 20;

  const maxTemp  = Math.max(...all);
  const maxIdx   = all.indexOf(maxTemp);
  const maxLabel = maxIdx < 10 ? `A${maxIdx + 1}` : `B${maxIdx - 9}`;
  const maxRisk  = cylRisks[maxIdx] ?? 0;

  const minTemp  = Math.min(...all);
  const minIdx   = all.indexOf(minTemp);
  const minLabel = minIdx < 10 ? `A${minIdx + 1}` : `B${minIdx - 9}`;

  const cards = [
    {
      label: 'BANK A  MEAN Δ',
      value: `±${bankADev.toFixed(1)}°C`,
      sub: `μ ${bankAMean.toFixed(1)}°C`,
      color: devColor(bankADev),
      border: devBorder(bankADev),
    },
    {
      label: 'BANK B  MEAN Δ',
      value: `±${bankBDev.toFixed(1)}°C`,
      sub: `μ ${bankBMean.toFixed(1)}°C`,
      color: devColor(bankBDev),
      border: devBorder(bankBDev),
    },
    {
      label: 'COMBINED  Δ',
      value: `±${combinedDev.toFixed(1)}°C`,
      sub: `μ ${overallMean.toFixed(1)}°C`,
      color: devColor(combinedDev),
      border: devBorder(combinedDev),
    },
    {
      label: 'MAX TEMP',
      value: `${maxTemp.toFixed(0)}°C`,
      sub: maxLabel,
      color: riskColor(maxRisk),
      border: riskBorder(maxRisk),
    },
    {
      label: 'MIN TEMP',
      value: `${minTemp.toFixed(0)}°C`,
      sub: minLabel,
      color: 'var(--text-primary)',
      border: 'rgba(0,212,170,0.18)',
    },
  ];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12,
    }}>
      {cards.map(({ label, value, sub, color, border }) => (
        <div key={label} style={{
          background: 'var(--bg-inset)',
          border: `1px solid ${border}`,
          borderRadius: 6, padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: 3,
          transition: 'border-color 0.4s',
        }}>
          <div className="label-xs" style={{ opacity: 0.65, letterSpacing: '0.1em' }}>{label}</div>
          <div style={{
            fontSize: 15, fontWeight: 700, color,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
          }}>{value}</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Cylinder placard (trend sparkline per cylinder) ───────────────────────────
interface MtuCylFaultEntry { intensity: number; faultType: string }

// Returns dot/border/glow based on fault intensity
function mtuFaultColors(intensity: number): { dot: string; border: string; glow: string } {
  if (intensity >= 70) return { dot: '#ef4444', border: 'rgba(239,68,68,0.65)', glow: '0 0 10px rgba(239,68,68,0.30)' };
  if (intensity >= 40) return { dot: '#f97316', border: 'rgba(249,115,22,0.60)', glow: '0 0 8px rgba(249,115,22,0.25)' };
  return                      { dot: '#f59e0b', border: 'rgba(245,158,11,0.55)', glow: '0 0 6px rgba(245,158,11,0.20)' };
}

interface PlacardProps {
  idx: number;
  history: number[];
  risk: number;
  hasFault?: boolean;
  mtuFault?: MtuCylFaultEntry;
  baselineHistory?: number[];
  onClick: () => void;
}

function CylinderPlacard({ idx, history, risk, hasFault, mtuFault, baselineHistory = [], onClick }: PlacardProps) {
  const name  = cylName(idx);
  const color = riskColor(risk);
  const last  = history[history.length - 1] ?? 0;
  const lastBase = baselineHistory.length > 0 ? baselineHistory[baselineHistory.length - 1] : null;

  const W = 100, H = 34;
  const allVals = baselineHistory.length > 0 ? [...history, ...baselineHistory] : history;
  const min   = allVals.length ? Math.min(...allVals) : 0;
  const max   = allVals.length ? Math.max(...allVals) : 0;
  const range = Math.max(max - min, 3);

  const toXY = (v: number, i: number, len: number) => {
    const x = (i / (len - 1)) * W;
    const y = H - ((v - min) / range) * H * 0.84 - H * 0.08;
    return `${x},${y}`;
  };

  const pts = history.length >= 2
    ? history.map((v, i) => toXY(v, i, history.length))
    : [];

  const basePts = baselineHistory.length >= 2
    ? baselineHistory.map((v, i) => toXY(v, i, baselineHistory.length))
    : [];

  const fc = mtuFault ? mtuFaultColors(mtuFault.intensity) : null;
  const borderStyle = fc
    ? fc.border
    : hasFault ? 'rgba(239,68,68,0.6)' : risk >= 25 ? color + '88' : 'var(--border-dim)';
  const glowStyle = fc
    ? fc.glow
    : hasFault ? '0 0 10px rgba(239,68,68,0.28)' : risk >= 50 ? `0 0 10px ${color}33` : 'none';
  const dotColor  = fc ? fc.dot : 'var(--risk-critical)';

  return (
    <div
      onClick={onClick}
      title={mtuFault
        ? `${name}: ${mtuFault.faultType} ${mtuFault.intensity}% active — ${last.toFixed(1)}°C`
        : `${name}: ${last.toFixed(1)}°C — click for trend`}
      style={{
        flex: '1 0 0', minWidth: 64,
        background: 'var(--bg-inset)',
        border: `1px solid ${borderStyle}`,
        borderRadius: 6, padding: '5px 7px 4px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.25s, box-shadow 0.25s',
        boxShadow: glowStyle,
      }}
    >
      {(hasFault || mtuFault) && (
        <div style={{
          position: 'absolute', top: 3, right: 3,
          width: 5, height: 5, borderRadius: '50%',
          background: dotColor,
          boxShadow: `0 0 5px ${dotColor}CC`,
          animation: 'pulse-dot 1.5s ease-in-out infinite',
        }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: mtuFault ? dotColor : color, letterSpacing: '0.06em' }}>{name}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: mtuFault ? dotColor : color, fontVariantNumeric: 'tabular-nums' }}>
          {last.toFixed(0)}°
        </span>
      </div>
      {mtuFault && (
        <div style={{ fontSize: 9, fontWeight: 700, color: dotColor, letterSpacing: '0.04em', marginBottom: 1 }}>
          {mtuFault.faultType} {mtuFault.intensity}%
        </div>
      )}
      {lastBase !== null && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
          <span style={{ fontSize: 9, color: 'rgba(0,212,170,0.75)', fontVariantNumeric: 'tabular-nums' }}>
            B:{lastBase.toFixed(0)}°
          </span>
        </div>
      )}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none" style={{ display: 'block' }}>
        {basePts.length >= 2 && (
          <polyline points={basePts.join(' ')} fill="none"
            stroke="rgba(255,255,255,0.65)" strokeWidth="1.2"
            strokeDasharray="3 2.5" strokeLinecap="round" />
        )}
        {pts.length >= 2 && (
          <polyline points={pts.join(' ')} fill="none"
            stroke={color} strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        )}
        {pts.length > 0 && (
          <circle
            cx={pts[pts.length - 1]!.split(',')[0]}
            cy={pts[pts.length - 1]!.split(',')[1]}
            r="2.5" fill={color}
          />
        )}
        {pts.length < 2 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="middle"
            fill="var(--text-dim)" fontSize="7">…</text>
        )}
      </svg>
    </div>
  );
}

// ── TrendChart ────────────────────────────────────────────────────────────────
interface Props {
  snapHistory: {
    exhaustTemp:     number[];
    lubeOilPressure: number[];
    jacketOutlet:    number[];
    tcRPM:           number[];
    sfoc:            number[];
    cylTemps:        number[][];
    systemRisk:      number[];
    // Lagged baseline traces
    baseExhaust:     number[];
    baseLube:        number[];
    baseJacket:      number[];
    baseTcRPM:       number[];
    baseSfoc:        number[];
    baseCylTemps:    number[][];
  };
  cylRisks?: number[];
  decision?: DecisionOutput;
  activeFaults?: Record<number, number>;
  mtuCylFaults?: Record<number, MtuCylFaultEntry>;
  onCylinderClick?: (cylIndex: number) => void;
}

export function TrendChart({
  snapHistory, cylRisks = [], decision, activeFaults = {}, mtuCylFaults = {}, onCylinderClick,
}: Props) {
  const cylTemps = snapHistory.cylTemps;

  // Risk levels for each sparkline sensor
  const exhaustRisk  = decision?.exhaustRisk  ?? 0;
  const lubeRisk     = decision?.lubeRisk     ?? 0;
  const coolingRisk  = decision?.coolingRisk  ?? 0;
  const systemRisk_  = decision?.systemRisk   ?? 0;
  const tcRisk       = Math.min(100, (exhaustRisk + coolingRisk) * 0.28);
  const sfocRisk     = Math.min(100, systemRisk_ * 0.38);

  // Focus rail (workspace) → dim non-focused sparklines. Off the workspace there's no
  // provider, so focus is null and nothing dims.
  const { focus } = useSensorFocus();
  const focusLabel = focus ? SENSOR_TO_SPARKLINE[focus] ?? null : null;
  const dim = (lbl: string) => focusLabel !== null && focusLabel !== lbl;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-dim)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div className="label-sm">Trend Analysis</div>
        <div className="label-xs">last {snapHistory.exhaustTemp.length} ticks</div>
      </div>

      <div style={{ padding: 14 }}>

        {/* ── Sensor sparklines with state-coloured borders ── */}
        <div style={{ marginBottom: 20 }}>
          <div className="label-xs" style={{ opacity: 0.7, marginBottom: 8 }}>SENSOR TRENDS</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Sparkline
              values={snapHistory.exhaustTemp}
              baselineValues={snapHistory.baseExhaust}
              label="Exhaust" unit="°C" decimals={1}
              color="var(--risk-high)" risk={exhaustRisk} dimmed={dim('Exhaust')}
            />
            <Sparkline
              values={snapHistory.lubeOilPressure}
              baselineValues={snapHistory.baseLube}
              label="LO Pressure" unit="bar" decimals={2}
              color="var(--accent-blue)" risk={lubeRisk} dimmed={dim('LO Pressure')}
            />
            <Sparkline
              values={snapHistory.jacketOutlet}
              baselineValues={snapHistory.baseJacket}
              label="Jacket Outlet" unit="°C" decimals={1}
              color="var(--accent-purple)" risk={coolingRisk} dimmed={dim('Jacket Outlet')}
            />
            <Sparkline
              values={snapHistory.tcRPM.map(v => v / 1000)}
              baselineValues={snapHistory.baseTcRPM.map(v => v / 1000)}
              label="TC Speed" unit="kRPM" decimals={1}
              color="var(--risk-warning)" risk={tcRisk} dimmed={dim('TC Speed')}
            />
            <Sparkline
              values={snapHistory.sfoc}
              baselineValues={snapHistory.baseSfoc}
              label="SFOC" unit="g/kWh" decimals={1}
              color="var(--accent-steel)" risk={sfocRisk} dimmed={dim('SFOC')}
            />
            <Sparkline
              values={snapHistory.systemRisk}
              label="Sys Risk" unit="%" decimals={1}
              color="var(--risk-critical)" risk={systemRisk_}
            />
          </div>
        </div>

        {/* ── Cylinder exhaust temperature section ── */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <div className="label-xs">Cylinder Exhaust Temperature</div>
            <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              click any placard for trend detail
            </div>
          </div>

          {/* Stat placards */}
          <CylinderStatPlacards cylTemps={cylTemps} cylRisks={cylRisks} />

          {/* Bank A */}
          <div style={{ marginBottom: 8 }}>
            <div style={{
              fontSize: 8, fontWeight: 700, color: 'var(--text-dim)',
              letterSpacing: '0.12em', marginBottom: 5,
            }}>
              BANK A — A1 › A10
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: 10 }, (_, i) => (
                <CylinderPlacard
                  key={i} idx={i}
                  history={cylTemps[i] ?? []}
                  baselineHistory={snapHistory.baseCylTemps[i] ?? []}
                  risk={cylRisks[i] ?? 0}
                  hasFault={activeFaults[i] !== undefined}
                  mtuFault={mtuCylFaults[i]}
                  onClick={() => onCylinderClick?.(i)}
                />
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border-dim)', marginBottom: 8 }} />

          {/* Bank B */}
          <div>
            <div style={{
              fontSize: 8, fontWeight: 700, color: 'var(--text-dim)',
              letterSpacing: '0.12em', marginBottom: 5,
            }}>
              BANK B — B1 › B10
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: 10 }, (_, i) => (
                <CylinderPlacard
                  key={i + 10} idx={i + 10}
                  history={cylTemps[i + 10] ?? []}
                  baselineHistory={snapHistory.baseCylTemps[i + 10] ?? []}
                  risk={cylRisks[i + 10] ?? 0}
                  hasFault={activeFaults[i + 10] !== undefined}
                  mtuFault={mtuCylFaults[i + 10]}
                  onClick={() => onCylinderClick?.(i + 10)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
