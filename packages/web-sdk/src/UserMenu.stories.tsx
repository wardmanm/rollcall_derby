import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { expect, screen, waitFor } from 'storybook/test';
import type { CurrentUser } from '@rollcall/core-contract';
import { makeStore } from './store.ts';
import { answerRequests } from './test/answer-requests.ts';
import { UserMenu } from './UserMenu.tsx';

const signedInAs = (user: CurrentUser) => answerRequests(async () => Response.json(user));

const meta = {
  title: 'Components/UserMenu',
  component: UserMenu,
  // A fresh store for each story, inside a router, since the menu's items move between pages.
  decorators: [
    (Story) => (
      <Provider store={makeStore()}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </Provider>
    ),
  ],
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Admin: Story = {
  beforeEach: signedInAs({
    id: 'u1',
    username: 'admin',
    role: 'admin',
    mustChangePassword: false,
    permissions: ['core:users.manage'],
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'admin Admin' }));
    // The menu fades in, so wait for it to finish.
    const logOut = await screen.findByRole('menuitem', { name: 'Log out' });
    await waitFor(() => expect(logOut).toBeVisible());
  },
};

export const Announcer: Story = {
  beforeEach: signedInAs({
    id: 'u2',
    username: 'announcer1',
    role: 'announcer',
    mustChangePassword: false,
    permissions: [],
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'announcer1 Announcer' })).toBeVisible();
  },
};
