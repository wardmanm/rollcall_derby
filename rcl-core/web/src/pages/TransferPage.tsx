import { useState } from 'react';
import { Alert, Button, Checkbox, Loader, Stack, Text, Title } from '@mantine/core';
import { exportUrl, ImportDialog, problemWith, useAppDispatch } from '@rollcall/web-sdk';
import { imported, useGetTransferKindsQuery } from '../api.ts';

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

// Import and export (docs/features/import-export.md): export whole kinds to a Rollcall export file, and import one
// through the Import dialog. The page offers only the kinds the server says you may export or import (hard rule 5).
export function TransferPage() {
  const kinds = useGetTransferKindsQuery();
  const dispatch = useAppDispatch();
  // The kinds ticked for export, until someone changes them: every kind that has something to export.
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  if (kinds.isError) return <Alert color="red">{problemWith(kinds.error)}</Alert>;
  if (!kinds.data) return <Loader />;
  if (kinds.data.length === 0) return <Alert color="gray">Your account can't import or export anything.</Alert>;

  const exportable = kinds.data.filter((kind) => kind.mayExport);
  const chosen = ticked ?? exportable.filter((kind) => kind.count > 0).map((kind) => kind.kind);
  const tick = (kind: string, on: boolean) =>
    setTicked(on ? [...chosen, kind] : chosen.filter((other) => other !== kind));
  return (
    <Stack maw={720}>
      <Title order={2}>Import / export</Title>
      <Text>
        Move teams and themes between Rollcall installs, or keep a backup. A file is a .zip with the data and its logos,
        photos and fonts.
      </Text>
      {exportable.length > 0 && (
        <Stack gap="xs">
          <Title order={3}>Export</Title>
          {exportable.map((kind) => (
            <Checkbox
              key={kind.kind}
              label={`${capitalized(kind.many)} (${kind.count})`}
              checked={chosen.includes(kind.kind)}
              disabled={kind.count === 0}
              onChange={(event) => tick(kind.kind, event.currentTarget.checked)}
            />
          ))}
          <Text size="sm">Uploaded fonts travel with the themes that use them.</Text>
          <div>
            {chosen.length > 0 ? (
              <Button component="a" href={exportUrl({ kinds: chosen })} download>
                Export
              </Button>
            ) : (
              <Button disabled>Export</Button>
            )}
          </div>
        </Stack>
      )}
      {kinds.data.some((kind) => kind.mayImport) && (
        <Stack gap="xs">
          <Title order={3}>Import</Title>
          <Text>
            Add teams and themes from a Rollcall export file. You'll see what's in it before anything is saved.
          </Text>
          <div>
            <Button variant="default" onClick={() => setImporting(true)}>
              Import…
            </Button>
          </div>
        </Stack>
      )}
      <ImportDialog opened={importing} onClose={() => setImporting(false)} onImported={() => dispatch(imported())} />
    </Stack>
  );
}
