import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from '@mantine/core';
import type { ImportChoice, PreviewItem } from '@rollcall/core-contract';
import { ImportConflict, type ImportConflictProps } from './ImportConflict.tsx';

const TEAM: PreviewItem = {
  index: 0,
  kind: 'core:team',
  label: 'Team',
  name: 'All Stars',
  facts: [
    { label: 'League', value: 'Rose City Rollers' },
    { label: 'Skaters', value: '16' },
    { label: 'Bench staff', value: '2' },
    { label: 'Colors', value: '#aa0000, #000000' },
    { label: 'Logo', value: 'yes' },
  ],
  status: 'conflict',
  reason: null,
  conflicts: [
    {
      id: 't1',
      name: 'All Stars',
      facts: [
        { label: 'League', value: 'Rose City Rollers' },
        { label: 'Skaters', value: '14' },
        { label: 'Bench staff', value: '2' },
        { label: 'Colors', value: '#aa0000, #000000' },
        { label: 'Logo', value: 'none' },
      ],
      updatedAt: '2026-10-24T10:00:00.000Z',
    },
  ],
  needs: [],
  canBeDefault: false,
  wasDefault: false,
};
const THEME: PreviewItem = {
  ...TEAM,
  index: 1,
  kind: 'producer:theme',
  label: 'Theme',
  name: 'Finals',
  facts: [
    { label: 'Surface', value: '#141821d9' },
    { label: 'Accent', value: '#ffd700' },
    { label: 'Fonts', value: 'Oswald / Inter' },
  ],
  conflicts: [
    {
      id: 'th1',
      name: 'Finals',
      facts: [
        { label: 'Surface', value: '#141821d9' },
        { label: 'Accent', value: '#228be6' },
        { label: 'Fonts', value: 'Inter / Inter' },
        { label: 'Default', value: 'yes' },
      ],
      updatedAt: '2026-10-25T10:00:00.000Z',
    },
  ],
  canBeDefault: true,
};

// The card with its choice kept in state, as the dialog keeps it.
function Stateful({ choice: first, ...props }: ImportConflictProps) {
  const [choice, setChoice] = useState<ImportChoice>(first);
  return <ImportConflict {...props} choice={choice} onChoose={setChoice} />;
}

const meta = {
  title: 'Import/ImportConflict',
  component: ImportConflict,
  render: (args) => <Stateful {...args} />,
  args: { number: 1, item: TEAM, choice: { action: 'keep-both' }, onChoose: () => undefined },
} satisfies Meta<typeof ImportConflict>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KeepBoth: Story = {};

export const SeveralMatches: Story = {
  args: {
    item: {
      ...TEAM,
      conflicts: [
        ...TEAM.conflicts,
        {
          id: 't2',
          name: 'all stars',
          facts: [{ label: 'Skaters', value: '9' }],
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    },
    choice: { action: 'replace', target: 't1' },
  },
};

export const ReplacingTheDefaultTheme: Story = {
  args: {
    number: 2,
    item: THEME,
    choice: { action: 'replace', target: 'th1' },
    makeDefault: <Switch size="xs" label="Make default" aria-label="Make theme “Finals” the default" />,
  },
};
