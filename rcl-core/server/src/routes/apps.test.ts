import { describe, expect, it } from 'vitest';
import type { AppModule } from '@rollcall/app-sdk';
import { HostedAppSchema } from '@rollcall/core-contract';
import { SESSION_COOKIE } from '../auth/guard.ts';
import { createSession } from '../auth/sessions.ts';
import { addUser, testApp } from '../testing.ts';

const app = (overrides: Partial<AppModule>): AppModule => ({
  id: 'demo',
  title: 'Demo',
  version: '2.0.0',
  requiresCore: '*',
  permissions: [],
  ...overrides,
});

describe('GET /api/core/apps', () => {
  it('lists the hosted apps, core first, with where each web app is served', async () => {
    const { app: server, db } = testApp({
      coreWebDir: '/builds/core',
      apps: [
        app({ id: 'demo', web: { dir: '/builds/demo' } }),
        app({ id: 'headless', title: 'Headless' }),
        app({ id: 'old', requiresCore: '^9.0.0' }),
      ],
    });
    const user = await addUser(db, 'announcer1', 'correct horse', 'announcer');
    const res = await server.inject({
      method: 'GET',
      url: '/api/core/apps',
      cookies: { [SESSION_COOKIE]: createSession(db, user.id).token },
    });
    expect(res.statusCode).toBe(200);
    expect(HostedAppSchema.array().parse(res.json())).toEqual([
      { id: 'core', title: 'Rollcall', version: '1.0.0', url: '/core/' },
      { id: 'demo', title: 'Demo', version: '2.0.0', url: '/demo/' },
      { id: 'headless', title: 'Headless', version: '2.0.0', url: null },
    ]);
    await server.close();
  });
});
