import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlaceholderCard } from './PlaceholderCard.tsx';

const meta = {
  title: 'Components/PlaceholderCard',
  component: PlaceholderCard,
  args: { title: 'OBS Producer', subtitle: 'v0.2.0' },
} satisfies Meta<typeof PlaceholderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSubtitle: Story = {};

export const WithoutSubtitle: Story = { args: { subtitle: undefined } };

export const LongTitle: Story = {
  args: { title: 'Grand Raggidy Roller Derby vs. Gotham Girls Roller Derby: Championship Final' },
};

// Pinned to each sample theme, so the accessibility check covers them in CI as well.
export const LightTheme: Story = { globals: { overlayTheme: 'light' } };

export const HighContrastTheme: Story = { globals: { overlayTheme: 'high-contrast' } };
