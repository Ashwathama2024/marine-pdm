// packages/ui/src/about/sections/SectionsReference.tsx
// Dossier sections §9 All-Parameters Reference, §10 Glossary (link-only, no duplication).

import React from 'react';
import { Link } from 'react-router-dom';
import { Section, P, Callout, DataTable } from '../AboutPrimitives';
import { DOSSIER_ENTRIES } from '../dossier-data';

function go(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

export function ReferenceTableSection() {
  const rows = DOSSIER_ENTRIES.map(e => [
    e.tag,
    e.name,
    e.unit,
    e.rated,
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{e.relatedFaults.length ? e.relatedFaults : <span style={{ color: 'var(--text-dim)' }}>—</span>}</span>,
    <a href={`#${e.id}`} onClick={go(e.id)} style={{ color: 'var(--accent-pink)', fontSize: 11, whiteSpace: 'nowrap' }}>
      full detail →
    </a>,
  ]);
  return (
    <Section id="ref-table" title="9 · All-Parameters Reference"
      subtitle="Every dossier entry in one table. Rated values and related faults are read from the same computed data that builds the cards in §3, so the two views can never disagree.">
      <DataTable
        columns={['Tag', 'Name', 'Unit', 'Rated (85% / 1150 RPM)', 'Related faults', '']}
        colWidths={['150px', '210px', '90px', undefined, '160px', '80px']}
        rows={rows}
      />
      <P>Full alarm bands, causal reasoning, and coupled-parameter lists for each row live in its §3 card — click "full detail" to jump there.</P>
    </Section>
  );
}

export function GlossaryLinkSection() {
  return (
    <Section id="ref-glossary" title="10 · Glossary">
      <Callout kind="info">
        Abbreviations (SFOC, TC/ETC, HT/LT, ECS, IPMS, MCR…), ECS alarm-code prefixes (SS/HI/LO/SD,
        W-number work orders), and pointers into the codebase all live in the{' '}
        <Link to="/help#glossary" style={{ color: 'var(--accent-blue)' }}>User Manual's Glossary</Link> —
        this dossier assumes you have it open in another tab rather than repeating it here.
      </Callout>
    </Section>
  );
}
