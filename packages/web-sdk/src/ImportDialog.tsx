import { useState } from 'react';
import { Alert, Badge, Button, FileButton, Group, Modal, Stack, Switch, Text, Title } from '@mantine/core';
import type { ImportChoice, ImportPreview, ImportResult, PreviewItem } from '@rollcall/core-contract';
import { apiError } from './errors.ts';
import { problemWith } from './forms.ts';
import { ImportConflict } from './ImportConflict.tsx';
import { ImportList } from './ImportList.tsx';
import { importSummary, useImportFileMutation, usePreviewImportMutation } from './transfer.ts';

export interface ImportDialogProps {
  opened: boolean;
  onClose: () => void;
  /** Runs once something was imported, so the page behind can refresh what it shows. */
  onImported?: (result: ImportResult) => void;
}

// Each item's first choice: add a new item, keep both for a conflict, skip the rest.
const firstChoice = (item: PreviewItem): ImportChoice =>
  item.status === 'new' ? { action: 'add' } : item.status === 'conflict' ? { action: 'keep-both' } : { action: 'skip' };

const CHANGED = 'changed_since_preview';

// Importing a Rollcall export file (docs/features/import-export.md), in three steps: choose a file, see what's in it
// and choose what happens to each item, then what was done. Nothing is saved until Import. Shared by every app's pages.
export function ImportDialog({ opened, onClose, onImported }: ImportDialogProps) {
  const [previewImport, preview] = usePreviewImportMutation();
  const [importFile, imported] = useImportFileMutation();
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<ImportChoice[]>([]);
  const [makeDefault, setMakeDefault] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const check = async (picked: File) => {
    const reply = await previewImport(picked);
    if (reply.error || !reply.data) {
      setProblem(problemWith(reply.error));
      return false;
    }
    setFile(picked);
    setChecked(reply.data);
    setChoices(reply.data.items.map(firstChoice));
    setMakeDefault(null);
    return true;
  };
  const choose = async (picked: File | null) => {
    if (!picked) return;
    setProblem(null);
    await check(picked);
  };
  const startOver = () => {
    setFile(null);
    setChecked(null);
    setProblem(null);
    setResult(null);
  };
  const close = () => {
    startOver();
    onClose();
  };
  const chooseFor = (index: number, choice: ImportChoice) => {
    setChoices((current) => current.map((old, i) => (i === index ? choice : old)));
    if (choice.action === 'skip' && makeDefault === index) setMakeDefault(null);
  };

  const run = async () => {
    if (!file || !checked) return;
    const reply = await importFile({ file, choices: { file: checked.file, items: choices, default: makeDefault } });
    if (reply.data) {
      setResult(reply.data);
      onImported?.(reply.data);
      return;
    }
    if (apiError(reply.error)?.code === CHANGED && (await check(file))) {
      setProblem(
        'Something changed since you checked this file, so it’s been checked again. Choose again where needed.',
      );
      return;
    }
    setProblem(problemWith(reply.error));
  };

  const items = checked?.items ?? [];
  const conflicts = items.filter((item) => item.status === 'conflict');
  const fresh = items.filter((item) => item.status === 'new' || item.status === 'reused');
  const cant = items.filter((item) => item.status === 'cant');
  const toImport = choices.filter((choice) => choice.action !== 'skip').length;
  const defaultSwitch = (item: PreviewItem) =>
    item.canBeDefault && choices[item.index]?.action !== 'skip' ? (
      <Switch
        size="xs"
        label="Make default"
        checked={makeDefault === item.index}
        onChange={(event) => setMakeDefault(event.currentTarget.checked ? item.index : null)}
        aria-label={`Make ${item.label.toLowerCase()} “${item.name}” the default`}
      />
    ) : null;

  const title = result ? 'Imported' : file && checked ? `Import from ${file.name}` : 'Import';
  return (
    <Modal opened={opened} onClose={close} title={title} size="xl">
      {result ? (
        <Stack>
          <Alert color="green">{importSummary(result)}</Alert>
          <Group justify="flex-end">
            <Button onClick={close}>Done</Button>
          </Group>
        </Stack>
      ) : checked && file ? (
        <Stack>
          <Text size="sm">
            {items.length === 1 ? '1 item' : `${items.length} items`}. Nothing is saved until you import them.
          </Text>
          {problem && <Alert color="orange">{problem}</Alert>}
          {conflicts.length > 0 && (
            <Stack gap="xs">
              <Group gap="xs">
                <Title order={4}>Conflicts</Title>
                <Badge color="orange">{conflicts.length}</Badge>
                <Text size="sm">Same name as something already here. Choose for each.</Text>
              </Group>
              {conflicts.map((item, n) => (
                <ImportConflict
                  key={item.index}
                  number={n + 1}
                  item={item}
                  choice={choices[item.index] ?? { action: 'keep-both' }}
                  onChoose={(choice) => chooseFor(item.index, choice)}
                  makeDefault={defaultSwitch(item)}
                />
              ))}
            </Stack>
          )}
          {fresh.length > 0 && (
            <Stack gap="xs">
              <Group gap="xs">
                <Title order={4}>New</Title>
                <Badge color="gray">{fresh.length}</Badge>
              </Group>
              <ImportList
                items={fresh}
                all={items}
                choices={choices}
                onChoose={chooseFor}
                makeDefault={defaultSwitch}
              />
            </Stack>
          )}
          {cant.length > 0 && (
            <Stack gap="xs">
              <Group gap="xs">
                <Title order={4}>Can’t import</Title>
                <Badge color="gray">{cant.length}</Badge>
              </Group>
              <ImportList items={cant} all={items} choices={choices} onChoose={chooseFor} makeDefault={() => null} />
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={startOver}>
              Back
            </Button>
            <Button onClick={() => void run()} loading={imported.isLoading} disabled={toImport === 0}>
              {toImport === 1 ? 'Import 1 item' : `Import ${toImport} items`}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Text size="sm">Choose a Rollcall export file (.zip). You’ll see what’s in it before anything is saved.</Text>
          <Group>
            <FileButton onChange={(picked) => void choose(picked)} accept=".zip,application/zip">
              {(props) => (
                <Button {...props} loading={preview.isLoading}>
                  Choose file
                </Button>
              )}
            </FileButton>
          </Group>
          {problem && <Alert color="red">{problem}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
