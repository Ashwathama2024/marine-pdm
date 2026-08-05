// engine3d/useReducedMotion.ts — respect the OS "reduce motion" setting.
//
// This view animates a lot by nature: four turbochargers turning, a crankshaft, a breathing
// selection highlight and an optional firing wave. That is exactly the combination motion-sensitive
// users ask to be spared, so everything decorative is gated on this and only the data itself keeps
// moving.

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(QUERY)?.matches ?? false);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
