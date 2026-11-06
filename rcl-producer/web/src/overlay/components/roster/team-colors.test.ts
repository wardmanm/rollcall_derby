import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKENS } from '@rollcall/producer-contract';
import { contrast, readableOn, roleColor, teamColorVariables } from './team-colors.ts';

describe('contrast', () => {
  it("is WCAG's contrast ratio, the same either way round", () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1);
  });

  it('counts a see-through colour as solid, ignoring its alpha', () => {
    expect(contrast('#ffffff', '#00000033')).toBeCloseTo(21);
  });
});

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

describe('roleColor', () => {
  const surface = DEFAULT_TOKENS.colors.surface;

  it("keeps the team's secondary colour when it reads on the card's surface", () => {
    expect(roleColor(team('#b3123f', '#f5c518'), surface)).toBe('#f5c518');
  });

  it("uses the theme's muted text when the secondary colour is too dark for a dark surface", () => {
    expect(roleColor(team('#b3123f', '#1d428a'), surface)).toBe('var(--theme-color-text-muted)');
  });

  it('wants 4.5:1: pure red just misses it on the default surface, and a light surface turns the test round', () => {
    expect(roleColor(team('#000000', '#ff0000'), surface)).toBe('var(--theme-color-text-muted)');
    expect(roleColor(team('#000000', '#1d428a'), '#fffffff0')).toBe('#1d428a');
    expect(roleColor(team('#000000', '#f5c518'), '#fffffff0')).toBe('var(--theme-color-text-muted)');
  });

  it("uses the theme's border with no secondary colour, unchecked, as the theme's author picked it", () => {
    expect(roleColor(team('#b3123f'), surface)).toBe('var(--theme-color-border)');
    expect(roleColor(team('#b3123f', 'navy'), surface)).toBe('var(--theme-color-border)');
  });
});
