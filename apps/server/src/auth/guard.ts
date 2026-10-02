import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Role, SessionUser } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { findSession } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionToken: string | null;
  }
}

export const SESSION_COOKIE = 'obs_producer_session';

// The only /api routes anyone may call without a session (ADR-0008). Every other route uses requireSession,
// requireUser or requireRole; the route inventory test (route-inventory.test.ts) fails CI otherwise.
export const PUBLIC_API_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/health',
  'GET /api/setup',
  'POST /api/setup',
  'POST /api/auth/login',
]);

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// The server machine itself (ADR-0008): a loopback address, reached through a loopback name. Checking the name
// too stops a web page whose domain is rebound to 127.0.0.1 from acting through the server machine's browser.
export function isServerMachine(request: FastifyRequest): boolean {
  if (!LOCAL_ADDRESSES.has(request.ip)) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(`http://${request.headers.host ?? ''}`).hostname);
  } catch {
    return false;
  }
}

// Runs inside the /api plugin: CSRF checks, then the session from the cookie (if any) onto the request.
export function installAuth(app: FastifyInstance, db: AppDatabase): void {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request.headers.origin, request.headers.host)) {
      return reply.code(403).send({ error: 'cross_origin' });
    }
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? findSession(db, token) : null;
    if (token && session) {
      request.user = session.user;
      request.sessionToken = token;
    }
    return undefined;
  });
}

// Browsers send Origin on cross-site and same-site writes; no Origin (curl, older clients) is allowed.
function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // includes "null"
  }
}

interface Denial {
  status: number;
  error: string;
}

// Builds a preHandler. No session is always a 401; `deny` can refuse a signed-in user for another reason.
function guard(deny: (user: SessionUser) => Denial | undefined) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) return reply.code(401).send({ error: 'unauthenticated' });
    const denial = deny(request.user);
    if (denial) return reply.code(denial.status).send({ error: denial.error });
    return undefined;
  };
}

const passwordChangePending = (user: SessionUser): Denial | undefined =>
  user.mustChangePassword ? { status: 403, error: 'password_change_required' } : undefined;

/** Signed in, even with a password change pending. Only `me`, `password` and `logout` use this. */
export const requireSession = guard(() => undefined);

/** Signed in, with no password change pending (ADR-0008). */
export const requireUser = guard(passwordChangePending);

/** Signed in with one of these roles, with no password change pending. */
export function requireRole(...roles: readonly Role[]) {
  return guard(
    (user) =>
      passwordChangePending(user) ?? (roles.includes(user.role) ? undefined : { status: 403, error: 'forbidden' }),
  );
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
