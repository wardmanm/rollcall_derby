import { useEffect } from 'react';
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
  const ready = useReadyOnce(onReady);
  useEffect(() => {
    if (team.logoUrl === null) ready();
  }, [team.logoUrl, ready]);

  return (
    <div className={classes.banner} style={cssVars(teamColorVariables(team))}>
      {team.logoUrl !== null && (
        <div className={classes.logo}>
          <img src={team.logoUrl} alt="" onLoad={ready} onError={ready} />
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
