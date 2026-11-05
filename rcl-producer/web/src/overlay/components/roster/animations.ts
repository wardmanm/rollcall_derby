import classes from '../TeamRoster.module.css';

/**
 * The exits' keyframe names, as the CSS module names them, so an animationend can say whether it ended an exit. An
 * entrance that ends just as the row starts leaving must not count as the piece having left.
 */
export const EXIT_ANIMATIONS: ReadonlySet<string> = new Set(
  ['pop-out', 'slide-up-out', 'fade-out', 'wipe-out'].flatMap((name) => classes[name] ?? []),
);
