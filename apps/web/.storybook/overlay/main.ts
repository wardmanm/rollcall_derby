import type { StorybookConfig } from '@storybook/react-vite';

// The overlay Storybook (ADR-0015): overlay components exactly as OBS renders them, so no Mantine anywhere
// (ADR-0006). Telemetry, crash reports and update notices are off.
const config: StorybookConfig = {
  stories: ['../../src/overlay/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true, enableCrashReports: false },
};

export default config;
