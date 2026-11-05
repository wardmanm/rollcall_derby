import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import type { RosterCard, RosterOnAir } from '@rollcall/producer-contract';
import { OverlayCanvas } from './OverlayCanvas.tsx';
import { TeamRoster } from './TeamRoster.tsx';
import { LOGO_URL, PHOTO_URL } from './roster/story-images.ts';

// A team of fifteen in team page order: skaters by number, then bench staff by name. Every fourth has no photo, so
// the logo stands in.
const PEOPLE: [name: string, number: string | null, roleLine: string][] = [
  ['Rolla Coaster', '00', 'she/her'],
  ['Pivot Table', '3', 'he/him'],
  ['Track Star', '5', 'she/her'],
  ['Jammy Dodger', '07', 'Captain · she/her'],
  ['Brick House', '9', 'they/them'],
  ['Rink Rat', '11', 'he/him'],
  ['Block Party', '12', 'Alt captain · they/them'],
  ['Hip Check Hannah', '21', 'she/her'],
  ['Whip It Good', '31', 'she/her'],
  ['Jam Session', '64', 'they/them'],
  ['Apex Predator', '77', 'he/him'],
  ['Penny Dreadful', '88', 'she/her'],
  ['Lady Lockdown', '404', 'she/her'],
  ['Coach Carter', null, 'Bench coach · he/him'],
  ['Minnie Mayhem', null, 'Bench manager · she/her'],
];

const people: RosterCard[] = PEOPLE.map(([name, number, roleLine], i) => ({
  id: `m${i + 1}`,
  kind: number === null ? 'bench' : 'skater',
  name,
  number,
  roleLine,
  photoUrl: i % 4 === 3 ? null : PHOTO_URL,
}));

const team = {
  name: 'Harbour City Wreckers',
  leagueName: 'Harbour City Roller Derby',
  logoUrl: LOGO_URL,
  primaryColor: '#b3123f',
  secondaryColor: '#f5c518',
};

/** The first `count` people up, `slots` across. */
function row(count: number, slots: number, fields: Partial<RosterOnAir> = {}): RosterOnAir {
  return {
    team,
    title: false,
    cards: people.slice(0, count),
    upNext: people[count] ?? null,
    slots,
    entrance: 'pop',
    placement: { spot: 'bottom-center', edge: 48 },
    ...fields,
  };
}

// Mounting is a reload: each piece appears, with no entrance, once its picture is on show.
const meta = {
  title: 'Components/TeamRoster',
  component: TeamRoster,
  args: { onAir: row(3, 4) },
  decorators: [
    (Story) => (
      <OverlayCanvas>
        <Story />
      </OverlayCanvas>
    ),
  ],
  // The canvas fills the window, so on the docs page each story gets a frame of its own.
  parameters: { docs: { story: { inline: false, iframeHeight: 360 } } },
  // Wait for every piece to appear, so the accessibility checks see the roster as it shows on stream.
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-state="waiting"]')).toBeNull());
  },
} satisfies Meta<typeof TeamRoster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleCard: Story = { args: { onAir: { ...row(0, 4), title: true } } };

export const RowOfThreeOfFour: Story = {};

export const FullRowOfFour: Story = { args: { onAir: row(4, 4) } };

export const WholeTeamOfFifteen: Story = { args: { onAir: row(15, 15) } };

export const TopLeft: Story = {
  args: { onAir: row(2, 4, { placement: { spot: 'top-left', edge: 48 } }) },
};
