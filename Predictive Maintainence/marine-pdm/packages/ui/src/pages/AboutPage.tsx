// packages/ui/src/pages/AboutPage.tsx
//
// The System Dossier (`/about`) — a deeper engineering reference than the Operator's Manual
// (`/help`): per-parameter causal dossier, interconnection map, decision-logic deep dive, and
// candid strengths/limitations. Shell structure (sticky TOC + scroll-spy) is a deliberate mirror
// of HelpManual.tsx so the two documentation pages feel like one system with two depths.

import React from 'react';
import { Link } from 'react-router-dom';
import { ABOUT_SECTIONS } from '../about/AboutPrimitives';
import { SystemIdentitySection, ModuleArchitectureSection } from '../about/sections/SectionsIdentity';
import { ParameterDossierSection } from '../about/sections/SectionsDossier';
import { InterconnectionSection } from '../about/sections/SectionsInterconnect';
import { DecisionDeepDiveSection } from '../about/sections/SectionsDecisionDeep';
import { PlaybookSection } from '../about/sections/SectionsPlaybook';
import { StrengthsSection, LimitationsSection } from '../about/sections/SectionsCandor';
import { ReferenceTableSection, GlossaryLinkSection } from '../about/sections/SectionsReference';

function useScrollSpy(ids: string[]): string {
  const [active, setActive] = React.useState(ids[0] ?? '');
  React.useEffect(() => {
    const els = ids.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-8% 0px -80% 0px', threshold: 0 },
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

// Cross-route hash links (e.g. from /help) don't auto-scroll under React Router — resolve on mount.
function useHashScrollOnMount() {
  React.useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      // Wait a tick for the full content column to mount before measuring scroll position.
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    }
  }, []);
}

export function AboutPage() {
  const ids = React.useMemo(() => ABOUT_SECTIONS.map(s => s.id), []);
  const active = useScrollSpy(ids);
  useHashScrollOnMount();

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start' }}>
      {/* ── Sticky TOC index ── */}
      <nav style={{
        position: 'sticky', top: 0, flexShrink: 0, width: 236, alignSelf: 'flex-start',
        maxHeight: 'calc(100vh - var(--header-h) - 40px)', overflowY: 'auto', paddingRight: 4,
      }}>
        <div style={{
          fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase',
          fontWeight: 700, padding: '4px 10px 10px',
        }}>Contents</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ABOUT_SECTIONS.map(s => {
            const on = active === s.id;
            return (
              <a key={s.id} href={`#${s.id}`} onClick={go(s.id)} style={{
                display: 'block', padding: '7px 10px', borderRadius: 6, textDecoration: 'none',
                borderLeft: `2px solid ${on ? 'var(--accent-pink)' : 'transparent'}`,
                background: on ? 'rgba(244,114,182,0.08)' : 'transparent',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 11.5, fontWeight: on ? 700 : 600, color: on ? 'var(--accent-pink)' : 'var(--text-secondary)' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-dim)', marginTop: 1 }}>{s.hint}</div>
              </a>
            );
          })}
        </div>
      </nav>

      {/* ── Content column ── */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 940 }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
            Marine PDM — System Dossier
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6, maxWidth: 720 }}>
            A deeper engineering reference than the{' '}
            <Link to="/help" style={{ color: 'var(--accent-blue)' }}>User Manual</Link> — the causal "why"
            behind every reading: what raises or lowers it, what it means for the engine as a whole, and how
            every parameter is coupled to every other. This assumes you already know the basic vocabulary
            (RPM/load, engine states, fault injection) from the User Manual; if you haven't read that yet,
            start there.
          </p>
        </div>

        <SystemIdentitySection />
        <ModuleArchitectureSection />
        <ParameterDossierSection />
        <InterconnectionSection />
        <DecisionDeepDiveSection />
        <PlaybookSection />
        <StrengthsSection />
        <LimitationsSection />
        <ReferenceTableSection />
        <GlossaryLinkSection />

        <div style={{ height: '40vh' }} aria-hidden />
      </div>
    </div>
  );
}
