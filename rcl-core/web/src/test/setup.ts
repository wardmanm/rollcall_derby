import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Most web tests run in jsdom; a few (e.g. the overlay bundle check) opt into Node with
// `// @vitest-environment node`, so only touch browser globals when they exist.
if (typeof window !== 'undefined') {
  // jsdom lacks these browser APIs, which Mantine uses for color scheme and layout.
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;

  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  afterEach(() => cleanup());
}
