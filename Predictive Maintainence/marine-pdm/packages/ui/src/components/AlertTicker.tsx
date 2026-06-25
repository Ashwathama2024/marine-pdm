// Fixed-bottom slow-marquee ticker showing active decision engine alerts.
// Runs at ~40s per cycle — slow enough to read, fast enough to feel live.

import React, { useRef, useEffect, useState } from 'react';
import { useEngine } from '../context/EngineContext';
import { useDegradation } from '../context/DegradationContext';

function riskColor(score: number): string {
  if (score >= 75) return 'var(--risk-critical)';
  if (score >= 50) return 'var(--risk-high)';
  if (score >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

interface TickerItem {
  key: string;
  color: string;
  glyph: string;
  text: string;
}

export function AlertTicker() {
  const { decision, snapshot, isOperational } = useEngine();
  const { activeEvents } = useDegradation();
  const [paused, setPaused] = useState(false);

  // Build ticker items from decision alerts + active degradation events
  // Suppress during pre-start — decision.alerts fire false positives at 0-bar lube
  const items: TickerItem[] = [];

  if (isOperational && decision) {
    for (const a of decision.alerts) {
      items.push({
        key: `alert_${a.component}`,
        color: riskColor(a.riskScore),
        glyph: a.riskScore >= 75 ? '◆' : '▲',
        text: `${a.component.toUpperCase()} — ${a.issue} · ${a.recommendedAction}${a.ecsAlarmCode ? ` [${a.ecsAlarmCode}]` : ''}`,
      });
    }
  }

  for (const ev of activeEvents) {
    const col = ev.severity === 'ACTION' ? 'var(--risk-high)'
      : ev.severity === 'CAUTION' ? 'var(--risk-warning)'
      : 'var(--accent-blue)';
    items.push({
      key: `deg_${ev.id}`,
      color: col,
      glyph: '●',
      text: `DEGRADATION · ${ev.label} ${ev.direction === 'falling' ? '↓' : '↑'} — ${ev.rootCause} — Acknowledge on dashboard`,
    });
  }

  // Status items when nothing active
  const hasContent = items.length > 0;
  const statusItems: TickerItem[] = snapshot
    ? [
        isOperational
          ? {
              key: 'status',
              color: 'var(--risk-normal)',
              glyph: '●',
              text: `ALL SYSTEMS NOMINAL · RPM ${snapshot.rpm.toFixed(0)} · LOAD ${snapshot.load.toFixed(0)}% · EXHAUST ${snapshot.exhaustTemp.toFixed(1)}°C · LO PRESS ${snapshot.lubeOilPressure.toFixed(2)} bar · TC ${snapshot.tcRPM.toFixed(0)} RPM`,
            }
          : {
              key: 'prestart',
              color: 'var(--text-dim)',
              glyph: '○',
              text: `ENGINE PRE-START · RPM ${snapshot.rpm.toFixed(0)} · LO ${snapshot.lubeOilPressure.toFixed(2)} bar · COOLANT ${snapshot.jacketOutlet.toFixed(1)}°C · Complete start sequence on Simulator page`,
            },
      ]
    : [];

  const displayItems = hasContent ? items : statusItems;
  if (displayItems.length === 0) return null;

  // Build the full ticker string
  const separator = '     ◇     ';
  const fullText = displayItems
    .map(it => `${it.glyph}  ${it.text}`)
    .join(separator);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 36,
        background: 'rgba(4, 12, 24, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${hasContent ? 'rgba(239,68,68,0.25)' : 'rgba(56,189,248,0.12)'}`,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Left label */}
      <div style={{
        flexShrink: 0,
        padding: '0 12px',
        borderRight: `1px solid ${hasContent ? 'rgba(239,68,68,0.3)' : 'rgba(56,189,248,0.2)'}`,
        height: '100%',
        display: 'flex', alignItems: 'center', gap: 6,
        background: hasContent ? 'rgba(239,68,68,0.08)' : 'rgba(0,212,170,0.05)',
      }}>
        {hasContent && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--risk-critical)', boxShadow: '0 0 6px var(--risk-critical)', display: 'inline-block', animation: 'pulse-dot 1s ease-in-out infinite' }} />}
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
          color: hasContent ? 'var(--risk-critical)' : 'var(--risk-normal)',
          whiteSpace: 'nowrap',
        }}>
          {hasContent ? `ALERTS (${items.length})` : 'STATUS'}
        </span>
      </div>

      {/* Scrolling content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%' }}>
        <div
          className={paused ? '' : 'ticker-scroll'}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            whiteSpace: 'nowrap',
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          {/* Duplicate content for seamless loop */}
          {[0, 1].map(pass => (
            <span key={pass} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
              {displayItems.map((item, idx) => (
                <span key={`${pass}_${item.key}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11,
                    color: item.color,
                    fontWeight: 700,
                    marginRight: 6,
                    textShadow: `0 0 8px ${item.color}`,
                  }}>
                    {item.glyph}
                  </span>
                  <span style={{
                    fontSize: 10,
                    color: hasContent ? 'var(--text-primary)' : 'var(--text-secondary)',
                    letterSpacing: '0.03em',
                    marginRight: 28,
                  }}>
                    {item.text}
                  </span>
                  {idx < displayItems.length - 1 && (
                    <span style={{ color: 'var(--border-hi)', marginRight: 28, fontSize: 8 }}>◇</span>
                  )}
                </span>
              ))}
              <span style={{ display: 'inline-block', width: 60 }} />
            </span>
          ))}
        </div>
      </div>

      {/* Right: pause hint */}
      <div style={{
        flexShrink: 0, padding: '0 10px',
        fontSize: 8, color: 'var(--text-dim)',
        borderLeft: '1px solid var(--border-dim)',
        height: '100%', display: 'flex', alignItems: 'center',
      }}>
        {paused ? 'PAUSED' : 'HOVER TO PAUSE'}
      </div>
    </div>
  );
}
