import { useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  NativeSelect,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { CreateUserRequestSchema, ROLES, type CurrentUser, type Role, type User } from '@rollcall/core-contract';
import { fieldErrors, problemWith, ROLE_NAMES, useGetMeQuery } from '@rollcall/web-sdk';
import {
  useCreateUserMutation,
  useDeleteUserMutation,
  useGetUsersQuery,
  useResetPasswordMutation,
  useSignOutUserMutation,
  useUpdateUserRoleMutation,
} from '../api.ts';
import { ShowOnce, type ShownOnce } from './ShowOnce.tsx';

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_NAMES[role] }));
const isRole = (value: string): value is Role => ROLES.some((role) => role === value);

const SENTENCES = {
  username_taken: 'That username is already taken.',
  not_found: 'That user no longer exists. The list has been refreshed.',
};

// A new temporary password, shown once (ADR-0018).
const temporaryPassword = (username: string, password: string): ShownOnce => ({
  title: `Temporary password for ${username}`,
  text: `Give it to ${username} now: it won't be shown again. They'll choose their own password when they sign in.`,
  label: 'Temporary password',
  value: password,
});

interface Confirmation {
  title: string;
  message: string;
  action: string;
  run: () => Promise<unknown>;
}

// User management for Admins (users-and-access R3). Hiding it from others is only for convenience: the server refuses
// them anyway (hard rule 5).
export function UsersPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:users.manage')) {
    return <Alert color="gray">Only Admins can manage users.</Alert>;
  }
  return <ManageUsers me={me} />;
}

function ManageUsers({ me }: { me: CurrentUser }) {
  const users = useGetUsersQuery();
  const [updateRole] = useUpdateUserRoleMutation();
  const [resetPassword] = useResetPasswordMutation();
  const [signOut] = useSignOutUserMutation();
  const [deleteUser] = useDeleteUserMutation();
  const [shown, setShown] = useState<ShownOnce | null>(null);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Runs a request, and says what went wrong if it fails.
  const attempt = async <T extends { error?: unknown }>(request: Promise<T>) => {
    setProblem(null);
    const result = await request;
    if (result.error) setProblem(problemWith(result.error, SENTENCES));
    return result;
  };

  const confirmed = async () => {
    const action = confirming;
    setConfirming(null);
    if (action) await action.run();
  };

  return (
    <Stack maw={880}>
      <Title order={2}>Users</Title>
      <CreateUser onCreated={setShown} />
      {problem && (
        <Alert color="red" withCloseButton closeButtonLabel="Dismiss" onClose={() => setProblem(null)}>
          {problem}
        </Alert>
      )}
      {users.isError && <Alert color="red">{problemWith(users.error)}</Alert>}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Username</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.data?.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isYou={user.id === me.id}
              onRole={(role) => void attempt(updateRole({ id: user.id, role }))}
              onReset={() =>
                setConfirming({
                  title: `Reset ${user.username}'s password?`,
                  message: 'They are signed out everywhere and get a temporary password, shown to you once.',
                  action: 'Reset password',
                  run: async () => {
                    const result = await attempt(resetPassword(user.id));
                    if (result.data) setShown(temporaryPassword(user.username, result.data.temporaryPassword));
                  },
                })
              }
              onSignOut={() =>
                setConfirming({
                  title: `Sign ${user.username} out everywhere?`,
                  message: 'Every device they use has to sign in again, even mid-game.',
                  action: 'Sign out',
                  run: () => attempt(signOut(user.id)),
                })
              }
              onDelete={() =>
                setConfirming({
                  title: `Delete ${user.username}?`,
                  message: 'Their account is removed and they are signed out everywhere. This cannot be undone.',
                  action: 'Delete',
                  run: () => attempt(deleteUser(user.id)),
                })
              }
            />
          ))}
        </Table.Tbody>
      </Table>
      <Modal opened={confirming !== null} onClose={() => setConfirming(null)} title={confirming?.title}>
        <Stack>
          <Text>{confirming?.message}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void confirmed()}>
              {confirming?.action}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <ShowOnce shown={shown} onClose={() => setShown(null)} />
    </Stack>
  );
}

interface UserRowProps {
  user: User;
  isYou: boolean;
  onRole: (role: Role) => void;
  onReset: () => void;
  onSignOut: () => void;
  onDelete: () => void;
}

function UserRow({ user, isYou, onRole, onReset, onSignOut, onDelete }: UserRowProps) {
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text>{user.username}</Text>
          {isYou && <Badge variant="light">You</Badge>}
          {user.mustChangePassword && (
            <Badge variant="light" color="gray">
              Temporary password
            </Badge>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        <NativeSelect
          aria-label={`Role for ${user.username}`}
          data={ROLE_OPTIONS}
          value={user.role}
          onChange={(event) => {
            const role = event.currentTarget.value;
            if (isRole(role)) onRole(role);
          }}
        />
      </Table.Td>
      <Table.Td>{new Date(user.createdAt).toLocaleDateString()}</Table.Td>
      <Table.Td>
        <Menu position="bottom-end" withInitialFocusPlaceholder={false}>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={`Actions for ${user.username}`}>
              ⋯
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {/* Resetting your own password signs you out before you could read the new one: use Change password. */}
            <Menu.Item onClick={onReset} disabled={isYou}>
              Reset password
            </Menu.Item>
            <Menu.Item onClick={onSignOut}>Sign out everywhere</Menu.Item>
            {/* The server refuses to delete your own account, so it isn't offered. */}
            <Menu.Item color="red" onClick={onDelete} disabled={isYou}>
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
}

function CreateUser({ onCreated }: { onCreated: (shown: ShownOnce) => void }) {
  const [createUser, { isLoading, error }] = useCreateUserMutation();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('producer');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = CreateUserRequestSchema.safeParse({ username, role });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await createUser(checked.data);
    if (result.data) {
      setUsername('');
      onCreated(temporaryPassword(result.data.user.username, result.data.temporaryPassword));
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="xs">
        <Title order={3} size="h4">
          New user
        </Title>
        <Group align="start">
          <TextInput
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            error={errors.username}
          />
          <NativeSelect
            label="Role"
            data={ROLE_OPTIONS}
            value={role}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isRole(value)) setRole(value);
            }}
          />
          <Button type="submit" loading={isLoading} mt={25}>
            Create
          </Button>
        </Group>
        {error && <Alert color="red">{problemWith(error, SENTENCES)}</Alert>}
      </Stack>
    </form>
  );
}
