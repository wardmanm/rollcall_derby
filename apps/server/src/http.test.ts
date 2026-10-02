import { describe, expect, it } from 'vitest';
import { testApp } from './testing.ts';

const login = (app: ReturnType<typeof testApp>['app'], remoteAddress = '127.0.0.1') =>
  app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress, payload: { username: 'x', password: 'y' } });

describe('errors raised by Fastify and its plugins', () => {
  it('name a rate limit', async () => {
    const { app } = testApp();
    for (let i = 0; i < 10; i++) await login(app);
    const res = await login(app);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: 'rate_limited', message: expect.stringContaining('retry in 1 minute') });
  });

  it('name a body that is not JSON', async () => {
    const { app } = testApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: 'a=b',
      headers: { 'content-type': 'text/plain' },
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ error: 'unsupported_media_type' });
  });

  it('name malformed JSON', async () => {
    const { app } = testApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: '{"username":',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'bad_request' });
  });

  it('hide the details of a server error', async () => {
    const { app } = testApp({
      registerRoutes: (api) => {
        api.get('/api/boom', async () => {
          throw new Error('SQLITE_CORRUPT in /data/obs-producer.db');
        });
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal_error' });
  });

  it('hide the details of a server error on the health route too', async () => {
    // A version that isn't a string makes the health response fail its own schema.
    const { app } = testApp({ version: 42 as unknown as string });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal_error' });
  });
});

describe('rate limits', () => {
  it('count each IPv6 device on its own', async () => {
    const { app } = testApp();
    for (let i = 0; i < 10; i++) await login(app, 'fd00::1');
    expect((await login(app, 'fd00::1')).statusCode).toBe(429);
    expect((await login(app, 'fd00::2')).statusCode).toBe(401);
  });
});
