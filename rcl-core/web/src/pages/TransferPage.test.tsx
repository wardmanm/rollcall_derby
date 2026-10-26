import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { TransferKindInfo } from '@rollcall/core-contract';
import { ADMIN, ANNOUNCER, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const KINDS: TransferKindInfo[] = [
  { kind: 'core:team', one: 'Team', many: 'teams', count: 12, mayExport: true, mayImport: true },
  { kind: 'producer:theme', one: 'Theme', many: 'themes', count: 3, mayExport: true, mayImport: true },
  { kind: 'producer:screen', one: 'Screen', many: 'screens', count: 0, mayExport: true, mayImport: true },
];

async function openTransfer(user = ADMIN, kinds = KINDS) {
  const server = signedIn(user, { 'GET /api/core/transfer/kinds': json(kinds) });
  openCore('/core/transfer');
  expect(await screen.findByRole('heading', { name: 'Import / export' })).toBeTruthy();
  return server;
}

const exportLink = () => screen.getByRole('link', { name: 'Export' }).getAttribute('href');

describe('the Import / export page', () => {
  it('exports the kinds ticked, every kind with something in it to start with', async () => {
    await openTransfer();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Teams (12)' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Themes (3)' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Screens (0)' }).disabled).toBe(true);
    expect(exportLink()).toBe('/api/core/transfer/export?kinds=core%3Ateam%2Cproducer%3Atheme');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Themes (3)' }));
    expect(exportLink()).toBe('/api/core/transfer/export?kinds=core%3Ateam');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Teams (12)' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Export' }).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Import / export' })).toBeTruthy();
  });

  it('opens the Import dialog', async () => {
    await openTransfer();
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
  });

  it('offers only what the account may do', async () => {
    await openTransfer(PRODUCER, [
      { ...KINDS[0]!, mayImport: true },
      { ...KINDS[1]!, mayImport: false },
    ]);
    expect(screen.getByRole('checkbox', { name: 'Themes (3)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import…' })).toBeTruthy();
  });

  it('says so, with no link to it, when the account can import or export nothing', async () => {
    signedIn(ANNOUNCER, { 'GET /api/core/transfer/kinds': json([]) });
    openCore('/core/transfer');
    expect(await screen.findByText("Your account can't import or export anything.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Import / export' })).toBeNull();
  });
});
