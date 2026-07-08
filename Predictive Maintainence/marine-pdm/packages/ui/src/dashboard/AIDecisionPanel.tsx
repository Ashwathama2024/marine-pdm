import React from 'react';
import type { DecisionOutput } from '@marine-pdm/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────
function riskColor(risk: number): string {
  if (risk >= 75) return 'var(--risk-critical)';
  if (risk >= 50) return 'var(--risk-high)';
  if (risk >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}
function riskGlow(risk: number): string {
  if (risk >= 75) return '239,68,68';
  if (risk >= 50) return '249,115,22';
  if (risk >= 25) return '245,158,11';
  return '0,212,170';
}
function riskHex(risk: number): string {
  if (risk >= 75) return '#EF4444';
  if (risk >= 50) return '#F97316';
  if (risk >= 25) return '#F59E0B';
  return '#00D4AA';
}

// ── Inject CSS keyframes once (client-side only) ──────────────────────────────
let _neuralCssInjected = false;
function ensureNeuralCSS() {
  if (_neuralCssInjected || typeof document === 'undefined') return;
  _neuralCssInjected = true;
  const el = document.createElement('style');
  el.id = 'neural-orb-keyframes';
  el.textContent = `
    @keyframes norb-pulse {
      0%,100% { opacity:.55; transform:scale(.94); }
      50%      { opacity:1;   transform:scale(1.07); }
    }
    @keyframes norb-glow {
      0%,100% { opacity:.12; }
      50%      { opacity:.42; }
    }
    @keyframes norb-cw  { from{transform:rotate(0deg)}   to{transform:rotate(360deg)} }
    @keyframes norb-ccw { from{transform:rotate(0deg)}   to{transform:rotate(-360deg)} }
    @keyframes norb-scan{ from{transform:rotate(-90deg)} to{transform:rotate(270deg)} }
    @keyframes norb-spike {
      0%,100% { opacity:.08; }
      50%      { opacity:1;  }
    }
    @keyframes norb-dot {
      0%,100% { opacity:.22; transform:scale(.65); }
      50%      { opacity:1;  transform:scale(1.35); }
    }
    @keyframes norb-flicker {
      0%,88%,100% { opacity:1;   }
      90%          { opacity:.35; }
      93%          { opacity:1;   }
      96%          { opacity:.55; }
    }
    @keyframes norb-ring-slow {
      0%,100%{ stroke-dashoffset:0; }
    }
    @media (prefers-reduced-motion:reduce){
      [data-norb] * { animation:none !important; transition:none !important; }
    }
  `;
  document.head.appendChild(el);
}

// ── JarvisOrb ─────────────────────────────────────────────────────────────────
interface OrbProps {
  risk:       number;
  status:     string;
  alertCount: number;
  size?:      number;
}

function JarvisOrb({ risk, status, alertCount, size = 184 }: OrbProps) {
  ensureNeuralCSS();

  const cx  = size / 2;
  const cy  = size / 2;
  const sc  = size / 184;          // scale factor from 184-base
  const hex = riskHex(risk);
  const glow = riskGlow(risk);

  // Animation durations — all speed up with risk
  const PULSE_S  = risk >= 75 ? 0.65 : risk >= 50 ? 1.0  : risk >= 25 ? 1.6  : 2.4;
  const ORBIT1_S = risk >= 75 ? 3.5  : risk >= 50 ? 5.5  : risk >= 25 ? 8.0  : 13.0;
  const ORBIT2_S = risk >= 75 ? 5.0  : risk >= 50 ? 7.5  : risk >= 25 ? 11.0 : 18.0;
  const SCAN_S   = risk >= 75 ? 1.4  : risk >= 50 ? 2.0  : risk >= 25 ? 3.2  : 5.0;
  const OUTER_S  = risk >= 75 ? 7    : risk >= 50 ? 12   : risk >= 25 ? 20   : 38;

  // Radii
  const R_OUT   = 80  * sc;
  const R_SPK   = 59  * sc;   // spike base
  const R_ORB1  = 52  * sc;
  const R_ORB2  = 40  * sc;
  const R_SEG   = 36  * sc;   // inner segmented ring
  const R_NODE  = 43  * sc;   // neural node ring
  const R_GLOW  = 30  * sc;
  const R_CORE  = 20  * sc;

  // Spikes
  const SPIKE_N  = 24;
  const spikeLen = (5 + (risk / 100) * 24) * sc;
  const activeN  = Math.max(5, Math.round(SPIKE_N * (0.22 + (risk / 100) * 0.78)));
  const WAVE_S   = risk >= 75 ? 0.7 : risk >= 50 ? 1.1 : risk >= 25 ? 1.7 : 2.8;

  const uid = `norb-${size}`;

  return (
    <div data-norb style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <defs>
          {/* Ambient bg gradient */}
          <radialGradient id={`${uid}-bg`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={hex} stopOpacity="0.20" />
            <stop offset="55%"  stopColor={hex} stopOpacity="0.05" />
            <stop offset="100%" stopColor={hex} stopOpacity="0"    />
          </radialGradient>
          {/* Core sphere gradient */}
          <radialGradient id={`${uid}-core`} cx="38%" cy="32%" r="62%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="38%"  stopColor={hex}     stopOpacity="0.85" />
            <stop offset="100%" stopColor={hex}     stopOpacity="0.08" />
          </radialGradient>
          {/* Scan sweep gradient */}
          <radialGradient id={`${uid}-sweep`} cx="0%" cy="100%" r="100%">
            <stop offset="0%"   stopColor={hex} stopOpacity="0.18" />
            <stop offset="100%" stopColor={hex} stopOpacity="0"    />
          </radialGradient>
          {/* Blur filters */}
          <filter id={`${uid}-blur-sm`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation={1.8 * sc} />
          </filter>
          <filter id={`${uid}-blur-lg`} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation={8 * sc} />
          </filter>
          <filter id={`${uid}-dot-glow`} x="-250%" y="-250%" width="600%" height="600%">
            <feGaussianBlur stdDeviation={2.5 * sc} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Layer 1: Ambient field ── */}
        <circle cx={cx} cy={cy} r={R_OUT}
          fill={`url(#${uid}-bg)`}
          style={{ animation: `norb-glow ${PULSE_S * 1.5}s ease-in-out infinite` }}
        />

        {/* ── Layer 2: Dark glass disc ── */}
        <circle cx={cx} cy={cy} r={R_OUT}
          fill="rgba(0,6,16,0.68)"
          stroke={hex} strokeWidth={0.5 * sc} strokeOpacity="0.28"
        />

        {/* ── Layer 3: Outer HUD ring + tick marks (CW slow) ── */}
        <g style={{
          transformBox: 'fill-box', transformOrigin: 'center',
          animation: `norb-cw ${OUTER_S}s linear infinite`,
        }}>
          {/* Fine tick ring */}
          <circle cx={cx} cy={cy} r={R_OUT}
            fill="none" stroke={hex} strokeWidth={0.4 * sc} strokeOpacity="0.22" />

          {/* Ticks */}
          {Array.from({ length: 48 }, (_, i) => {
            const angle = (i / 48) * Math.PI * 2;
            const major = i % 4 === 0;
            const armLen = (major ? 7 : 3.5) * sc;
            const r1 = R_OUT - armLen, r2 = R_OUT;
            return (
              <line key={i}
                x1={cx + r1 * Math.cos(angle)} y1={cy + r1 * Math.sin(angle)}
                x2={cx + r2 * Math.cos(angle)} y2={cy + r2 * Math.sin(angle)}
                stroke={hex}
                strokeWidth={(major ? 1.2 : 0.5) * sc}
                strokeOpacity={major ? 0.85 : 0.28}
              />
            );
          })}

          {/* 4 quadrant bracket arcs */}
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((base, i) => {
            const span = 0.28;
            const x0 = cx + R_OUT * Math.cos(base - span);
            const y0 = cy + R_OUT * Math.sin(base - span);
            const x1 = cx + R_OUT * Math.cos(base + span);
            const y1 = cy + R_OUT * Math.sin(base + span);
            return (
              <path key={i}
                d={`M ${x0} ${y0} A ${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1}`}
                fill="none" stroke={hex} strokeWidth={2.8 * sc} strokeOpacity="0.9"
              />
            );
          })}
        </g>

        {/* ── Layer 4: EKG spike field ── */}
        {Array.from({ length: SPIKE_N }, (_, i) => {
          if (i >= activeN) return null;
          const angle = (i / SPIKE_N) * Math.PI * 2;
          const delay = -((i / SPIKE_N) * WAVE_S).toFixed(3);
          const x1 = cx + R_SPK * Math.cos(angle);
          const y1 = cy + R_SPK * Math.sin(angle);
          const x2 = cx + (R_SPK + spikeLen) * Math.cos(angle);
          const y2 = cy + (R_SPK + spikeLen) * Math.sin(angle);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={hex}
              strokeWidth={(0.9 + (risk / 100) * 0.8) * sc}
              strokeLinecap="round"
              style={{
                animation: `norb-spike ${WAVE_S}s ease-in-out infinite`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}

        {/* ── Layer 5: Orbit A — tilted ellipse CW ── */}
        <g style={{
          transformBox: 'fill-box', transformOrigin: 'center',
          animation: `norb-cw ${ORBIT1_S}s linear infinite`,
        }}>
          <ellipse cx={cx} cy={cy}
            rx={R_ORB1} ry={R_ORB1 * 0.28}
            fill="none" stroke={hex}
            strokeWidth={0.85 * sc} strokeOpacity="0.55"
            strokeDasharray={`${4 * sc} ${3.5 * sc}`}
          />
          {/* Orbital node */}
          <circle cx={cx + R_ORB1} cy={cy}
            r={3.8 * sc} fill={hex}
            filter={`url(#${uid}-dot-glow)`} opacity="0.95"
          />
          <circle cx={cx - R_ORB1} cy={cy}
            r={2 * sc} fill={hex} opacity="0.45"
          />
        </g>

        {/* ── Layer 6: Orbit B — angled ellipse CCW (nested tilt) ── */}
        <g transform={`rotate(58, ${cx}, ${cy})`}>
          <g style={{
            transformBox: 'fill-box', transformOrigin: 'center',
            animation: `norb-ccw ${ORBIT2_S}s linear infinite`,
          }}>
            <ellipse cx={cx} cy={cy}
              rx={R_ORB2} ry={R_ORB2 * 0.26}
              fill="none" stroke={hex}
              strokeWidth={0.65 * sc} strokeOpacity="0.38"
              strokeDasharray={`${3 * sc} ${5 * sc}`}
            />
            <circle cx={cx + R_ORB2} cy={cy}
              r={2.6 * sc} fill={hex} opacity="0.80"
              filter={`url(#${uid}-dot-glow)`}
            />
          </g>
        </g>

        {/* ── Layer 7: Inner segmented ring CCW ── */}
        <g style={{
          transformBox: 'fill-box', transformOrigin: 'center',
          animation: `norb-ccw ${ORBIT1_S * 0.8}s linear infinite`,
        }}>
          <circle cx={cx} cy={cy} r={R_SEG}
            fill="none" stroke={hex}
            strokeWidth={0.9 * sc} strokeOpacity="0.32"
            strokeDasharray={`${7 * sc} ${4 * sc}`}
          />
        </g>

        {/* ── Layer 8: Radar sweep ── */}
        <g style={{
          transformBox: 'fill-box', transformOrigin: 'center',
          animation: `norb-scan ${SCAN_S}s linear infinite`,
        }}>
          {/* Sweep line */}
          <line x1={cx} y1={cy} x2={cx} y2={cy - R_SPK - spikeLen * 0.55}
            stroke={hex} strokeWidth={0.9 * sc} strokeOpacity="0.75"
            strokeLinecap="round"
          />
          {/* Sweep cone */}
          <path
            d={`M ${cx} ${cy}
                L ${cx + (R_SPK + spikeLen * 0.4) * Math.cos(-Math.PI / 2 - 0.14)} ${cy + (R_SPK + spikeLen * 0.4) * Math.sin(-Math.PI / 2 - 0.14)}
                A ${R_SPK} ${R_SPK} 0 0 1
                ${cx + (R_SPK + spikeLen * 0.4) * Math.cos(-Math.PI / 2 + 0.01)} ${cy + (R_SPK + spikeLen * 0.4) * Math.sin(-Math.PI / 2 + 0.01)}
                Z`}
            fill={hex} fillOpacity="0.08"
          />
        </g>

        {/* ── Layer 9: Neural node ring ── */}
        {Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const nx = cx + R_NODE * Math.cos(angle);
          const ny = cy + R_NODE * Math.sin(angle);
          const delay = -((i / 6) * PULSE_S).toFixed(2);
          return (
            <g key={i}>
              {/* Axon line to center */}
              <line x1={cx} y1={cy} x2={nx} y2={ny}
                stroke={hex} strokeWidth={0.35 * sc} strokeOpacity="0.20"
              />
              {/* Neuron */}
              <circle cx={nx} cy={ny} r={2.8 * sc} fill={hex}
                filter={`url(#${uid}-dot-glow)`}
                style={{
                  animation: `norb-dot ${PULSE_S * 0.85}s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                  transformBox: 'fill-box', transformOrigin: 'center',
                }}
              />
            </g>
          );
        })}

        {/* ── Layer 10: Core outer glow (blurred) ── */}
        <circle cx={cx} cy={cy} r={R_GLOW}
          fill={hex} opacity="0.14"
          filter={`url(#${uid}-blur-lg)`}
          style={{ animation: `norb-glow ${PULSE_S}s ease-in-out infinite` }}
        />

        {/* ── Layer 11: Core sphere ── */}
        <circle cx={cx} cy={cy} r={R_CORE}
          fill={`url(#${uid}-core)`}
          style={{
            animation: `norb-pulse ${PULSE_S}s ease-in-out infinite`,
            transformBox: 'fill-box', transformOrigin: 'center',
          }}
        />

        {/* ── Layer 12: Risk number + label ── */}
        <text
          x={cx} y={cy - 3 * sc}
          textAnchor="middle" dominantBaseline="middle"
          fill="#ffffff" fontSize={21 * sc} fontWeight="800"
          fontFamily="'JetBrains Mono', monospace"
          style={{ filter: `drop-shadow(0 0 ${7 * sc}px rgba(${glow},1))` }}
        >
          {Math.round(risk)}
        </text>
        <text
          x={cx} y={cy + 13 * sc}
          textAnchor="middle"
          fill={hex} fontSize={6 * sc} fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="0.18em"
        >
          RISK
        </text>

        {/* ── Layer 13: Status label below ring ── */}
        <text
          x={cx} y={cy + R_OUT + 16 * sc}
          textAnchor="middle"
          fill={hex} fontSize={9 * sc} fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="0.16em"
          style={{
            animation: risk >= 75
              ? `norb-flicker ${3.5 + Math.random() * 1.5}s ease-in-out infinite`
              : undefined,
            filter: `drop-shadow(0 0 ${4 * sc}px rgba(${glow},0.7))`,
          }}
        >
          {status}
        </text>

        {/* Alert count line */}
        {alertCount > 0 ? (
          <text
            x={cx} y={cy + R_OUT + 29 * sc}
            textAnchor="middle"
            fill={hex} fontSize={7.5 * sc} fontWeight="600"
            fontFamily="'JetBrains Mono', monospace"
            opacity="0.85"
          >
            {alertCount} ACTIVE ALERT{alertCount !== 1 ? 'S' : ''}
          </text>
        ) : (
          <text
            x={cx} y={cy + R_OUT + 29 * sc}
            textAnchor="middle"
            fill="rgba(0,212,170,0.55)" fontSize={7 * sc}
            fontFamily="'JetBrains Mono', monospace"
            letterSpacing="0.10em"
          >
            ALL NOMINAL
          </text>
        )}

        {/* ── Layer 14: HUD corner brackets ── */}
        {(() => {
          const m = 5 * sc;    // margin from edge
          const l = 13 * sc;   // arm length
          const sw = 1.4 * sc; // stroke width
          const s = size;
          const paths = [
            `M ${m + l},${m} L ${m},${m} L ${m},${m + l}`,
            `M ${s - m - l},${m} L ${s - m},${m} L ${s - m},${m + l}`,
            `M ${m},${s - m - l} L ${m},${s - m} L ${m + l},${s - m}`,
            `M ${s - m - l},${s - m} L ${s - m},${s - m} L ${s - m},${s - m - l}`,
          ];
          return paths.map((d, i) => (
            <path key={i} d={d} fill="none"
              stroke={hex} strokeWidth={sw} strokeOpacity="0.65"
              strokeLinecap="square"
            />
          ));
        })()}

        {/* ── Layer 15: HUD side data chips ── */}
        {/* Left side */}
        <text x={cx - R_OUT - 4 * sc} y={cy - 5 * sc}
          textAnchor="end"
          fill="rgba(255,255,255,0.3)" fontSize={6 * sc}
          fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em"
        >SYS</text>
        <text x={cx - R_OUT - 4 * sc} y={cy + 6 * sc}
          textAnchor="end"
          fill={hex} fontSize={9 * sc} fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
        >{Math.round(risk)}%</text>

        {/* Right side */}
        <text x={cx + R_OUT + 4 * sc} y={cy - 5 * sc}
          textAnchor="start"
          fill="rgba(255,255,255,0.3)" fontSize={6 * sc}
          fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em"
        >ALT</text>
        <text x={cx + R_OUT + 4 * sc} y={cy + 6 * sc}
          textAnchor="start"
          fill={alertCount > 0 ? hex : 'rgba(255,255,255,0.25)'} fontSize={9 * sc} fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
        >{alertCount}</text>
      </svg>
    </div>
  );
}

// ── Sub-risk row ──────────────────────────────────────────────────────────────
function SubRisk({ label, value }: { label: string; value: number }) {
  const color = riskColor(value);
  const glow  = riskGlow(value);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(value)}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--border-dim)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(100, value)}%`,
          background: color, borderRadius: 3,
          transition: 'width 0.5s ease, background 0.5s ease',
          boxShadow: value > 25 ? `0 0 8px rgba(${glow},0.5)` : 'none',
        }} />
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface Props {
  decision:        DecisionOutput;
  engineName?:     string;
  hero?:           boolean;
  onConfirm:       (patternId: string) => void;
  onFalsePositive: (patternId: string) => void;
}

export function AIDecisionPanel({
  decision, engineName = 'Main Engine', hero, onConfirm, onFalsePositive,
}: Props) {
  const risk  = decision.systemRisk;
  const color = riskColor(risk);
  const glow  = riskGlow(risk);

  if (hero) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${risk > 25 ? `rgba(${glow},0.35)` : 'var(--border-dim)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: risk > 25
          ? `0 0 32px rgba(${glow},0.10), inset 0 0 60px rgba(${glow},0.03)`
          : 'none',
        transition: 'border-color 0.5s, box-shadow 0.5s',
      }}>

        {/* Status ribbon */}
        <div style={{ height: 3, background: color, transition: 'background 0.5s' }} />

        {/* Header */}
        <div style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-dim)',
          padding: '11px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
              AI DECISION ENGINE
            </span>
            <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{engineName}</span>
          </div>
          <div style={{
            fontSize: 12, fontWeight: 700, color,
            padding: '4px 14px',
            border: `1px solid rgba(${glow},0.4)`,
            borderRadius: 5,
            background: `rgba(${glow},0.08)`,
            letterSpacing: '0.08em',
            boxShadow: risk > 25 ? `0 0 14px rgba(${glow},0.25)` : 'none',
            transition: 'all 0.5s',
          }}>
            {decision.status} · {Math.round(risk)}
          </div>
        </div>

        {/* 3-column body */}
        <div style={{
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: '220px 1fr 1fr',
          gap: 24,
          alignItems: 'start',
        }}>

          {/* Col 1: Jarvis Neural Orb */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <JarvisOrb
              risk={risk}
              status={decision.status}
              alertCount={decision.alerts.length}
              size={184}
            />
          </div>

          {/* Col 2: Sub-risk breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 4 }}>
              SUBSYSTEM RISKS
            </div>
            <SubRisk label="Exhaust / Combustion"  value={decision.exhaustRisk} />
            <SubRisk label="Lube Oil System"        value={decision.lubeRisk} />
            <SubRisk label="Cooling System"         value={decision.coolingRisk} />
            <SubRisk label="Cylinder Degradation"   value={Math.max(...decision.cylRisks)} />

            {/* Active alerts */}
            {decision.alerts.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 6 }}>
                  ACTIVE ALERTS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {decision.alerts.map((alert, i) => {
                    const ac = riskColor(alert.riskScore);
                    const ag = riskGlow(alert.riskScore);
                    return (
                      <div key={i} style={{
                        background: 'var(--bg-inset)',
                        border: `1px solid ${ac}`,
                        borderRadius: 5, padding: '7px 10px',
                        boxShadow: `0 0 10px rgba(${ag},0.12)`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, color: ac, fontSize: 10 }}>{alert.component}</span>
                          <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                            {(alert.confidence * 100).toFixed(0)}% · {alert.faultSource}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-primary)', marginBottom: 4 }}>{alert.issue}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>→ {alert.recommendedAction}</div>
                        {(alert.ecsAlarmCode || alert.maintenanceTask) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                            {alert.ecsAlarmCode && (
                              <span style={{
                                fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 2,
                                border: `1px solid ${ac}`, background: `rgba(${ag},0.1)`, color: ac,
                              }}>ECS: {alert.ecsAlarmCode}</span>
                            )}
                            {alert.maintenanceTask && (
                              <span style={{
                                fontSize: 8, padding: '1px 6px', borderRadius: 2,
                                border: '1px solid var(--border-dim)', background: 'var(--bg-elevated)',
                                color: 'var(--text-secondary)',
                              }}>{alert.maintenanceTask.split('—')[0].trim()}</span>
                            )}
                          </div>
                        )}
                        {alert.patternId && (
                          <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                            <button className="mag-btn mag-btn-ghost"
                              style={{ padding: '3px 8px', fontSize: 9, color: 'var(--risk-normal)', borderColor: 'var(--risk-normal)' }}
                              onClick={() => onConfirm(alert.patternId!)}>✓ Confirm</button>
                            <button className="mag-btn mag-btn-ghost"
                              style={{ padding: '3px 8px', fontSize: 9 }}
                              onClick={() => onFalsePositive(alert.patternId!)}>✗ False Positive</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {decision.alerts.length === 0 && (
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(0,212,170,0.05)',
                border: '1px solid rgba(0,212,170,0.2)',
                borderRadius: 5, padding: '8px 10px',
              }}>
                <span className="live-dot" />
                <span style={{ fontSize: 10, color: 'var(--risk-normal)' }}>All subsystems nominal</span>
              </div>
            )}
          </div>

          {/* Col 3: Evidence chain */}
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 8 }}>
              EVIDENCE CHAIN
            </div>
            {decision.evidenceChain.map(layer => (
              <div key={layer.layer} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{
                    width: 3, height: 12, borderRadius: 1,
                    background: layer.layer === 'PHYSICS'    ? 'var(--accent-blue)'
                              : layer.layer === 'STATISTICS' ? 'var(--accent-purple)'
                              : 'var(--risk-normal)',
                  }} />
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    color: layer.layer === 'PHYSICS'    ? 'var(--accent-blue)'
                         : layer.layer === 'STATISTICS' ? 'var(--accent-purple)'
                         : 'var(--risk-normal)',
                  }}>{layer.layer}</span>
                </div>
                {layer.findings.map((f, i) => (
                  <div key={i} style={{
                    fontSize: 10, color: 'var(--text-secondary)',
                    paddingLeft: 10, borderLeft: '1px solid var(--border)',
                    marginBottom: 3, lineHeight: 1.6,
                  }}>{f}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Compact mode ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-dim)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div className="label-sm">AI Decision Engine</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{engineName}</div>
      </div>

      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <JarvisOrb
            risk={risk}
            status={decision.status}
            alertCount={decision.alerts.length}
            size={140}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SubRisk label="Exhaust"   value={decision.exhaustRisk} />
            <SubRisk label="Lube"      value={decision.lubeRisk} />
            <SubRisk label="Cooling"   value={decision.coolingRisk} />
            <SubRisk label="Cylinders" value={Math.max(...decision.cylRisks)} />
          </div>
        </div>

        <div>
          <div className="label-xs" style={{ marginBottom: 8 }}>Evidence Chain</div>
          {decision.evidenceChain.map(layer => (
            <div key={layer.layer} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{
                  width: 3, height: 12, borderRadius: 1,
                  background: layer.layer === 'PHYSICS'    ? 'var(--accent-blue)'
                            : layer.layer === 'STATISTICS' ? 'var(--accent-purple)'
                            : 'var(--risk-normal)',
                }} />
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                  color: layer.layer === 'PHYSICS'    ? 'var(--accent-blue)'
                       : layer.layer === 'STATISTICS' ? 'var(--accent-purple)'
                       : 'var(--risk-normal)',
                }}>{layer.layer}</span>
              </div>
              {layer.findings.map((f, i) => (
                <div key={i} style={{
                  fontSize: 10, color: 'var(--text-secondary)',
                  paddingLeft: 12, borderLeft: '1px solid var(--border)',
                  marginBottom: 2, lineHeight: 1.6,
                }}>{f}</div>
              ))}
            </div>
          ))}
        </div>

        {decision.alerts.length > 0 && (
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Active Alerts</div>
            {decision.alerts.map((alert, i) => {
              const ac = riskColor(alert.riskScore);
              const ag = riskGlow(alert.riskScore);
              return (
                <div key={i} style={{
                  background: 'var(--bg-inset)', border: `1px solid ${ac}`,
                  borderRadius: 6, padding: '10px 12px', marginBottom: 8,
                  boxShadow: `0 0 12px rgba(${ag},0.15)`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: ac, fontSize: 11 }}>{alert.component}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                      {(alert.confidence * 100).toFixed(0)}% conf · {alert.faultSource}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 5 }}>{alert.issue}</div>
                  {alert.evidence.map((e, j) => (
                    <div key={j} style={{ fontSize: 9, color: 'var(--text-secondary)', paddingLeft: 8 }}>— {e}</div>
                  ))}
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 5 }}>→ {alert.recommendedAction}</div>
                  {alert.patternId && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="mag-btn mag-btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 10, color: 'var(--risk-normal)', borderColor: 'var(--risk-normal)' }}
                        onClick={() => onConfirm(alert.patternId!)}>✓ Confirm</button>
                      <button className="mag-btn mag-btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 10 }}
                        onClick={() => onFalsePositive(alert.patternId!)}>✗ False Positive</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {decision.alerts.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,212,170,0.06)',
            border: '1px solid rgba(0,212,170,0.2)',
            borderRadius: 6, padding: '10px 12px',
          }}>
            <span className="live-dot" />
            <span style={{ fontSize: 10, color: 'var(--risk-normal)' }}>All subsystems nominal — no active alerts</span>
          </div>
        )}
      </div>
    </div>
  );
}
