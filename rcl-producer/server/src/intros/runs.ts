import type { TeamsService } from '@rollcall/app-sdk';
import type { Team, TeamMember } from '@rollcall/core-contract';
import {
  rosterCard,
  rosterTeam,
  type Intro,
  type IntroOverlayState,
  type IntroRun,
  type IntroTeamSlot,
} from '@rollcall/producer-contract';
import type { ProducerDatabase } from '../themes/themes.ts';
import { findIntro } from './intros.ts';
import { clearRun, endRun, isDone, NO_RUN, nextStep, shown, startRun, upNext, type Run } from './run.ts';

/**
 * Each intro's live run (docs/features/skater-intros.md), held in memory with its timer, so a restart leaves nothing on
 * air. Every read and press reads the run's team fresh from core: changed details show at once, someone removed is
 * skipped, and a run whose team is gone ends. Core doesn't announce changes (ADR-0023), so they're noticed here.
 */
export interface IntroRuns {
  /** The control page's view of the run. */
  run(intro: Intro): IntroRun;
  /** What the intro's overlay shows: only the cards on air and the next person, never the whole team. */
  overlay(intro: Intro): IntroOverlayState;
  /** Starts the slot's team from its title card, or answers 'no_team' when the slot is empty or its team is gone. */
  start(intro: Intro, team: IntroTeamSlot): IntroRun | 'no_team';
  /** Shows the next person. A `revision` that isn't the run's own was pressed on a step that has passed: no change. */
  next(intro: Intro, revision?: number): IntroRun;
  /** Takes everything off air, keeping the team's place, and stops the timer. */
  clear(intro: Intro): IntroRun;
  /** Drops a deleted intro's run and timer, and returns what its overlay shows now: nothing, at a newer revision. */
  forget(introId: string): IntroOverlayState;
  /** Stops every timer. */
  close(): void;
}

interface Held {
  run: Run;
  timer?: ReturnType<typeof setTimeout>;
  /** When the timer fires, in `Date.now()` milliseconds. */
  deadline?: number;
}

// A run with its team's members as core has them now.
interface Current {
  run: Run;
  team: Team | undefined;
  members: ReadonlyMap<string, TeamMember>;
}

const membersOf = (team: Team | undefined) => new Map(team?.members.map((member) => [member.id, member]));
// Whether the person is still on the team: one argument, since run.ts filters with it.
const presentIn =
  ({ members }: Current) =>
  (id: string) =>
    members.has(id);

function stopTimer(entry: Held): void {
  clearTimeout(entry.timer);
  entry.timer = undefined;
  entry.deadline = undefined;
}

// What the overlay is sent: the cards on air and the next person, so their photo can load early.
function overlayView(now: Current): IntroOverlayState {
  const { run, team, members } = now;
  if (!run.onAir || !team) return { revision: run.revision, onAir: null };
  const isPresent = presentIn(now);
  const card = (id: string) => rosterCard(members.get(id)!);
  const { title, people } = shown(run, isPresent);
  const coming = upNext(run, isPresent);
  return {
    revision: run.revision,
    onAir: {
      team: rosterTeam(team),
      title,
      cards: people.map(card),
      upNext: coming === null ? null : card(coming),
      slots: run.slots,
      entrance: run.entrance,
      placement: run.placement,
    },
  };
}

/** The runs. `onChange` gets the intro's id after every change, even a timer's step or a run whose team is gone. */
export function introRuns({
  db,
  teams,
  onChange,
}: {
  db: ProducerDatabase;
  teams: TeamsService;
  onChange: (introId: string) => void;
}): IntroRuns {
  const held = new Map<string, Held>();

  // Keeps `now.run` as the intro's run, restarts its timer when it's on air on a timer with someone still to come (or
  // stops it), and tells `onChange`.
  function keep(introId: string, now: Current): Current {
    const { run } = now;
    const entry = held.get(introId) ?? { run };
    held.set(introId, entry);
    entry.run = run;
    stopTimer(entry);
    if (run.seconds !== null && run.onAir && !isDone(run, presentIn(now))) {
      const ms = run.seconds * 1000;
      entry.deadline = Date.now() + ms;
      entry.timer = setTimeout(() => tick(introId), ms);
    }
    onChange(introId);
    return now;
  }

  // The intro's run, with its team read fresh. A run whose team is gone ends here.
  function current(introId: string): Current {
    const run = held.get(introId)?.run ?? NO_RUN;
    const team = run.teamId === null ? undefined : teams.get(run.teamId);
    if (run.teamId !== null && !team) return keep(introId, { run: endRun(run), team, members: new Map() });
    return { run, team, members: membersOf(team) };
  }

  function controlView(introId: string, now: Current): IntroRun {
    const { run, members } = now;
    const isPresent = presentIn(now);
    const { title, people } = shown(run, isPresent);
    const deadline = held.get(introId)?.deadline;
    return {
      revision: run.revision,
      team: run.team,
      title,
      onAir: run.onAir,
      people: run.people.filter(isPresent).map((id) => {
        const { name, number, kind } = members.get(id)!;
        return { id, name, number, kind };
      }),
      onScreen: people,
      next: upNext(run, isPresent),
      done: isDone(run, isPresent),
      timerMsLeft: deadline === undefined ? null : Math.max(0, deadline - Date.now()),
    };
  }

  function next(intro: Intro, revision?: number): IntroRun {
    const now = current(intro.id);
    if (revision !== undefined && revision !== now.run.revision) return controlView(intro.id, now);
    const moved = nextStep(now.run, presentIn(now));
    if (moved === now.run) return controlView(intro.id, now);
    return controlView(intro.id, keep(intro.id, { ...now, run: moved }));
  }

  // The timer presses Next as a person would. A step that finds no one left has still stopped the timer, so control
  // pages are told, to stop counting down.
  function tick(introId: string): void {
    const entry = held.get(introId);
    if (!entry) return;
    stopTimer(entry);
    const intro = findIntro(db, introId);
    if (!intro) {
      forget(introId);
      return;
    }
    const before = entry.run;
    next(intro);
    if (entry.run === before) onChange(introId);
  }

  function forget(introId: string): IntroOverlayState {
    const entry = held.get(introId);
    if (entry) stopTimer(entry);
    held.delete(introId);
    return { revision: (entry?.run ?? NO_RUN).revision + 1, onAir: null };
  }

  return {
    run: (intro) => controlView(intro.id, current(intro.id)),

    overlay: (intro) => overlayView(current(intro.id)),

    start(intro, slot) {
      const { run } = current(intro.id);
      const teamId = slot === 'a' ? intro.teamAId : intro.teamBId;
      const team = teamId === null ? undefined : teams.get(teamId);
      if (!team) return 'no_team';
      const started = startRun(run, {
        team: slot,
        teamId: team.id,
        people: team.members.map((member) => member.id),
        options: intro.options,
        placement: intro.placement,
      });
      return controlView(intro.id, keep(intro.id, { run: started, team, members: membersOf(team) }));
    },

    next,

    clear(intro) {
      const now = current(intro.id);
      const cleared = clearRun(now.run);
      if (cleared === now.run) return controlView(intro.id, now);
      return controlView(intro.id, keep(intro.id, { ...now, run: cleared }));
    },

    forget,

    close() {
      for (const entry of held.values()) stopTimer(entry);
      held.clear();
    },
  };
}
