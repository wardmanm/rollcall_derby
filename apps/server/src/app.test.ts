import { describe, expect, it } from 'vitest';
import { APP_NAME, HealthResponseSchema } from '@obs-producer/shared';
import { buildApp } from './app.ts';

describe('GET /api/health', () => {
  it('returns the shared health contract', async () => {
    const app = buildApp({ version: '1.2.3' });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', name: APP_NAME, version: '1.2.3' });
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('answers 404 for unknown API routes', async () => {
    const app = buildApp({ version: '1.2.3' });
    expect((await app.inject({ method: 'GET', url: '/api/nope' })).statusCode).toBe(404);
    await app.close();
  });
});
