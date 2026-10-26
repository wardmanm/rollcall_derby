import type { ReactNode } from 'react';
import { Badge, Group, Mark, NativeSelect, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import type { ConflictTarget, ImportChoice, PreviewItem, TransferFact } from '@rollcall/core-contract';

const ACTIONS = [
  { value: 'replace', label: 'Replace' },
  { value: 'keep-both', label: 'Keep both' },
  { value: 'skip', label: 'Skip' },
];

export interface ImportConflictProps {
  /** Its place among the file's conflicts, from 1. */
  number: number;
  item: PreviewItem;
  choice: ImportChoice;
  onChoose: (choice: ImportChoice) => void;
  /** The item's "Make default" switch, when it can be the default. */
  makeDefault?: ReactNode;
}

// One side of a conflict: its facts, with those that differ from the other side's highlighted.
function Side({
  title,
  name,
  facts,
  other,
}: {
  title: string;
  name: string;
  facts: readonly TransferFact[];
  other: readonly TransferFact[];
}) {
  return (
    <Paper withBorder p="xs" radius="sm">
      <Text size="xs" tt="uppercase" fw={600}>
        {title}
      </Text>
      <Text fw={600}>{name}</Text>
      {facts.map((fact) => {
        const differs = other.some((o) => o.label === fact.label && o.value !== fact.value);
        return (
          <Group key={fact.label} justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm">{fact.label}</Text>
            <Text size="sm" fw={differs ? 700 : 400}>
              {differs ? <Mark color="orange">{fact.value}</Mark> : fact.value}
            </Text>
          </Group>
        );
      })}
    </Paper>
  );
}

// What the choice will do, in a sentence.
function outcome(item: PreviewItem, choice: ImportChoice, target: ConflictTarget | undefined): string {
  const thing = item.label.toLowerCase();
  if (choice.action === 'skip') return `Skip: the file’s ${thing} isn’t imported.`;
  if (choice.action === 'keep-both')
    return `Keep both: the file’s ${thing} is added as a copy; the one here is unchanged.`;
  const isDefault = target?.facts.some((fact) => fact.label === 'Default' && fact.value === 'yes');
  return isDefault
    ? `Replace: the ${thing} here takes what’s in the file. It’s the default, so the OBS overlay changes at once.`
    : `Replace: the ${thing} here takes what’s in the file, and keeps its place.`;
}

// A conflict in a file being imported (docs/features/import-export.md): the item in the file and the one here it
// clashes with, side by side with their differences highlighted, and Replace, Keep both or Skip.
export function ImportConflict({ number, item, choice, onChoose, makeDefault }: ImportConflictProps) {
  const target = item.conflicts.find((c) => choice.action === 'replace' && c.id === choice.target) ?? item.conflicts[0];
  const choose = (action: string) => {
    if (action === 'replace') onChoose({ action: 'replace', target: target?.id ?? '' });
    else onChoose({ action: action === 'skip' ? 'skip' : 'keep-both' });
  };
  return (
    <Paper
      withBorder
      p="sm"
      radius="sm"
      style={{ borderLeft: '4px solid var(--mantine-color-orange-6)' }}
      aria-label={`Conflict ${number}: ${item.label} “${item.name}”`}
      component="section"
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge color="orange" circle>
              {number}
            </Badge>
            <Text fw={600}>
              {item.label} “{item.name}”
            </Text>
          </Group>
          <SegmentedControl
            size="xs"
            data={ACTIONS}
            value={choice.action === 'add' ? 'keep-both' : choice.action}
            onChange={choose}
            aria-label={`What happens to ${item.label.toLowerCase()} “${item.name}”`}
          />
        </Group>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
          <Side title="In the file" name={item.name} facts={item.facts} other={target?.facts ?? []} />
          <Text c="orange.9" fw={700} size="lg" aria-hidden>
            ⇄
          </Text>
          <Side
            title={item.conflicts.length > 1 ? `Here now · ${item.conflicts.length} have this name` : 'Here now'}
            name={target?.name ?? ''}
            facts={target?.facts ?? []}
            other={item.facts}
          />
        </div>
        {choice.action === 'replace' && item.conflicts.length > 1 && (
          <NativeSelect
            label="Replace which?"
            size="xs"
            data={item.conflicts.map((c) => ({
              value: c.id,
              label: c.updatedAt ? `${c.name} · changed ${c.updatedAt.slice(0, 10)}` : c.name,
            }))}
            value={choice.target}
            onChange={(event) => onChoose({ action: 'replace', target: event.currentTarget.value })}
          />
        )}
        <Text size="sm">{outcome(item, choice, target)}</Text>
        {makeDefault}
      </Stack>
    </Paper>
  );
}
