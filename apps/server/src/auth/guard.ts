import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SessionUser } from '@obs-producer/shared';
import type { AppDatabase } from '../db.ts';
import { findSession } from './sessions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    sessionToken: string | null;
  }
}

export const SESSION_COOKIE = 'obs_producer_session';
export const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) return reply.code(401).send({ error: 'unauthenticated' });
  return undefined;
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
