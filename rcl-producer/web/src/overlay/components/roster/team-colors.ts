import type { RosterTeam } from '@rollcall/producer-contract';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// WCAG relative luminance of a 3-, 6- or 8-digit hex colour. An 8-digit colour's alpha is ignored.
function luminance(hex: string): number {
  const digits = hex.replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two hex colours, from 1 to 21. A see-through colour counts as solid. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** WCAG's contrast for normal text: a team colour with less against the card's surface isn't used for its text. */
export const MIN_TEXT_CONTRAST = 4.5;

/** Black or white, whichever has the higher WCAG contrast ratio against `hex`. */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  return contrast(hex, '#ffffff') >= contrast(hex, '#000000') ? '#ffffff' : '#000000';
}

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

/** The colour if it's 3- or 6-digit hex, which is all the roster can read; anything else counts as none. */
const hexOrNull = (color: string | null): string | null => (color !== null && HEX.test(color) ? color : null);

/**
 * The colour the title banner fades toward: black under white text and white under black, so the text only gets
 * easier to read along it. With the theme's accent, which way is safe isn't known, so the bar stays plain.
 */
const fadeToward = (onPrimary: string | null): string => {
  if (onPrimary === null) return 'var(--team-primary)';
  return onPrimary === '#ffffff' ? '#000000' : '#ffffff';
};

/** The custom properties the roster pieces use for a team, falling back to the theme. */
export function teamColorVariables(
  team: RosterTeam,
): Record<'--team-primary' | '--team-secondary' | '--team-on-primary' | '--team-fade', string> {
  const primary = hexOrNull(team.primaryColor);
  const secondary = hexOrNull(team.secondaryColor);
  const onPrimary = primary === null ? null : readableOn(primary);
  return {
    '--team-primary': primary ?? 'var(--theme-color-accent)',
    '--team-secondary': secondary ?? 'var(--theme-color-border)',
    '--team-on-primary': onPrimary ?? 'var(--theme-color-on-accent)',
    '--team-fade': fadeToward(onPrimary),
  };
}

/**
 * The colour of a person card's role line, which sits on the theme's `surface`: the team's secondary colour when it
 * has at least MIN_TEXT_CONTRAST against the surface (counted as solid, since what shows through is unknown), or else
 * the theme's muted text. A team without a secondary colour gets the theme's border, which the theme's author picked to
 * go with its surface, so it isn't checked.
 */
export function roleColor(team: RosterTeam, surface: string): string {
  const secondary = hexOrNull(team.secondaryColor);
  if (secondary === null) return 'var(--theme-color-border)';
  return contrast(secondary, surface) >= MIN_TEXT_CONTRAST ? secondary : 'var(--theme-color-text-muted)';
}
