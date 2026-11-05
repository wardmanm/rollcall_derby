import type { IntroOverlayState, ThemeChanged } from '@rollcall/producer-contract';
import { OverlayCanvas } from './components/OverlayCanvas.tsx';
import { TeamRoster } from './components/TeamRoster.tsx';
import { ThemeWhenLoaded } from './ThemeWhenLoaded.tsx';

// An intro's OBS page: its team roster on the canvas, in the intro's theme. The roster mounts only once the server has
// sent the intro's state, so a reload shows what is on air without replaying entrances (TeamRoster treats its first
// state as a reload).
export function IntroOverlay({ state, theme }: { state: IntroOverlayState | null; theme: ThemeChanged }) {
  if (!state) return null;
  return (
    <OverlayCanvas>
      <ThemeWhenLoaded theme={theme}>
        <TeamRoster onAir={state.onAir} />
      </ThemeWhenLoaded>
    </OverlayCanvas>
  );
}
