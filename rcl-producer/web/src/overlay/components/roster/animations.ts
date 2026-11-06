import classes from '../TeamRoster.module.css';

/** The exits' keyframes, as TeamRoster.module.css names them. */
export const EXIT_KEYFRAMES = ['pop-out', 'slide-up-out', 'fade-out', 'wipe-out'] as const;

/**
 * The exits' keyframe names, as the CSS module names them, so an animationend can say whether it ended an exit. An
 * entrance that ends just as the row starts leaving must not count as the piece having left. Vitest stands in for CSS
 * modules with names of its own, so bundle.test.ts checks these against the real build.
 */
export const EXIT_ANIMATIONS: ReadonlySet<string> = new Set(EXIT_KEYFRAMES.flatMap((name) => classes[name] ?? []));
