// engine3d/useFullscreen.ts — put one element into the browser's real fullscreen.
//
// The real Fullscreen API rather than a CSS position:fixed overlay, for two reasons: the app shell
// (sidebar, header, alert ticker) genuinely leaves the screen instead of being covered, and Escape
// works the way a user already expects without us binding a key.
//
// The awkward parts, and why the DOM calls are wrapped rather than inlined at the call site:
//   • Safari still exposes only the webkit-prefixed names, so both spellings must be tried.
//   • The user can leave fullscreen by ways we never hear about directly — Escape, F11, switching
//     tabs — so the state has to be driven by the `fullscreenchange` event, never by assuming the
//     request succeeded.
//   • requestFullscreen REJECTS rather than throws when it is refused (no user gesture, an iframe
//     without allow="fullscreen"). An unhandled rejection there would surface as a console error on
//     a button press, so it is swallowed and the state simply stays false.

import { useCallback, useEffect, useState } from 'react';

interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FullscreenCapableDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/** The element currently fullscreen, across both spellings. Exported for tests. */
export function currentFullscreenElement(doc: Document = document): Element | null {
  const d = doc as FullscreenCapableDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Whether this browser will do fullscreen at all. */
export function fullscreenSupported(doc: Document = document): boolean {
  const el = doc.documentElement as FullscreenCapableElement;
  return typeof el.requestFullscreen === 'function'
    || typeof el.webkitRequestFullscreen === 'function';
}

export interface FullscreenState {
  /** True while `ref.current` is the fullscreen element. */
  active: boolean;
  /** False when the browser cannot do it — callers should hide the control rather than dead-end it. */
  supported: boolean;
  toggle: () => void;
  exit: () => void;
}

export function useFullscreen(ref: React.RefObject<HTMLElement>): FullscreenState {
  const [active, setActive] = useState(false);
  const [supported] = useState(() =>
    typeof document !== 'undefined' && fullscreenSupported(),
  );

  // Driven by the event, not by the outcome of our own call: Escape and F11 bypass us entirely.
  useEffect(() => {
    const sync = () => setActive(currentFullscreenElement() === ref.current);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [ref]);

  const exit = useCallback(() => {
    const d = document as FullscreenCapableDocument;
    if (!currentFullscreenElement()) return;
    void Promise.resolve(
      d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.(),
    ).catch(() => { /* already out, or refused — the event listener is the source of truth */ });
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current as FullscreenCapableElement | null;
    if (!el) return;
    if (currentFullscreenElement() === el) {
      exit();
      return;
    }
    void Promise.resolve(
      el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.(),
    ).catch(() => { /* refused: no gesture, or embedded without allow="fullscreen" */ });
  }, [ref, exit]);

  return { active, supported, toggle, exit };
}
