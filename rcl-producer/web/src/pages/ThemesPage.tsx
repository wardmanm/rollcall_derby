import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  ColorSwatch,
  Group,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { CreateThemeRequestSchema, type Theme } from '@rollcall/producer-contract';
import { exportUrl, fieldErrors, ImportDialog, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import {
  useCreateThemeMutation,
  useDeleteThemeMutation,
  useDuplicateThemeMutation,
  useGetThemesQuery,
  useSetDefaultThemeMutation,
} from '../api.ts';

// The themes (docs/features/theme-builder.md). Anyone holding producer:themes.read sees the list;
// producer:themes.manage can create, duplicate and delete themes and choose the default. Hiding things is only for
// convenience: the server checks every request (hard rule 5).
export function ThemesPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('producer:themes.read')) {
    return <Alert color="gray">Your account can't view themes.</Alert>;
  }
  return <ThemeList canManage={me.permissions.includes('producer:themes.manage')} />;
}

function ThemeList({ canManage }: { canManage: boolean }) {
  const themes = useGetThemesQuery();
  const [deleting, setDeleting] = useState<Theme | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  return (
    <Stack maw={980}>
      <Group justify="space-between">
        <Title order={2}>Themes</Title>
        <Group gap="xs">
          {canManage && (
            <Button variant="default" onClick={() => setImporting(true)}>
              Import…
            </Button>
          )}
          {themes.data && themes.data.length > 0 && (
            <Button variant="default" component="a" href={exportUrl({ kinds: ['producer:theme'] })} download>
              Export all
            </Button>
          )}
        </Group>
      </Group>
      <Text size="sm">The default theme styles the OBS overlay. With none, the overlay uses the built-in look.</Text>
      {canManage && <NewTheme />}
      {themes.isError && <Alert color="red">{problemWith(themes.error)}</Alert>}
      {problem && <Alert color="red">{problem}</Alert>}
      {themes.data?.length === 0 && <Text>No themes yet.</Text>}
      {themes.data && themes.data.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Colors</Table.Th>
              <Table.Th>
                <VisuallyHidden>Actions</VisuallyHidden>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {themes.data.map((theme) => (
              <ThemeRow
                key={theme.id}
                theme={theme}
                actions={
                  <ThemeMenu theme={theme} canManage={canManage} onDelete={setDeleting} onProblem={setProblem} />
                }
              />
            ))}
          </Table.Tbody>
        </Table>
      )}
      {deleting && <DeleteTheme theme={deleting} onClose={() => setDeleting(null)} />}
      {canManage && (
        <ImportDialog opened={importing} onClose={() => setImporting(false)} onImported={() => void themes.refetch()} />
      )}
    </Stack>
  );
}

function ThemeRow({ theme, actions }: { theme: Theme; actions: ReactNode }) {
  const { surface, accent } = theme.tokens.colors;
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Anchor component={Link} to={`/themes/${encodeURIComponent(theme.id)}`}>
            {theme.name}
          </Anchor>
          {theme.isDefault && <Badge variant="light">Default</Badge>}
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          <ColorSwatch color={surface} size={18}>
            <VisuallyHidden>Surface {surface}</VisuallyHidden>
          </ColorSwatch>
          <ColorSwatch color={accent} size={18}>
            <VisuallyHidden>Accent {accent}</VisuallyHidden>
          </ColorSwatch>
        </Group>
      </Table.Td>
      <Table.Td>{actions}</Table.Td>
    </Table.Tr>
  );
}

// A theme's row menu: Export for anyone who can see it, then for those who may manage themes Duplicate, Make default
// or Stop using as default, and Delete (which confirms first).
function ThemeMenu({
  theme,
  canManage,
  onDelete,
  onProblem,
}: {
  theme: Theme;
  canManage: boolean;
  onDelete: (theme: Theme) => void;
  onProblem: (problem: string | null) => void;
}) {
  const [duplicateTheme] = useDuplicateThemeMutation();
  const [setDefaultTheme] = useSetDefaultThemeMutation();
  const run = async (request: Promise<{ error?: unknown }>) => {
    const result = await request;
    onProblem(result.error ? problemWith(result.error) : null);
  };
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" aria-label={`Actions for ${theme.name}`}>
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component="a" href={exportUrl({ items: [{ kind: 'producer:theme', id: theme.id }] })} download>
          Export
        </Menu.Item>
        {canManage && (
          <>
            <Menu.Item onClick={() => void run(duplicateTheme({ id: theme.id }))}>Duplicate</Menu.Item>
            {theme.isDefault ? (
              <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: null }))}>Stop using as default</Menu.Item>
            ) : (
              <Menu.Item onClick={() => void run(setDefaultTheme({ themeId: theme.id }))}>Make default</Menu.Item>
            )}
            <Menu.Item color="red" onClick={() => onDelete(theme)}>
              Delete
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

// Deletes a theme once the person confirms, saying when the overlay loses it.
function DeleteTheme({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const [deleteTheme, { isLoading }] = useDeleteThemeMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = async () => {
    const result = await deleteTheme({ id: theme.id });
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That theme was already deleted.' }));
    else onClose();
  };
  return (
    <Modal opened onClose={onClose} title={`Delete ${theme.name}?`}>
      <Stack>
        <Text>
          {theme.isDefault
            ? 'The overlay goes back to the built-in look. This cannot be undone.'
            : 'This cannot be undone.'}
        </Text>
        {problem && <Alert color="red">{problem}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={isLoading} onClick={() => void confirm()}>
            Delete theme
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Creates a theme from its name, starting from the built-in look, then opens it to edit.
function NewTheme() {
  const [createTheme, { isLoading, error }] = useCreateThemeMutation();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = CreateThemeRequestSchema.safeParse({ name });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await createTheme(checked.data);
    if (result.data) void navigate(`/themes/${encodeURIComponent(result.data.id)}`);
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Group align="end">
        <TextInput
          label="New theme"
          placeholder="Theme name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          error={errors.name}
          w={320}
        />
        <Button type="submit" loading={isLoading}>
          Create theme
        </Button>
      </Group>
      {error && (
        <Alert color="red" mt="sm">
          {problemWith(error)}
        </Alert>
      )}
    </form>
  );
}
