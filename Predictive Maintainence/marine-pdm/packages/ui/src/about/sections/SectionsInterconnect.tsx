// packages/ui/src/about/sections/SectionsInterconnect.tsx
// Dossier section §4 — the consolidated Interconnection Map. Edges are derived live from
// DEGRADATION_MODES[].effects[] (@marine-pdm/simulator), filtered to modeled===true; unmodeled
// claims (e.g. F05 -> chargeAirTemp) are rendered as visible dashed "declined" edges rather than
// silently omitted, so the documented gap is something the reader can literally see, not a footnote.

import React from 'react';
import { ROOT_FACTORS, DEGRADATION_MODES } from '@marine-pdm/simulator';
import type { RootFactor } from '@marine-pdm/simulator';
import { Section, P, Callout, ColorKey, DiagramFrame } from '../AboutPrimitives';
import { DOSSIER_ENTRIES } from '../dossier-data';

const ROOT_COLOR: Record<RootFactor, string> = {
  injFault:     '#F59E0B', // amber
  coolingEff:   '#38BDF8', // blue
  tcEff:        '#A78BFA', // purple
  lubeFault:    '#F472B6', // pink
  bearingFault: '#F97316', // orange
  pistonBlowby: '#10B981', // teal-green
};
const ROOT_ORDER: RootFactor[] = ['injFault', 'coolingEff', 'tcEff', 'lubeFault', 'bearingFault', 'pistonBlowby'];

function findDossierIdForSensor(sensorId: string): string | undefined {
  return DOSSIER_ENTRIES.find(e => e.sensorIds.includes(sensorId))?.id;
}

interface Edge { root: RootFactor; targetId: string; modeled: boolean; via?: string }

function buildEdges(): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const mode of DEGRADATION_MODES) {
    for (const effect of mode.effects) {
      const targetId = findDossierIdForSensor(effect.sensorId);
      if (!targetId) continue; // sensorId not surfaced as its own dossier entry (e.g. per-instance internals)
      const key = `${mode.rootFactor}|${targetId}|${effect.modeled}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ root: mode.rootFactor, targetId, modeled: effect.modeled, via: effect.via });
    }
  }
  return edges;
}

function InterconnectionDiagram() {
  const edges = buildEdges();
  const roots = ROOT_ORDER.map(f => ROOT_FACTORS[f]);
  const targets = DOSSIER_ENTRIES;

  const leftX = 20, rightX = 560, boxW = 150, boxH = 26;
  const H = Math.max(roots.length, targets.length) * 34 + 20;
  const rootY = (i: number) => 10 + i * ((H - 20) / (roots.length - 1 || 1));
  const targetY = (i: number) => 10 + i * ((H - 20) / (targets.length - 1 || 1));
  const rootYById = Object.fromEntries(roots.map((r, i) => [r.factor, rootY(i)]));
  const targetYById = Object.fromEntries(targets.map((t, i) => [t.id, targetY(i)]));

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <DiagramFrame title="Root factors -> every parameter they touch (modeled edges only; dashed = claimed but not modeled)">
      <svg viewBox={`0 0 720 ${H + 20}`} width="100%" style={{ maxWidth: 720, minWidth: 640 }}>
        {/* edges — drawn first so nodes sit on top */}
        {edges.map((e, i) => {
          const y1 = rootYById[e.root] + boxH / 2;
          const y2 = targetYById[e.targetId] + boxH / 2;
          const x1 = leftX + boxW, x2 = rightX;
          const midX = (x1 + x2) / 2;
          const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
          const color = ROOT_COLOR[e.root];
          return (
            <path key={i} d={path} fill="none" stroke={color}
              strokeWidth={e.modeled ? 1.3 : 1.1}
              strokeDasharray={e.modeled ? undefined : '3 4'}
              opacity={e.modeled ? 0.55 : 0.35}
            />
          );
        })}
        {/* root-factor nodes (left) */}
        {roots.map(r => (
          <g key={r.factor}>
            <rect x={leftX} y={rootYById[r.factor]} width={boxW} height={boxH} rx={6}
              fill="var(--bg-inset)" stroke={ROOT_COLOR[r.factor]} strokeWidth="1.4" />
            <text x={leftX + boxW / 2} y={rootYById[r.factor] + boxH / 2 + 4} fontSize="10.5" fontWeight="700"
              fill={ROOT_COLOR[r.factor]} textAnchor="middle">{r.label}</text>
          </g>
        ))}
        {/* dossier-entry nodes (right) — clickable, scroll to the full card */}
        {targets.map(t => (
          <g key={t.id} style={{ cursor: 'pointer' }} onClick={go(t.id)}>
            <rect x={rightX} y={targetYById[t.id]} width={140} height={boxH} rx={6}
              fill="var(--bg-inset)" stroke="var(--border-hi)" strokeWidth="1.1" />
            <text x={rightX + 70} y={targetYById[t.id] + boxH / 2 + 4} fontSize="9.5" fontWeight="600"
              fill="var(--text-secondary)" textAnchor="middle">{t.name.length > 22 ? t.name.slice(0, 20) + '…' : t.name}</text>
          </g>
        ))}
      </svg>
    </DiagramFrame>
  );
}

export function InterconnectionSection() {
  const edges = buildEdges();
  const unmodeledCount = edges.filter(e => !e.modeled).length;
  return (
    <Section id="interconnect" title="4 · Interconnection Map"
      subtitle="Every root factor a fault can set, and every parameter it's actually wired to in the physics — in one diagram.">
      <P>
        Six independent <em>root factors</em> are the only things a fault directly sets on the physics state;
        every dossier entry in §3 is a <em>dependent</em> observable propagated from one or more of them. Click
        any parameter node to jump to its full dossier card.
      </P>
      <InterconnectionDiagram />
      <ColorKey items={ROOT_ORDER.map(f => ({ color: ROOT_COLOR[f], label: ROOT_FACTORS[f].label }))} />
      {unmodeledCount > 0 && (
        <Callout kind="warn">
          The {unmodeledCount} dashed edge{unmodeledCount === 1 ? '' : 's'} above {unmodeledCount === 1 ? 'is a claim' : 'are claims'} a fault's
          own cross-correlation metadata makes but the physics equations do <em>not</em> actually produce —
          most notably F05 (HT cooler fouling) claiming an effect on charge-air temperature, which is
          physically impossible in this model (charge air is LT/seawater-cooled, a separate circuit). See{' '}
          <strong>§9 Known Limitations</strong> for the full list and why each was deliberately left unmodeled
          rather than silently "fixed."
        </Callout>
      )}
    </Section>
  );
}
