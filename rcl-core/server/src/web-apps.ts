import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/** One rcl app's web build, served below `base` (split spec). */
export interface WebApp {
  /** Where it's served, matching its Vite `base`: `/producer/`, or `/` for the app at the root. */
  base: string;
  /** Its production build folder. Skipped while it has no index.html (e.g. in development). */
  dir: string;
  /**
   * More HTML pages, each answering one path below `base` and everything under it, such as
   * `{ overlay: 'overlay.html' }`.
   */
  pages?: Record<string, string>;
}

const PRODUCER_WEB_DIR = fileURLToPath(new URL('../../../rcl-producer/web/dist', import.meta.url));

// The web builds this server serves. Temporary: Phase 4b replaces this list with each installed app module's `web`.
export function installedWebApps(coreWebDir: string): WebApp[] {
  return [
    { base: '/', dir: coreWebDir },
    { base: '/producer/', dir: PRODUCER_WEB_DIR, pages: { overlay: 'overlay.html' } },
  ];
}

// Serves each app's build below its base: real files as they are, its pages at their paths, and index.html for
// every other GET below the base, so client-side routes like /producer/screens/3 load. API and Socket.IO paths, and
// paths no app claims, get a JSON 404.
export function serveWebApps(app: FastifyInstance, webApps: readonly WebApp[]): void {
  const built = webApps.filter((web) => existsSync(join(web.dir, 'index.html')));
  built.forEach((web, i) => {
    // Only the first registration may add reply.sendFile; the others share it.
    void app.register(fastifyStatic, { root: web.dir, prefix: web.base, wildcard: false, decorateReply: i === 0 });
  });
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    const web = request.method === 'GET' && !/^\/(api|socket\.io)(\/|$)/.test(path) ? appAt(built, path) : undefined;
    if (!web) {
      return reply
        .code(404)
        .send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
    }
    return reply.type('text/html').sendFile(pageAt(web, path), web.dir);
  });
}

// The app with the longest base that `path` is at or below ('/producer' counts as '/producer/').
function appAt(apps: readonly WebApp[], path: string): WebApp | undefined {
  return apps
    .filter((web) => `${path}/`.startsWith(web.base))
    .reduce<WebApp | undefined>((best, web) => (best && best.base.length >= web.base.length ? best : web), undefined);
}

// The page that answers `path`: one of the app's own pages, or its index.html.
function pageAt(web: WebApp, path: string): string {
  const below = path.slice(web.base.length);
  const page = Object.entries(web.pages ?? {}).find(([name]) => below === name || below.startsWith(`${name}/`));
  return page?.[1] ?? 'index.html';
}
