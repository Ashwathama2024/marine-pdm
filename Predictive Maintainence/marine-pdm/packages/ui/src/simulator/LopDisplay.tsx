import React from 'react';
import type { EngineSnapshot } from '@marine-pdm/shared';
import { useEngine } from '../context/EngineContext';

// ── LOP 8 measured-value display ──────────────────────────────────────────────
// Mirrors the MTU ECS 8000 Local Operating Panel: digital readouts + vertical bar
// graphs with yellow (alarm) and red (shutdown) limit indications. Lets the operator
// watch the live start parameters on the Simulator page without opening the dashboard.

type Status = 'green' | 'yellow' | 'red';

interface BarCfg {
  key:    string;
  label:  string;
  unit:   string;
  min:    number;
  max:    number;
  warn:   number;            // yellow (alarm) threshold
  crit:   number;            // red (shutdown) threshold
  invert?: boolean;          // true → LOW values are bad (e.g. lube pressure)
  value:  (s: EngineSnapshot) => number;
  fmt:    (v: number) => string;
}

const fmtInt = (v: number) => Math.round(v).toString();
const fmt1   = (v: number) => v.toFixed(1);
const fmtK   = (v: number) => (v / 1000).toFixed(1) + 'k';

// Limits sourced from the MTU 8000 alarm bands / hard limits used elsewhere in the model.
const BARS: BarCfg[] = [
  { key: 'rpm',  label: 'SPEED',   unit: 'rpm', min: 0,  max: 1250,  warn: 1150,  crit: 1200,  value: s => s.rpm,                                fmt: fmtInt },
  { key: 'inj',  label: 'INJ',     unit: '%',   min: 0,  max: 110,   warn: 85,    crit: 100,   value: s => s.load,                               fmt: fmtInt },
  { key: 'lo',   label: 'LO BRG',  unit: 'bar', min: 0,  max: 5,     warn: 3.0,   crit: 2.0,   invert: true, value: s => (s.lubeLastBearingPressure as number) ?? 0, fmt: fmt1 },
  { key: 'cool', label: 'COOLANT', unit: '°C',  min: 20, max: 110,   warn: 90,    crit: 100,   value: s => (s.coolantTempAfterEngine as number) ?? (s.jacketOutlet as number) ?? 0, fmt: fmtInt },
  { key: 'air',  label: 'CH.AIR',  unit: 'bar', min: 0,  max: 4,     warn: 3.6,   crit: 3.9,   value: s => (s.chargeAirPressure as number) ?? (s.scavengeAir as number) ?? 0, fmt: fmt1 },
  { key: 'exh',  label: 'EXH',     unit: '°C',  min: 0,  max: 600,   warn: 460,   crit: 560,   value: s => (s.exhaustMeanTemp as number) ?? (s.exhaustTemp as number) ?? 0, fmt: fmtInt },
  { key: 'tc',   label: 'ETC',     unit: 'rpm', min: 0,  max: 42000, warn: 40500, crit: 41000, value: s => (s.tcSpeeds as number[] | undefined)?.[0] ?? (s.tcRPM as number) ?? 0, fmt: fmtK },
];

function statusOf(v: number, c: BarCfg): Status {
  if (c.invert) return v <= c.crit ? 'red' : v <= c.warn ? 'yellow' : 'green';
  return v >= c.crit ? 'red' : v >= c.warn ? 'yellow' : 'green';
}

const STATUS_COLOR: Record<Status, string> = {
  green:  '#00C878',
  yellow: '#F59E0B',
  red:    '#EF4444',
};

const BAR_H = 104;

function VBar({ cfg, snap }: { cfg: BarCfg; snap: EngineSnapshot }) {
  const v       = cfg.value(snap);
  const pct     = Math.max(0, Math.min(1, (v - cfg.min) / (cfg.max - cfg.min)));
  const color   = STATUS_COLOR[statusOf(v, cfg)];
  const warnPos = Math.max(0, Math.min(1, (cfg.warn - cfg.min) / (cfg.max - cfg.min)));
  const critPos = Math.max(0, Math.min(1, (cfg.crit - cfg.min) / (cfg.max - cfg.min)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {cfg.fmt(v)}
      </span>
      <div style={{
        position: 'relative', width: 16, height: BAR_H,
        background: 'rgba(255,255,255,0.05)', borderRadius: 3,
        border: '1px solid var(--border-dim)', overflow: 'hidden',
      }}>
        {/* live fill from bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct * 100}%`,
          background: color, boxShadow: `0 0 6px ${color}90`,
          transition: 'height 0.5s ease, background 0.3s', borderRadius: 2,
        }} />
        {/* yellow alarm limit */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${warnPos * 100}%`, height: 1, background: '#F59E0B', opacity: 0.85 }} />
        {/* red shutdown limit */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${critPos * 100}%`, height: 1, background: '#EF4444', opacity: 0.9 }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>{cfg.label}</span>
      <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{cfg.unit}</span>
    </div>
  );
}

function StatusChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', fontSize: 9, letterSpacing: '0.04em' }}>
      <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: color ?? 'var(--text-secondary)', fontWeight: 700 }}>{value}</span>
    </span>
  );
}

export function LopDisplay() {
  const { snapshot, engineState, decision } = useEngine();

  const clutch =
    engineState === 'CLUTCHED' || engineState === 'LOADED' ? 'AHEAD' :
    engineState === 'CLUTCHING' ? 'ENGAGING' : 'NEUTRAL';
  const alarms      = decision?.alerts?.length ?? 0;
  const ssOverride  = decision?.status === 'CRITICAL';
  const readiness   = engineState.replace(/_/g, ' ');

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(4,12,10,0.9), rgba(6,16,14,0.7))',
      border: '1px solid var(--border-dim)', borderRadius: 8,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%',
    }}>
      {/* LCD title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--accent-blue)' }}>
          MEASURED VALUES · ECS 8000
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>LOCAL</span>
      </div>

      {/* status strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'center' }}>
        <StatusChip label="STATE" value={readiness} color="var(--accent-blue)" />
        <StatusChip label="CLUTCH" value={clutch} color={clutch === 'AHEAD' ? '#00C878' : 'var(--text-secondary)'} />
        <StatusChip label="ALARMS" value={String(alarms)} color={alarms > 0 ? '#EF4444' : '#00C878'} />
        <StatusChip label="SS OVRD" value={ssOverride ? 'ACTIVE' : 'OFF'} color={ssOverride ? '#EF4444' : 'var(--text-secondary)'} />
      </div>

      {/* vertical bar graphs */}
      {snapshot ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', justifyContent: 'space-between', flex: 1 }}>
          {BARS.map(cfg => <VBar key={cfg.key} cfg={cfg} snap={snapshot} />)}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
          NO SIGNAL
        </div>
      )}

      {/* legend */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 8, color: 'var(--text-muted)' }}>
        <span style={{ color: '#00C878' }}>● NORMAL</span>
        <span style={{ color: '#F59E0B' }}>▬ ALARM</span>
        <span style={{ color: '#EF4444' }}>▬ SHUTDOWN</span>
      </div>
    </div>
  );
}
