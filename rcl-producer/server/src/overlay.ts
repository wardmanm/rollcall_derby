import type { AppContext, Realtime } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import {
  familiesUsedBy,
  INTRO_STATE_EVENT,
  IntroHandshakeSchema,
  SERVER_HELLO_EVENT,
  ServerHelloSchema,
  THEME_CHANGED_EVENT,
  type IntroOverlayState,
  type ThemeChanged,
} from '@rollcall/producer-contract';
import * as schema from './db/schema.ts';
import { findIntro } from './intros/intros.ts';
import type { IntroRuns } from './intros/runs.ts';
import { findDefaultTheme, findTheme } from './themes/themes.ts';

// The OBS overlay's live connection, /producer/overlay (docs/features/theme-builder.md and skater-intros.md). Core
// gives the app one context, to both register() and realtime() (ADR-0023), so the routes find the namespace realtime()
// opened through it. A plain overlay joins one room, an intro's overlay its intro's room, so each is sent only its own
// theme and state.
const overlays = new WeakMap<AppContext, ReturnType<Realtime['namespace']>>();

const DEFAULT_ROOM = 'overlay:default';

/** The room an intro's overlays join here, and its control pages in /producer/intros. */
export const introRoom = (id: string) => `intro:${id}`;

const NOTHING_ON_AIR: IntroOverlayState = { revision: 0, onAir: null };

/**
 * A theme as the overlay gets it: its tokens and only the font families they use. With no `themeId`, or one that's
 * gone, that's the default theme, or null for the built-in look when there's no default.
 */
export function overlayTheme(ctx: AppContext, themeId: string | null = null): ThemeChanged {
  const db = ctx.db(schema);
  const theme = (themeId === null ? undefined : findTheme(db, themeId)) ?? findDefaultTheme(db);
  return theme ? { tokens: theme.tokens, families: familiesUsedBy(theme.tokens, ctx.fonts.list()) } : null;
}

/** The overlays in `room`, once realtime() has opened the namespace. */
export const overlaysIn = (ctx: AppContext, room: string) => overlays.get(ctx)?.to(room);

/**
 * Opens /producer/overlay. A plain overlay is greeted with the server and the default theme. An intro's overlay (its
 * handshake names the intro) is greeted with the server, the intro's theme and what's on air, which is nothing for an
 * intro that doesn't exist.
 */
export function openOverlay(rt: Realtime, ctx: AppContext, runs: IntroRuns): void {
  const hello = ServerHelloSchema.parse({ name: APP_NAME, version: ctx.coreVersion });
  const overlay = rt.namespace('/producer/overlay', {
    access: { public: "OBS browser sources can't sign in; output token URLs replace this in Live Mode" },
  });
  overlays.set(ctx, overlay);
  overlay.on('connection', (socket) => {
    const handshake = IntroHandshakeSchema.safeParse(socket.handshake.auth);
    if (!handshake.success) {
      void socket.join(DEFAULT_ROOM);
      socket.emit(SERVER_HELLO_EVENT, hello);
      socket.emit(THEME_CHANGED_EVENT, overlayTheme(ctx));
      return;
    }
    const id = handshake.data.intro;
    const intro = findIntro(ctx.db(schema), id);
    void socket.join(introRoom(id));
    socket.emit(SERVER_HELLO_EVENT, hello);
    socket.emit(THEME_CHANGED_EVENT, overlayTheme(ctx, intro?.themeId));
    socket.emit(INTRO_STATE_EVENT, intro ? runs.overlay(intro) : NOTHING_ON_AIR);
  });
}

/** Sends every plain overlay the default theme as it is now. Intro overlays on the default get it from live.ts. */
export function announceDefaultTheme(ctx: AppContext): void {
  overlaysIn(ctx, DEFAULT_ROOM)?.emit(THEME_CHANGED_EVENT, overlayTheme(ctx));
}
