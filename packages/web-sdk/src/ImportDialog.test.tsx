import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Provider } from 'react-redux';
import type { ImportPreview, PreviewItem } from '@rollcall/core-contract';
import { ImportDialog } from './ImportDialog.tsx';
import { makeStore } from './store.ts';
import { fakeServer, json } from './testing.ts';
import { theme } from './theme.ts';

afterEach(() => vi.unstubAllGlobals());

const item = (
  fields: Partial<PreviewItem> & Pick<PreviewItem, 'index' | 'label' | 'name' | 'status'>,
): PreviewItem => ({
  kind: `core:${fields.label.toLowerCase()}`,
  facts: [],
  reason: null,
  conflicts: [],
  needs: [],
  canBeDefault: false,
  wasDefault: false,
  ...fields,
});
const PREVIEW: ImportPreview = {
  file: 'f'.repeat(64),
  items: [
    item({
      index: 0,
      label: 'Team',
      name: 'All Stars',
      status: 'conflict',
      facts: [
        { label: 'League', value: 'Rose City Rollers' },
        { label: 'Skaters', value: '16' },
      ],
      conflicts: [
        {
          id: 't1',
          name: 'All Stars',
          facts: [
            { label: 'League', value: 'Rose City Rollers' },
            { label: 'Skaters', value: '14' },
          ],
          updatedAt: '2026-10-24T10:00:00.000Z',
        },
        {
          id: 't2',
          name: 'all stars',
          facts: [{ label: 'Skaters', value: '9' }],
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    }),
    item({
      index: 1,
      label: 'Team',
      name: 'Rose City Rollers',
      status: 'new',
      facts: [{ label: 'Skaters', value: '14' }],
    }),
    item({
      index: 2,
      kind: 'producer:theme',
      label: 'Theme',
      name: 'Derby Night',
      status: 'new',
      needs: [3],
      canBeDefault: true,
      wasDefault: true,
    }),
    item({ index: 3, kind: 'core:font-face', label: 'Font', name: 'Rollerball 700', status: 'new' }),
    item({
      index: 4,
      kind: 'producer:theme',
      label: 'Theme',
      name: 'Finals',
      status: 'conflict',
      canBeDefault: true,
      conflicts: [{ id: 'th1', name: 'Finals', facts: [{ label: 'Default', value: 'yes' }], updatedAt: null }],
    }),
    item({ index: 5, label: 'Screen', name: 'Bout intro', status: 'cant', reason: "Screens aren't known here yet" }),
  ],
};
const RESULT = { added: 3, replaced: 0, keptBoth: 2, skipped: 1, copies: ['All Stars copy', 'Finals copy'] };

function openDialog(routes: Parameters<typeof fakeServer>[0] = {}) {
  const server = fakeServer({ 'POST /api/core/transfer/import/preview': json(PREVIEW), ...routes });
  const onClose = vi.fn<() => void>();
  const onImported = vi.fn<() => void>();
  render(
    <MantineProvider theme={theme}>
      <Provider store={makeStore()}>
        <ImportDialog opened onClose={onClose} onImported={onImported} />
      </Provider>
    </MantineProvider>,
  );
  return { ...server, onClose, onImported };
}

const pickFile = async () => {
  const input = await vi.waitFor(() => document.body.querySelector<HTMLInputElement>('input[type="file"]')!);
  fireEvent.change(input, { target: { files: [new File(['PK zip bytes'], 'setup.zip', { type: '' })] } });
  await screen.findByText('6 items. Nothing is saved until you import them.');
};
const conflict = (n: number) => within(screen.getByRole('region', { name: new RegExp(`^Conflict ${n}:`) }));
// The choices each import sent, from its address.
const sentChoices = (urls: string[]) =>
  urls.map((url) => JSON.parse(new URL(url).searchParams.get('choices')!) as unknown);

describe('the Import dialog', () => {
  it('checks a chosen file, then shows its conflicts side by side, its new items and what can’t be imported', async () => {
    const { requests } = openDialog();
    await pickFile();
    expect(requests).toContainEqual({
      method: 'POST',
      path: '/api/core/transfer/import/preview',
      body: 'PK zip bytes',
      contentType: 'application/zip',
    });
    expect(screen.getByText('Import from setup.zip')).toBeTruthy();
    const first = conflict(1);
    expect(first.getByText('Team “All Stars”')).toBeTruthy();
    expect(first.getByText('Here now · 2 have this name')).toBeTruthy();
    // The skater counts differ, so both are highlighted; the leagues match, so neither is.
    expect([...first.getAllByText(/^1[46]$/)].map((el) => el.tagName)).toEqual(['MARK', 'MARK']);
    expect(first.getAllByText('Rose City Rollers').map((el) => el.tagName)).toEqual(['P', 'P']);
    expect(first.getByText('Keep both: the file’s team is added as a copy; the one here is unchanged.')).toBeTruthy();
    expect(screen.getByText('used by Derby Night')).toBeTruthy();
    expect(screen.getByText('was the default in the file')).toBeTruthy();
    expect(screen.getByText("Screens aren't known here yet")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import 5 items' })).toBeTruthy();
  });

  it('imports with each item’s first choice and no default, then says what was done', async () => {
    const urls: string[] = [];
    const { onImported, onClose } = openDialog({
      'POST /api/core/transfer/import': (request) => {
        urls.push(request.url);
        return Response.json(RESULT);
      },
    });
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import 5 items' }));
    expect(
      await screen.findByText('Imported 5: 3 new, 2 kept as copies (“All Stars copy”, “Finals copy”). Skipped 1.'),
    ).toBeTruthy();
    expect(sentChoices(urls)).toEqual([
      {
        file: PREVIEW.file,
        items: [
          { action: 'keep-both' },
          { action: 'add' },
          { action: 'add' },
          { action: 'add' },
          { action: 'keep-both' },
          { action: 'skip' },
        ],
        default: null,
      },
    ]);
    expect(onImported).toHaveBeenCalledWith(RESULT);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('replaces the item chosen, leaves out an unticked one, and makes only one theme the default', async () => {
    const urls: string[] = [];
    openDialog({
      'POST /api/core/transfer/import': (request) => {
        urls.push(request.url);
        return Response.json(RESULT);
      },
    });
    await pickFile();
    fireEvent.click(conflict(1).getByLabelText('Replace'));
    const which = await vi.waitFor(() => conflict(1).getByLabelText<HTMLSelectElement>('Replace which?'));
    expect(which.value).toBe('t1');
    fireEvent.change(which, { target: { value: 't2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import Team “Rose City Rollers”' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Make theme “Derby Night” the default' }));
    fireEvent.click(conflict(2).getByRole('switch', { name: 'Make theme “Finals” the default' }));
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Make theme “Derby Night” the default' }).checked).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 items' }));
    await screen.findByText(/^Imported 5/);
    expect(sentChoices(urls)).toEqual([
      {
        file: PREVIEW.file,
        items: [
          { action: 'replace', target: 't2' },
          { action: 'skip' },
          { action: 'add' },
          { action: 'add' },
          { action: 'keep-both' },
          { action: 'skip' },
        ],
        default: 4,
      },
    ]);
  });

  it('says why a file can’t be imported, and stays on choosing one', async () => {
    openDialog({
      'POST /api/core/transfer/import/preview': json(
        { error: 'invalid_item', message: 'Item 3 (team “All Stars”): Number 07 is used by two skaters' },
        400,
      ),
    });
    const input = await vi.waitFor(() => document.body.querySelector<HTMLInputElement>('input[type="file"]')!);
    fireEvent.change(input, { target: { files: [new File(['x'], 'bad.zip')] } });
    expect(await screen.findByText('Item 3 (team “All Stars”): Number 07 is used by two skaters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeTruthy();
  });

  it('checks the file again when something changed since it was checked', async () => {
    const { requests } = openDialog({
      'POST /api/core/transfer/import': json({ error: 'changed_since_preview', message: 'Something changed' }, 409),
    });
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Import 5 items' }));
    expect(
      await screen.findByText(
        'Something changed since you checked this file, so it’s been checked again. Choose again where needed.',
      ),
    ).toBeTruthy();
    expect(requests.filter((r) => r.path === '/api/core/transfer/import/preview')).toHaveLength(2);
  });

  it('goes back to choosing another file', async () => {
    openDialog();
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeTruthy();
  });
});
