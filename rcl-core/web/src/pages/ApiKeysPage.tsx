import { useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
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
import {
  API_KEY_EXPIRIES,
  CreateApiKeyRequestSchema,
  type ApiKey,
  type ApiKeyExpiry,
  type CreateApiKeyResponse,
} from '@rollcall/core-contract';
import { useGetMeQuery } from '@rollcall/web-sdk';
import {
  useCreateApiKeyMutation,
  useGetApiKeysQuery,
  useGetGrantablePermissionsQuery,
  useRevokeApiKeyMutation,
} from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
import { ShowOnce, type ShownOnce } from './ShowOnce.tsx';

const EXPIRY_NAMES: Record<ApiKeyExpiry, string> = {
  never: 'Never',
  '1d': '1 day',
  '7d': '7 days',
  '30d': '30 days',
  '1y': '1 year',
};
const EXPIRY_OPTIONS = API_KEY_EXPIRIES.map((value) => ({ value, label: EXPIRY_NAMES[value] }));
const isExpiry = (value: string): value is ApiKeyExpiry => API_KEY_EXPIRIES.some((expiry) => expiry === value);
const dateOf = (iso: string) => new Date(iso).toLocaleDateString();

// A new API key, shown once (ADR-0020).
const newKey = ({ apiKey, key }: CreateApiKeyResponse): ShownOnce => ({
  title: `API key: ${apiKey.name}`,
  text: "Copy it into your device or script now: it won't be shown again.",
  label: 'API key',
  value: key,
});

// API keys for devices and scripts (users-and-access R7, ADR-0020), for Admins. Hiding it from others is only for
// convenience: the server refuses them anyway (hard rule 5).
export function ApiKeysPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:api-keys.manage')) {
    return <Alert color="gray">Only Admins can manage API keys.</Alert>;
  }
  return <ManageApiKeys />;
}

function ManageApiKeys() {
  const keys = useGetApiKeysQuery();
  const [revokeApiKey] = useRevokeApiKeyMutation();
  const [shown, setShown] = useState<ShownOnce | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // When the page opened, to mark keys that have expired. A key that expires while the page is open shows once the
  // page is opened again.
  const [now] = useState(() => Date.now());

  const revoke = async () => {
    const key = revoking;
    setRevoking(null);
    if (!key) return;
    setProblem(null);
    const result = await revokeApiKey(key.id);
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That key was already revoked.' }));
  };

  return (
    <Stack maw={980}>
      <Title order={2}>API keys</Title>
      <Text>
        Devices and scripts on the venue network, such as Bitfocus Companion, call Rollcall with an API key instead of
        signing in. A key can do only what its permissions allow.
      </Text>
      <CreateApiKey onCreated={(created) => setShown(newKey(created))} />
      {problem && (
        <Alert color="red" withCloseButton closeButtonLabel="Dismiss" onClose={() => setProblem(null)}>
          {problem}
        </Alert>
      )}
      {keys.isError && <Alert color="red">{problemWith(keys.error)}</Alert>}
      {keys.data?.length === 0 && <Text c="dimmed">No API keys yet.</Text>}
      {keys.data && keys.data.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Key</Table.Th>
              <Table.Th>Permissions</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Expires</Table.Th>
              <Table.Th>Last used</Table.Th>
              <Table.Th>
                <VisuallyHidden>Actions</VisuallyHidden>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {keys.data.map((key) => (
              <ApiKeyRow key={key.id} apiKey={key} now={now} onRevoke={() => setRevoking(key)} />
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal opened={revoking !== null} onClose={() => setRevoking(null)} title={`Revoke ${revoking?.name ?? ''}?`}>
        <Stack>
          <Text>Devices and scripts using it stop working at once. This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void revoke()}>
              Revoke
            </Button>
          </Group>
        </Stack>
      </Modal>
      <ShowOnce shown={shown} onClose={() => setShown(null)} />
    </Stack>
  );
}

function ApiKeyRow({ apiKey, now, onRevoke }: { apiKey: ApiKey; now: number; onRevoke: () => void }) {
  const expired = apiKey.expiresAt !== null && Date.parse(apiKey.expiresAt) <= now;
  return (
    <Table.Tr>
      <Table.Td>{apiKey.name}</Table.Td>
      <Table.Td>
        <Code>{apiKey.prefix}…</Code>
      </Table.Td>
      <Table.Td>
        {apiKey.permissions.length === 0 ? (
          <Text size="sm" c="dimmed">
            Public routes only
          </Text>
        ) : (
          <Group gap={4}>
            {apiKey.permissions.map((permission) => (
              <Badge key={permission} variant="light" tt="none">
                {permission}
              </Badge>
            ))}
          </Group>
        )}
      </Table.Td>
      <Table.Td>
        {dateOf(apiKey.createdAt)} by {apiKey.createdBy}
      </Table.Td>
      <Table.Td>
        {expired ? (
          <Badge variant="light" color="gray">
            Expired
          </Badge>
        ) : apiKey.expiresAt === null ? (
          'Never'
        ) : (
          dateOf(apiKey.expiresAt)
        )}
      </Table.Td>
      <Table.Td>{apiKey.lastUsedAt === null ? 'Never' : dateOf(apiKey.lastUsedAt)}</Table.Td>
      <Table.Td>
        <Menu position="bottom-end" withInitialFocusPlaceholder={false}>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={`Actions for ${apiKey.name}`}>
              ⋯
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item color="red" onClick={onRevoke}>
              Revoke
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Table.Td>
    </Table.Tr>
  );
}

function CreateApiKey({ onCreated }: { onCreated: (created: CreateApiKeyResponse) => void }) {
  const grantable = useGetGrantablePermissionsQuery();
  const [createApiKey, { isLoading, error }] = useCreateApiKeyMutation();
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState<ApiKeyExpiry>('never');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = CreateApiKeyRequestSchema.safeParse({ name, permissions, expiresIn });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await createApiKey(checked.data);
    if (result.data) {
      setName('');
      setPermissions([]);
      setExpiresIn('never');
      onCreated(result.data);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack gap="sm">
        <Title order={3} size="h4">
          New API key
        </Title>
        <Group align="start">
          <TextInput
            label="Name"
            placeholder="Stream Deck, production desk"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.name}
            w={320}
          />
          <NativeSelect
            label="Expires"
            data={EXPIRY_OPTIONS}
            value={expiresIn}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isExpiry(value)) setExpiresIn(value);
            }}
          />
        </Group>
        {grantable.data?.length === 0 ? (
          <Text size="sm" c="dimmed">
            No permissions can be given to API keys yet: a key can call public routes only.
          </Text>
        ) : (
          <Checkbox.Group label="Permissions" value={permissions} onChange={setPermissions}>
            <Stack gap="xs" mt="xs">
              {grantable.data?.map((permission) => (
                <Checkbox
                  key={permission.key}
                  value={permission.key}
                  label={permission.key}
                  description={permission.summary}
                />
              ))}
            </Stack>
          </Checkbox.Group>
        )}
        {error && <Alert color="red">{problemWith(error, { name_taken: 'That name is already taken.' })}</Alert>}
        <Group>
          <Button type="submit" loading={isLoading}>
            Create key
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
