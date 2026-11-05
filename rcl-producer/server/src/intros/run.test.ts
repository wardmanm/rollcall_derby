import { describe, expect, it } from 'vitest';
import { DEFAULT_ROSTER_OPTIONS, DEFAULT_PLACEMENT } from '@rollcall/producer-contract';
import { NO_RUN, clearRun, endRun, isDone, nextStep, shown, startRun, upNext, type Run } from './run.ts';

const P = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const all = () => true;
const none = () => false;
const notP2 = (id: string) => id !== 'p2';

function start(
  people: readonly string[] = P,
  atOnce: number | 'team' = 4,
  team: 'a' | 'b' = 'a',
  run: Run = NO_RUN,
): Run {
  return startRun(run, {
    team,
    teamId: `team-${team}`,
    people,
    options: { ...DEFAULT_ROSTER_OPTIONS, atOnce },
    placement: DEFAULT_PLACEMENT,
  });
}

function nexts(run: Run, count: number, isPresent: (id: string) => boolean = all): Run {
  let r = run;
  for (let i = 0; i < count; i++) r = nextStep(r, isPresent);
  return r;
}

describe('the intro run', () => {
  it('Start fixes whether pronouns show from the options', () => {
    expect(NO_RUN.showPronouns).toBe(true);
    expect(start().showPronouns).toBe(true);
    const off = startRun(NO_RUN, {
      team: 'a',
      teamId: 'team-a',
      people: P,
      options: { ...DEFAULT_ROSTER_OPTIONS, showPronouns: false },
      placement: DEFAULT_PLACEMENT,
    });
    expect(off.showPronouns).toBe(false);
    expect(endRun(off).showPronouns).toBe(true);
  });

  it('Start shows the title card and bumps the revision', () => {
    const r = start();
    expect(shown(r, all)).toEqual({ title: true, people: [] });
    expect(upNext(r, all)).toBe('p1');
    expect(r.revision).toBe(1);
    expect(r.team).toBe('a');
    expect(r.teamId).toBe('team-a');
  });

  it("each Next adds a person to the row until it's full, then starts a new row", () => {
    const r = start();
    expect(shown(nexts(r, 4), all)).toEqual({ title: false, people: ['p1', 'p2', 'p3', 'p4'] });
    expect(shown(nexts(r, 5), all).people).toEqual(['p5']);
    expect(shown(nexts(r, 6), all).people).toEqual(['p5', 'p6']);
  });

  it('Next after the last person changes nothing, and the run is done', () => {
    const r = nexts(start(), 6);
    expect(isDone(r, all)).toBe(true);
    expect(nextStep(r, all)).toBe(r);
    expect(isDone(start(), all)).toBe(false);
  });

  it('Clear keeps the place: the next Next starts a fresh row', () => {
    const cleared = clearRun(nexts(start(), 2));
    expect(shown(cleared, all).people).toEqual([]);
    expect(clearRun(cleared)).toBe(cleared);
    const n = nextStep(cleared, all);
    expect(shown(n, all).people).toEqual(['p3']);
    expect(shown(nextStep(n, all), all).people).toEqual(['p3', 'p4']);
  });

  it('Clear while the title card is up, then Next, shows the first person', () => {
    const r = nextStep(clearRun(start()), all);
    expect(shown(r, all)).toEqual({ title: false, people: ['p1'] });
  });

  it('skips people who are no longer present', () => {
    const r = nexts(start(), 1, notP2);
    expect(upNext(r, notP2)).toBe('p3');
    expect(shown(nextStep(r, notP2), notP2).people).toEqual(['p1', 'p3']);
  });

  it("'Whole team' makes one row of everyone", () => {
    expect(start(P, 'team').slots).toBe(6);
    expect(start([], 'team').slots).toBe(1);
    expect(shown(nexts(start(P, 'team'), 6), all).people).toEqual(P);
  });

  it('a team with no one present is done at its title card', () => {
    const r = start();
    expect(isDone(r, none)).toBe(true);
    expect(nextStep(r, none)).toBe(r);
  });

  it('Start mid-run begins the other team from its title card', () => {
    const r = start(['q1', 'q2'], 1, 'b', nexts(start(), 3));
    expect(r.team).toBe('b');
    expect(r.step).toBe(0);
    expect(r.onAir).toBe(true);
    expect(r.revision).toBe(5);
    expect(shown(r, all)).toEqual({ title: true, people: [] });
  });

  it('endRun takes everything off air and forgets the team', () => {
    const r = start();
    const ended = endRun(r);
    expect(ended).toEqual({ ...NO_RUN, revision: r.revision + 1 });
    expect(shown(ended, all)).toEqual({ title: false, people: [] });
    expect(isDone(ended, all)).toBe(false);
  });

  it('never mutates its input', () => {
    const r = start();
    const copy = structuredClone(r);
    nextStep(r, all);
    clearRun(r);
    endRun(r);
    expect(r).toEqual(copy);
  });
});
