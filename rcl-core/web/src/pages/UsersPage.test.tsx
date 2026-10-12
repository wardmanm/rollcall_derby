import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { User } from '@rollcall/core-contract';
import { ADMIN, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const USERS: User[] = [
  { id: ADMIN.id, username: 'admin', role: 'admin', mustChangePassword: false, createdAt: '2026-10-01T10:00:00.000Z' },
  {
    id: 'u-p1',
    username: 'producer1',
    role: 'producer',
    mustChangePassword: true,
    createdAt: '2026-10-02T10:00:00.000Z',
  },
];

// What the server answers when an Admin creates announcer1.
const CREATED = {
  user: { ...USERS[1]!, username: 'announcer1', role: 'announcer' },
  temporaryPassword: 'tmp-pass-abcdefghjkmn',
};

// An Admin on the Users page, with `more` server routes.
async function openUsers(more: Parameters<typeof signedIn>[1] = {}) {
  const server = signedIn(ADMIN, { 'GET /api/core/users': json(USERS), ...more });
  openCore('/core/users');
  await within(await screen.findByRole('table')).findByText('producer1');
  return server;
}

// The table's row for a user (their name also appears in the account menu).
const rowOf = (username: string) => within(screen.getByRole('table')).getByText(username).closest('tr')!;

// jsdom has no layout, so every element measures 0×0 and Mantine may hide an open menu as if its button had scrolled
// out of view. Menu items are found whether or not they're hidden.
const menuItem = (name: string) => screen.findByRole('menuitem', { name, hidden: true });

async function choose(username: string, action: string) {
  fireEvent.click(within(rowOf(username)).getByRole('button', { name: `Actions for ${username}` }));
  fireEvent.click(await menuItem(action));
}

describe('the Users page', () => {
  it('lists the users, marking you and anyone still on a temporary password', async () => {
    await openUsers();
    expect(within(rowOf('admin')).getByText('You')).toBeTruthy();
    expect(within(rowOf('producer1')).getByText('Temporary password')).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>('Role for producer1').value).toBe('producer');
  });

  it('creates a user and shows their temporary password once', async () => {
    const { requests } = await openUsers({ 'POST /api/core/users': json(CREATED, 201) });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Announcer1' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'announcer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password for announcer1' });
    expect(within(dialog).getByLabelText<HTMLInputElement>('Temporary password').value).toBe('tmp-pass-abcdefghjkmn');
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/users',
      body: { username: 'announcer1', role: 'announcer' },
    });
  });

  it('on a plain HTTP address, where browsers block copying, leaves the password to select instead', async () => {
    await openUsers({ 'POST /api/core/users': json(CREATED, 201) });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'announcer1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password for announcer1' });
    expect(within(dialog).getByLabelText<HTMLInputElement>('Temporary password').readOnly).toBe(true);
    expect(within(dialog).queryByRole('button', { name: 'Copy' })).toBeNull();
  });

  it('offers a Copy button where the browser allows copying', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    onTestFinished(() => {
      Reflect.deleteProperty(navigator, 'clipboard');
    });
    await openUsers({ 'POST /api/core/users': json(CREATED, 201) });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'announcer1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = await screen.findByRole('dialog', { name: 'Temporary password for announcer1' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('tmp-pass-abcdefghjkmn');
  });

  it('checks a new username before sending it', async () => {
    const { requests } = await openUsers();
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'a b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Use 3–32 letters, digits, dots, dashes or underscores')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it("changes a role, and says why when the server won't", async () => {
    const refusal = { error: 'last_admin', message: 'There must always be at least one Admin.' };
    const { requests } = await openUsers({
      'PATCH /api/core/users/u-p1': json({ ...USERS[1]!, role: 'announcer' }),
      'PATCH /api/core/users/u-admin': json(refusal, 409),
    });
    fireEvent.change(screen.getByLabelText('Role for producer1'), { target: { value: 'announcer' } });
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'PATCH', path: '/api/core/users/u-p1', body: { role: 'announcer' } }),
    );
    fireEvent.change(screen.getByLabelText('Role for admin'), { target: { value: 'producer' } });
    expect(await screen.findByText('There must always be at least one Admin.')).toBeTruthy();
  });

  it('resets a password once you confirm, then shows the new temporary password', async () => {
    const { requests } = await openUsers({
      'POST /api/core/users/u-p1/password-reset': json({ temporaryPassword: 'reset-pass-abcdefghjk' }),
    });
    await choose('producer1', 'Reset password');
    const confirm = await screen.findByRole('dialog', { name: "Reset producer1's password?" });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Reset password' }));
    const shown = await screen.findByRole('dialog', { name: 'Temporary password for producer1' });
    expect(within(shown).getByLabelText<HTMLInputElement>('Temporary password').value).toBe('reset-pass-abcdefghjk');
    expect(requests).toContainEqual({ method: 'POST', path: '/api/core/users/u-p1/password-reset', body: {} });
  });

  it('signs a user out everywhere once you confirm', async () => {
    const { requests } = await openUsers({
      'POST /api/core/users/u-p1/sign-out': () => new Response(null, { status: 204 }),
    });
    await choose('producer1', 'Sign out everywhere');
    const confirm = await screen.findByRole('dialog', { name: 'Sign producer1 out everywhere?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'POST', path: '/api/core/users/u-p1/sign-out', body: {} }),
    );
  });

  it('deletes a user once you confirm, and does nothing if you cancel', async () => {
    const { requests } = await openUsers({ 'DELETE /api/core/users/u-p1': () => new Response(null, { status: 204 }) });
    await choose('producer1', 'Delete');
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Delete producer1?' })).getByRole('button', { name: 'Cancel' }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests.filter((r) => r.method === 'DELETE')).toEqual([]);
    await choose('producer1', 'Delete');
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Delete producer1?' })).getByRole('button', { name: 'Delete' }),
    );
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/users/u-p1', body: undefined }),
    );
  });

  it("doesn't offer to delete your own account", async () => {
    await openUsers();
    fireEvent.click(within(rowOf('admin')).getByRole('button', { name: 'Actions for admin' }));
    const item = await menuItem('Delete');
    expect(item.hasAttribute('disabled') || item.getAttribute('data-disabled') === 'true').toBe(true);
  });

  it('tells someone without the permission that only Admins manage users', async () => {
    signedIn(PRODUCER);
    openCore('/core/users');
    expect(await screen.findByText('Only Admins can manage users.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
  });
});
