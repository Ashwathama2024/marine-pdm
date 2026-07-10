import React from 'react';
import { Link } from 'react-router-dom';

// Dependency-free markdown renderer for JARVIS chat bubbles. Supports headings (#/##/###),
// unordered/ordered lists, GFM tables, `>` callouts (colour keyed to risk keywords), fenced
// code, and inline **bold** / `code` / _italic_ / [label](/route) links. Colours come from the
// existing CSS risk palette in styles/global.css — no new palette invented.

const RISK = {
  critical: 'var(--risk-critical)',
  warning: 'var(--risk-warning)',
  normal: 'var(--risk-normal)',
  accent: 'var(--accent-blue)',
};

const codeStyle: React.CSSProperties = { background: 'rgba(56,189,248,0.12)', padding: '0 4px', borderRadius: 3, fontSize: '0.92em', fontFamily: 'var(--font-mono, monospace)' };
const linkStyle: React.CSSProperties = { color: 'var(--accent-blue)', textDecoration: 'none', borderBottom: '1px solid rgba(56,189,248,0.4)' };

// ── inline spans: bold / code / italic / link ────────────────────────────────────
function inline(text: string, kb: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  let last = 0, idx = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${kb}-${idx++}`;
    if (tok.startsWith('**')) parts.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={key} style={codeStyle}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('_')) parts.push(<em key={key} style={{ color: 'var(--text-muted)' }}>{tok.slice(1, -1)}</em>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (mm) {
        const [, label, href] = mm;
        parts.push(href.startsWith('/')
          ? <Link key={key} to={href} style={linkStyle}>{label}</Link>
          : <a key={key} href={href} target="_blank" rel="noreferrer" style={linkStyle}>{label}</a>);
      } else parts.push(tok);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const splitRow = (row: string): string[] =>
  row.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());

const isTableSep = (l: string): boolean =>
  l.includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(l);

function calloutColor(text: string): string {
  const t = text.toUpperCase();
  if (/⚠|CRITICAL|DANGER|SHUTDOWN|EMERGENCY|\bSS\b/.test(t)) return RISK.critical;
  if (/WARNING|CAUTION|ELEVATED|ALARM|\bHI\b/.test(t)) return RISK.warning;
  if (/\bOK\b|NORMAL|HEALTHY|STABLE|NOMINAL/.test(t)) return RISK.normal;
  return RISK.accent;
}

const headingStyle = (level: number): React.CSSProperties => ({
  fontSize: level === 1 ? 13 : level === 2 ? 12 : 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: level < 3 ? 'uppercase' : 'none',
  color: level === 1 ? 'var(--text-primary)' : 'var(--accent-blue)',
  margin: '4px 0 1px',
});

export function MessageMarkdown({ text }: { text: string }) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0, kc = 0;
  const nk = () => `b${kc++}`;

  while (i < lines.length) {
    const line = lines[i];
    const key = nk();

    // fenced code
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push(
        <pre key={key} style={{ margin: '2px 0', padding: '6px 8px', background: 'var(--bg-inset)', border: '1px solid var(--border-dim)', borderRadius: 6, overflowX: 'auto', fontSize: 10.5, lineHeight: 1.5 }}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // table (header row followed by a separator row)
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') { rows.push(splitRow(lines[i])); i++; }
      blocks.push(
        <div key={key} style={{ overflowX: 'auto', margin: '2px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
            <thead>
              <tr>{header.map((h, j) => (
                <th key={j} style={{ textAlign: 'left', padding: '3px 7px', borderBottom: '1px solid var(--glass-border)', color: 'var(--accent-blue)', fontWeight: 700, whiteSpace: 'nowrap' }}>{inline(h, `${key}h${j}`)}</th>
              ))}</tr>
            </thead>
            <tbody>{rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => (
                <td key={ci} style={{ padding: '3px 7px', borderBottom: '1px solid var(--border-dim)', color: 'var(--text-secondary)' }}>{inline(cell, `${key}r${ri}c${ci}`)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<div key={key} style={headingStyle(h[1].length)}>{inline(h[2], key)}</div>);
      i++; continue;
    }

    // callout (consecutive `>` lines)
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      const joined = buf.join('\n');
      const color = calloutColor(joined);
      blocks.push(
        <div key={key} style={{ borderLeft: `3px solid ${color}`, background: 'rgba(255,255,255,0.03)', padding: '4px 9px', borderRadius: '0 5px 5px 0', margin: '2px 0', color: 'var(--text-secondary)' }}>
          {buf.map((ln, j) => <React.Fragment key={j}>{inline(ln, `${key}-${j}`)}{j < buf.length - 1 && <br />}</React.Fragment>)}
        </div>,
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push(
        <ul key={key} style={{ margin: '2px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>)}
        </ul>,
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      blocks.push(
        <ol key={key} style={{ margin: '2px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>)}
        </ol>,
      );
      continue;
    }

    // blank line
    if (line.trim() === '') { i++; continue; }

    // paragraph — gather consecutive plain lines
    const buf: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !/^\s*```/.test(lines[i]) && !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) { buf.push(lines[i]); i++; }
    blocks.push(
      <div key={key} style={{ lineHeight: 1.55 }}>
        {buf.map((ln, j) => <React.Fragment key={j}>{inline(ln, `${key}-${j}`)}{j < buf.length - 1 && <br />}</React.Fragment>)}
      </div>,
    );
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{blocks}</div>;
}
