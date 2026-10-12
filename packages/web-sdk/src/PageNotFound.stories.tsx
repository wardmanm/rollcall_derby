import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import { expect } from 'storybook/test';
import { PageNotFound } from './PageNotFound.tsx';

const meta = {
  title: 'Components/PageNotFound',
  component: PageNotFound,
  // Inside a router, since it links to the app's home page.
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof PageNotFound>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: "Go to this app's home page" })).toBeVisible();
  },
};
