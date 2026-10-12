import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ADMIN, asSessionUser, fakeServer, HEALTH, json } from '@rollcall/web-sdk/testing';
import { openCore, whereIs } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const PASSWORD = 'correct horse battery';

// A fresh install: setup is needed until the first Admin is created, then they're signed in. Once set up, the status
// comes back a little slowly, as it can on a real network.
function freshInstall({ canSetupHere = true } = {}) {
  let done = false;
  return fakeServer({
    'GET /api/core/health': json(HEALTH),
    'GET /api/core/setup': async () => {
      if (done) await new Promise((resolve) => setTimeout(resolve, 50));
      return Response.json({ needsSetup: !done, canSetupHere });
    },
    'POST /api/core/setup': () => {
      done = true;
      return Response.json(asSessionUser(ADMIN), { status: 201 });
    },
    'GET /api/core/auth/me': () =>
      done ? Response.json(ADMIN) : Response.json({ error: 'unauthenticated' }, { status: 401 }),
    'GET /api/core/apps': json([]),
  });
}

function fillIn(fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe('first-run setup', () => {
  it('sends a fresh install there from any page', async () => {
    freshInstall();
    const router = openCore('/core/users');
    expect(await screen.findByRole('heading', { name: 'Create the first Admin' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/setup');
  });

  it('creates the first Admin, signs them in and opens the home page', async () => {
    const { requests } = freshInstall();
    const router = openCore('/core/setup');
    await screen.findByRole('heading', { name: 'Create the first Admin' });
    fillIn({ Username: 'Admin', Password: PASSWORD, 'Repeat password': PASSWORD });
    fireEvent.click(screen.getByRole('button', { name: 'Create Admin and sign in' }));
    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/');
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/setup',
      body: { username: 'admin', password: PASSWORD },
    });
  });

  it('checks the form with the contract before sending it', async () => {
    const { requests } = freshInstall();
    openCore('/core/setup');
    await screen.findByRole('heading', { name: 'Create the first Admin' });
    fillIn({ Username: 'ab', Password: 'short', 'Repeat password': 'shorter' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Admin and sign in' }));
    expect(await screen.findByText('Use 3–32 letters, digits, dots, dashes or underscores')).toBeTruthy();
    expect(screen.getByText('Use at least 10 characters')).toBeTruthy();
    expect(screen.getByText("The passwords don't match")).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('on any other device, says to open it on the server machine at a localhost address', async () => {
    freshInstall({ canSetupHere: false });
    openCore('/core/setup');
    const port = window.location.port ? `:${window.location.port}` : '';
    expect(await screen.findByText(`http://localhost${port}/core/setup`)).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
  });

  it('once set up, sends people to sign in instead', async () => {
    fakeServer({ 'GET /api/core/setup': json({ needsSetup: false, canSetupHere: true }) });
    const router = openCore('/core/setup');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/login');
  });
});
