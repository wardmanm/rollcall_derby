import { useEffect, useMemo, useState } from 'react';
import { useElementSize } from '@mantine/hooks';
import type { Team } from '@rollcall/core-contract';
import {
  rosterCard,
  rosterTeam,
  type IntroPlacement,
  type RosterOnAir,
  type RosterOptions,
  type ThemeCss,
} from '@rollcall/producer-contract';
import { OverlayCanvas } from '../overlay/components/OverlayCanvas.tsx';
import { CANVAS_WIDTH } from '../overlay/components/roster/layout.ts';
import { TeamRoster } from '../overlay/components/TeamRoster.tsx';
import { ThemeScope } from '../overlay/ThemeScope.tsx';
import classes from './IntroPreview.module.css';

const STEP_MS = 1200;
/** The most cards the demo shows, so the preview stays quick to read. */
const DEMO_CARDS = 4;

export interface IntroPreviewProps {
  /** Team A, with its members. Without it, nothing shows. */
  team: Team | undefined;
  options: RosterOptions;
  placement: IntroPlacement;
  theme: ThemeCss | null;
}

// A small, looping demo of the overlay (docs/features/skater-intros.md): team A's title, then its first people one
// after another, then over again, using the overlay's own components so it looks as the OBS page will.
export function IntroPreview({ team, options, placement, theme }: IntroPreviewProps) {
  const people = useMemo(
    () => team?.members.map((member) => rosterCard(member, { showPronouns: options.showPronouns })) ?? [],
    [team, options.showPronouns],
  );
  const slots = options.atOnce === 'team' ? Math.max(people.length, 1) : options.atOnce;
  const demo = Math.min(slots, DEMO_CARDS, people.length);

  // Step 0 is the title; step n shows the first n people.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => (current >= demo ? 0 : current + 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [demo]);

  const onAir = useMemo<RosterOnAir | null>(() => {
    if (!team) return null;
    const shown = Math.min(step, demo);
    return {
      team: rosterTeam(team),
      title: shown === 0,
      cards: people.slice(0, shown),
      upNext: people[shown] ?? null,
      slots,
      entrance: options.entrance,
      placement,
    };
  }, [team, people, step, demo, slots, options.entrance, placement]);

  // The canvas is scaled to the frame's width, which the frame's 16:9 shape matches, so all of it shows at any width.
  // Until the frame is measured (one frame after it appears), the scale is 0 and nothing shows.
  const { ref: frameRef, width } = useElementSize();

  return (
    <div ref={frameRef} className={classes.frame} data-testid="intro-preview">
      <OverlayCanvas scale={width / CANVAS_WIDTH}>
        <ThemeScope css={theme}>
          <TeamRoster onAir={onAir} />
        </ThemeScope>
      </OverlayCanvas>
    </div>
  );
}
