import { describe, expect, it } from 'vitest';
import {
  INTRO_RUN_EVENT,
  INTRO_STATE_EVENT,
  IntroHandshakeSchema,
  ServerHelloSchema,
  SERVER_HELLO_EVENT,
  THEME_CHANGED_EVENT,
  ThemeChangedSchema,
} from './realtime.ts';
import { DEFAULT_TOKENS } from './themes.ts';

describe('ServerHelloSchema', () => {
  it('accepts the hello the server sends on connect', () => {
    expect(ServerHelloSchema.parse({ name: 'Rollcall', version: '0.1.0' })).toEqual({
      name: 'Rollcall',
      version: '0.1.0',
    });
  });

  it('rejects a hello without a version', () => {
    expect(ServerHelloSchema.safeParse({ name: 'Rollcall' }).success).toBe(false);
  });

  it('names the event', () => {
    expect(SERVER_HELLO_EVENT).toBe('server:hello');
  });
});

describe('ThemeChangedSchema', () => {
  it('accepts the default theme with its font families, or null for the built-in look', () => {
    const theme = { tokens: DEFAULT_TOKENS, families: [] };
    expect(ThemeChangedSchema.parse(theme)).toEqual(theme);
    expect(ThemeChangedSchema.parse(null)).toBeNull();
    expect(THEME_CHANGED_EVENT).toBe('theme:changed');
  });

  it('rejects a theme without its tokens', () => {
    expect(ThemeChangedSchema.safeParse({ families: [] }).success).toBe(false);
  });
});

describe('intro events and handshake', () => {
  it('names the events', () => {
    expect(INTRO_STATE_EVENT).toBe('intro:state');
    expect(INTRO_RUN_EVENT).toBe('intro:run');
  });

  it('needs an intro id in the handshake, of at most 64 characters', () => {
    expect(IntroHandshakeSchema.parse({ intro: 'i1' })).toEqual({ intro: 'i1' });
    const uuid = 'a3bb189e-8bf9-3888-9912-ace4e6543002';
    expect(IntroHandshakeSchema.parse({ intro: uuid })).toEqual({ intro: uuid });
    expect(IntroHandshakeSchema.safeParse({ intro: 'x'.repeat(64) }).success).toBe(true);
    expect(IntroHandshakeSchema.safeParse({ intro: 'x'.repeat(65) }).success).toBe(false);
    expect(IntroHandshakeSchema.safeParse({ intro: '' }).success).toBe(false);
    expect(IntroHandshakeSchema.safeParse({ intro: 7 }).success).toBe(false);
    expect(IntroHandshakeSchema.safeParse({}).success).toBe(false);
  });
});
