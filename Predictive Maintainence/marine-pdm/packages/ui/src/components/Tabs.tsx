import React, { useState } from 'react';

export interface TabDef {
  id: string;
  label: string;
  content: React.ReactNode;
  badge?: number;          // optional count chip
  badgeColor?: string;
}

interface Props {
  tabs: TabDef[];
  initial?: string;
}

// Reusable tab bar + single active panel. Only the active tab's content is mounted,
// so inactive analysis views don't run their hooks (cheap) and the page shows one
// view at a time — the core "analyse, don't scroll/hop" mechanism.
export function Tabs({ tabs, initial }: Props) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find(t => t.id === active) ?? tabs[0];

  return (
    <div>
      <div style={{
        display: 'flex', gap: 2, marginBottom: 16, overflowX: 'auto',
        borderBottom: '1px solid var(--border-dim)',
      }}>
        {tabs.map(t => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', fontFamily: 'var(--font)',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                background: on ? 'rgba(56,189,248,0.06)' : 'transparent',
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                color: on ? 'var(--accent-blue)' : 'var(--text-muted)',
                borderBottom: `2px solid ${on ? 'var(--accent-blue)' : 'transparent'}`,
                transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              }}
            >
              {t.label}
              {t.badge ? (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                  background: `${t.badgeColor ?? 'var(--risk-critical)'}22`,
                  border: `1px solid ${t.badgeColor ?? 'var(--risk-critical)'}66`,
                  color: t.badgeColor ?? 'var(--risk-critical)',
                }}>
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div>{current?.content}</div>
    </div>
  );
}
