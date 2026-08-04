// packages/ui/src/about/sections/SectionsDecisionDeep.tsx
// Dossier section §5 — Decision Logic Deep-Dive. Assumes the reader already knows the 4-step
// pipeline from the User Manual §7; this goes straight to (a) an interactive calculator and
// (b) a worked numeric example.
//
// RiskCalculator below calls the REAL computeRiskBreakdown() from @marine-pdm/decision for every
// number it shows — the headline score AND the weighted dev/trend/persist breakdown both come from
// the same single implementation in risk.ts (computeRisk() itself is just `.total` from the same
// call). There is no second, hand-copied formula anywhere in this file, so nothing here can drift
// from the real scoring logic.
//
// IMPORTANT SCOPE NOTE: this demonstrates the ADVISORY risk-scoring layer only (step 2 of the
// 4-step pipeline in the User Manual's Algorithm section). It does not run inputs through the
// deterministic safety-override layer (step 4) — see the callout in the component below.
//
// The worked-example table further down was generated the same way the calculator computes live —
// by running these formulas against the F01 severity ramp for cylinder A4 at FAST speed / 100%
// intensity — not hand-estimated.

import React from 'react';
import { Link } from 'react-router-dom';
import { computeRiskBreakdown, MTU8000_ALARM_BANDS } from '@marine-pdm/decision';
import type { RiskBreakdown } from '@marine-pdm/decision';
import { Section, SubSection, P, Code, Hi, Callout, DataTable, Bullets } from '../AboutPrimitives';

// ── Friendly labels for the alarm-band keys (falls back to the raw key for any sensor added to
// MTU8000_ALARM_BANDS later without a label here, so the dropdown never silently omits an entry) ──
const SENSOR_LABELS: Record<string, string> = {
  exhaustTemp: 'Exhaust Temp (mean)', cylTemp: 'Cylinder Temp (per-cyl)', jacketOutlet: 'Coolant / Jacket Temp',
  chargeAirTemp: 'Charge-Air Temp', fuelOilTemp: 'Fuel Oil Temp', lubeOilPressure: 'Lube Oil Pressure',
  fuelOilPressure: 'Fuel Oil Pressure', scavengeAir: 'Charge-Air Pressure', pistonCoolingPress: 'Piston Cooling Pressure',
  loFilterDP: 'LO Filter ΔP', tcRPM: 'Turbocharger Speed', sfoc: 'SFOC', shaftPower: 'Shaft Power',
};

function riskColor(r: number) {
  return r >= 75 ? 'var(--risk-critical)' : r >= 50 ? 'var(--risk-high)' : r >= 25 ? 'var(--risk-warning)' : 'var(--risk-normal)';
}
function statusOf(r: number) {
  return r >= 75 ? 'CRITICAL' : r >= 50 ? 'HIGH' : r >= 25 ? 'WARNING' : 'NORMAL';
}

type PresetKind = 'healthy' | 'drift' | 'fast' | 'threshold';
function preset(kind: PresetKind, band: { dev: number; rate: number }) {
  switch (kind) {
    case 'healthy':   return { deviation: band.dev * 0.15, rate: band.rate * 0.08, persistCount: 0 };
    case 'drift':     return { deviation: band.dev * 0.90, rate: band.rate * 0.15, persistCount: 10 };
    case 'fast':      return { deviation: band.dev * 0.90, rate: band.rate * 1.40, persistCount: 2 };
    case 'threshold': return { deviation: band.dev * 1.00, rate: band.rate * 0.30, persistCount: 6 };
  }
}

interface Scenario { id: number; sensorKey: string; deviation: number; rate: number; persistCount: number; }
function freshScenario(id: number, sensorKey: string): Scenario {
  const band = MTU8000_ALARM_BANDS[sensorKey]!;
  return { id, sensorKey, deviation: band.dev * 0.15, rate: band.rate * 0.08, persistCount: 0 };
}
const MAX_SCENARIOS = 5;

const bar = (label: string, contrib: number, weight: number, raw: number, color: string) => (
  <div key={label} style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label} <span style={{ color: 'var(--text-dim)' }}>(weight {weight.toFixed(2)} × score {raw.toFixed(1)})</span></span>
      <span style={{ fontWeight: 700, color }}>{contrib.toFixed(1)}</span>
    </div>
    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, contrib)}%`, background: color, transition: 'width 0.15s' }} />
    </div>
  </div>
);

function Slider({ label, value, min, max, step, unit, onChange, decimals = 1 }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void; decimals?: number;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)', fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(decimals)} {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={e => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--accent-pink)' }} />
    </div>
  );
}

// One scenario = one subsystem being scored — exactly like decision-engine.ts calling computeRisk()
// independently for exhaust, lube, cooling, and each cylinder. The breakdown is computed ONCE by the
// parent (with the correct shared load) and passed down — this card only displays it, it never
// recomputes risk itself, so it can't go out of sync with the combined panel below.
function ScenarioCard({ scenario, breakdown, sensorKeys, onChange, onRemove, onPreset, removable, dominant }: {
  scenario: Scenario; breakdown: RiskBreakdown; sensorKeys: string[]; removable: boolean; dominant: boolean;
  onChange: (patch: Partial<Scenario>) => void; onRemove: () => void; onPreset: (kind: PresetKind) => void;
}) {
  const risk = breakdown.total;
  const band = MTU8000_ALARM_BANDS[scenario.sensorKey]!;
  return (
    <div style={{
      background: 'var(--bg-inset)', border: `1px solid ${dominant ? 'var(--accent-pink)' : 'var(--border-dim)'}`,
      borderRadius: 7, padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <select value={scenario.sensorKey} onChange={e => onChange({ sensorKey: e.target.value })}
          aria-label="Parameter to score" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 5,
          color: 'var(--text-secondary)', fontSize: 10.5, padding: '4px 6px', fontFamily: 'var(--font)',
        }}>
          {sensorKeys.map(k => <option key={k} value={k}>{SENSOR_LABELS[k] ?? k}</option>)}
        </select>
        {dominant && (
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent-pink)' }}>
            → SETS SYSTEM RISK
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: riskColor(risk), fontVariantNumeric: 'tabular-nums' }}>{risk.toFixed(1)}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: riskColor(risk) }}>{statusOf(risk)}</span>
          {removable && (
            <button onClick={onRemove} title="Remove this parameter" aria-label="Remove this parameter" style={{
              background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
              fontSize: 14, lineHeight: 1, padding: '0 2px',
            }}>×</button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {([
          ['healthy', 'Healthy'], ['drift', 'Slow drift'], ['fast', 'Fast fault'], ['threshold', 'Threshold'],
        ] as [PresetKind, string][]).map(([kind, label]) => (
          <button key={kind} onClick={() => onPreset(kind)} style={{
            fontSize: 9, fontWeight: 600, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
            background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.25)',
            color: 'var(--accent-pink)', fontFamily: 'var(--font)',
          }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px 14px' }}>
        <Slider label="Deviation" value={scenario.deviation} min={0} max={band.dev * 2} step={band.dev / 50}
          unit="" onChange={v => onChange({ deviation: v })} decimals={2} />
        <Slider label="Rate" value={scenario.rate} min={0} max={band.rate * 2} step={band.rate / 50}
          unit="/min" onChange={v => onChange({ rate: v })} decimals={2} />
        <Slider label="Persistence" value={scenario.persistCount} min={0} max={20} step={1}
          unit="ticks" onChange={v => onChange({ persistCount: v })} decimals={0} />
      </div>
    </div>
  );
}

function RiskCalculator() {
  const sensorKeys = React.useMemo(() => Object.keys(MTU8000_ALARM_BANDS), []);
  const [load, setLoad] = React.useState(85);
  const [scenarios, setScenarios] = React.useState<Scenario[]>(() => [
    freshScenario(0, 'exhaustTemp'),
    freshScenario(1, 'lubeOilPressure'),
  ]);
  const nextId = React.useRef(2);

  const updateScenario = (id: number, patch: Partial<Scenario>) =>
    setScenarios(ss => ss.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const addScenario = () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    const used = new Set(scenarios.map(s => s.sensorKey));
    const next = sensorKeys.find(k => !used.has(k)) ?? sensorKeys[0]!;
    setScenarios(ss => [...ss, freshScenario(nextId.current++, next)]);
  };
  const removeScenario = (id: number) => setScenarios(ss => (ss.length > 1 ? ss.filter(s => s.id !== id) : ss));
  const applyPreset = (id: number, kind: PresetKind) => {
    const s = scenarios.find(sc => sc.id === id)!;
    updateScenario(id, preset(kind, MTU8000_ALARM_BANDS[s.sensorKey]!));
  };
  const changeSensor = (id: number, sensorKey: string) => updateScenario(id, freshScenario(id, sensorKey));

  // Each scenario scored independently via the REAL computeRiskBreakdown() — one call per subsystem,
  // exactly mirroring decision-engine.ts. Load is shared because it's one engine-wide value, not
  // per-sensor. Computed once here (with the correct shared load) and passed down to each
  // ScenarioCard, which only displays it — no risk of a card's own number disagreeing with the
  // combined panel below, because there is only one calculation, not two.
  const results = scenarios.map(s => {
    const band = MTU8000_ALARM_BANDS[s.sensorKey]!;
    const breakdown = computeRiskBreakdown(s.deviation, 0, s.rate, s.persistCount, load, band.dev, band.rate);
    return { ...s, band, breakdown };
  });

  // System risk = MAX across subsystems, not a sum — the exact rule in decision-engine.ts:
  // systemRiskRaw = Math.max(exhaustSmooth, lubeSmooth, coolingSmooth, ...cylRisks).
  const systemRisk = Math.max(...results.map(r => r.breakdown.total));
  const dominant = results.reduce((best, r) => (r.breakdown.total > best.breakdown.total ? r : best), results[0]!);

  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>Interactive risk calculator</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>
          Each card below is scored independently via the real <Code>computeRiskBreakdown()</Code>; add
          more to see how the system combines several at once.
        </div>
      </div>

      <div style={{ marginBottom: 12, maxWidth: 260 }}>
        <Slider label="Engine load (shared — one engine has one load)" value={load} min={0} max={100} step={1}
          unit="%" onChange={setLoad} decimals={0} />
      </div>

      {results.map(r => (
        <ScenarioCard key={r.id} scenario={r} breakdown={r.breakdown} sensorKeys={sensorKeys}
          removable={scenarios.length > 1} dominant={r.id === dominant.id}
          onChange={patch => updateScenario(r.id, patch)}
          onRemove={() => removeScenario(r.id)}
          onPreset={kind => applyPreset(r.id, kind)}
        />
      ))}

      <button onClick={addScenario} disabled={scenarios.length >= MAX_SCENARIOS} style={{
        width: '100%', padding: '8px 0', marginBottom: 16,
        background: scenarios.length >= MAX_SCENARIOS ? 'rgba(255,255,255,0.02)' : 'rgba(56,189,248,0.06)',
        border: `1px dashed ${scenarios.length >= MAX_SCENARIOS ? 'var(--border-dim)' : 'rgba(56,189,248,0.3)'}`,
        borderRadius: 6, color: scenarios.length >= MAX_SCENARIOS ? 'var(--text-dim)' : 'var(--accent-blue)',
        fontSize: 10.5, fontWeight: 600, cursor: scenarios.length >= MAX_SCENARIOS ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font)',
      }}>
        {scenarios.length >= MAX_SCENARIOS ? `Maximum ${MAX_SCENARIOS} parameters` : '+ Add another parameter'}
      </button>

      <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 130 }}>
            <div style={{ fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>System risk</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: riskColor(systemRisk), fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              {systemRisk.toFixed(1)}
            </div>
            <div style={{
              display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: riskColor(systemRisk), background: `${riskColor(systemRisk)}18`,
              border: `1px solid ${riskColor(systemRisk)}55`, borderRadius: 4, padding: '2px 8px', marginTop: 4,
            }}>{statusOf(systemRisk)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 6, maxWidth: 130 }}>
              = max({results.map(r => r.breakdown.total.toFixed(0)).join(', ')})
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Weighted breakdown for {SENSOR_LABELS[dominant.sensorKey] ?? dominant.sensorKey} — the parameter currently driving system risk
            </div>
            {bar('Deviation', dominant.breakdown.devContrib, dominant.breakdown.weights.dev, dominant.breakdown.scoreDev, 'var(--risk-warning)')}
            {bar('Trend / rate', dominant.breakdown.trendContrib, dominant.breakdown.weights.trend, dominant.breakdown.scoreTrend, 'var(--accent-blue)')}
            {bar('Persistence', dominant.breakdown.persistContrib, dominant.breakdown.weights.persist, dominant.breakdown.scorePersist, 'var(--accent-purple)')}
          </div>
        </div>
        <Callout kind="info">
          System risk is the <Hi>maximum</Hi> across subsystems, not a sum or average — this mirrors{' '}
          <Code>decision-engine.ts</Code>'s <Code>Math.max(exhaustSmooth, lubeSmooth, coolingSmooth,
          ...cylRisks)</Code>. Two parameters degrading at once does <em>not</em> push the headline number
          higher than the worse of the two alone — but each can still surface its own separate alert in the
          evidence chain, so "one number" doesn't mean "one problem."
        </Callout>
        <Callout kind="warn" title="SCOPE">
          This shows the <Hi color="var(--risk-warning)">advisory scoring layer</Hi> only (step 2 of the
          4-step pipeline). It does not run these values through the{' '}
          <Hi color="var(--risk-critical)">safety-override layer</Hi> (step 4) — on the real engine, e.g.
          last-bearing pressure below 2.0 bar or bearing temp above 130°C forces risk to <Code>100</Code>{' '}
          immediately, deterministically, regardless of what this weighted formula computes. See §8 Hidden
          Strengths and <Link to="/help#algorithm" style={{ color: 'var(--accent-blue)' }}>the User Manual's
          Algorithm section</Link> for the override thresholds this calculator intentionally leaves out.
        </Callout>
      </div>
    </div>
  );
}

export function DecisionDeepDiveSection() {
  return (
    <Section id="decision-deep" title="5 · Decision Logic — Deep Dive"
      subtitle="A worked, tick-by-tick trace of a fault becoming an alert — not just the formula, but the formula running.">
      <P>
        The User Manual's <Link to="/help#algorithm" style={{ color: 'var(--accent-blue)' }}>Algorithm
        section</Link> covers the four-step pipeline (features → risk score → evidence chain → safety
        overrides) — read that first if you haven't. This section does not repeat it; it traces one concrete
        fault through the real formulas, tick by tick, so the abstract rules ("20% deadband," "persistence
        gate," "EWMA smoothing") become a specific number becoming a specific alert.
      </P>

      <SubSection title="Try the formula yourself">
        <P>
          This is the exact formula behind every risk score in the app, live. It opens with two parameters —
          Exhaust Temp and Lube Oil Pressure — so you can immediately see how a{' '}
          <Hi color="var(--risk-warning)">combination</Hi> is handled, not just one gauge at a time. Add up
          to {5 - 2} more with <Code>+ Add another parameter</Code>. Each preset row gives you two
          contrasting starting points worth comparing on the same card —{' '}
          <Hi color="var(--risk-warning)">Slow drift</Hi> (high deviation, low rate, long persistence, since
          a drift has been quietly happening for a while) versus <Hi color="var(--risk-high)">Fast fault</Hi>{' '}
          (similarly high deviation, but a sharp rate and barely any persistence yet) — then watch which
          parameter ends up marked <Code>→ SETS SYSTEM RISK</Code> as you adjust things.
        </P>
        <Callout kind="info">
          The <Code>Slow drift</Code> preset is an <em>illustration</em> — a hand-picked input shape chosen
          to resemble what a drift produces in this formula — not a hookup to the real DRIFT sensor-failure
          mode. The actual DRIFT model lives in <Code>sensor-failure.ts</Code> and feeds a separate{' '}
          <Code>SensorHealth</Code> score (see the User Manual §6), which this calculator does not simulate.
        </Callout>
        <RiskCalculator />
      </SubSection>

      <SubSection title="The scenario">
        <P>
          Inject <Hi color="var(--risk-high)">F01</Hi> (single-cylinder injector degradation) on cylinder{' '}
          <Hi>A4</Hi>, speed <Hi>FAST</Hi> (growth rate 0.012 severity/sec), intensity <Hi>100%</Hi>, at
          steady 85% load / 1150 RPM. The physics is simple: <Code>severity(t) = min(0.012·t, 1.0)</Code>,{' '}
          and the effect on cylinder A4's temperature is <Code>severity(t) × 65°C</Code>. Everything after
          that — when this crosses into WARNING, then HIGH — comes from the decision layer's real constants.
        </P>
      </SubSection>

      <SubSection title="Tick by tick">
        <DataTable
          columns={['Tick (s)', 'Severity', 'Cyl A4 Dev (°C)', 'Persist Count', 'Raw Risk', 'Smoothed Risk', 'Status']}
          rows={[
            ['0', '0.000', '0.0', '0', '0.0', '0.0', 'NORMAL'],
            ['20', '0.240', '15.6', '0', '8.5', '7.3', 'NORMAL'],
            ['28', '0.336', '21.8', '0', '13.5', '12.3', 'NORMAL'],
            ['29', '0.348', '22.6', <Hi color="var(--risk-warning)">1</Hi>, '14.1', '12.9', 'NORMAL'],
            ['31', '0.372', '24.2', '3', <Hi color="var(--risk-warning)">42.6</Hi>, '23.7', 'NORMAL'],
            ['32', '0.384', '25.0', '4', '44.1', <Hi color="var(--risk-warning)">30.9</Hi>, <Hi color="var(--risk-warning)">WARNING</Hi>],
            ['33', '0.396', '25.7', '5', '52.3', '38.3', 'WARNING'],
            ['36', '0.432', '28.1', '8', '64.5', <Hi color="var(--risk-high)">52.7</Hi>, <Hi color="var(--risk-high)">HIGH</Hi>],
            ['40', '0.480', '31.2', '12', <Hi>75.0</Hi>, '66.1', 'HIGH'],
            ['50', '0.600', '39.0', '22', '75.0', '74.9', 'HIGH'],
            ['60', '0.720', '46.8', '32', '75.0', '75.0', 'HIGH'],
          ]}
        />
        <Bullets items={[
          <><Hi>Tick 0–28 — building, invisible.</Hi> Deviation is climbing but stays under the 22°C
            persistence gate, so <Code>persistCount</Code> stays at 0 and <Code>devMultiplier</Code> stays at
            its damped 40% — a genuinely new deviation is deliberately under-weighted until it proves it will
            persist, which is exactly what stops sensor noise from ever reaching this stage.</>,
          <><Hi>Tick 29 — the gate opens.</Hi> Deviation (22.6°C) finally exceeds the 22°C persistence
            threshold; <Code>persistCount</Code> starts counting.</>,
          <><Hi>Tick 31 — the multiplier snaps to full weight.</Hi> At <Code>persistCount ≥ 3</Code>,{' '}
            <Code>devMultiplier</Code> jumps from 0.40 to 1.0 — raw risk nearly triples in one tick (14.7 →
            42.6). This is the single biggest single-tick jump in the whole trace, and it is intentional: a
            deviation that has now held for 3 consecutive ticks has proven it isn't a spike.</>,
          <><Hi>Tick 32 — WARNING.</Hi> Smoothed risk crosses 25 — four ticks after the persistence gate
            opened at tick 29, matching the documented "sustained fault crosses WARNING in ~4 ticks" rule
            exactly.</>,
          <><Hi>Tick 36 — HIGH.</Hi> <Code>persistCount</Code> reaches 8 (<Code>scorePersist</Code> jumps to
            70); smoothed risk crosses 50.</>,
          <><Hi>Tick 40 onward — a ceiling, not a runaway.</Hi> Raw risk plateaus at <Hi>75.0</Hi>, not 100.
            This is a real, structural fact about cylinder-level scoring: the rate/trend term is always passed
            as 0 for individual cylinders (per-cylinder rates aren't tracked — see the Cylinder Imbalance
            dossier entry), so only the deviation weight (0.40) and persistence weight (0.35) can ever
            contribute — 0.40×100 + 0.35×100 = 75 is the mathematical ceiling for a single cylinder through{' '}
            <em>this</em> path alone. Reaching CRITICAL (≥75 smoothed) from here requires either the
            cylinder-imbalance override (a separate floor applied when imbalance itself is large) or a hard
            safety-limit crossing elsewhere — not more of the same formula.</>,
        ]} />
      </SubSection>

      <SubSection title="The other path: trend-driven, not persistence-driven">
        <P>
          F01 demonstrates the <em>persistence</em> path because a single cylinder's rate is never tracked.
          A whole-engine fault like <Hi color="var(--risk-warning)">F05</Hi> (HT cooler fouling) tells a
          different story: <Code>exhaustMeanTemp</Code> rate <em>is</em> tracked, so a fast-ramping F05 can
          cross WARNING via the <Code>scoreTrend</Code> term well before persistence alone would get there —
          the trend term exists precisely so a rapidly-worsening whole-engine fault doesn't have to wait out
          the same multi-tick persistence gate that protects against single-sensor noise. The two mechanisms
          are complementary: persistence catches slow, sustained, single-point faults; trend catches fast,
          systemic ones. A real fault often trips both at once.
        </P>
      </SubSection>

      <SubSection title="Evidence chain at tick ~36 (HIGH)">
        <Bullets items={[
          <><Hi color="var(--accent-blue)">PHYSICS</Hi> — mean exhaust barely moves (one cylinder's +28°C
            contributes only 28/20 ≈ +1.4°C to the 20-cylinder mean); the real signal is cylinder A4's own
            deviation and the resulting cylinder imbalance, not the mean-exhaust reading.</>,
          <><Hi color="var(--accent-purple)">STATISTICS</Hi> — <Code>cylImbalance &gt; 15</Code> fires as
            A4 pulls away from its bank; SFOC deviation is small but present (+4.5 g/kWh at full severity).</>,
          <><Hi color="var(--risk-warning)">RULES</Hi> — <Code>matchMTU8000Patterns()</Code>'s real P01 check
            (exactly one cylinder's deviation past 20°C, <Code>cylImbalance&gt;15</Code>,{' '}
            <Code>sfocDev&gt;3</Code>) is satisfied by this point — this is the actual, live matcher, not a
            worked hypothetical — surfacing ECS code <Code>HI T-Exhaust Cyl N</Code> and maintenance task{' '}
            <Code>W1006 — Replace fuel injector</Code> from the real pattern data in{' '}
            <Code>@marine-pdm/knowledge</Code>.</>,
        ]} />
      </SubSection>
    </Section>
  );
}
