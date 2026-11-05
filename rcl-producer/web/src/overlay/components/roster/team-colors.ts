import type { RosterTeam } from '@rollcall/producer-contract';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

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

/** Black or white, whichever has the higher WCAG contrast ratio against `hex`. */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  const l = luminance(hex);
  // Contrast against white is 1.05 / (l + 0.05); against black it is (l + 0.05) / 0.05.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

/** The custom properties the roster pieces use for a team, falling back to the theme. */
export function teamColorVariables(
  team: RosterTeam,
): Record<'--team-primary' | '--team-secondary' | '--team-on-primary', string> {
  return {
    '--team-primary': team.primaryColor ?? 'var(--theme-color-accent)',
    '--team-secondary': team.secondaryColor ?? 'var(--theme-color-border)',
    '--team-on-primary': team.primaryColor ? readableOn(team.primaryColor) : 'var(--theme-color-on-accent)',
  };
}
