import type { AppContext, Realtime } from '@rollcall/app-sdk';
import { APP_NAME } from '@rollcall/core-contract';
import {
  familiesUsedBy,
  SERVER_HELLO_EVENT,
  ServerHelloSchema,
  THEME_CHANGED_EVENT,
  type ThemeChanged,
} from '@rollcall/producer-contract';
import * as schema from './db/schema.ts';
import { findDefaultTheme } from './themes/themes.ts';

// The OBS overlay's live connection, /producer/overlay (docs/features/theme-builder.md). Core gives the app one context,
// to both register() and realtime() (ADR-0023), so the theme routes find the namespace realtime() opened through it.
const overlays = new WeakMap<AppContext, ReturnType<Realtime['namespace']>>();

// The default theme as the overlay gets it: its tokens and only the font families they use, or null with no default.
function overlayTheme(ctx: AppContext): ThemeChanged {
  const theme = findDefaultTheme(ctx.db(schema));
  return theme ? { tokens: theme.tokens, families: familiesUsedBy(theme.tokens, ctx.fonts.list()) } : null;
}

/** Opens /producer/overlay, which greets each client with the server and the default theme. */
export function openOverlay(rt: Realtime, ctx: AppContext): void {
  const hello = ServerHelloSchema.parse({ name: APP_NAME, version: ctx.coreVersion });
  const overlay = rt.namespace('/producer/overlay', {
    access: { public: "OBS browser sources can't sign in; output token URLs replace this in Live Mode" },
  });
  overlays.set(ctx, overlay);
  overlay.on('connection', (socket) => {
    socket.emit(SERVER_HELLO_EVENT, hello);
    socket.emit(THEME_CHANGED_EVENT, overlayTheme(ctx));
  });
}

/** Sends every connected overlay the default theme as it is now. */
export function announceDefaultTheme(ctx: AppContext): void {
  overlays.get(ctx)?.emit(THEME_CHANGED_EVENT, overlayTheme(ctx));
}
