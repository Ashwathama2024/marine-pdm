// CSV escaping — the export path for training data, so a corrupted field silently shifts every column
// after it. The version this replaced (DeviationTable.exportCSV) did no escaping at all.

import { describe, it, expect } from 'vitest';
import { csvField, toCsvRow } from './csv';

/** Minimal RFC 4180 reader, used to prove the writer round-trips rather than just eyeballing quotes. */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

describe('csvField', () => {
  it('leaves plain values unquoted', () => {
    expect(csvField('HEALTHY')).toBe('HEALTHY');
    expect(csvField(42)).toBe('42');
    expect(csvField(-0.0031)).toBe('-0.0031');
  });

  it('renders null and undefined as empty, not as the strings', () => {
    // A literal "null" in a numeric column becomes NaN in pandas rather than a missing value.
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes fields containing a comma', () => {
    expect(csvField('cylA4+cylA5, bearing3')).toBe('"cylA4+cylA5, bearing3"');
  });

  it('doubles interior quotes', () => {
    expect(csvField('LO Filter "DP"')).toBe('"LO Filter ""DP"""');
  });

  it('quotes fields containing newlines', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('toCsvRow round-trip', () => {
  it('survives every hostile field a training row can carry', () => {
    const values = [
      'run-2026-07-30T10-00-00-000Z',
      1_753_872_000_000,
      'F01',
      'cylA4, cylA5',           // comma — the case that used to shift all later columns
      'evidence: "spread" high',// quotes
      'multi\nline',            // newline
      null,                     // missing RUL
      -0.0031,
      '',
    ];
    expect(parseCsvRow(toCsvRow(values))).toEqual([
      'run-2026-07-30T10-00-00-000Z',
      '1753872000000',
      'F01',
      'cylA4, cylA5',
      'evidence: "spread" high',
      'multi\nline',
      '',
      '-0.0031',
      '',
    ]);
  });

  it('keeps column count stable when a field contains delimiters', () => {
    const header = toCsvRow(['a', 'b', 'c']);
    const row = toCsvRow(['x,y', 'q"r', 'z']);
    expect(parseCsvRow(header)).toHaveLength(3);
    expect(parseCsvRow(row)).toHaveLength(3);
  });
});
