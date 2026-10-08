import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import type { Preview } from '@storybook/react-vite';

// Every admin story renders inside MantineProvider, as App.tsx does. The toolbar switches light and dark.
const preview: Preview = {
  globalTypes: {
    colorScheme: {
      description: 'Mantine color scheme',
      toolbar: {
        title: 'Color scheme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { colorScheme: 'light' },
  // Story tests fail on any accessibility violation (ADR-0015).
  parameters: { a11y: { test: 'error' } },
  tags: ['autodocs'],
  decorators: [
    (Story, { globals }) => (
      <MantineProvider forceColorScheme={globals.colorScheme === 'dark' ? 'dark' : 'light'}>
        <Story />
      </MantineProvider>
    ),
  ],
};

export default preview;
