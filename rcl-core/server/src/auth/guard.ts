import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDatabase } from '../db.ts';
import { deny, type Denial, type Permissions, type Principal } from './access.ts';
import { findApiKey } from './api-keys.ts';
import { findSession } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Who's calling, from the session cookie; null when nobody is signed in. */
    principal: Principal | null;
    /**
     * Checks the caller again against the database as it is now. A handler that awaits (password hashing) before it
     * writes calls this after the await: the caller may have been demoted, deleted or signed out in the meantime.
     */
    recheckAccess(): Denial | undefined;
  }
}

export const SESSION_COOKIE = 'rollcall_session';

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// The server machine itself (ADR-0018): a loopback address, reached through a loopback name. Checking the name
// too stops a web page whose domain is rebound to 127.0.0.1 from acting through the server machine's browser.
export function isServerMachine(request: FastifyRequest): boolean {
  if (!LOCAL_ADDRESSES.has(request.ip)) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(`http://${request.headers.host ?? ''}`).hostname);
  } catch {
    return false;
  }
}

const BEARER = /^Bearer\s+(\S+)\s*$/i;

/**
 * The caller a request's credentials identify. An `Authorization` header, when present, is all that counts: a valid
 * `Bearer` API key, or nobody, and the session cookie is ignored (ADR-0020). Otherwise it's the session cookie's user.
 * Output tokens are resolved here too once they exist.
 */
export function resolvePrincipal(
  db: AppDatabase,
  { cookies, authorization }: { cookies: Record<string, string | undefined>; authorization?: string },
): Principal | null {
  if (authorization !== undefined) {
    const bearer = BEARER.exec(authorization)?.[1];
    const key = bearer ? findApiKey(db, bearer) : null;
    return key ? { kind: 'apiKey', key } : null;
  }
  const token = cookies[SESSION_COOKIE];
  const session = token ? findSession(db, token) : null;
  return token && session ? { kind: 'session', user: session.user, token } : null;
}

const credentials = (request: FastifyRequest) => ({
  cookies: request.cookies,
  authorization: request.headers.authorization,
});

// Runs inside the /api plugin: the CSRF check, then the caller onto the request. Each route's access is enforced
// separately, by enforceRouteAccess in access.ts.
export function installAuth(app: FastifyInstance, { db, permissions }: { db: AppDatabase; permissions: Permissions }) {
  app.decorateRequest('principal', null);
  app.decorateRequest('recheckAccess', function (this: FastifyRequest) {
    this.principal = resolvePrincipal(db, credentials(this));
    const { access } = this.routeOptions.config;
    return access ? deny(access, this.principal, permissions) : { status: 403, error: 'forbidden' };
  });

  app.addHook('onRequest', async (request, reply) => {
    // A request with an Authorization header comes from a device or script, not a forged cross-site form: browsers
    // never add that header on their own, and the session cookie is ignored for it (ADR-0020).
    const fromBrowser = request.headers.authorization === undefined;
    if (
      fromBrowser &&
      !SAFE_METHODS.has(request.method) &&
      !isSameOrigin(request.headers.origin, request.headers.host)
    ) {
      return reply.code(403).send({ error: 'cross_origin' });
    }
    request.principal = resolvePrincipal(db, credentials(request));
    return undefined;
  });
}

// Browsers send Origin on cross-site and same-site writes; no Origin (curl, older clients) is allowed.
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // includes "null"
  }
}

export function setSessionCookie(reply: FastifyReply, request: FastifyRequest, token: string, expiresAt: Date): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: request.protocol === 'https',
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  void reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
