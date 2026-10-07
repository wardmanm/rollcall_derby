import '../../src/overlay/theme-defaults.css';
import '../../src/overlay/themes/sample-themes.css';
import './frame.css';
import type { Preview } from '@storybook/react-vite';
import { expect } from 'storybook/test';

const THEME_CLASSES: Record<string, string> = {
  default: '',
  light: 'sample-theme-light',
  'high-contrast': 'sample-theme-high-contrast',
};

const BACKDROP_CLASSES: Record<string, string> = {
  checkerboard: 'backdrop-checkerboard',
  dark: 'backdrop-dark',
  bright: 'backdrop-bright',
};

const classFor = (classes: Record<string, string>, value: unknown, fallback: string) =>
  (typeof value === 'string' ? classes[value] : undefined) ?? classes[fallback] ?? '';

// Overlay stories render the way OBS shows them: no Mantine, theme variables set on the root element
// (ADR-0006), over a backdrop.
const preview: Preview = {
  globalTypes: {
    overlayTheme: {
      description: 'Sample theme (until the Theme Builder makes real ones)',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'default', title: 'Default' },
          { value: 'light', title: 'Light' },
          { value: 'high-contrast', title: 'High contrast' },
        ],
        dynamicTitle: true,
      },
    },
    backdrop: {
      description: 'What is behind the transparent overlay',
      toolbar: {
        title: 'Backdrop',
        icon: 'photo',
        items: [
          { value: 'checkerboard', title: 'Checkerboard' },
          { value: 'dark', title: 'Dark (game footage)' },
          { value: 'bright', title: 'Bright (light arena)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { overlayTheme: 'default', backdrop: 'checkerboard' },
  // Story tests fail on any accessibility violation (ADR-0015).
  parameters: { a11y: { test: 'error' }, layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story, { globals }) => (
      <div className={`overlay-frame ${classFor(BACKDROP_CLASSES, globals.backdrop, 'checkerboard')}`}>
        <div data-overlay-root className={classFor(THEME_CLASSES, globals.overlayTheme, 'default')}>
          <Story />
        </div>
      </div>
    ),
  ],
  // ADR-0006 in Storybook: no Mantine on the page, and theme variables reach the story's root.
  afterEach: async ({ canvasElement }) => {
    await expect(getComputedStyle(document.documentElement).getPropertyValue('--mantine-color-body')).toBe('');
    const root = canvasElement.querySelector('[data-overlay-root]');
    await expect(root).not.toBeNull();
    if (root) await expect(getComputedStyle(root).getPropertyValue('--theme-color-text').trim()).not.toBe('');
  },
};

export default preview;
