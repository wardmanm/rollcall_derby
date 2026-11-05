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
