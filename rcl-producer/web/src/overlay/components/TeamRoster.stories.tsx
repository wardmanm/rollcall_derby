import { useState, type CSSProperties } from 'react';
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
import { sampleSurface } from '../themes/sample-themes.ts';

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

// Mounting is a reload: each piece appears, with no entrance, once its picture is on show. The roster gets the surface
// of the theme picked in the toolbar, as the OBS page gets its theme's.
const meta = {
  title: 'Components/TeamRoster',
  component: TeamRoster,
  args: { onAir: row(3, 4), surface: sampleSurface('default') },
  render: (args, { globals }) => <TeamRoster {...args} surface={sampleSurface(globals.overlayTheme)} />,
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

// A secondary colour too dark to read on the default theme's dark surface: the role line uses the theme's muted text.
// On the Light theme, the team's colour is kept.
export const DarkSecondaryColour: Story = {
  args: { onAir: { ...row(3, 4), team: { ...team, primaryColor: '#f5c518', secondaryColor: '#1d428a' } } },
};

// A run as the server keeps one (rcl-producer/server/src/intros/run.ts), cut down for the stepping story. The team is
// fixed at Start: `step` 0 is the title, k >= 1 means people[k-1] is the latest shown, and the row is the people in
// people[rowStart..step) still on the team. A removed member stays in `people` and is only `gone`, as the server's
// isPresent tells it, so the overlay hears of the removal at the next step.
interface StepRun {
  step: number;
  rowStart: number;
  onAir: boolean;
  /** Fixed at Start, as the server fixes it. */
  entrance: RosterEntrance;
  gone: ReadonlySet<string>;
}

const STEP_SLOTS = 4;

const nextIndex = (run: StepRun) => people.findIndex((card, i) => i >= run.step && !run.gone.has(card.id));
const rowOf = (run: StepRun) => people.slice(run.rowStart, run.step).filter((card) => !run.gone.has(card.id));

function nextStep(run: StepRun): StepRun {
  const index = nextIndex(run);
  if (index < 0) return run;
  // The row is full by the cards in it still on the team, so one whose person left has room again.
  const fresh = run.step === 0 || !run.onAir || rowOf(run).length >= STEP_SLOTS;
  return { ...run, step: index + 1, rowStart: fresh ? index : run.rowStart, onAir: true };
}

// What the server sends the overlay after Start, Next or Clear. A removal alone sends nothing.
function onAirFor(run: StepRun): RosterOnAir | null {
  if (!run.onAir) return null;
  const title = run.step === 0;
  return {
    team,
    title,
    cards: title ? [] : rowOf(run),
    upNext: people[nextIndex(run)] ?? null,
    slots: STEP_SLOTS,
    entrance: run.entrance,
    placement: { spot: 'bottom-center', edge: 48 },
  };
}

// Deletes the member whose card is first on screen, as Team Builder would mid-intro, when at least two are up. The
// overlay isn't told until the next step: then that card leaves on its own, and its place closes as the next opens.
function removeFirstOnScreen(run: StepRun, sent: RosterOnAir | null): StepRun {
  const up = sent?.cards.filter((card) => !run.gone.has(card.id)) ?? [];
  if (up.length < 2) return run;
  return { ...run, gone: new Set([...run.gone, up[0]!.id]) };
}

// The controls sit on the canvas, so they're sized in canvas pixels.
const CONTROLS: CSSProperties = { position: 'absolute', top: 48, left: 48, display: 'flex', gap: 24, fontSize: 36 };
const CONTROL: CSSProperties = { font: 'inherit', padding: '12px 28px' };

function SteppingRoster({ surface }: { surface: string }) {
  const [run, setRun] = useState<StepRun | null>(null);
  // What the overlay was last told: the same object until the next step, as the roster compares states by identity.
  const [sent, setSent] = useState<RosterOnAir | null>(null);
  const [entrance, setEntrance] = useState<RosterEntrance>('pop');
  const send = (next: StepRun) => {
    if (next === run) return;
    setRun(next);
    setSent(onAirFor(next));
  };
  return (
    <>
      <TeamRoster onAir={sent} surface={surface} />
      <div style={CONTROLS}>
        <button
          type="button"
          style={CONTROL}
          onClick={() => send({ step: 0, rowStart: 0, onAir: true, entrance, gone: new Set() })}
        >
          Start
        </button>
        <button type="button" style={CONTROL} disabled={run === null} onClick={() => run && send(nextStep(run))}>
          Next
        </button>
        <button
          type="button"
          style={CONTROL}
          disabled={run === null}
          onClick={() => run?.onAir && send({ ...run, onAir: false })}
        >
          Clear
        </button>
        <button
          type="button"
          style={CONTROL}
          disabled={run === null}
          onClick={() => run && setRun(removeFirstOnScreen(run, sent))}
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
 * four leaves for the next), Remove a member to delete the row's first person mid-row (their card leaves at the next
 * Next, as on the OBS page), and Clear. A new entrance applies from the next Start.
 */
export const Stepping: Story = {
  render: (_args, { globals }) => <SteppingRoster surface={sampleSurface(globals.overlayTheme)} />,
  play: async ({ canvas, userEvent }) => {
    const click = (name: string) => userEvent.click(canvas.getByRole('button', { name }));
    const piece = (name: string) => canvas.getByRole('figure', { name }).closest('[data-piece]');
    await click('Start');
    // The title, then three cards.
    await click('Next');
    await click('Next');
    await click('Next');
    // The title leaves first, then each card's place opens and the card comes in.
    await waitFor(() => expect(canvas.getAllByRole('figure')).toHaveLength(3), { timeout: 5000 });
    await click('Remove a member');
    // The overlay isn't told yet, so the card stays up.
    await expect(piece('Rolla Coaster')?.hasAttribute('data-leaving')).toBe(false);
    await click('Next');
    // Then it leaves on its own, and its place closes as the next person's opens.
    const names = () => canvas.getAllByRole('figure').map((figure) => figure.getAttribute('aria-label'));
    await waitFor(() => expect(names()).toEqual(['Pivot Table', 'Track Star', 'Jammy Dodger']), { timeout: 5000 });
  },
};
