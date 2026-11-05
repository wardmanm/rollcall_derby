import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RosterCard } from '@rollcall/producer-contract';
import { PersonCard } from './PersonCard.tsx';
import { cssVars } from './roster/css-vars.ts';
import { teamColorVariables } from './roster/team-colors.ts';
import { LOGO_URL, PHOTO_URL } from './roster/story-images.ts';

const team = {
  name: 'Harbour City Wreckers',
  leagueName: null,
  logoUrl: LOGO_URL,
  primaryColor: '#b3123f',
  secondaryColor: '#f5c518',
};

const skater: RosterCard = {
  id: 'm1',
  kind: 'skater',
  name: 'Jammy Dodger',
  number: '07',
  roleLine: 'Captain · she/her',
  photoUrl: PHOTO_URL,
};

const meta = {
  title: 'Components/PersonCard',
  component: PersonCard,
  args: { card: skater, width: 420, logoUrl: LOGO_URL },
  decorators: [
    (Story) => (
      <div style={cssVars(teamColorVariables(team))}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PersonCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Skater: Story = {};

export const BenchStaff: Story = {
  args: { card: { ...skater, id: 'b1', kind: 'bench', name: 'Ref Erence', number: null, roleLine: 'Head coach' } },
};

// A role line too long for one line, so it takes two; the card is the same height as any other.
export const TwoLineRoleLine: Story = {
  args: { card: { ...skater, roleLine: 'Captain · Lead Jammer · Penalty Box Timekeeper · she/her' } },
};

export const PronounsOff: Story = {
  args: { card: { ...skater, roleLine: 'Captain · Lead Jammer · Penalty Box Timekeeper' } },
};

export const NoRoleLine: Story = { args: { card: { ...skater, roleLine: '' } } };

export const NoPhoto: Story = { args: { card: { ...skater, photoUrl: null } } };

export const NoPhotoNoLogo: Story = { args: { card: { ...skater, photoUrl: null }, logoUrl: null } };

// The worst case: ten or more cards in a row, with a 64-character name and three 32-character custom roles and pronouns.
export const LongestName: Story = {
  args: {
    width: 160,
    card: {
      ...skater,
      name: 'Bartholomew Featherstonehaugh-Cholmondeley Winterbottom-Smythe V',
      roleLine:
        'Co-Captain and Lead Jammer Emeri · Penalty Box Timekeeper Extraordi · Season Ticket Wrangler Supreme!! · she/her/hers or they/them/theirs',
    },
  },
};
