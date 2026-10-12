import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { CurrentUser } from '@rollcall/core-contract';
import { asSessionUser, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore, whereIs } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const TEMPORARY = 'abcdefghjkmnpqrstuvw';
const CHOSEN = 'my own good password';

// A Producer signed in with a temporary password, which a correct change replaces. Once it's changed, who's signed in
// comes back a little slowly, as it can on a real network.
function withTemporaryPassword() {
  let me: CurrentUser = { ...PRODUCER, mustChangePassword: true };
  return signedIn(me, {
    'GET /api/core/auth/me': async () => {
      if (!me.mustChangePassword) await new Promise((resolve) => setTimeout(resolve, 50));
      return Response.json(me);
    },
    'POST /api/core/auth/password': async (request) => {
      const { currentPassword } = (await request.json()) as { currentPassword: string };
      if (currentPassword !== TEMPORARY) return Response.json({ error: 'wrong_password' }, { status: 400 });
      me = { ...me, mustChangePassword: false };
      return Response.json(asSessionUser(me));
    },
    'GET /api/core/apps': json([]),
  });
}

function fillIn(fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe('changing your password', () => {
  it('comes first after signing in with a temporary password, then carries on to where you were going', async () => {
    const { requests } = withTemporaryPassword();
    const router = openCore('/core/');
    expect(await screen.findByRole('heading', { name: 'Choose your own password' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/change-password?next=%2Fcore%2F');
    fillIn({ 'Temporary password': TEMPORARY, 'New password': CHOSEN, 'Repeat new password': CHOSEN });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/');
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/auth/password',
      body: { currentPassword: TEMPORARY, newPassword: CHOSEN },
    });
  });

  it('checks the new password before sending it', async () => {
    const { requests } = withTemporaryPassword();
    openCore('/core/change-password');
    await screen.findByRole('heading', { name: 'Choose your own password' });
    fillIn({ 'Temporary password': TEMPORARY, 'New password': 'Producer1', 'Repeat new password': 'producer2' });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Use at least 10 characters')).toBeTruthy();
    expect(screen.getByText("The passwords don't match")).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('refuses your username as the new password, whatever its case', async () => {
    const { requests } = signedIn({ ...PRODUCER, username: 'announcer01' });
    openCore('/core/change-password');
    await screen.findByLabelText('Current password');
    fillIn({
      'Current password': 'my old password',
      'New password': 'Announcer01',
      'Repeat new password': 'Announcer01',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The password must not be the username')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('says when the temporary password is wrong', async () => {
    withTemporaryPassword();
    openCore('/core/change-password');
    await screen.findByRole('heading', { name: 'Choose your own password' });
    fillIn({ 'Temporary password': 'not it at all', 'New password': CHOSEN, 'Repeat new password': CHOSEN });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText("That isn't the temporary password you signed in with.")).toBeTruthy();
  });

  it('can be cancelled when you chose to change it', async () => {
    signedIn(PRODUCER, { 'GET /api/core/apps': json([]) });
    const router = openCore('/core/change-password?next=%2Fcore%2F');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/');
  });

  it('sends someone signed out to sign in first', async () => {
    signedIn(null);
    const router = openCore('/core/change-password');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/login?next=%2Fcore%2Fchange-password');
  });
});
