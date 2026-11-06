import { useMemo, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import {
  ROSTER_ENTRANCES,
  RosterEntranceSchema,
  type RosterCard,
  type RosterEntrance,
  type RosterOnAir,
} from '@rollcall/producer-contract';
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

// A run as the server keeps one (rcl-producer/server/src/intros/run.ts), cut down for the stepping story. `step` 0 is the
// title; k >= 1 means people[k-1] is the latest shown, and the row is people[rowStart..step).
interface StepRun {
  people: RosterCard[];
  step: number;
  rowStart: number;
  onAir: boolean;
}

const STEP_SLOTS = 4;

function onAirFor(run: StepRun | null, entrance: RosterEntrance): RosterOnAir | null {
  if (!run?.onAir) return null;
  const title = run.step === 0;
  return {
    team,
    title,
    cards: title ? [] : run.people.slice(run.rowStart, run.step),
    upNext: run.people[run.step] ?? null,
    slots: STEP_SLOTS,
    entrance,
    placement: { spot: 'bottom-center', edge: 48 },
  };
}

function nextStep(run: StepRun): StepRun {
  if (run.step >= run.people.length) return run;
  const fresh = run.step === 0 || !run.onAir || run.step - run.rowStart >= STEP_SLOTS;
  return { ...run, step: run.step + 1, rowStart: fresh ? run.step : run.rowStart, onAir: true };
}

// Deletes the member whose card is first in the row, as Team Builder would mid-intro. The server tells the overlay at
// its next step; here the overlay is told at once, as a timer tick would.
function removeFirstOnScreen(run: StepRun): StepRun {
  if (!run.onAir || run.step - run.rowStart < 2) return run;
  return { ...run, people: run.people.filter((_, i) => i !== run.rowStart), step: run.step - 1 };
}

// The controls sit on the canvas, so they're sized in canvas pixels.
const CONTROLS: CSSProperties = { position: 'absolute', top: 48, left: 48, display: 'flex', gap: 24, fontSize: 36 };
const CONTROL: CSSProperties = { font: 'inherit', padding: '12px 28px' };

function SteppingRoster() {
  const [run, setRun] = useState<StepRun | null>(null);
  const [entrance, setEntrance] = useState<RosterEntrance>('pop');
  // The same object until something changes, as the roster compares states by identity.
  const onAir = useMemo(() => onAirFor(run, entrance), [run, entrance]);
  return (
    <>
      <TeamRoster onAir={onAir} />
      <div style={CONTROLS}>
        <button type="button" style={CONTROL} onClick={() => setRun({ people, step: 0, rowStart: 0, onAir: true })}>
          Start
        </button>
        <button type="button" style={CONTROL} disabled={run === null} onClick={() => setRun(run && nextStep(run))}>
          Next
        </button>
        <button
          type="button"
          style={CONTROL}
          disabled={run === null}
          onClick={() => setRun(run && { ...run, onAir: false })}
        >
          Clear
        </button>
        <button
          type="button"
          style={CONTROL}
          disabled={run === null}
          onClick={() => setRun(run && removeFirstOnScreen(run))}
        >
          Remove a member
        </button>
        <label>
          Entrance{' '}
          <select
            style={CONTROL}
            value={entrance}
            onChange={(event) => setEntrance(RosterEntranceSchema.parse(event.currentTarget.value))}
          >
            {ROSTER_ENTRANCES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

/**
 * Steps through a team as the control page would, so the motion shows: Start, then Next to add cards (a full row of
 * four leaves for the next), Remove a member to take the row's first card off mid-row, and Clear.
 */
export const Stepping: Story = {
  render: () => <SteppingRoster />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Start' })).toBeVisible();
  },
};
