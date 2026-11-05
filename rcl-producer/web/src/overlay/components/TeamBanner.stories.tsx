import type { Meta, StoryObj } from '@storybook/react-vite';
import { TeamBanner } from './TeamBanner.tsx';
import { LOGO_URL } from './roster/story-images.ts';

const meta = {
  title: 'Components/TeamBanner',
  component: TeamBanner,
  args: {
    team: {
      name: 'Harbour City Wreckers',
      leagueName: 'Harbour City Roller Derby',
      logoUrl: LOGO_URL,
      primaryColor: '#b3123f',
      secondaryColor: '#f5c518',
    },
  },
} satisfies Meta<typeof TeamBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLogo: Story = {};

export const NoLogo: Story = { args: { team: { ...meta.args.team, logoUrl: null } } };

export const NoLeague: Story = { args: { team: { ...meta.args.team, leagueName: null } } };

// The worst case: a 64-character team name must stay inside the bar, on at most two lines.
export const LongestName: Story = {
  args: { team: { ...meta.args.team, name: 'Greater Metropolitan Harbour City Roller Derby Wreckers Reserves' } },
};
