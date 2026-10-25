import { z } from 'zod';
import { OverlayThemeSchema } from './themes.ts';

// Sent by the server to every client of the /producer/overlay namespace as soon as it connects.
export const SERVER_HELLO_EVENT = 'server:hello';
export const ServerHelloSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
});
export type ServerHello = z.infer<typeof ServerHelloSchema>;

// Sent to every client of /producer/overlay as soon as it connects, and again whenever the default theme changes: its
// tokens and the font families they use, or null for the built-in look.
export const THEME_CHANGED_EVENT = 'theme:changed';
export const ThemeChangedSchema = OverlayThemeSchema.nullable();
export type ThemeChanged = z.infer<typeof ThemeChangedSchema>;
