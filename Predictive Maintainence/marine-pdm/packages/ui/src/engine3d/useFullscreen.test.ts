// Fullscreen capability detection, across both spellings of the API.
//
// SCOPE. The suite runs in a plain Node environment (vitest.config.ts) with no jsdom, so the hook's
// event wiring — the fullscreenchange listener that catches Escape and F11 — cannot be exercised
// here. What is covered is the part that silently does the wrong thing on one browser and is
// invisible on the others: which of the two spellings gets picked. The listener registers BOTH
// event names for the same reason.

import { describe, expect, it } from 'vitest';
import { currentFullscreenElement, fullscreenSupported } from './useFullscreen';

const el = (name: string) => ({ name }) as unknown as Element;

/** A stand-in Document exposing whichever subset of the API a given browser would. */
function fakeDoc(opts: {
  standard?: boolean;
  webkit?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
}): Document {
  const documentElement: Record<string, unknown> = {};
  if (opts.standard) documentElement.requestFullscreen = () => Promise.resolve();
  if (opts.webkit) documentElement.webkitRequestFullscreen = () => Promise.resolve();
  return {
    documentElement,
    fullscreenElement: opts.fullscreenElement ?? null,
    webkitFullscreenElement: opts.webkitFullscreenElement ?? null,
  } as unknown as Document;
}

describe('capability detection', () => {
  it('accepts a browser with only the standard API', () => {
    expect(fullscreenSupported(fakeDoc({ standard: true }))).toBe(true);
  });

  it('accepts a browser with only the webkit-prefixed API', () => {
    // Safari. Testing for the unprefixed name alone would hide the control on a browser that can
    // do it perfectly well.
    expect(fullscreenSupported(fakeDoc({ webkit: true }))).toBe(true);
  });

  it('reports unsupported when neither exists, so the control can be hidden', () => {
    expect(fullscreenSupported(fakeDoc({}))).toBe(false);
  });
});

describe('reading the current fullscreen element', () => {
  const target = el('shell');

  it('finds it under the standard property', () => {
    expect(currentFullscreenElement(fakeDoc({ fullscreenElement: target }))).toBe(target);
  });

  it('finds it under the webkit property', () => {
    expect(currentFullscreenElement(fakeDoc({ webkitFullscreenElement: target }))).toBe(target);
  });

  it('returns null when nothing is fullscreen', () => {
    expect(currentFullscreenElement(fakeDoc({}))).toBeNull();
  });

  it('does not confuse "no element" with "property absent"', () => {
    // ?? rather than || matters here: a browser mid-transition reports null, and falling through to
    // the other spelling on a falsy value would be reading a property that means something else.
    const doc = fakeDoc({ fullscreenElement: null, webkitFullscreenElement: target });
    expect(currentFullscreenElement(doc)).toBe(target);
  });
});
