import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { MAX_IMAGE_BYTES, type Team } from '@rollcall/core-contract';
import { ANNOUNCER, json, PRODUCER, signedIn } from '@rollcall/web-sdk/testing';
import { openCore, whereIs } from '../test/open-core.tsx';

afterEach(() => vi.unstubAllGlobals());

const NOW = '2026-10-23T10:00:00.000Z';
const TEAM: Team = {
  id: 't1',
  name: 'All Stars',
  leagueName: 'Rose City Rollers',
  shortName: 'RCR',
  primaryColor: '#aa0000',
  secondaryColor: null,
  logoUrl: null,
  createdAt: NOW,
  updatedAt: NOW,
  members: [
    {
      id: 'm1',
      kind: 'skater',
      name: 'Zero Cool',
      number: '00',
      pronouns: null,
      roles: ['captain'],
      customRoles: [],
      photoUrl: '/media/0123456789abcdef0123456789abcdef',
    },
    {
      id: 'm2',
      kind: 'skater',
      name: 'Jammy',
      number: '7',
      pronouns: 'she/her',
      roles: [],
      customRoles: ['MVP'],
      photoUrl: null,
    },
    {
      id: 'm3',
      kind: 'bench',
      name: 'Coach Amy',
      number: null,
      pronouns: null,
      roles: ['bench-coach'],
      customRoles: [],
      photoUrl: null,
    },
  ],
};
const withMember = (name: string, number: string): Team => ({
  ...TEAM,
  members: [
    ...TEAM.members,
    { id: `new-${number}`, kind: 'skater', name, number, pronouns: null, roles: [], customRoles: [], photoUrl: null },
  ],
});

// The team page for `user`, with `more` server routes.
async function openTeam(user = PRODUCER, more: Parameters<typeof signedIn>[1] = {}) {
  const server = signedIn(user, { 'GET /api/core/teams/t1': json(TEAM), ...more });
  const router = openCore('/core/teams/t1');
  await screen.findByRole('heading', { name: 'All Stars' });
  return { ...server, router };
}

// The skaters' table, and the bench staff's.
const tableAt = (i: number) => within(screen.getAllByRole('table')[i]!);
const skaters = () => tableAt(0);
const bench = () => tableAt(1);
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

// Opens a member's row menu and chooses an item. jsdom has no layout, so Mantine may hide an open menu: its items are
// found whether or not they're hidden.
async function chooseFor(name: string, item: string) {
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: `Actions for ${name}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: item, hidden: true }));
}

const fileInput = (inside: HTMLElement = document.body) =>
  inside.querySelector<HTMLInputElement>('input[type="file"]')!;
const pickFile = (input: HTMLInputElement, file: File) => fireEvent.change(input, { target: { files: [file] } });
const png = (name = 'logo.png') => new File(['\u0089PNG\r\n\u001a\n'], name, { type: 'image/png' });

describe('the Team page', () => {
  it('shows the details, then the skaters by number and the bench staff, with photos, pronouns and roles', async () => {
    await openTeam();
    expect(screen.getByLabelText<HTMLInputElement>('League').value).toBe('Rose City Rollers');
    const skaterRows = skaters().getAllByRole('row').slice(1);
    expect(skaterRows.map((row) => within(row).getAllByRole('cell')[1]!.textContent)).toEqual(['00', '7']);
    expect(within(rowOf('Zero Cool')).getByText('Captain')).toBeTruthy();
    expect(within(rowOf('Zero Cool')).getByRole('img', { name: 'Photo of Zero Cool' })).toBeTruthy();
    expect(within(rowOf('Jammy')).getByText('she/her')).toBeTruthy();
    expect(within(rowOf('Jammy')).getByText('MVP')).toBeTruthy();
    expect(bench().getByText('Bench coach')).toBeTruthy();
  });

  it('saves the details, sending blank fields as none', async () => {
    const { requests } = await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1': json({ ...TEAM, leagueName: null }) });
    fireEvent.change(screen.getByLabelText('League'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(requests).toContainEqual({ method: 'PATCH', path: '/api/core/teams/t1', body: { leagueName: null } });
  });

  it('shows the details as saved, and a colleague\u2019s change to a field you didn\u2019t touch', async () => {
    let current = TEAM;
    await openTeam(PRODUCER, {
      'GET /api/core/teams/t1': () => Response.json(current),
      'PATCH /api/core/teams/t1': () => {
        current = { ...current, name: 'Rose City All Stars' };
        return Response.json(current);
      },
      'POST /api/core/teams/t1/members': () => {
        // Meanwhile, a colleague changed the short name.
        current = { ...withMember('Blocky', '12'), name: current.name, shortName: 'RCAS' };
        return Response.json(current, { status: 201 });
      },
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Rose City All Stars  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Rose City All Stars'));
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Short name').value).toBe('RCAS'));
  });

  it('says so when someone else deleted the team in the meantime', async () => {
    await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1': json({ error: 'not_found' }, 404) });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(
      await screen.findByText('This team or member no longer exists. Someone else may have deleted it.'),
    ).toBeTruthy();
  });

  it('adds skaters one after another with Save and add another', async () => {
    let added = 0;
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': () => {
        added += 1;
        return Response.json(added === 1 ? withMember('Blocky', '12') : withMember('Pivot', '21'), { status: 201 });
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and add another' }));
    await vi.waitFor(() => expect(within(dialog).getByLabelText<HTMLInputElement>('Name').value).toBe(''));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Pivot' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '21' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posted = requests.filter((r) => r.method === 'POST').map((r) => r.body);
    expect(posted).toEqual([
      { kind: 'skater', name: 'Blocky', number: '12', pronouns: null, roles: [], customRoles: [] },
      { kind: 'skater', name: 'Pivot', number: '21', pronouns: null, roles: [], customRoles: [] },
    ]);
  });

  it('asks for a skater’s number before sending anything', async () => {
    const { requests } = await openTeam();
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Give the skater a number')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it("shows the server's reason when a number or role is taken, and uploads no photo", async () => {
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': json(
        { error: 'number_taken', message: 'Another skater already has number 7' },
        409,
      ),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Copycat' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '7' } });
    pickFile(fileInput(dialog), png('copycat.png'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Another skater already has number 7')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it("uploads a new skater's photo once the skater exists", async () => {
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': json(withMember('Blocky', '12'), 201),
      'PUT /api/core/teams/t1/members/new-12/photo': json(withMember('Blocky', '12')),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '12' } });
    pickFile(fileInput(dialog), png('blocky.png'));
    expect(await within(dialog).findByText('blocky.png chosen. It\u2019s uploaded when you save.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(
      expect.arrayContaining(['POST /api/core/teams/t1/members', 'PUT /api/core/teams/t1/members/new-12/photo']),
    );
  });

  it('puts a new skater\u2019s photo on that skater, even when someone else added one meanwhile', async () => {
    // This page hasn't seen Blocky, whom someone else added; the reply has both.
    const both: Team = {
      ...withMember('Blocky', '12'),
      members: [...withMember('Blocky', '12').members, ...withMember('Pivot', '21').members.slice(-1)],
    };
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': json(both, 201),
      'PUT /api/core/teams/t1/members/new-21/photo': json(both),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Pivot' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '21' } });
    pickFile(fileInput(dialog), png('pivot.png'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const photos = requests.filter((r) => r.method === 'PUT').map((r) => r.path);
    expect(photos).toEqual(['/api/core/teams/t1/members/new-21/photo']);
  });

  it('keeps both save buttons busy while a new skater\u2019s photo uploads', async () => {
    let finish: (() => void) | undefined;
    await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': json(withMember('Blocky', '12'), 201),
      'PUT /api/core/teams/t1/members/new-12/photo': () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(Response.json(withMember('Blocky', '12')));
        }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '12' } });
    pickFile(fileInput(dialog), png('blocky.png'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(finish).toBeDefined());
    for (const name of ['Save', 'Save and add another']) {
      expect(within(dialog).getByRole<HTMLButtonElement>('button', { name }).disabled, name).toBe(true);
    }
    finish?.();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets you change or remove a photo chosen for a new skater, before saving', async () => {
    const { requests } = await openTeam(PRODUCER, {
      'POST /api/core/teams/t1/members': json(withMember('Blocky', '12'), 201),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add skater' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add skater' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blocky' } });
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: '12' } });
    pickFile(fileInput(dialog), png('blocky.png'));
    expect(await within(dialog).findByText('blocky.png chosen. It\u2019s uploaded when you save.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Change photo' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove photo' }));
    expect(within(dialog).queryByText(/blocky\.png chosen/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('says a member can have at most 3 custom roles, rather than dropping the fourth', async () => {
    const { requests } = await openTeam();
    await chooseFor('Jammy', 'Edit');
    const dialog = await screen.findByRole('dialog', { name: 'Edit Jammy' });
    const custom = within(dialog).getByLabelText(/^Custom roles/);
    for (const role of ['Lineups', 'Hype', 'Snacks']) {
      custom.focus();
      fireEvent.change(custom, { target: { value: role } });
      fireEvent.blur(custom);
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Use at most 3 custom roles')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'PATCH')).toEqual([]);
  });

  it("edits a member's roles", async () => {
    const { requests } = await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1/members/m2': json(TEAM) });
    await chooseFor('Jammy', 'Edit');
    const dialog = await screen.findByRole('dialog', { name: 'Edit Jammy' });
    fireEvent.click(within(dialog).getByLabelText('Alt captain'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/core/teams/t1/members/m2',
        body: {
          kind: 'skater',
          name: 'Jammy',
          number: '7',
          pronouns: 'she/her',
          roles: ['alt-captain'],
          customRoles: ['MVP'],
        },
      }),
    );
  });

  it('keeps a custom role typed without pressing Enter, when the focus moves on to Save', async () => {
    const { requests } = await openTeam(PRODUCER, { 'PATCH /api/core/teams/t1/members/m2': json(TEAM) });
    await chooseFor('Jammy', 'Edit');
    const dialog = await screen.findByRole('dialog', { name: 'Edit Jammy' });
    // As a browser does: focus the field and type, then clicking Save moves the focus away.
    const custom = within(dialog).getByLabelText(/^Custom roles/);
    custom.focus();
    fireEvent.change(custom, { target: { value: 'Lineups' } });
    fireEvent.blur(custom);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ customRoles: ['MVP', 'Lineups'] }),
        }),
      ),
    );
  });

  it('removes a member once you confirm', async () => {
    const { requests } = await openTeam(PRODUCER, { 'DELETE /api/core/teams/t1/members/m2': json(TEAM) });
    await chooseFor('Jammy', 'Remove');
    const confirm = await screen.findByRole('dialog', { name: 'Remove Jammy?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await vi.waitFor(() =>
      expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/teams/t1/members/m2', body: undefined }),
    );
  });

  it('uploads a logo as the image itself, with its own type', async () => {
    const { requests } = await openTeam(PRODUCER, { 'PUT /api/core/teams/t1/logo': json(TEAM) });
    pickFile(fileInput(), png());
    await vi.waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PUT',
        path: '/api/core/teams/t1/logo',
        body: '\u0089PNG\r\n\u001a\n',
        contentType: 'image/png',
      }),
    );
  });

  it('refuses a file that is not an image, or is over 5 MB, before sending it', async () => {
    const { requests } = await openTeam();
    pickFile(fileInput(), new File(['GIF89a'], 'logo.gif', { type: 'image/gif' }));
    expect(await screen.findByText('Use a PNG, JPEG or WebP image')).toBeTruthy();
    pickFile(fileInput(), new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'huge.png', { type: 'image/png' }));
    expect(await screen.findByText('That image is over 5 MB')).toBeTruthy();
    expect(requests.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('deletes the team once you confirm, saying what goes with it, then goes back to the list', async () => {
    const { requests, router } = await openTeam(PRODUCER, {
      'DELETE /api/core/teams/t1': () => new Response(null, { status: 204 }),
      'GET /api/core/teams': json([]),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete team' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete All Stars?' });
    expect(
      within(confirm).getByText('Deletes the team, its 3 members, its logo and photos. This cannot be undone.'),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete team' }));
    expect(await screen.findByText('No teams yet.')).toBeTruthy();
    expect(whereIs(router)).toBe('/core/teams');
    expect(requests).toContainEqual({ method: 'DELETE', path: '/api/core/teams/t1', body: undefined });
  });

  it('is read-only for an Announcer', async () => {
    await openTeam(ANNOUNCER);
    expect(screen.getByText('League: Rose City Rollers')).toBeTruthy();
    for (const name of ['Save details', 'Add skater', 'Add bench staff', 'Delete team', 'Actions for Jammy']) {
      expect(screen.queryByRole('button', { name }), name).toBeNull();
    }
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('says when there is no such team', async () => {
    signedIn(PRODUCER, { 'GET /api/core/teams/gone': json({ error: 'not_found' }, 404) });
    openCore('/core/teams/gone');
    expect(await screen.findByText("There's no such team. It may have been deleted.")).toBeTruthy();
  });
});
