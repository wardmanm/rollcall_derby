const INTRO_PATH = /^\/producer\/overlay\/intros\/([^/]+)\/?$/;

/** The intro an OBS page address is for (`/producer/overlay/intros/<id>`), or null for any other address. */
export function introIdFromPath(pathname: string): string | null {
  const id = INTRO_PATH.exec(pathname)?.[1];
  if (id === undefined) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}
