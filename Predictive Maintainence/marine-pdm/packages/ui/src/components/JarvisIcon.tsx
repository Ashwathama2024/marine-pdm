import React from 'react';

// Arc-reactor JARVIS mark — concentric rings + a pulsing core on the teal→blue brand palette.
// Used by the floating assistant button and the sidebar nav item.
//   size  — px width/height (square viewBox 0 0 24 24)
//   spin  — continuously rotate the outer ring (JARVIS is busy / thinking)
//   mono  — single `currentColor` stroke (sidebar inherits --nav-color); no gradient
// Animations are scoped to a per-instance class so no global CSS is touched.
interface Props { size?: number; spin?: boolean; mono?: boolean; }

export function JarvisIcon({ size = 24, spin = false, mono = false }: Props) {
  const rid = React.useId().replace(/[:]/g, '');
  const gid = `jarvisGrad-${rid}`;
  const cls = `jarvisIcon-${rid}`;
  const paint = mono ? 'currentColor' : `url(#${gid})`;

  return (
    <span className={cls} style={{ display: 'inline-flex', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        {!mono && (
          <defs>
            <linearGradient id={gid} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#00D4AA" />
              <stop offset="1" stopColor="#38BDF8" />
            </linearGradient>
          </defs>
        )}
        {/* Outer segmented ring — rotates on hover, or continuously while `spin` */}
        <circle className="ji-outer" cx="12" cy="12" r="10.2" stroke={paint} strokeWidth="1.3"
          strokeDasharray="2.6 3.2" strokeLinecap="round" opacity="0.75" />
        {/* Inner containment ring */}
        <circle cx="12" cy="12" r="6.6" stroke={paint} strokeWidth="1.2" opacity="0.9" />
        {/* Four radial spokes toward the core */}
        <g stroke={paint} strokeWidth="1.2" strokeLinecap="round" opacity="0.85">
          <line x1="12" y1="5.4" x2="12" y2="8.4" />
          <line x1="12" y1="15.6" x2="12" y2="18.6" />
          <line x1="5.4" y1="12" x2="8.4" y2="12" />
          <line x1="15.6" y1="12" x2="18.6" y2="12" />
        </g>
        {/* Pulsing core */}
        <circle className="ji-core" cx="12" cy="12" r="3" fill={paint} opacity="0.95" />
      </svg>
      <style>{`
        .${cls} .ji-outer { transform-box: fill-box; transform-origin: center; }
        .${cls} .ji-core  { transform-box: fill-box; transform-origin: center;
          animation: ${cls}-pulse 2.4s ease-in-out infinite; }
        .${cls}:hover .ji-outer { animation: ${cls}-spin 6s linear infinite; }
        ${spin ? `.${cls} .ji-outer { animation: ${cls}-spin 1.5s linear infinite; }` : ''}
        @keyframes ${cls}-spin  { to { transform: rotate(360deg); } }
        @keyframes ${cls}-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>
    </span>
  );
}
