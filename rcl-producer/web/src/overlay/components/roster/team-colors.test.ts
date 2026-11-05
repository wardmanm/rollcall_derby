import { describe, expect, it } from 'vitest';
import { readableOn, teamColorVariables } from './team-colors.ts';

describe('readableOn', () => {
  it('picks the text color with more contrast', () => {
    expect(readableOn('#b3123f')).toBe('#ffffff');
    expect(readableOn('#f5c518')).toBe('#000000');
  });
});

describe('teamColorVariables', () => {
  it('uses the team colors and a readable text color', () => {
    const vars = teamColorVariables({
      name: 'A',
      leagueName: null,
      logoUrl: null,
      primaryColor: '#f5c518',
      secondaryColor: '#112233',
    });
    expect(vars).toEqual({
      '--team-primary': '#f5c518',
      '--team-secondary': '#112233',
      '--team-on-primary': '#000000',
    });
  });

  it('falls back to the theme when the team has no colors', () => {
    const vars = teamColorVariables({
      name: 'A',
      leagueName: null,
      logoUrl: null,
      primaryColor: null,
      secondaryColor: null,
    });
    expect(vars).toEqual({
      '--team-primary': 'var(--theme-color-accent)',
      '--team-secondary': 'var(--theme-color-border)',
      '--team-on-primary': 'var(--theme-color-on-accent)',
    });
  });
});
