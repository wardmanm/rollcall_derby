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
  // The logo loads from the start, hidden behind a photo, so it's ready the moment a photo fails or hangs. This is the
  // logo address whose load has ended, loaded or failed.
  const [logoSettled, setLogoSettled] = useState<string | null>(null);
  const logoReady = logoUrl === null || logoSettled === logoUrl;
  // A photo still loading at the limit counts as failed: the logo shows, and the card comes in without waiting for it.
  const ready = useReadyOnce(onReady, () => {
    if (showPhoto) setFailedUrl(card.photoUrl);
  });

  // A photo makes the card ready itself, when it loads. Without one, the logo (if any) has to have loaded or failed.
  useEffect(() => {
    if (!showPhoto && logoReady) ready();
  }, [showPhoto, logoReady, ready]);

  const settleLogo = () => setLogoSettled(logoUrl);

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
            {showPhoto && (
              <img
                key={card.photoUrl}
                src={card.photoUrl ?? undefined}
                alt=""
                className={classes.cover}
                onLoad={ready}
                onError={() => setFailedUrl(card.photoUrl)}
              />
            )}
            {logoUrl !== null && (
              <img
                key={logoUrl}
                src={logoUrl}
                alt=""
                className={classes.logo}
                hidden={showPhoto}
                onLoad={settleLogo}
                onError={settleLogo}
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
