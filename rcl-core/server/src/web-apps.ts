import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/** One hosted rcl app's web build, served below `base` (ADR-0019). */
export interface WebApp {
  /** Where it's served, matching its Vite `base`: `/<id>/`, such as `/producer/`. */
  base: string;
  /** Its production build folder. Skipped while it has no index.html (e.g. in development). */
  dir: string;
  /**
   * More HTML pages, each answering one path below `base` and everything under it, such as
   * `{ overlay: 'overlay.html' }`.
   */
  pages?: Record<string, string>;
}

// Serves each hosted app's build below its base (ADR-0019): real files as they are, its pages at their paths, and
// index.html for every other path below the base, so client-side routes like /producer/screens/3 load. A path that
// looks like a file gets no page, so a missing file is a 404. `/` redirects to the first app (core's). Returns the
// page for a path that no route or file answers, if any; the server's not-found handler sends it.
export function serveWebApps(
  app: FastifyInstance,
  webApps: readonly WebApp[],
): (path: string) => { dir: string; file: string } | undefined {
  for (const web of webApps) {
    if (!/^\/[a-z][a-z0-9-]*\/$/.test(web.base)) throw new Error(`Web app base ${web.base} must be /<id>/`);
  }
  const home = webApps[0]?.base;
  if (home) app.get('/', (_request, reply) => reply.redirect(home, 302));
  const built = webApps.filter((web) => existsSync(join(web.dir, 'index.html')));
  built.forEach((web, i) => {
    // Only the first registration may add reply.sendFile; the others share it.
    void app.register(fastifyStatic, { root: web.dir, prefix: web.base, wildcard: false, decorateReply: i === 0 });
  });
  return (path) => {
    const web = appAt(built, path);
    const file = web && pageAt(web, path);
    return web && file !== undefined ? { dir: web.dir, file } : undefined;
  };
}

// The app with the longest base that `path` is at or below ('/producer' counts as '/producer/').
function appAt(apps: readonly WebApp[], path: string): WebApp | undefined {
  return apps
    .filter((web) => `${path}/`.startsWith(web.base))
    .reduce<WebApp | undefined>((best, web) => (best && best.base.length >= web.base.length ? best : web), undefined);
}

// A path below a base that looks like a file: anything under assets/, or with a dot in its last part (an extension).
// No page answers one, so an old hashed asset asked for after an upgrade gets a 404, not HTML the browser can't run.
const FILE_PATH = /^assets\/|\.[^/]*$/;

// The page that answers `path`: one of the app's own pages, or its index.html. None for a path that looks like a file.
function pageAt(web: WebApp, path: string): string | undefined {
  const below = path.slice(web.base.length);
  if (FILE_PATH.test(below)) return undefined;
  const page = Object.entries(web.pages ?? {}).find(([name]) => below === name || below.startsWith(`${name}/`));
  return page?.[1] ?? 'index.html';
}
