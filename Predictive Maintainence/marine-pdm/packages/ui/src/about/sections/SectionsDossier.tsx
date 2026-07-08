// packages/ui/src/about/sections/SectionsDossier.tsx
// Dossier section §3 — the Parameter Dossier itself. All content is sourced from
// about/dossier-data.tsx; this file only renders it.

import React from 'react';
import { Section, P, ParameterDossier } from '../AboutPrimitives';
import { DOSSIER_ENTRIES } from '../dossier-data';

export function ParameterDossierSection() {
  return (
    <Section id="dossier" title="3 · Parameter Dossier"
      subtitle="Every monitored quantity, in depth: how to read it, what raises or lowers it, what a sustained change means for the engine as a whole, and what it's causally coupled to.">
      <P>
        13 entries, each following the same fixed structure so the shape becomes predictable as you read
        more of them. <strong>Mean Exhaust Temperature</strong> below is the fully worked example — read it
        first, since every other entry follows its shape with less repetition of the reasoning. Cylinder
        readings are treated as one consolidated entry (all 20 share one physical circuit and one reading
        skill), and lube oil's four sub-gauges (gallery / after-filter / piston-cooling / last-bearing) are
        one entry for the same reason.
      </P>
      <div style={{ marginTop: 16 }}>
        {DOSSIER_ENTRIES.map(entry => (
          <ParameterDossier key={entry.id} {...entry} />
        ))}
      </div>
    </Section>
  );
}
