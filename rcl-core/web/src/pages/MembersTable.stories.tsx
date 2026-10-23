import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { TeamMember } from '@rollcall/core-contract';
import { MembersTable } from './MembersTable.tsx';

const SKATERS: TeamMember[] = [
  {
    id: 'm1',
    kind: 'skater',
    name: 'Zero Cool',
    number: '00',
    pronouns: 'he/him',
    roles: ['captain'],
    customRoles: [],
    photoUrl: null,
  },
  {
    id: 'm2',
    kind: 'skater',
    name: 'Jammy Dodger',
    number: '7',
    pronouns: 'she/her',
    roles: ['alt-captain'],
    customRoles: ['MVP'],
    photoUrl: null,
  },
  {
    id: 'm3',
    kind: 'skater',
    name: 'Blocky Balboa',
    number: '12A',
    pronouns: null,
    roles: [],
    customRoles: [],
    photoUrl: null,
  },
];
const BENCH: TeamMember[] = [
  {
    id: 'm4',
    kind: 'bench',
    name: 'Coach Amy',
    number: null,
    pronouns: 'they/them',
    roles: ['bench-coach'],
    customRoles: ['Lineups'],
    photoUrl: null,
  },
];

const meta = {
  title: 'Teams/MembersTable',
  component: MembersTable,
} satisfies Meta<typeof MembersTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What Admins and Producers see: each row has a menu with Edit and Remove. */
export const Editable: Story = { args: { members: SKATERS, kind: 'skater', onEdit: fn(), onRemove: fn() } };

/** What Announcers see: no row menus. */
export const ReadOnly: Story = { args: { members: SKATERS, kind: 'skater' } };

export const BenchStaff: Story = { args: { members: BENCH, kind: 'bench', onEdit: fn(), onRemove: fn() } };

export const NoSkatersYet: Story = { args: { members: [], kind: 'skater' } };
