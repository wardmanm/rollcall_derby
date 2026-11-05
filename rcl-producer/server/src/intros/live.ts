import type { AppContext, Realtime } from '@rollcall/app-sdk';
import {
  INTRO_RUN_EVENT,
  INTRO_STATE_EVENT,
  IntroHandshakeSchema,
  THEME_CHANGED_EVENT,
  type Intro,
  type IntroOverlayState,
} from '@rollcall/producer-contract';
import * as schema from '../db/schema.ts';
import { introRoom, overlaysIn, overlayTheme } from '../overlay.ts';
import { findTheme } from '../themes/themes.ts';
import { findIntro, listIntros } from './intros.ts';
import type { IntroRuns } from './runs.ts';

// Intros live (docs/features/skater-intros.md): each intro has a room in /producer/overlay, which its OBS overlays
// join, and one in /producer/intros, which its control pages join. Both get the full state on connect and after every
// change.
const controls = new WeakMap<AppContext, ReturnType<Realtime['namespace']>>();

/** Opens /producer/intros for control pages, which name their intro in the handshake and get its run. */
export function openIntroControl(rt: Realtime, ctx: AppContext, runs: IntroRuns): void {
  const control = rt.namespace('/producer/intros', { access: { permission: 'producer:intros.run' } });
  controls.set(ctx, control);
  control.on('connection', (socket) => {
    const handshake = IntroHandshakeSchema.safeParse(socket.handshake.auth);
    const intro = handshake.success ? findIntro(ctx.db(schema), handshake.data.intro) : undefined;
    if (!intro) return;
    void socket.join(introRoom(intro.id));
    socket.emit(INTRO_RUN_EVENT, runs.run(intro));
  });
}

/** Sends the intro's overlays what's on air, and its control pages the run. */
export function announceIntro(ctx: AppContext, runs: IntroRuns, introId: string): void {
  const intro = findIntro(ctx.db(schema), introId);
  if (!intro) return;
  overlaysIn(ctx, introRoom(introId))?.emit(INTRO_STATE_EVENT, runs.overlay(intro));
  controls.get(ctx)?.to(introRoom(introId)).emit(INTRO_RUN_EVENT, runs.run(intro));
}

/** Sends a deleted intro's overlays its last state, from `IntroRuns.forget`: nothing on air. */
export function announceIntroGone(ctx: AppContext, introId: string, state: IntroOverlayState): void {
  overlaysIn(ctx, introRoom(introId))?.emit(INTRO_STATE_EVENT, state);
}

/** Sends the intro's overlays its theme as it is now: its own, or the default. */
export function announceIntroTheme(ctx: AppContext, intro: Intro): void {
  overlaysIn(ctx, introRoom(intro.id))?.emit(THEME_CHANGED_EVENT, overlayTheme(ctx, intro.themeId));
}

/**
 * Sends the overlays of every intro on the theme with this id, or with null on the default, that theme as it is now.
 * Deleting a theme moves its intros to the default, so for a theme that's gone, it's every intro on the default.
 */
export function announceIntroThemes(ctx: AppContext, themeId: string | null): void {
  const db = ctx.db(schema);
  const using = themeId !== null && findTheme(db, themeId) ? themeId : null;
  const intros = listIntros(db).filter((intro) => intro.themeId === using);
  if (intros.length === 0) return;
  const theme = overlayTheme(ctx, using);
  for (const intro of intros) overlaysIn(ctx, introRoom(intro.id))?.emit(THEME_CHANGED_EVENT, theme);
}
