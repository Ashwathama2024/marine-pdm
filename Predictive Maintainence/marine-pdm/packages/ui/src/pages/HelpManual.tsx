// packages/ui/src/pages/HelpManual.tsx
//
// In-app User Manual (`/help`) — one long scrollable reference with a sticky TOC index (scroll-spy)
// and clearly-labelled LIVE mini-examples. Content is composed from the src/help/ section components;
// the index is driven by HELP_SECTIONS so it stays in sync with what is rendered.

import React from 'react';
import { HELP_SECTIONS } from '../help/HelpPrimitives';
import { OverviewSection, QuickStartSection, EngineStatesSection } from '../help/sections/SectionsCore';
import { PhysicsSection } from '../help/sections/SectionsPhysics';
import { FaultsSection, SensorFailuresSection } from '../help/sections/SectionsFaults';
import { AlgorithmSection, DegradationSection } from '../help/sections/SectionsAlgo';
import { PredictionSection } from '../help/sections/SectionsPredict';
import { JarvisSection } from '../help/sections/SectionsJarvis';
import { PagesSection, GraphsSection, LegendSection, GlossarySection } from '../help/sections/SectionsUI';

// Cross-route hash links (e.g. from /about) don't auto-scroll under React Router — resolve on mount.
function useHashScrollOnMount() {
  React.useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    }
  }, []);
}

function useScrollSpy(ids: string[]): string {
  const [active, setActive] = React.useState(ids[0] ?? '');
  React.useEffect(() => {
    const els = ids.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      entries => {
        // Pick the entry nearest the top of the viewport that is intersecting.
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

export function HelpManual() {
  const ids = React.useMemo(() => HELP_SECTIONS.map(s => s.id), []);
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
          {HELP_SECTIONS.map(s => {
            const on = active === s.id;
            return (
              <a key={s.id} href={`#${s.id}`} onClick={go(s.id)} style={{
                display: 'block', padding: '7px 10px', borderRadius: 6, textDecoration: 'none',
                borderLeft: `2px solid ${on ? 'var(--risk-normal)' : 'transparent'}`,
                background: on ? 'rgba(0,212,170,0.08)' : 'transparent',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 11.5, fontWeight: on ? 700 : 600, color: on ? 'var(--risk-normal)' : 'var(--text-secondary)' }}>
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
            Marine PDM — Operator’s Manual
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6, maxWidth: 720 }}>
            A complete, no-black-boxes reference to the MTU 8000 predictive-maintenance twin: every page, every
            graph, the physics behind each sensor, and exactly how the algorithm decides. Use the index to jump;
            everything is on one page so <kbd style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Ctrl-F</kbd> searches all of it.
          </p>
        </div>

        <OverviewSection />
        <QuickStartSection />
        <PhysicsSection />
        <EngineStatesSection />
        <FaultsSection />
        <SensorFailuresSection />
        <AlgorithmSection />
        <DegradationSection />
        <PredictionSection />
        <JarvisSection />
        <PagesSection />
        <GraphsSection />
        <LegendSection />
        <GlossarySection />

        <div style={{ height: '40vh' }} aria-hidden />
      </div>
    </div>
  );
}
