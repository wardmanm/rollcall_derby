import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThemeSample } from './ThemeSample.tsx';

const meta = {
  title: 'Components/ThemeSample',
  component: ThemeSample,
} satisfies Meta<typeof ThemeSample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithExtraColors: Story = { args: { extras: ['gold', 'team-2'] } };

// Pinned to each sample theme, so the accessibility check covers them in CI as well.
export const LightTheme: Story = { globals: { overlayTheme: 'light' } };

export const HighContrastTheme: Story = { globals: { overlayTheme: 'high-contrast' } };
