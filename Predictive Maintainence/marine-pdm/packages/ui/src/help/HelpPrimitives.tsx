// packages/ui/src/help/HelpPrimitives.tsx
//
// Reusable building blocks for the in-app User Manual (`/help`). Themed with the global CSS
// variable tokens (styles/global.css) so the manual matches the rest of the UI. Pure presentational
// components — no engine coupling here (live widgets live in sections/LiveExamples.tsx).

import React from 'react';

// ── TOC / ordering — the single source of truth for section ids + titles ──────────
// The shell (HelpManual.tsx) renders the index and the scroll-spy from THIS array, so adding a
// section here is all that is needed to list it in the index.
export interface HelpSectionMeta { id: string; title: string; hint: string; }
export const HELP_SECTIONS: HelpSectionMeta[] = [
  { id: 'overview',    title: '1 · Overview & Orientation',    hint: 'What this is, data flow' },
  { id: 'quickstart',  title: '2 · Quick Start — Operating',   hint: 'Start → clutch → load → fault' },
  { id: 'physics',     title: '3 · Engine & Physics',          hint: 'Every calibrated equation' },
  { id: 'states',      title: '4 · Engine States & Start',     hint: 'State machine · interlocks' },
  { id: 'faults',      title: '5 · Fault System (F01–F09)',    hint: 'What each fault does' },
  { id: 'sensorfail',  title: '6 · Sensor-Failure Modes',      hint: 'Dropout · drift · spike…' },
  { id: 'algorithm',   title: '7 · The Algorithm',             hint: 'How the AI scores risk' },
  { id: 'degradation', title: '8 · Degradation & Regression',  hint: 'The weight matrix' },
  { id: 'predict',     title: '9 · Prediction & Training',     hint: 'Time-to-alarm · RUL · dataset' },
  { id: 'jarvis',      title: '10 · JARVIS — Assistant',       hint: 'Read-only tools · settings' },
  { id: 'pages',       title: '11 · Page-by-Page Guide',       hint: 'Every route in the sidebar' },
  { id: 'graphs',      title: '12 · Graph-by-Graph Guide',     hint: 'How to read every chart' },
  { id: 'legend',      title: '13 · Colour & Status Legend',   hint: 'What every colour means' },
  { id: 'glossary',    title: '14 · Glossary & References',    hint: 'Codes, terms, files' },
];

// ── Section shell ─────────────────────────────────────────────────────────────────
export function Section({ id, title, subtitle, children }: {
  id: string; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 16, marginBottom: 34 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4,
        paddingBottom: 8, borderBottom: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
          {title}
        </h2>
      </div>
      {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 14px' }}>{subtitle}</p>}
      <div style={{ marginTop: subtitle ? 0 : 12 }}>{children}</div>
    </section>
  );
}

export function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22, marginBottom: 8 }}>
      <h3 style={{
        fontSize: 13, fontWeight: 700, color: 'var(--accent-blue)',
        letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10,
      }}>{title}</h3>
      {children}
    </div>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-secondary)', margin: '0 0 11px' }}>{children}</p>;
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: 'var(--font)', fontSize: 11.5, color: 'var(--accent-purple)',
      background: 'var(--bg-inset)', border: '1px solid var(--border-dim)',
      borderRadius: 4, padding: '1px 5px',
    }}>{children}</code>
  );
}

export function Hi({ children, color = 'var(--risk-normal)' }: { children: React.ReactNode; color?: string }) {
  return <span style={{ color, fontWeight: 700 }}>{children}</span>;
}

// ── Equation block — formula + rated value + drivers + expectation + alarm band ─────
export function EquationBlock({ name, tag, formula, rated, drivers, expect, band }: {
  name: string; tag?: string; formula: string; rated?: string;
  drivers?: string; expect?: string; band?: string;
}) {
  return (
    <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{name}</span>
        {tag && <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>{tag}</span>}
      </div>
      <div style={{
        fontFamily: 'var(--font)', fontSize: 12, color: 'var(--accent-blue)',
        background: 'var(--bg-inset)', border: '1px solid var(--border-dim)',
        borderRadius: 5, padding: '8px 10px', overflowX: 'auto', whiteSpace: 'pre',
      }}>{formula}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr', gap: '4px 10px', marginTop: 9, fontSize: 11.5 }}>
        {rated   && (<><span style={kLbl}>Rated</span>   <span style={kVal}><Hi>{rated}</Hi></span></>)}
        {drivers && (<><span style={kLbl}>Driven by</span><span style={kVal}>{drivers}</span></>)}
        {expect  && (<><span style={kLbl}>Expect</span>  <span style={kVal}>{expect}</span></>)}
        {band    && (<><span style={kLbl}>Alarm</span>   <span style={{ ...kVal, color: 'var(--risk-warning)' }}>{band}</span></>)}
      </div>
    </div>
  );
}
const kLbl: React.CSSProperties = { color: 'var(--text-dim)', fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', paddingTop: 1 };
const kVal: React.CSSProperties = { color: 'var(--text-secondary)', lineHeight: 1.5 };

// ── Data table — themed, header + rows ──────────────────────────────────────────────
export function DataTable({ columns, rows, colWidths }: {
  columns: string[]; rows: (React.ReactNode)[][]; colWidths?: (string | undefined)[];
}) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 14, border: '1px solid var(--border-dim)', borderRadius: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, minWidth: 520 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{
                textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)',
                fontWeight: 700, letterSpacing: '0.05em', fontSize: 10.5, textTransform: 'uppercase',
                background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)',
                width: colWidths?.[i],
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }}>
              {r.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '7px 10px', color: 'var(--text-secondary)', verticalAlign: 'top',
                  borderBottom: '1px solid var(--border-dim)', lineHeight: 1.5,
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Callout — info / warn / tip / read ("how to read") ──────────────────────────────
const CALLOUT_STYLE: Record<string, { c: string; bg: string; label: string }> = {
  info: { c: 'var(--accent-blue)',   bg: 'rgba(56,189,248,0.07)',  label: 'NOTE' },
  warn: { c: 'var(--risk-warning)',  bg: 'rgba(245,158,11,0.07)',  label: 'WATCH' },
  tip:  { c: 'var(--risk-normal)',   bg: 'rgba(0,212,170,0.07)',   label: 'TIP' },
  read: { c: 'var(--accent-purple)', bg: 'rgba(167,139,250,0.07)', label: 'HOW TO READ' },
};
export function Callout({ kind = 'info', title, children }: {
  kind?: 'info' | 'warn' | 'tip' | 'read'; title?: string; children: React.ReactNode;
}) {
  const s = CALLOUT_STYLE[kind]!;
  return (
    <div style={{
      background: s.bg, borderLeft: `3px solid ${s.c}`, borderRadius: '0 6px 6px 0',
      padding: '9px 13px', margin: '4px 0 14px', fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)',
    }}>
      <span style={{ color: s.c, fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', marginRight: 8 }}>
        {title ?? s.label}
      </span>
      {children}
    </div>
  );
}

// ── Colour key / legend swatches ────────────────────────────────────────────────────
export function ColorKey({ items }: { items: { color: string; label: string; note?: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', margin: '4px 0 14px' }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
          <span style={{ width: 13, height: 13, borderRadius: 3, background: it.color, boxShadow: `0 0 6px ${it.color}66`, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{it.label}</span>
          {it.note && <span style={{ color: 'var(--text-dim)' }}>— {it.note}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Diagram frame — wraps hand-authored SVG diagrams ────────────────────────────────
export function DiagramFrame({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 14, overflowX: 'auto' }}>
      {title && <div style={{ fontSize: 10.5, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  );
}

// ── "LIVE" badge for widgets that read the running engine ───────────────────────────
export function LiveBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'rgba(0,212,170,0.10)', border: '1px solid rgba(0,212,170,0.35)',
      color: 'var(--risk-normal)', borderRadius: 4, padding: '2px 8px',
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--risk-normal)', boxShadow: '0 0 6px var(--risk-normal)' }} />
      LIVE
    </span>
  );
}

// Ordered/bulleted list helpers
export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol style={{ margin: '0 0 14px', paddingLeft: 0, listStyle: 'none', counterReset: 'step' }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: 11, marginBottom: 9, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          <span style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.3)', color: 'var(--accent-blue)',
          }}>{i + 1}</span>
          <span style={{ paddingTop: 2 }}>{it}</span>
        </li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-secondary)', marginBottom: 5 }}>{it}</li>
      ))}
    </ul>
  );
}
