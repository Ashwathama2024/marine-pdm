// Durable operator feedback on pattern accuracy.
//
// patternLibrary is an in-memory singleton, so its timesTriggered / timesConfirmed /
// timesFalsePositive counters reset on every reload. Those three numbers are the only record of
// whether P01–P08 actually fire correctly — they drive getSuggestion()'s false-positive and miss-rate
// math — and throwing them away each session means the library can never accumulate enough
// observations to say anything. The operator's Confirm / False-Alarm clicks are also, in ML terms,
// hand-labelled ground truth about the RULES engine, which is worth keeping alongside the tick data.
//
// Stored in the training DB's `meta` store rather than localStorage: it belongs with the run data it
// describes, and gets wiped by the same "Wipe Database" action.

import { patternLibrary } from '@marine-pdm/knowledge';
import { putMeta, getMeta } from './training-store';

const META_KEY = 'pattern-feedback';

type Counters = Record<string, { triggered: number; confirmed: number; falsePositive: number }>;

function snapshotCounters(): Counters {
  const out: Counters = {};
  for (const p of patternLibrary.getAll()) {
    // Only carry patterns that have actually been observed — a table of zeroes is noise.
    if (p.timesTriggered === 0 && p.timesConfirmed === 0 && p.timesFalsePositive === 0) continue;
    out[p.id] = { triggered: p.timesTriggered, confirmed: p.timesConfirmed, falsePositive: p.timesFalsePositive };
  }
  return out;
}

/** Persist the current counters. Call after any recordOutcome / trigger. */
export async function savePatternFeedback(): Promise<void> {
  try { await putMeta(META_KEY, snapshotCounters()); } catch { /* non-fatal */ }
}

/**
 * Restore counters into the in-memory library at startup. Additive onto whatever the library already
 * has, because seedKnowledgeBase() may itself have set non-zero values.
 */
export async function restorePatternFeedback(): Promise<void> {
  let stored: Counters | undefined;
  try { stored = await getMeta<Counters>(META_KEY); } catch { return; }
  if (!stored) return;

  for (const [id, c] of Object.entries(stored)) {
    const p = patternLibrary.getPattern(id);
    if (!p) continue;
    // recordOutcome/registerTrigger are the only mutators, and they increment by one, so replay the
    // stored totals through them rather than reaching into the pattern object.
    const missingConfirmed = Math.max(0, c.confirmed - p.timesConfirmed);
    const missingFalse = Math.max(0, c.falsePositive - p.timesFalsePositive);
    for (let i = 0; i < missingConfirmed; i++) patternLibrary.recordOutcome(id, 'CONFIRMED');
    for (let i = 0; i < missingFalse; i++) patternLibrary.recordOutcome(id, 'FALSE_POSITIVE');
  }
}

export async function getStoredPatternFeedback(): Promise<Counters> {
  try { return (await getMeta<Counters>(META_KEY)) ?? {}; } catch { return {}; }
}
