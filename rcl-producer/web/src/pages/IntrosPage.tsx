import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import type { TeamSummary } from '@rollcall/core-contract';
import { CreateIntroRequestSchema, type Intro } from '@rollcall/producer-contract';
import { fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import { useCreateIntroMutation, useDeleteIntroMutation, useGetIntrosQuery, useGetTeamsQuery } from '../api.ts';

// The intros (docs/features/skater-intros.md). Anyone holding producer:intros.run sees the list and can run an intro;
// producer:intros.manage can also create, set up and delete them. Hiding things is only for convenience: the server
// checks every request (hard rule 5).
export function IntrosPage() {
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('producer:intros.run')) {
    return <Alert color="gray">Your account can't view intros.</Alert>;
  }
  return <IntroList canManage={me.permissions.includes('producer:intros.manage')} />;
}

// "Team A vs Team B", or "No teams yet". A team that was deleted shows as such once the teams have loaded, and
// "Teams unavailable" stands for both if they couldn't be.
function teamsOf(intro: Intro, teams: readonly TeamSummary[] | undefined, failed: boolean): string {
  if (intro.teamAId === null && intro.teamBId === null) return 'No teams yet';
  if (!teams && failed) return 'Teams unavailable';
  const nameOf = (id: string | null) => {
    if (id === null) return 'No team';
    return teams?.find((team) => team.id === id)?.name ?? (teams ? 'Deleted team' : '…');
  };
  return `${nameOf(intro.teamAId)} vs ${nameOf(intro.teamBId)}`;
}

function IntroList({ canManage }: { canManage: boolean }) {
  const intros = useGetIntrosQuery();
  const teams = useGetTeamsQuery();
  const [deleting, setDeleting] = useState<Intro | null>(null);
  return (
    <Stack maw={980}>
      <Title order={2}>Intros</Title>
      <Text size="sm">An intro introduces each team's people on the OBS overlay, one step at a time.</Text>
      {canManage && <NewIntro />}
      {intros.isLoading && (
        <output aria-label="Loading intros">
          <Loader />
        </output>
      )}
      {intros.isError && <Alert color="red">{problemWith(intros.error)}</Alert>}
      {intros.data?.length === 0 && <Text>No intros yet.</Text>}
      {intros.data && intros.data.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Teams</Table.Th>
              <Table.Th>
                <VisuallyHidden>Actions</VisuallyHidden>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {intros.data.map((intro) => (
              <Table.Tr key={intro.id}>
                <Table.Td>{intro.name}</Table.Td>
                <Table.Td>{teamsOf(intro, teams.data, teams.isError)}</Table.Td>
                <Table.Td>
                  <Group gap="md" justify="flex-end">
                    {canManage && (
                      <Anchor component={Link} to={`/intros/${encodeURIComponent(intro.id)}`}>
                        Set up
                      </Anchor>
                    )}
                    <Anchor component={Link} to={`/intros/${encodeURIComponent(intro.id)}/run`}>
                      Run
                    </Anchor>
                    {canManage && (
                      <Button
                        variant="subtle"
                        color="red"
                        size="compact-sm"
                        aria-label={`Delete ${intro.name}`}
                        onClick={() => setDeleting(intro)}
                      >
                        Delete
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {deleting && <DeleteIntro intro={deleting} onClose={() => setDeleting(null)} />}
    </Stack>
  );
}

// Deletes an intro once the person confirms.
function DeleteIntro({ intro, onClose }: { intro: Intro; onClose: () => void }) {
  const [deleteIntro, { isLoading }] = useDeleteIntroMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = async () => {
    const result = await deleteIntro({ id: intro.id });
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That intro was already deleted.' }));
    else onClose();
  };
  return (
    <Modal opened onClose={onClose} title="Delete intro?">
      <Stack>
        <Text>{`Delete intro “${intro.name}”? Its OBS browser source will show nothing.`}</Text>
        {problem && <Alert color="red">{problem}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={isLoading} onClick={() => void confirm()}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Creates an intro from its name, then opens its setup page.
function NewIntro() {
  const [createIntro, { isLoading, error }] = useCreateIntroMutation();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = CreateIntroRequestSchema.safeParse({ name });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    if (!checked.success) return;
    const result = await createIntro(checked.data);
    if (result.data) void navigate(`/intros/${encodeURIComponent(result.data.id)}`);
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Group align="end">
        <TextInput
          label="Intro name"
          placeholder="Intro name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          error={errors.name}
          w={320}
        />
        <Button type="submit" loading={isLoading}>
          New intro
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
