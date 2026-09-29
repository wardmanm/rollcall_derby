import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
