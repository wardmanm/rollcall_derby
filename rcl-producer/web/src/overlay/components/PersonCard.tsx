import { useEffect, useState } from 'react';
import type { RosterCard } from '@rollcall/producer-contract';
import { cssVars } from './roster/css-vars.ts';
import { useReadyOnce } from './useReadyOnce.ts';
import classes from './PersonCard.module.css';

export interface PersonCardProps {
  card: RosterCard;
  /** Width in canvas pixels; everything inside scales with it. */
  width: number;
  /** The team logo, shown when the person has no photo or it fails to load. */
  logoUrl: string | null;
  /**
   * Called once, when the picture has loaded or failed over, so the entrance doesn't play on a blank card, or after
   * LOAD_LIMIT_MS at the latest.
   */
  onReady?: () => void;
}

// The photo card: a 4:3 photo (or the team logo), the number as a badge, then the name and role line. Team colors come
// from --team-primary, --team-on-primary and --team-role (the role line's), set by a parent (see roster/team-colors.ts).
export function PersonCard({ card, width, logoUrl, onReady }: PersonCardProps) {
  // The photo that failed, so a new photo address (a corrected photo) is tried.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = card.photoUrl !== null && card.photoUrl !== failedUrl;
  const src = showPhoto ? card.photoUrl : logoUrl;
  // A photo still loading at the limit counts as failed: the logo shows, and the card comes in without waiting for it.
  const ready = useReadyOnce(onReady, () => {
    if (showPhoto) setFailedUrl(card.photoUrl);
  });

  useEffect(() => {
    if (src === null) ready();
  }, [src, ready]);

  const onError = () => {
    // A failed photo fails over to the logo, which then has to load (or fail) before the card is ready.
    if (showPhoto) setFailedUrl(card.photoUrl);
    else ready();
  };

  return (
    <figure
      aria-label={card.name}
      className={classes.card}
      style={{
        width,
        ...cssVars({ '--name-length': Math.max(card.name.length, 1) }),
      }}
    >
      <div className={classes.frame}>
        <div className={classes.top}>
          {card.number !== null && <div className={classes.number}>{card.number}</div>}
          <div className={classes.photo}>
            {src !== null && (
              <img
                key={src}
                src={src}
                alt=""
                className={showPhoto ? classes.cover : classes.logo}
                onLoad={ready}
                onError={onError}
              />
            )}
          </div>
        </div>
        <div className={classes.text}>
          <div className={classes.name}>{card.name}</div>
          <div className={classes.role}>
            <span className={classes.roleText}>{card.roleLine}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}
