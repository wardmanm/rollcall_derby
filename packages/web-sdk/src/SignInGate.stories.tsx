import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { expect } from 'storybook/test';
import { SignInGate } from './SignInGate.tsx';
import { makeStore } from './store.ts';
import { answerRequests } from './test/answer-requests.ts';

const meta = {
  title: 'Components/SignInGate',
  component: SignInGate,
  args: { children: <p>The page behind the gate</p> },
  // A fresh store for each story, inside a router, since the gate sends people to other pages.
  decorators: [
    (Story) => (
      <Provider store={makeStore()}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </Provider>
    ),
  ],
} satisfies Meta<typeof SignInGate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {
  beforeEach: answerRequests(async (request) =>
    Response.json(
      new URL(request.url).pathname === '/api/core/setup'
        ? { needsSetup: false, canSetupHere: false }
        : { id: 'u1', username: 'admin', role: 'admin', mustChangePassword: false, permissions: [] },
    ),
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('The page behind the gate')).toBeVisible();
  },
};

export const ServerUnreachable: Story = {
  beforeEach: answerRequests(async () => {
    throw new TypeError('Failed to fetch');
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Can't reach the Rollcall server")).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeVisible();
  },
};

export const Checking: Story = {
  beforeEach: answerRequests(() => new Promise<Response>(() => undefined)),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Checking who's signed in")).toBeVisible();
  },
};
