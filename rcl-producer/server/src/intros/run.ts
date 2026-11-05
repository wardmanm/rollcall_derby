import {
  DEFAULT_PLACEMENT,
  DEFAULT_ROSTER_OPTIONS,
  type IntroPlacement,
  type IntroTeamSlot,
  type RosterEntrance,
  type RosterOptions,
} from '@rollcall/producer-contract';

/** One intro's progress through a team. Pure data: the service holds it, the functions below change it. */
export interface Run {
  /** Bumps on every change, never on a no-op. */
  revision: number;
  /** The slot started last; null before any Start or after the run ends. */
  team: IntroTeamSlot | null;
  /** The team that slot held at Start. */
  teamId: string | null;
  /** Member ids in team page order, fixed at Start. */
  people: readonly string[];
  /** Cards per row, fixed at Start. */
  slots: number;
  /** 0 is the title card; k >= 1 means people[k-1] is the latest shown. */
  step: number;
  /** Index in `people` of the row's first card. */
  rowStart: number;
  /** False after Clear. */
  onAir: boolean;
  entrance: RosterEntrance;
  /** Whether cards show pronouns, fixed at Start. */
  showPronouns: boolean;
  placement: IntroPlacement;
  /** Timer seconds fixed at Start, or null for Next. */
  seconds: number | null;
}

export const NO_RUN: Run = {
  revision: 0,
  team: null,
  teamId: null,
  people: [],
  slots: DEFAULT_ROSTER_OPTIONS.atOnce === 'team' ? 1 : DEFAULT_ROSTER_OPTIONS.atOnce,
  step: 0,
  rowStart: 0,
  onAir: false,
  entrance: DEFAULT_ROSTER_OPTIONS.entrance,
  showPronouns: DEFAULT_ROSTER_OPTIONS.showPronouns,
  placement: DEFAULT_PLACEMENT,
  seconds: null,
};

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

export function nextStep(run: Run, isPresent: (id: string) => boolean): Run {
  const index = nextIndex(run, isPresent);
  if (run.team === null || index < 0) return run;
  const rowCards = run.people.slice(run.rowStart, run.step).filter(isPresent).length;
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

export function endRun(run: Run): Run {
  return { ...NO_RUN, revision: run.revision + 1 };
}

export function shown(run: Run, isPresent: (id: string) => boolean): { title: boolean; people: string[] } {
  if (!run.onAir) return { title: false, people: [] };
  return { title: run.step === 0, people: run.people.slice(run.rowStart, run.step).filter(isPresent) };
}

export function upNext(run: Run, isPresent: (id: string) => boolean): string | null {
  if (run.team === null) return null;
  const index = nextIndex(run, isPresent);
  return index < 0 ? null : run.people[index]!;
}

export function isDone(run: Run, isPresent: (id: string) => boolean): boolean {
  return run.team !== null && upNext(run, isPresent) === null;
}
