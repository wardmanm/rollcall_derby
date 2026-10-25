import classes from './ThemeSample.module.css';

export interface ThemeSampleProps {
  /** The names of the theme's extra colors, each shown as a swatch of `--theme-extra-<name>`. */
  extras?: readonly string[];
}

const NO_EXTRAS: readonly string[] = [];

// Every theme token at once, for the theme editor's preview and the overlay Storybook (docs/features/theme-builder.md).
// Presentational: styled only with theme variables (ADR-0006).
export function ThemeSample({ extras = NO_EXTRAS }: ThemeSampleProps) {
  return (
    <div className={classes.sample}>
      <div className={classes.heading}>Heading</div>
      <div className={classes.body}>Body text: the jammer laps the pack.</div>
      <div className={classes.muted}>Muted text: Jam 3 · Period 1</div>
      <table className={classes.table}>
        <tbody>
          <tr className={classes.row}>
            <td>07</td>
            <td>Jammy Dodger</td>
          </tr>
          <tr className={classes.rowAlt}>
            <td>00</td>
            <td>Zero Cool</td>
          </tr>
        </tbody>
      </table>
      <div className={classes.accentBar}>Accent bar</div>
      <div className={classes.panel}>Bordered panel</div>
      {extras.length > 0 && (
        <div className={classes.extras}>
          <div className={classes.muted}>Extra colors</div>
          {extras.map((name) => (
            <span key={name} className={classes.extra}>
              <span data-extra className={classes.chip} style={{ background: `var(--theme-extra-${name})` }} />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
