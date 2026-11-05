import { afterEach, describe, expect, it } from 'vitest';
import { APP_NAME, type FontFamily } from '@rollcall/core-contract';
import {
  DEFAULT_TOKENS,
  SERVER_HELLO_EVENT,
  THEME_CHANGED_EVENT,
  ThemeSchema,
  type ThemeTokens,
} from '@rollcall/producer-contract';
import { testProducer, testRealtime, type Sent } from './testing.ts';

const opened: ReturnType<typeof testProducer>['api'][] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((api) => api.close()));
});

const family = (name: string): FontFamily => ({
  name,
  bundled: true,
  faces: [{ id: name, weightMin: 400, weightMax: 400, style: 'normal', format: 'font/ttf', url: `/fonts/${name}.ttf` }],
});
const INTER = family('Inter');
const OSWALD = family('Oswald');
const ANTON = family('Anton');
const OSWALD_HEADINGS: ThemeTokens = {
  ...DEFAULT_TOKENS,
  fonts: { ...DEFAULT_TOKENS.fonts, heading: { family: 'Oswald', weight: 700 } },
};

// The Producer app with its /producer/overlay namespace open on a stand-in for Socket.IO: what it sends to the room
// every plain overlay joins, and a way to connect one and see what it's sent.
function overlay() {
  const { api, ctx } = testProducer({ fonts: [ANTON, INTER, OSWALD] });
  opened.push(api);
  const realtime = testRealtime(ctx);
  const broadcasts = realtime.sentTo('/producer/overlay', 'overlay:default');
  const opens = realtime.opens.filter(([name]) => name === '/producer/overlay');
  const connect = () => realtime.connect('/producer/overlay');
  const call = async (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    api.inject({ method, url: `/api/producer${url}`, ...(payload ? { payload } : {}) });
  const create = async (name: string, tokens?: ThemeTokens) =>
    ThemeSchema.parse((await call('POST', '/themes', { name, tokens })).json());
  return { opens, broadcasts, connect, call, create };
}

function themes(sent: Sent[]) {
  return sent.filter(([event]) => event === THEME_CHANGED_EVENT).map(([, theme]) => theme);
}

describe('the overlay namespace', () => {
  it('is public, and greets each client with the server, then the built-in look while there is no default', () => {
    const { opens, connect } = overlay();
    expect(opens).toEqual([
      ['/producer/overlay', { access: { public: expect.stringContaining('OBS browser sources') as string } }],
    ]);
    expect(connect()).toEqual([
      [SERVER_HELLO_EVENT, { name: APP_NAME, version: '0.1.0' }],
      [THEME_CHANGED_EVENT, null],
    ]);
  });

  it('sends a new client the default theme, with only the font families it uses', async () => {
    const { connect, call, create } = overlay();
    const theme = await create('Derby Night', OSWALD_HEADINGS);
    await call('PUT', '/default-theme', { themeId: theme.id });
    expect(themes(connect())).toEqual([{ tokens: OSWALD_HEADINGS, families: [INTER, OSWALD] }]);
  });

  it('sends every client the new theme when the default is saved, switched, cleared or deleted', async () => {
    const { broadcasts, connect, call, create } = overlay();
    const client = connect();
    const night = await create('Derby Night');
    const finals = await create('Finals', OSWALD_HEADINGS);
    await call('PUT', '/default-theme', { themeId: night.id });
    await call('PATCH', `/themes/${night.id}`, { tokens: OSWALD_HEADINGS });
    await call('PUT', '/default-theme', { themeId: finals.id });
    await call('PUT', '/default-theme', { themeId: null });
    await call('PUT', '/default-theme', { themeId: finals.id });
    await call('DELETE', `/themes/${finals.id}`);
    const withOswald = { tokens: OSWALD_HEADINGS, families: [INTER, OSWALD] };
    expect(themes(broadcasts)).toEqual([
      { tokens: DEFAULT_TOKENS, families: [INTER] },
      withOswald,
      withOswald,
      null,
      withOswald,
      null,
    ]);
    expect(themes(client)).toEqual([null, ...themes(broadcasts)]);
  });

  it('sends nothing when a theme that is not the default changes', async () => {
    const { broadcasts, call, create } = overlay();
    const night = await create('Derby Night');
    await call('PATCH', `/themes/${night.id}`, { tokens: OSWALD_HEADINGS });
    await call('POST', `/themes/${night.id}/duplicate`);
    await call('DELETE', `/themes/${night.id}`);
    expect(broadcasts).toEqual([]);
  });

  it('sends nothing when a change is refused', async () => {
    const { broadcasts, call, create } = overlay();
    const night = await create('Derby Night');
    await create('Finals');
    await call('PUT', '/default-theme', { themeId: night.id });
    broadcasts.length = 0;
    await call('PATCH', `/themes/${night.id}`, { name: 'Finals' });
    await call('PUT', '/default-theme', { themeId: 'nope' });
    expect(broadcasts).toEqual([]);
  });
});
