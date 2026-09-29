import classes from './PlaceholderCard.module.css';

export interface PlaceholderCardProps {
  title: string;
  subtitle?: string;
}

// Stand-in overlay component until the real catalog exists (docs/features/overlay-components.md).
// Presentational: everything comes in through props, and styling comes from theme variables.
export function PlaceholderCard({ title, subtitle }: PlaceholderCardProps) {
  return (
    <div className={classes.card}>
      <div className={classes.title}>{title}</div>
      {subtitle && <div className={classes.subtitle}>{subtitle}</div>}
    </div>
  );
}
