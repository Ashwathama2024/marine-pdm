// engine3d/MagButton.tsx — the magnetic button the .mag-btn class was always built for.
//
// global.css already gives .mag-btn a spring easing and will-change:transform, but nothing ever
// drove it. This supplies the missing half: the button leans toward the cursor while hovered and
// springs back on leave. The pull is deliberately small — this is a dense instrument panel, not a
// marketing page, and a button that moves far enough to escape the pointer is just annoying.
//
// Transform is written straight to the node rather than through state: 12 of these live in the dock
// and re-rendering them on mousemove would be absurd.

import React, { useCallback, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** Maximum pull, in px, reached at the button's edge. */
const PULL_X = 5;
const PULL_Y = 3;

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  /** Renders as a toggle and reports state to assistive tech. */
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function MagButton({
  children,
  onClick,
  pressed,
  disabled,
  title,
  ariaLabel,
  className = '',
  style,
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (reduced || disabled) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      el.style.transform = `translate(${(dx * PULL_X).toFixed(2)}px, ${(dy * PULL_Y).toFixed(2)}px)`;
    },
    [reduced, disabled],
  );

  const release = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = '';
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className={`mag-btn e3d-btn ${className}`}
      style={style}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={release}
      onBlur={release}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}
