import { DEFAULT_TOKENS, type IntroOverlayState, type ThemeChanged } from '@rollcall/producer-contract';
import { OverlayCanvas } from './components/OverlayCanvas.tsx';
import { TeamRoster } from './components/TeamRoster.tsx';
import { ThemeWhenLoaded } from './ThemeWhenLoaded.tsx';

// An intro's OBS page: its team roster on the canvas, in the intro's theme. The roster mounts only once the server has
// sent the intro's state, so a reload shows what is on air without replaying entrances (TeamRoster treats its first
// state as a reload). It gets the surface of the theme on show, so its colour checks change with the theme's look.
export function IntroOverlay({ state, theme }: { state: IntroOverlayState | null; theme: ThemeChanged }) {
  if (!state) return null;
  return (
    <OverlayCanvas>
      <ThemeWhenLoaded theme={theme}>
        {(applied) => <TeamRoster onAir={state.onAir} surface={(applied?.tokens ?? DEFAULT_TOKENS).colors.surface} />}
      </ThemeWhenLoaded>
    </OverlayCanvas>
  );
}
