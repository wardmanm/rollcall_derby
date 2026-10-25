import type { Meta, StoryObj } from '@storybook/react-vite';
import { FontSample } from './FontSample.tsx';

// Storybook has no Rollcall server, so the font itself doesn't load: the sample falls back to the system font, as it
// does on the Fonts page while a font loads.
const meta = {
  title: 'Fonts/FontSample',
  component: FontSample,
  args: { family: 'Inter' },
} satisfies Meta<typeof FontSample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Regular: Story = {};

export const Bold: Story = { args: { weight: 700 } };

export const MissingFamily: Story = { args: { family: 'Not In The Library' } };
