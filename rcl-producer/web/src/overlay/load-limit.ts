/**
 * How long the OBS page waits for a picture (a photo or logo) or a theme's fonts. One that has neither loaded nor failed
 * by then counts as failed, so a request that hangs can't hold a card, or the whole roster, off air
 * (docs/features/skater-intros.md).
 */
export const LOAD_LIMIT_MS = 4000;
