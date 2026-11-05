import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAME, type FontFamily, type Team, type TeamMember } from '@rollcall/core-contract';
import {
  DEFAULT_PLACEMENT,
  DEFAULT_ROSTER_OPTIONS,
  DEFAULT_TOKENS,
  INTRO_RUN_EVENT,
  INTRO_STATE_EVENT,
  IntroOverlayStateSchema,
  IntroRunSchema,
  IntroSchema,
  rosterCard,
  rosterTeam,
  SERVER_HELLO_EVENT,
  THEME_CHANGED_EVENT,
  ThemeSchema,
  type UpdateIntroRequest,
  type ThemeTokens,
} from '@rollcall/producer-contract';
import { producerApp } from '../index.ts';
import { testProducer, testRealtime, type Sent } from '../testing.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
// Revisions count from when the app's runs were made, on this clock. Only timeouts and the clock are faked: Fastify's
// inject waits on the real setImmediate.
const NOW = new Date('2026-11-05T19:00:00.000Z');
const FIRST = NOW.getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
});
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
  vi.useRealTimers();
});

const family = (name: string): FontFamily => ({
  name,
  bundled: true,
  faces: [{ id: name, weightMin: 400, weightMax: 400, style: 'normal', format: 'font/ttf', url: `/fonts/${name}.ttf` }],
});
const INTER = family('Inter');
const OSWALD = family('Oswald');
const OSWALD_HEADINGS: ThemeTokens = {
  ...DEFAULT_TOKENS,
  fonts: { ...DEFAULT_TOKENS.fonts, heading: { family: 'Oswald', weight: 700 } },
};
const DEFAULT_LOOK = { tokens: DEFAULT_TOKENS, families: [INTER] };
const WITH_OSWALD = { tokens: OSWALD_HEADINGS, families: [INTER, OSWALD] };
const HELLO: Sent = [SERVER_HELLO_EVENT, { name: APP_NAME, version: '0.1.0' }];

const person = (n: number): TeamMember => ({
  id: `m${n}`,
  kind: 'skater',
  name: `Skater Number ${n}`,
  number: String(n),
  pronouns: null,
  roles: [],
  customRoles: [],
  photoUrl: `/media/photo-${n}`,
});
const allStars = (): Team => ({
  id: 't1',
  name: 'All Stars',
  leagueName: 'Derby City',
  shortName: null,
  primaryColor: '#d4145a',
  secondaryColor: '#ffffff',
  logoUrl: '/media/logo',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  members: [1, 2, 3, 4, 5, 6].map(person),
});

// The Producer app with both its namespaces open on a stand-in for Socket.IO, and All Stars, a team of six.
function live() {
  const { api, ctx, teams } = testProducer({ fonts: [INTER, OSWALD], teams: [allStars()] });
  opened.push(api);
  const realtime = testRealtime(ctx);
  const call = async (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const theme = async (name: string, tokens?: ThemeTokens) =>
    ThemeSchema.parse((await call('POST', '/themes', { name, tokens })).json());
  // An intro of All Stars as team A, four at once.
  const intro = async (name: string, changes: UpdateIntroRequest = {}) => {
    const { id } = IntroSchema.parse((await call('POST', '/intros', { name })).json());
    const options = { ...DEFAULT_ROSTER_OPTIONS, atOnce: 4 };
    return IntroSchema.parse((await call('PATCH', `/intros/${id}`, { teamAId: 't1', options, ...changes })).json());
  };
  const press = async (id: string, action: 'start' | 'next' | 'clear', payload: object = {}) => {
    const res = await call('POST', `/intros/${id}/${action}`, action === 'start' ? { team: 'a', ...payload } : payload);
    expect(res.statusCode, action).toBe(200);
    return IntroRunSchema.parse(res.json());
  };
  return {
    ctx,
    teams,
    realtime,
    call,
    theme,
    intro,
    press,
    overlayFor: (id: string) => realtime.connect('/producer/overlay', { intro: id }),
    controlFor: (id: string) => realtime.connect('/producer/intros', { intro: id }),
  };
}

// Themes have no media, so saving one never asks for a media id.
const noMedia = () => {
  throw new Error('Themes have no media');
};
const sentOf = (event: string, sent: Sent[]) => sent.filter(([name]) => name === event).map(([, payload]) => payload);
const lastState = (sent: Sent[]) => IntroOverlayStateSchema.parse(sentOf(INTRO_STATE_EVENT, sent).at(-1));
const lastRun = (sent: Sent[]) => IntroRunSchema.parse(sentOf(INTRO_RUN_EVENT, sent).at(-1));

describe('live intros', () => {
  it("an overlay for an intro joins its room and gets hello, the intro's theme and its state; an unknown intro gets nothing on air", async () => {
    const { call, theme, intro, press, overlayFor } = live();
    const gold = await theme('Gold', OSWALD_HEADINGS);
    await call('PUT', '/default-theme', { themeId: (await theme('Night')).id });
    const onGold = await intro('Bout 1', { themeId: gold.id });
    const onDefault = await intro('Bout 2');
    await press(onGold.id, 'start');

    const goldOverlay = overlayFor(onGold.id);
    expect(goldOverlay).toEqual([HELLO, [THEME_CHANGED_EVENT, WITH_OSWALD], [INTRO_STATE_EVENT, expect.anything()]]);
    expect(lastState(goldOverlay)).toMatchObject({ revision: FIRST + 1, onAir: { title: true, cards: [] } });
    expect(overlayFor(onDefault.id)).toEqual([
      HELLO,
      [THEME_CHANGED_EVENT, DEFAULT_LOOK],
      [INTRO_STATE_EVENT, { revision: FIRST, onAir: null }],
    ]);
    expect(overlayFor('nope')).toEqual([
      HELLO,
      [THEME_CHANGED_EVENT, DEFAULT_LOOK],
      [INTRO_STATE_EVENT, { revision: FIRST, onAir: null }],
    ]);

    // It's in the intro's room: the next change reaches it.
    await press(onGold.id, 'next');
    expect(lastState(goldOverlay).onAir?.cards.map((card) => card.id)).toEqual(['m1']);
  });

  it("each change reaches the intro's overlay room and control room", async () => {
    const { call, intro, press, overlayFor, controlFor } = live();
    const one = await intro('Bout 1');
    const two = await intro('Bout 2');
    const [overlayOne, controlOne] = [overlayFor(one.id), controlFor(one.id)];
    const [overlayTwo, controlTwo] = [overlayFor(two.id), controlFor(two.id)];
    expect(controlOne).toEqual([[INTRO_RUN_EVENT, expect.objectContaining({ revision: FIRST, team: null })]]);

    for (const action of ['start', 'next', 'next', 'clear'] as const) {
      const reply = await press(one.id, action);
      expect(lastRun(controlOne), action).toEqual(reply);
      expect(lastState(overlayOne).revision, action).toBe(reply.revision);
    }
    expect(sentOf(INTRO_RUN_EVENT, controlOne)).toHaveLength(5);
    expect(sentOf(INTRO_STATE_EVENT, overlayOne)).toHaveLength(5);
    expect(lastState(overlayOne).onAir).toBeNull();

    // Saving the intro sends its state again; a press that changes nothing sends nothing.
    await call('PATCH', `/intros/${one.id}`, { name: 'Bout One' });
    expect(sentOf(INTRO_RUN_EVENT, controlOne)).toHaveLength(6);
    await press(one.id, 'clear');
    await press(one.id, 'next', { revision: FIRST });
    expect(sentOf(INTRO_RUN_EVENT, controlOne)).toHaveLength(6);
    expect(sentOf(INTRO_STATE_EVENT, overlayOne)).toHaveLength(6);

    expect(sentOf(INTRO_STATE_EVENT, overlayTwo)).toEqual([{ revision: FIRST, onAir: null }]);
    expect(sentOf(INTRO_RUN_EVENT, controlTwo)).toHaveLength(1);
  });

  it('deleting a running intro takes it off its overlay', async () => {
    const { call, intro, press, overlayFor } = live();
    const one = await intro('Bout 1');
    await press(one.id, 'start');
    const overlay = overlayFor(one.id);
    const { revision } = await press(one.id, 'next');
    await call('DELETE', `/intros/${one.id}`);
    const gone = lastState(overlay);
    expect(gone.onAir).toBeNull();
    // Newer than the last state, so an overlay that drops older states still takes it.
    expect(gone.revision).toBeGreaterThan(revision);
  });

  it('a theme edit reaches only the intro rooms using that theme, and a new default reaches only those on Default theme', async () => {
    const { realtime, call, theme, intro, overlayFor } = live();
    const gold = await theme('Gold');
    const night = await theme('Night');
    const goldOverlay = overlayFor((await intro('Bout 1', { themeId: gold.id })).id);
    const defaultOverlay = overlayFor((await intro('Bout 2')).id);
    const plain = realtime.connect('/producer/overlay');
    for (const sent of [goldOverlay, defaultOverlay, plain]) sent.length = 0;

    await call('PATCH', `/themes/${gold.id}`, { tokens: OSWALD_HEADINGS });
    await call('PATCH', `/themes/${night.id}`, { tokens: OSWALD_HEADINGS });
    expect(sentOf(THEME_CHANGED_EVENT, goldOverlay)).toEqual([WITH_OSWALD]);
    expect(defaultOverlay).toEqual([]);
    expect(plain).toEqual([]);

    await call('PUT', '/default-theme', { themeId: night.id });
    await call('PATCH', `/themes/${night.id}`, { tokens: DEFAULT_TOKENS });
    await call('PUT', '/default-theme', { themeId: null });
    expect(sentOf(THEME_CHANGED_EVENT, defaultOverlay)).toEqual([WITH_OSWALD, DEFAULT_LOOK, null]);
    expect(sentOf(THEME_CHANGED_EVENT, plain)).toEqual([WITH_OSWALD, DEFAULT_LOOK, null]);
    expect(sentOf(THEME_CHANGED_EVENT, goldOverlay)).toEqual([WITH_OSWALD]);
  });

  it("an intro's overlay follows a change of its theme, and the deletion of it", async () => {
    const { call, theme, intro, overlayFor } = live();
    const gold = await theme('Gold', OSWALD_HEADINGS);
    await call('PUT', '/default-theme', { themeId: (await theme('Night')).id });
    const one = await intro('Bout 1');
    const overlay = overlayFor(one.id);
    overlay.length = 0;

    await call('PATCH', `/intros/${one.id}`, { name: 'Bout One' });
    expect(sentOf(THEME_CHANGED_EVENT, overlay)).toEqual([]);
    await call('PATCH', `/intros/${one.id}`, { themeId: gold.id });
    expect(sentOf(THEME_CHANGED_EVENT, overlay)).toEqual([WITH_OSWALD]);
    // Deleting its theme leaves it on the default theme.
    await call('DELETE', `/themes/${gold.id}`);
    expect(sentOf(THEME_CHANGED_EVENT, overlay)).toEqual([WITH_OSWALD, DEFAULT_LOOK]);
  });

  it('deleting the default theme sends every overlay on the default its new look once', async () => {
    const { realtime, call, theme, intro, overlayFor } = live();
    const night = await theme('Night', OSWALD_HEADINGS);
    await call('PUT', '/default-theme', { themeId: night.id });
    const onDefault = overlayFor((await intro('Bout 1')).id);
    // Picked by name, so deleting it moves this intro to the default too.
    const onNight = overlayFor((await intro('Bout 2', { themeId: night.id })).id);
    const plain = realtime.connect('/producer/overlay');
    for (const sent of [onDefault, onNight, plain]) sent.length = 0;

    expect((await call('DELETE', `/themes/${night.id}`)).statusCode).toBe(204);
    // No default is left, so each gets the built-in look.
    expect(sentOf(THEME_CHANGED_EVENT, onDefault)).toEqual([null]);
    expect(sentOf(THEME_CHANGED_EVENT, onNight)).toEqual([null]);
    expect(sentOf(THEME_CHANGED_EVENT, plain)).toEqual([null]);
  });

  it('an import over a theme an intro uses sends that intro its new look', async () => {
    const { ctx, theme, intro, overlayFor } = live();
    const gold = await theme('Gold');
    const goldOverlay = overlayFor((await intro('Bout 1', { themeId: gold.id })).id);
    const defaultOverlay = overlayFor((await intro('Bout 2')).id);
    for (const sent of [goldOverlay, defaultOverlay]) sent.length = 0;

    // As core's import does: save each item in its transaction, then tell the kind once it's committed.
    const [kind] = producerApp.transfer?.(ctx) ?? [];
    const checked = kind!.check({ name: 'Gold', tokens: OSWALD_HEADINGS, default: false });
    if (!checked.ok) throw new Error(checked.message);
    kind!.save(checked.data, { as: 'replace', id: gold.id }, noMedia, { makeDefault: false });
    expect(goldOverlay).toEqual([]);
    kind!.afterImport?.();
    expect(sentOf(THEME_CHANGED_EVENT, goldOverlay)).toEqual([WITH_OSWALD]);
    expect(defaultOverlay).toEqual([]);
  });

  it("the overlay is sent only what's on air and who's next", async () => {
    const { teams, intro, press, overlayFor } = live();
    const one = await intro('Bout 1');
    const overlay = overlayFor(one.id);
    await press(one.id, 'start');
    await press(one.id, 'next');
    await press(one.id, 'next');
    const [team] = teams;
    expect(lastState(overlay)).toEqual({
      revision: FIRST + 3,
      onAir: {
        team: rosterTeam(team!),
        title: false,
        cards: [rosterCard(team!.members[0]!), rosterCard(team!.members[1]!)],
        upNext: rosterCard(team!.members[2]!),
        slots: 4,
        entrance: 'pop',
        placement: DEFAULT_PLACEMENT,
      },
    });
    const everything = JSON.stringify(overlay);
    for (const n of [4, 5, 6]) {
      expect(everything).not.toContain(`"m${n}"`);
      expect(everything).not.toContain(`Skater Number ${n}`);
      expect(everything).not.toContain(`photo-${n}`);
    }
  });

  it('the control namespace needs producer:intros.run', async () => {
    const { realtime, intro, controlFor } = live();
    expect(realtime.opens).toContainEqual(['/producer/intros', { access: { permission: 'producer:intros.run' } }]);
    const one = await intro('Bout 1');
    expect(lastRun(controlFor(one.id))).toMatchObject({ revision: FIRST, team: null, onAir: false });
    expect(controlFor('nope')).toEqual([]);
    expect(realtime.connect('/producer/intros')).toEqual([]);
  });

  it('a run whose team is deleted ends at its next timer tick, and its rooms are told', async () => {
    const { teams, intro, press, overlayFor, controlFor } = live();
    const one = await intro('Bout 1', {
      options: { ...DEFAULT_ROSTER_OPTIONS, advance: { mode: 'timer', seconds: 5 } },
    });
    const [overlay, control] = [overlayFor(one.id), controlFor(one.id)];
    const { revision } = await press(one.id, 'start');
    teams.splice(0);
    vi.advanceTimersByTime(5000);
    expect(lastState(overlay)).toEqual({ revision: revision + 1, onAir: null });
    expect(lastRun(control)).toMatchObject({ revision: revision + 1, team: null, onAir: false, timerMsLeft: null });
    expect(vi.getTimerCount()).toBe(0);
  });
});
