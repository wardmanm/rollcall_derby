import type { FontFamily } from '@rollcall/core-contract';
import type { Queryable } from '../db.ts';
import { BUNDLED_FAMILIES } from './bundled.ts';

// The font library: the bundled families now; uploaded faces join them in their own families.

/** Every family, bundled first. */
export function listFonts(_db: Queryable): FontFamily[] {
  return [...BUNDLED_FAMILIES];
}
