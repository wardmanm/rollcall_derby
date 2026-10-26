import type { ReactNode } from 'react';
import { Checkbox, Group, Stack, Text } from '@mantine/core';
import type { ImportChoice, PreviewItem } from '@rollcall/core-contract';

export interface ImportListProps {
  /** The file's items that aren't conflicts: new, reused or can't-import. */
  items: readonly PreviewItem[];
  /** Every item of the file, for naming what needs what. */
  all: readonly PreviewItem[];
  choices: readonly ImportChoice[];
  onChoose: (index: number, choice: ImportChoice) => void;
  /** An item's "Make default" switch, when it can be the default. */
  makeDefault: (item: PreviewItem) => ReactNode;
}

// A short summary of an item: what needs it, such as "used by Derby Night", or else its first facts.
function summaryOf(item: PreviewItem, all: readonly PreviewItem[]): string {
  const usedBy = all.filter((other) => other.needs.includes(item.index)).map((other) => other.name);
  if (usedBy.length > 0) return `used by ${usedBy.join(', ')}`;
  return item.facts
    .slice(0, 3)
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join(' · ');
}

// The items of a file being imported that aren't conflicts (docs/features/import-export.md): new ones with a tick box,
// ones already here, and ones that can't be imported, with why.
export function ImportList({ items, all, choices, onChoose, makeDefault }: ImportListProps) {
  return (
    <Stack gap={4}>
      {items.map((item) => {
        const choice = choices[item.index];
        const label = `${item.label} “${item.name}”`;
        return (
          <Group
            key={item.index}
            gap="sm"
            wrap="nowrap"
            py={4}
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            {item.status === 'new' ? (
              <Checkbox
                aria-label={`Import ${label}`}
                checked={choice?.action === 'add'}
                onChange={(event) => onChoose(item.index, { action: event.currentTarget.checked ? 'add' : 'skip' })}
              />
            ) : (
              <span style={{ width: 20 }} />
            )}
            <Text size="sm" w={56}>
              {item.label}
            </Text>
            <Text size="sm" fw={500}>
              {item.name || 'Unnamed'}
            </Text>
            <Group gap="sm" ml="auto" wrap="nowrap">
              {item.wasDefault && <Text size="xs">was the default in the file</Text>}
              <Text size="xs">{item.status === 'new' ? summaryOf(item, all) : item.reason}</Text>
              {item.status === 'new' && makeDefault(item)}
            </Group>
          </Group>
        );
      })}
    </Stack>
  );
}
