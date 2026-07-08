// packages/ui/src/about/AboutPrimitives.tsx
//
// Primitives for the System Dossier (`/about`). Re-exports Help's generic building blocks rather
// than duplicating them — dependency direction is about -> help, never the reverse, so `/help`
// stays fully self-contained. The two new primitives here (ParameterDossier, StrengthCallout /
// LimitationCallout) are About-specific: a fixed-structure per-parameter card, and two candor
// callout variants distinct from Help's info/warn/tip/read.

import React from 'react';
import {
  Section, SubSection, P, Code, Hi, Callout, DataTable, EquationBlock, ColorKey, DiagramFrame,
  LiveBadge, Steps, Bullets,
} from '../help/HelpPrimitives';

export {
  Section, SubSection, P, Code, Hi, Callout, DataTable, EquationBlock, ColorKey, DiagramFrame,
  LiveBadge, Steps, Bullets,
};

// ── TOC / ordering — single source of truth for the About index + scroll-spy ───────
export interface AboutSectionMeta { id: string; title: string; hint: string; }
export const ABOUT_SECTIONS: AboutSectionMeta[] = [
  { id: 'identity',      title: '1 · System Identity',            hint: 'What this is · vs the User Manual' },
  { id: 'architecture',  title: '2 · Module Architecture',        hint: 'The monorepo dependency graph' },
  { id: 'dossier',       title: '3 · Parameter Dossier',          hint: 'Every gauge, in depth — start here' },
  { id: 'interconnect',  title: '4 · Interconnection Map',        hint: 'How every parameter is coupled' },
  { id: 'decision-deep', title: '5 · Decision Logic — Deep Dive', hint: 'Worked example, tick by tick' },
  { id: 'playbook',      title: '6 · Health Assessment Playbook', hint: 'How to read the whole engine' },
  { id: 'strengths',     title: '7 · Hidden Strengths',           hint: 'Design choices worth knowing' },
  { id: 'limitations',   title: '8 · Known Limitations',          hint: 'Candid gaps, not hidden' },
  { id: 'ref-table',     title: '9 · All-Parameters Reference',   hint: 'One table, every tag' },
  { id: 'ref-glossary',  title: '10 · Glossary',                  hint: 'Points to the User Manual' },
];

// ── Coupled-parameter chip — used inside ParameterDossier and the interconnection map ──
export type CoupleDirection = 'raises' | 'lowers' | 'both';
export interface CoupledParam { name: string; direction: CoupleDirection; note?: string; anchorId?: string }

const DIR_STYLE: Record<CoupleDirection, { c: string; arrow: string }> = {
  raises: { c: 'var(--risk-warning)', arrow: '↑' },
  lowers: { c: 'var(--accent-blue)',  arrow: '↓' },
  both:   { c: 'var(--accent-purple)', arrow: '↕' },
};

function CoupledChip({ p }: { p: CoupledParam }) {
  const s = DIR_STYLE[p.direction];
  const inner = (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'var(--bg-inset)', border: `1px solid ${s.c}40`, borderRadius: 5,
      padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)',
    }}>
      <span style={{ color: s.c, fontWeight: 700 }}>{s.arrow}</span>
      <span style={{ fontWeight: 600 }}>{p.name}</span>
      {p.note && <span style={{ color: 'var(--text-dim)' }}>— {p.note}</span>}
    </span>
  );
  return p.anchorId ? (
    <a href={`#${p.anchorId}`} style={{ textDecoration: 'none' }}
      onClick={e => { e.preventDefault(); document.getElementById(p.anchorId!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
      {inner}
    </a>
  ) : inner;
}

// ── ParameterDossier — the fixed-structure per-parameter card (the dossier's centerpiece) ──
export interface ParameterDossierProps {
  id: string;
  name: string;
  tag: string;
  unit: string;
  definition: React.ReactNode;
  howToRead: React.ReactNode;
  rated: React.ReactNode;
  risesWhen: React.ReactNode[];
  fallsWhen: React.ReactNode[];
  cascadeConsequence: React.ReactNode;
  coupledParams: CoupledParam[];
  alarmBand: React.ReactNode;
  relatedFaults: React.ReactNode[];
  exemplary?: boolean;
}

export function ParameterDossier(p: ParameterDossierProps) {
  return (
    <div id={p.id} className="card" style={{
      padding: '16px 18px', marginBottom: 18, scrollMarginTop: 16,
      border: p.exemplary ? '1px solid rgba(0,212,170,0.4)' : undefined,
      boxShadow: p.exemplary ? '0 0 0 1px rgba(0,212,170,0.12)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>{p.tag}</span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(56,189,248,0.10)',
          border: '1px solid rgba(56,189,248,0.25)', borderRadius: 4, padding: '1px 6px',
        }}>{p.unit}</span>
        {p.exemplary && (
          <span style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--risk-normal)',
            background: 'rgba(0,212,170,0.10)', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 4, padding: '2px 7px',
          }}>MOST DETAILED ENTRY</span>
        )}
      </div>

      <P>{p.definition}</P>

      <Callout kind="read">{p.howToRead}</Callout>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 14px' }}>
        <span style={{ fontSize: 10.5, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Rated (85% / 1150 RPM)</span>
        <span style={{ fontSize: 13 }}><Hi>{p.rated}</Hi></span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--risk-warning)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Rises when</div>
          <Bullets items={p.risesWhen} />
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Falls when</div>
          <Bullets items={p.fallsWhen} />
        </div>
      </div>

      <div style={{
        background: 'rgba(167,139,250,0.06)', borderLeft: '3px solid var(--accent-purple)',
        borderRadius: '0 6px 6px 0', padding: '10px 14px', margin: '4px 0 14px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-purple)', letterSpacing: '0.08em', marginBottom: 5 }}>
          WHAT A SUSTAINED CHANGE MEANS FOR THE ENGINE AS A WHOLE
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{p.cascadeConsequence}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Coupled parameters</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {p.coupledParams.map((cp, i) => <CoupledChip key={i} p={cp} />)}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Alarm band</div>
        {p.alarmBand}
      </div>

      <div>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Related faults</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{p.relatedFaults}</div>
      </div>
    </div>
  );
}

// ── Candor callouts — Hidden Strengths / Known Limitations ─────────────────────────
// Deliberately NOT using risk-critical red for limitations: a documented design boundary is
// candor, not an active alarm — conflating the two visually would misread as "something is broken."
export function StrengthCallout({ title, children, verifiedCurrent }: {
  title: string; children: React.ReactNode; verifiedCurrent?: boolean;
}) {
  return (
    <div style={{
      background: 'rgba(0,212,170,0.06)', borderLeft: '3px solid var(--risk-normal)',
      borderRadius: '0 6px 6px 0', padding: '11px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--risk-normal)', letterSpacing: '0.08em' }}>✓ STRENGTH</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {verifiedCurrent && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)' }}>verified against source</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );
}

export function LimitationCallout({ title, children, verifiedCurrent }: {
  title: string; children: React.ReactNode; verifiedCurrent?: boolean;
}) {
  return (
    <div style={{
      background: 'rgba(148,163,184,0.06)', borderLeft: '3px solid var(--text-muted)',
      borderRadius: '0 6px 6px 0', padding: '11px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>⚑ LIMITATION</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {verifiedCurrent && (
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)' }}>verified against source</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{children}</div>
    </div>
  );
}
