import type { StorybookConfig } from '@storybook/react-vite';

// The admin Storybook: shared Mantine components from the admin app (ADR-0015). Overlay components have their
// own Storybook, so Mantine never loads next to them (ADR-0006). Nothing here calls home: telemetry, crash
// reports and update notices are off.
const config: StorybookConfig = {
  stories: ['../../src/!(overlay)/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true, enableCrashReports: false },
  // The overlay Storybook runs on its own (port 6007) and appears here as its own section (ADR-0015).
  refs: { overlay: { title: 'Overlay', url: 'http://localhost:6007' } },
};

export default config;
