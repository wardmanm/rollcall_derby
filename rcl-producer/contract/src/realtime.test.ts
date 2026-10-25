import { describe, expect, it } from 'vitest';
import { ServerHelloSchema, SERVER_HELLO_EVENT, THEME_CHANGED_EVENT, ThemeChangedSchema } from './realtime.ts';
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
