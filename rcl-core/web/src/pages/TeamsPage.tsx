import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Alert,
  Anchor,
  Avatar,
  Button,
  ColorSwatch,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { CreateTeamRequestSchema, type TeamSummary } from '@rollcall/core-contract';
import { exportUrl, fieldErrors, ImportDialog, problemWith, useAppDispatch, useGetMeQuery } from '@rollcall/web-sdk';
import { imported, useCreateTeamMutation, useGetTeamsQuery } from '../api.ts';

// The teams (docs/features/team-builder.md). Anyone holding core:teams.read sees the list; core:teams.manage can
// create teams too. Hiding things is only for convenience: the server checks every request (hard rule 5).
export function TeamsPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:teams.read')) return <Alert color="gray">Your account can't view teams.</Alert>;
  return <TeamList canManage={me.permissions.includes('core:teams.manage')} />;
}

function TeamList({ canManage }: { canManage: boolean }) {
  const teams = useGetTeamsQuery();
  const dispatch = useAppDispatch();
  const [importing, setImporting] = useState(false);
  return (
    <Stack maw={980}>
      <Group justify="space-between">
        <Title order={2}>Teams</Title>
        {canManage && (
          <Group gap="xs">
            <Button variant="default" onClick={() => setImporting(true)}>
              Import…
            </Button>
            {teams.data && teams.data.length > 0 && (
              <Button variant="default" component="a" href={exportUrl({ kinds: ['core:team'] })} download>
                Export all
              </Button>
            )}
          </Group>
        )}
      </Group>
      {canManage && <NewTeam />}
      {canManage && (
        <ImportDialog opened={importing} onClose={() => setImporting(false)} onImported={() => dispatch(imported())} />
      )}
      {teams.isError && <Alert color="red">{problemWith(teams.error)}</Alert>}
      {teams.data?.length === 0 && <Text>No teams yet.</Text>}
      {teams.data && teams.data.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <VisuallyHidden>Logo</VisuallyHidden>
              </Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>League</Table.Th>
              <Table.Th>Short name</Table.Th>
              <Table.Th>Colors</Table.Th>
              <Table.Th>Skaters</Table.Th>
              <Table.Th>Bench staff</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {teams.data.map((team) => (
              <TeamRow key={team.id} team={team} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

function TeamRow({ team }: { team: TeamSummary }) {
  return (
    <Table.Tr>
      <Table.Td>
        <Avatar src={team.logoUrl} alt={`${team.name} logo`} name={team.name} radius="sm" />
      </Table.Td>
      <Table.Td>
        <Anchor component={Link} to={`/teams/${encodeURIComponent(team.id)}`}>
          {team.name}
        </Anchor>
      </Table.Td>
      <Table.Td>{team.leagueName}</Table.Td>
      <Table.Td>{team.shortName}</Table.Td>
      <Table.Td>
        <Group gap={4}>
          {[team.primaryColor, team.secondaryColor].map(
            (color, i) =>
              color && (
                <ColorSwatch key={color + String(i)} color={color} size={18}>
                  <VisuallyHidden>Color {color}</VisuallyHidden>
                </ColorSwatch>
              ),
          )}
        </Group>
      </Table.Td>
      <Table.Td>{team.skaterCount}</Table.Td>
      <Table.Td>{team.benchCount}</Table.Td>
    </Table.Tr>
  );
}

// Creates a team from its name, then opens it to fill in the rest.
function NewTeam() {
  const [createTeam, { isLoading, error }] = useCreateTeamMutation();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = CreateTeamRequestSchema.safeParse({ name });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await createTeam(checked.data);
    if (result.data) void navigate(`/teams/${encodeURIComponent(result.data.id)}`);
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Group align="end">
        <TextInput
          label="New team"
          placeholder="Team name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          error={errors.name}
          w={320}
        />
        <Button type="submit" loading={isLoading}>
          Create team
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
