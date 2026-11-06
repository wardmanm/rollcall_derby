import { describe, expect, it } from 'vitest';
import { readableOn, teamColorVariables } from './team-colors.ts';

describe('readableOn', () => {
  it('picks the text color with more contrast', () => {
    expect(readableOn('#b3123f')).toBe('#ffffff');
    expect(readableOn('#f5c518')).toBe('#000000');
  });

  it('reads 3-digit colours', () => {
    expect(readableOn('#fff')).toBe('#000000');
    expect(readableOn('#000')).toBe('#ffffff');
  });
});

const team = (primaryColor: string | null, secondaryColor: string | null = null) => ({
  name: 'A',
  leagueName: null,
  logoUrl: null,
  primaryColor,
  secondaryColor,
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
      '--team-fade': '#ffffff',
    });
  });

  it('fades toward the colour opposite the text, so the text only gets easier to read', () => {
    expect(teamColorVariables(team('#b3123f'))['--team-fade']).toBe('#000000');
    expect(teamColorVariables(team('#f5c518'))['--team-fade']).toBe('#ffffff');
  });

  it("treats a colour that isn't hex as no colour", () => {
    expect(teamColorVariables(team('nonsense', 'red'))).toEqual(teamColorVariables(team(null)));
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
      // A plain bar: which way the theme's text colour needs to fade isn't known.
      '--team-fade': 'var(--team-primary)',
    });
  });
});
