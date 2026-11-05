import {
  DEFAULT_PLACEMENT,
  DEFAULT_ROSTER_OPTIONS,
  type IntroPlacement,
  type IntroTeamSlot,
  type RosterEntrance,
  type RosterOptions,
} from '@rollcall/producer-contract';

/**
 * One intro's progress through a team. Pure data, never changed in place: the service holds it, and the functions
 * below return a new one for each change.
 */
export interface Run {
  /** Bumps on every change, never on a no-op. */
  readonly revision: number;
  /** The slot started last; null before any Start or after the run ends. */
  readonly team: IntroTeamSlot | null;
  /** The team that slot held at Start. */
  readonly teamId: string | null;
  /** Member ids in team page order, fixed at Start. */
  readonly people: readonly string[];
  /** Cards per row, fixed at Start. */
  readonly slots: number;
  /** 0 is the title card; k >= 1 means people[k-1] is the latest shown. */
  readonly step: number;
  /** Index in `people` of the row's first card. */
  readonly rowStart: number;
  /** False after Clear. */
  readonly onAir: boolean;
  readonly entrance: RosterEntrance;
  /** Whether cards show pronouns, fixed at Start. */
  readonly showPronouns: boolean;
  readonly placement: Readonly<IntroPlacement>;
  /** Timer seconds fixed at Start, or null for Next. */
  readonly seconds: number | null;
}

/** The run before any Start, and after one ends. Frozen, since every intro shares it. */
export const NO_RUN: Run = Object.freeze({
  revision: 0,
  team: null,
  teamId: null,
  people: Object.freeze([]),
  slots: DEFAULT_ROSTER_OPTIONS.atOnce === 'team' ? 1 : DEFAULT_ROSTER_OPTIONS.atOnce,
  step: 0,
  rowStart: 0,
  onAir: false,
  entrance: DEFAULT_ROSTER_OPTIONS.entrance,
  showPronouns: DEFAULT_ROSTER_OPTIONS.showPronouns,
  placement: Object.freeze({ ...DEFAULT_PLACEMENT }),
  seconds: null,
});

export function startRun(
  run: Run,
  start: {
    team: IntroTeamSlot;
    teamId: string;
    people: readonly string[];
    options: RosterOptions;
    placement: IntroPlacement;
  },
): Run {
  const { options } = start;
  return {
    revision: run.revision + 1,
    team: start.team,
    teamId: start.teamId,
    people: [...start.people],
    slots: options.atOnce === 'team' ? Math.max(1, start.people.length) : options.atOnce,
    step: 0,
    rowStart: 0,
    onAir: true,
    entrance: options.entrance,
    showPronouns: options.showPronouns,
    placement: start.placement,
    seconds: options.advance.mode === 'timer' ? options.advance.seconds : null,
  };
}

/** Index in `people` of the next present person, or -1 when there is none. */
function nextIndex(run: Run, isPresent: (id: string) => boolean): number {
  for (let i = run.step; i < run.people.length; i++) {
    if (isPresent(run.people[i]!)) return i;
  }
  return -1;
}

// The row's people, from its first card to the latest shown, who are still present. Each is asked about by id alone.
const presentInRow = (run: Run, isPresent: (id: string) => boolean): string[] =>
  run.people.slice(run.rowStart, run.step).filter((id) => isPresent(id));

export function nextStep(run: Run, isPresent: (id: string) => boolean): Run {
  const index = nextIndex(run, isPresent);
  if (run.team === null || index < 0) return run;
  // The row is full by the cards in it still present, so one whose person left has room again.
  const rowCards = presentInRow(run, isPresent).length;
  const fresh = run.step === 0 || !run.onAir || rowCards >= run.slots;
  return {
    ...run,
    revision: run.revision + 1,
    step: index + 1,
    rowStart: fresh ? index : run.rowStart,
    onAir: true,
  };
}

export function clearRun(run: Run): Run {
  return run.onAir ? { ...run, revision: run.revision + 1, onAir: false } : run;
}

/** Takes everything off air and forgets the team. A run that has ended, or never started, stays as it is. */
export function endRun(run: Run): Run {
  return run.team === null ? run : { ...NO_RUN, revision: run.revision + 1 };
}

export function shown(run: Run, isPresent: (id: string) => boolean): { title: boolean; people: string[] } {
  if (!run.onAir) return { title: false, people: [] };
  return { title: run.step === 0, people: presentInRow(run, isPresent) };
}

export function upNext(run: Run, isPresent: (id: string) => boolean): string | null {
  if (run.team === null) return null;
  const index = nextIndex(run, isPresent);
  return index < 0 ? null : run.people[index]!;
}

export function isDone(run: Run, isPresent: (id: string) => boolean): boolean {
  return run.team !== null && upNext(run, isPresent) === null;
}
