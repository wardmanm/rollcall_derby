import { ActionIcon, Avatar, Badge, Group, Menu, Table, Text, VisuallyHidden } from '@mantine/core';
import { MEMBER_ROLE_NAMES, type MemberKind, type TeamMember } from '@rollcall/core-contract';

export interface MembersTableProps {
  /** The team's skaters or its bench staff, in the server's order. */
  members: readonly TeamMember[];
  kind: MemberKind;
  /** Without these, the table is read-only: no row menus. */
  onEdit?: (member: TeamMember) => void;
  onRemove?: (member: TeamMember) => void;
}

// One kind of a team's members, as a table: photo, number (skaters only), name, pronouns and roles. With onEdit and
// onRemove, each row has a menu with Edit and Remove.
export function MembersTable({ members, kind, onEdit, onRemove }: MembersTableProps) {
  const editable = onEdit !== undefined && onRemove !== undefined;
  if (members.length === 0) {
    return <Text size="sm">{kind === 'skater' ? 'No skaters yet.' : 'No bench staff yet.'}</Text>;
  }
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>
            <VisuallyHidden>Photo</VisuallyHidden>
          </Table.Th>
          {kind === 'skater' && <Table.Th>Number</Table.Th>}
          <Table.Th>Name</Table.Th>
          <Table.Th>Pronouns</Table.Th>
          <Table.Th>Roles</Table.Th>
          {editable && (
            <Table.Th>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Table.Th>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {members.map((member) => (
          <Table.Tr key={member.id}>
            <Table.Td>
              <Avatar src={member.photoUrl} alt={`Photo of ${member.name}`} name={member.name} radius="sm" />
            </Table.Td>
            {kind === 'skater' && <Table.Td>{member.number}</Table.Td>}
            <Table.Td>{member.name}</Table.Td>
            <Table.Td>{member.pronouns}</Table.Td>
            <Table.Td>
              <Group gap={4}>
                {member.roles.map((role) => (
                  <Badge key={role} variant="light">
                    {MEMBER_ROLE_NAMES[role]}
                  </Badge>
                ))}
                {member.customRoles.map((role) => (
                  <Badge key={role} variant="light" color="gray" tt="none">
                    {role}
                  </Badge>
                ))}
              </Group>
            </Table.Td>
            {editable && (
              <Table.Td>
                <Menu position="bottom-end" withInitialFocusPlaceholder={false}>
                  <Menu.Target>
                    <ActionIcon variant="subtle" aria-label={`Actions for ${member.name}`}>
                      ⋯
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => onEdit(member)}>Edit</Menu.Item>
                    <Menu.Item color="red" onClick={() => onRemove(member)}>
                      Remove
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
