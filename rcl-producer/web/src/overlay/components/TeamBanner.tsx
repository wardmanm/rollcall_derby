import { useEffect, useState } from 'react';
import type { RosterTeam } from '@rollcall/producer-contract';
import { cssVars } from './roster/css-vars.ts';
import { teamColorVariables } from './roster/team-colors.ts';
import { useReadyOnce } from './useReadyOnce.ts';
import classes from './TeamBanner.module.css';

export interface TeamBannerProps {
  team: RosterTeam;
  /** Called once, when the logo has loaded or failed, or at once when there is none, or after LOAD_LIMIT_MS at the latest. */
  onReady?: () => void;
}

// The team's title banner: a bar on the team color with the logo, name and league, and an underline in the secondary color.
export function TeamBanner({ team, onReady }: TeamBannerProps) {
  // The logo that failed or hung: the banner comes in without it, rather than with an empty circle it might pop into on
  // air. A new logo address is tried.
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const logoUrl = team.logoUrl === failedLogo ? null : team.logoUrl;
  const ready = useReadyOnce(onReady, () => setFailedLogo(team.logoUrl));
  useEffect(() => {
    if (logoUrl === null) ready();
  }, [logoUrl, ready]);

  return (
    <div className={classes.banner} style={cssVars(teamColorVariables(team))}>
      {logoUrl !== null && (
        <div className={classes.logo} data-testid="banner-logo">
          <img src={logoUrl} alt="" onLoad={ready} onError={() => setFailedLogo(logoUrl)} />
        </div>
      )}
      <div className={classes.text}>
        <div className={classes.name} style={cssVars({ '--name-length': Math.max(team.name.length, 1) })}>
          {team.name}
        </div>
        {team.leagueName !== null && <div className={classes.league}>{team.leagueName}</div>}
      </div>
    </div>
  );
}
