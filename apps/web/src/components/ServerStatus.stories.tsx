import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect } from 'storybook/test';
import { makeStore } from '../store/store.ts';
import { ServerStatus } from './ServerStatus.tsx';

const HEALTH = { status: 'ok', name: 'OBS Producer', version: '0.2.0', uptimeSeconds: 42 };

// Stories run without a server: each one answers the app's requests itself, then puts the real fetch back.
function answerRequests(respond: () => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = respond;
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}

const meta = {
  title: 'Components/ServerStatus',
  component: ServerStatus,
  // A fresh copy of the app's store for each story, so RTK Query starts empty every time.
  decorators: [
    (Story) => (
      <Provider store={makeStore()}>
        <Story />
      </Provider>
    ),
  ],
} satisfies Meta<typeof ServerStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {
  beforeEach: answerRequests(async () => Response.json(HEALTH)),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Server v0.2.0')).toBeVisible();
  },
};

export const Unreachable: Story = {
  beforeEach: answerRequests(async () => {
    throw new TypeError('Failed to fetch');
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Server unreachable')).toBeVisible();
  },
};

export const Checking: Story = {
  beforeEach: answerRequests(() => new Promise<Response>(() => undefined)),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Checking server')).toBeVisible();
  },
};
