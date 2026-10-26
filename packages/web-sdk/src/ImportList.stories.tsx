import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from '@mantine/core';
import type { PreviewItem } from '@rollcall/core-contract';
import { ImportList } from './ImportList.tsx';

const base = { reason: null, conflicts: [], needs: [], canBeDefault: false, wasDefault: false, facts: [] };
const ITEMS: PreviewItem[] = [
  {
    ...base,
    index: 0,
    kind: 'core:team',
    label: 'Team',
    name: 'Rose City Rollers',
    status: 'new',
    facts: [
      { label: 'League', value: 'Rose City Rollers' },
      { label: 'Skaters', value: '14' },
    ],
  },
  {
    ...base,
    index: 1,
    kind: 'producer:theme',
    label: 'Theme',
    name: 'Derby Night',
    status: 'new',
    needs: [2],
    canBeDefault: true,
    wasDefault: true,
  },
  { ...base, index: 2, kind: 'core:font-face', label: 'Font', name: 'Rollerball 700', status: 'new' },
  {
    ...base,
    index: 3,
    kind: 'core:font-face',
    label: 'Font',
    name: 'Jammer 400',
    status: 'reused',
    reason: 'Already here: the one here is used',
  },
];
const CANT: PreviewItem[] = [
  {
    ...base,
    index: 4,
    kind: 'core:screen',
    label: 'Screen',
    name: 'Bout intro',
    status: 'cant',
    reason: "Screens aren't known here yet",
  },
  {
    ...base,
    index: 5,
    kind: 'producer:theme',
    label: 'Theme',
    name: 'Playoffs',
    status: 'cant',
    reason: "Your account can't import themes",
  },
];

const meta = {
  title: 'Import/ImportList',
  component: ImportList,
  args: {
    items: ITEMS,
    all: [...ITEMS, ...CANT],
    choices: [
      { action: 'add' },
      { action: 'add' },
      { action: 'add' },
      { action: 'skip' },
      { action: 'skip' },
      { action: 'skip' },
    ],
    onChoose: () => undefined,
    makeDefault: (item) =>
      item.canBeDefault ? <Switch size="xs" label="Make default" aria-label={`Make ${item.name} the default`} /> : null,
  },
} satisfies Meta<typeof ImportList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const CantImport: Story = { args: { items: CANT, makeDefault: () => null } };
