import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { ImportPreview, Team, TeamSummary } from '@rollcall/core-contract';
import { ANNOUNCER, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore, whereIs } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const TEAMS: TeamSummary[] = [
  {
    id: 't1',
    name: 'All Stars',
    leagueName: 'Rose City Rollers',
    shortName: 'RCR',
    primaryColor: '#aa0000',
    secondaryColor: '#000000',
    logoUrl: '/media/0123456789abcdef0123456789abcdef',
    skaterCount: 14,
    benchCount: 2,
    updatedAt: '2026-10-23T10:00:00.000Z',
  },
  {
    id: 't2',
    name: 'B Team',
    leagueName: null,
    shortName: null,
    primaryColor: null,
    secondaryColor: null,
    logoUrl: null,
    skaterCount: 0,
    benchCount: 0,
    updatedAt: '2026-10-23T10:00:00.000Z',
  },
];
const NEW_TEAM: Team = {
  id: 't3',
  name: 'Visitors',
  leagueName: null,
  shortName: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  createdAt: '2026-10-23T10:00:00.000Z',
  updatedAt: '2026-10-23T10:00:00.000Z',
  members: [],
};

const rowOf = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!;

describe('the Teams page', () => {
  it('lists each team with its league, short name, colors and member counts, linking to it', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    await within(await screen.findByRole('table')).findByText('All Stars');
    const stars = within(rowOf('All Stars'));
    expect(stars.getByRole('link', { name: 'All Stars' }).getAttribute('href')).toBe('/core/teams/t1');
    expect(stars.getByText('Rose City Rollers')).toBeTruthy();
    expect(stars.getByText('RCR')).toBeTruthy();
    expect(stars.getByText('Color #aa0000')).toBeTruthy();
    expect(stars.getByText('14')).toBeTruthy();
    expect(stars.getByRole('img', { name: 'All Stars logo' }).getAttribute('src')).toBe(TEAMS[0]!.logoUrl);
    expect(screen.getByRole('link', { name: 'Teams' })).toBeTruthy();
  });

  it('exports every team, and opens the Import dialog, for those who may manage teams', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    await within(await screen.findByRole('table')).findByText('All Stars');
    expect(screen.getByRole('link', { name: 'Export all' }).getAttribute('href')).toBe(
      '/api/core/transfer/export?kinds=core%3Ateam',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
  });

  it('says when there are no teams yet', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams': json([]) });
    openCore('/core/teams');
    expect(await screen.findByText('No teams yet.')).toBeTruthy();
  });

  it('creates a team from its name, then opens it', async () => {
    const { requests } = signedIn(PRODUCER, {
      'GET /api/core/teams': json(TEAMS),
      'POST /api/core/teams': json(NEW_TEAM, 201),
      'GET /api/core/teams/t3': json(NEW_TEAM),
    });
    const router = openCore('/core/teams');
    fireEvent.change(await screen.findByLabelText('New team'), { target: { value: ' Visitors ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByRole('heading', { name: 'Visitors' })).toBeTruthy();
    expect(whereIs(router)).toBe('/core/teams/t3');
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/teams',
      body: { name: 'Visitors', leagueName: null, shortName: null, primaryColor: null, secondaryColor: null },
    });
  });

  it('asks for a name before sending anything', async () => {
    const { requests } = signedIn(PRODUCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    fireEvent.click(await screen.findByRole('button', { name: 'Create team' }));
    expect(await screen.findByText('Give the team a name')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('lets an Announcer look, without the form to create one', async () => {
    signedIn(ANNOUNCER, { 'GET /api/core/teams': json(TEAMS) });
    openCore('/core/teams');
    await within(await screen.findByRole('table')).findByText('All Stars');
    expect(screen.queryByRole('button', { name: 'Create team' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import…' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Export all' })).toBeNull();
  });

  it('hides the page and its link from someone who may not view teams', async () => {
    signedIn({ ...PRODUCER, permissions: [] });
    openCore('/core/teams');
    expect(await screen.findByText("Your account can't view teams.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Teams' })).toBeNull();
  });

  it('fetches the font library again after an import, as the import may have added fonts', async () => {
    const PREVIEW: ImportPreview = {
      file: 'a'.repeat(64),
      items: [
        {
          index: 0,
          kind: 'core:team',
          label: 'Team',
          name: 'Visitors',
          facts: [],
          status: 'new',
          reason: null,
          conflicts: [],
          needs: [],
          canBeDefault: false,
          wasDefault: false,
        },
      ],
    };
    const { requests } = signedIn(PRODUCER, {
      'GET /api/core/teams': json(TEAMS),
      'GET /api/core/fonts': json([]),
      'POST /api/core/transfer/import/preview': json(PREVIEW),
      'POST /api/core/transfer/import': json({ added: 1, replaced: 0, keptBoth: 0, skipped: 0, copies: [] }),
    });
    const fetched = (path: string) => requests.filter((r) => r.method === 'GET' && r.path === path).length;
    const router = openCore('/core/fonts');
    await vi.waitFor(() => expect(fetched('/api/core/fonts')).toBe(1));
    await router.navigate('/teams');
    fireEvent.click(await screen.findByRole('button', { name: 'Import…' }));
    await screen.findByRole('button', { name: 'Choose file' });
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['PK'], 'setup.zip')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 item' }));
    await screen.findByText('Imported 1: 1 new.');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await router.navigate('/fonts');
    await vi.waitFor(() => expect(fetched('/api/core/fonts')).toBe(2));
  });
});
