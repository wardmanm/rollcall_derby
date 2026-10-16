import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { ApiKey, CreateApiKeyResponse, GrantablePermission } from '@rollcall/core-contract';
import { ADMIN, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const KEYS: ApiKey[] = [
  {
    id: 'k1',
    name: 'Stream Deck',
    prefix: 'rcl_abcd',
    permissions: ['demo:things.read'],
    createdAt: '2026-10-02T10:00:00.000Z',
    createdBy: 'admin',
    expiresAt: null,
    lastUsedAt: '2026-10-03T10:00:00.000Z',
  },
  {
    id: 'k2',
    name: 'Old laptop',
    prefix: 'rcl_wxyz',
    permissions: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    createdBy: 'admin',
    expiresAt: '2026-09-02T10:00:00.000Z',
    lastUsedAt: null,
  },
];
const GRANTABLE: GrantablePermission[] = [{ key: 'demo:things.read', summary: 'Read things' }];
const CREATED: CreateApiKeyResponse = {
  apiKey: { ...KEYS[0]!, id: 'k3', name: 'Companion', lastUsedAt: null },
  key: 'rcl_the-whole-key-shown-once',
};

// An Admin on the API keys page, with `more` server routes.
async function openApiKeys(more: Parameters<typeof signedIn>[1] = {}) {
  const server = signedIn(ADMIN, {
    'GET /api/core/api-keys': json(KEYS),
    'GET /api/core/api-keys/grantable': json(GRANTABLE),
    ...more,
  });
  openCore('/core/api-keys');
  await within(await screen.findByRole('table')).findByText('Stream Deck');
  return server;
}

// The table's row for a key.
const rowOf = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!;

// Chooses Revoke for the Stream Deck key, and returns the confirmation. jsdom has no layout, so Mantine may hide an
// open menu: its items are found whether or not they're hidden.
async function revoke() {
  fireEvent.click(within(rowOf('Stream Deck')).getByRole('button', { name: 'Actions for Stream Deck' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Revoke', hidden: true }));
  return screen.findByRole('dialog', { name: 'Revoke Stream Deck?' });
}

describe('the API keys page', () => {
  it('lists the keys with how each starts, what it may do, and which have expired', async () => {
    await openApiKeys();
    const deck = within(rowOf('Stream Deck'));
    expect(deck.getByText('rcl_abcd…')).toBeTruthy();
    expect(deck.getByText('demo:things.read')).toBeTruthy();
    expect(deck.getByText('Never')).toBeTruthy();
    const laptop = within(rowOf('Old laptop'));
    expect(laptop.getByText('Public routes only')).toBeTruthy();
    expect(laptop.getByText('Expired')).toBeTruthy();
  });

  it('creates a key with the chosen permissions and expiry, then shows it once', async () => {
    const { requests } = await openApiKeys({ 'POST /api/core/api-keys': json(CREATED, 201) });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Companion' } });
    fireEvent.click(screen.getByLabelText('demo:things.read'));
    fireEvent.change(screen.getByLabelText('Expires'), { target: { value: '30d' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    const dialog = await screen.findByRole('dialog', { name: 'API key: Companion' });
    expect(within(dialog).getByLabelText<HTMLInputElement>('API key').value).toBe('rcl_the-whole-key-shown-once');
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/api-keys',
      body: { name: 'Companion', permissions: ['demo:things.read'], expiresIn: '30d' },
    });
  });

  it('says when nothing can be given to keys yet, and still creates one for public routes', async () => {
    const { requests } = await openApiKeys({
      'GET /api/core/api-keys/grantable': json([]),
      'POST /api/core/api-keys': json(CREATED, 201),
    });
    expect(
      await screen.findByText('No permissions can be given to API keys yet: a key can call public routes only.'),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Companion' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await screen.findByRole('dialog', { name: 'API key: Companion' });
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/api-keys',
      body: { name: 'Companion', permissions: [], expiresIn: 'never' },
    });
  });

  it('asks for a name before sending anything', async () => {
    const { requests } = await openApiKeys();
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText('Give the key a name')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('says when the name is already taken', async () => {
    await openApiKeys({ 'POST /api/core/api-keys': json({ error: 'name_taken' }, 409) });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Stream Deck' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText('That name is already taken.')).toBeTruthy();
  });

  it('revokes a key once you confirm, and does nothing if you cancel', async () => {
    const { requests } = await openApiKeys({
      'DELETE /api/core/api-keys/k1': () => new Response(null, { status: 204 }),
    });
    fireEvent.click(within(await revoke()).getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests.filter((r) => r.method === 'DELETE')).toEqual([]);
    fireEvent.click(within(await revoke()).getByRole('button', { name: 'Revoke' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/api-keys/k1', body: undefined }),
    );
  });

  it('tells someone without the permission that only Admins manage API keys', async () => {
    signedIn(PRODUCER);
    openCore('/core/api-keys');
    expect(await screen.findByText('Only Admins can manage API keys.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'API keys' })).toBeNull();
  });
});
