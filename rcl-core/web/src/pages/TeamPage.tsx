import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Anchor,
  Button,
  ColorInput,
  ColorSwatch,
  Group,
  Image,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { UpdateTeamRequestSchema, type MemberKind, type Team, type TeamMember } from '@rollcall/core-contract';
import { apiError, exportUrl, fieldErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import {
  useDeleteTeamMutation,
  useGetTeamQuery,
  useRemoveLogoMutation,
  useRemoveMemberMutation,
  useSetLogoMutation,
  useUpdateTeamMutation,
} from '../api.ts';
import { ImagePicker } from './ImagePicker.tsx';
import { GONE, MemberForm } from './MemberForm.tsx';
import { MembersTable } from './MembersTable.tsx';

// One team (docs/features/team-builder.md): its details and logo, its skaters and its bench staff. With
// core:teams.manage it's an editor; with only core:teams.read it's read-only. The server checks every change anyway.
export function TeamPage() {
  const { id = '' } = useParams();
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('core:teams.read')) return <Alert color="gray">Your account can't view teams.</Alert>;
  return <TeamView id={id} canManage={me.permissions.includes('core:teams.manage')} />;
}

function TeamView({ id, canManage }: { id: string; canManage: boolean }) {
  const team = useGetTeamQuery(id);
  const [editing, setEditing] = useState<{ kind: MemberKind; member: TeamMember | null } | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [removeMember] = useRemoveMemberMutation();
  const [problem, setProblem] = useState<string | null>(null);

  if (team.isError) {
    return (
      <Stack maw={980}>
        <BackToTeams />
        <Alert color={apiError(team.error)?.code === 'not_found' ? 'gray' : 'red'}>
          {problemWith(team.error, { not_found: "There's no such team. It may have been deleted." })}
        </Alert>
      </Stack>
    );
  }
  if (!team.data) return <Loader aria-label="Loading the team" />;
  const { data } = team;

  const remove = async () => {
    const member = removing;
    setRemoving(null);
    if (!member) return;
    setProblem(null);
    const result = await removeMember({ id: data.id, memberId: member.id });
    if (result.error) setProblem(problemWith(result.error, { not_found: 'That member was already removed.' }));
  };

  const section = (kind: MemberKind, heading: string, add: string) => (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={3} size="h4">
          {heading}
        </Title>
        {canManage && (
          <Button variant="default" size="xs" onClick={() => setEditing({ kind, member: null })}>
            {add}
          </Button>
        )}
      </Group>
      <MembersTable
        members={data.members.filter((member) => member.kind === kind)}
        kind={kind}
        {...(canManage ? { onEdit: (member: TeamMember) => setEditing({ kind, member }), onRemove: setRemoving } : {})}
      />
    </Stack>
  );

  return (
    <Stack maw={980}>
      <BackToTeams />
      <Group justify="space-between">
        <Title order={2}>{data.name}</Title>
        {canManage && (
          <Button
            variant="default"
            component="a"
            href={exportUrl({ items: [{ kind: 'core:team', id: data.id }] })}
            download
          >
            Export team
          </Button>
        )}
      </Group>
      {canManage ? <TeamDetailsForm key={data.id} team={data} /> : <TeamDetails team={data} />}
      {problem && (
        <Alert color="red" withCloseButton closeButtonLabel="Dismiss" onClose={() => setProblem(null)}>
          {problem}
        </Alert>
      )}
      {section('skater', 'Skaters', 'Add skater')}
      {section('bench', 'Bench staff', 'Add bench staff')}
      {canManage && <DeleteTeam team={data} />}
      {editing && (
        <MemberForm
          key={editing.member?.id ?? `new-${editing.kind}`}
          team={data}
          kind={editing.kind}
          member={editing.member}
          onClose={() => setEditing(null)}
        />
      )}
      <Modal opened={removing !== null} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? ''}?`}>
        <Stack>
          <Text>Their photo is deleted too.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void remove()}>
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

const BackToTeams = () => (
  <Anchor component={Link} to="/teams" size="sm">
    ← Teams
  </Anchor>
);

// The team's details, read-only.
function TeamDetails({ team }: { team: Team }) {
  const rows: [string, string | null][] = [
    ['League', team.leagueName],
    ['Short name', team.shortName],
  ];
  return (
    <Group align="start" gap="xl">
      {team.logoUrl && <Image src={team.logoUrl} alt={`${team.name} logo`} w={96} h={96} fit="contain" />}
      <Stack gap={4}>
        {rows.map(
          ([label, value]) =>
            value && (
              <Text key={label} size="sm">
                {label}: {value}
              </Text>
            ),
        )}
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
      </Stack>
    </Group>
  );
}

type DetailField = 'name' | 'leagueName' | 'shortName' | 'primaryColor' | 'secondaryColor';

// The team's details as a form, with its logo. It shows the team as the server has it, apart from the fields you've
// changed: Save sends only those, then shows what was saved, and a colleague's change to another field shows too.
function TeamDetailsForm({ team }: { team: Team }) {
  const [updateTeam, saving] = useUpdateTeamMutation();
  const [setLogo, uploading] = useSetLogoMutation();
  const [removeLogo, removing] = useRemoveLogoMutation();
  const [edits, setEdits] = useState<Partial<Record<DetailField, string>>>({});
  const shown = (field: DetailField) => edits[field] ?? team[field] ?? '';
  const change = (field: DetailField) => (value: string) => setEdits((current) => ({ ...current, [field]: value }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = UpdateTeamRequestSchema.safeParse(edits);
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    setProblem(null);
    setSaved(false);
    if (!checked.success) return;
    const result = await updateTeam({ id: team.id, changes: checked.data });
    if (result.error) {
      setProblem(problemWith(result.error, GONE));
      return;
    }
    setEdits({});
    setSaved(true);
  };
  const logoProblem = (result: { error?: unknown }) => {
    if (result.error) setProblem(problemWith(result.error, GONE));
  };

  return (
    <Group align="start" gap="xl">
      <ImagePicker
        label="Logo"
        imageUrl={team.logoUrl}
        alt={`${team.name} logo`}
        busy={uploading.isLoading || removing.isLoading}
        onPick={(image) => void setLogo({ id: team.id, image }).then(logoProblem)}
        onRemove={() => void removeLogo({ id: team.id }).then(logoProblem)}
      />
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack gap="sm">
          <TextInput
            label="Name"
            value={shown('name')}
            onChange={(e) => change('name')(e.currentTarget.value)}
            error={errors.name}
            w={320}
          />
          <TextInput
            label="League"
            value={shown('leagueName')}
            onChange={(e) => change('leagueName')(e.currentTarget.value)}
            error={errors.leagueName}
            w={320}
          />
          <TextInput
            label="Short name"
            description="Up to 8 characters, such as RCR"
            value={shown('shortName')}
            onChange={(e) => change('shortName')(e.currentTarget.value)}
            error={errors.shortName}
            w={160}
          />
          <Group>
            <ColorInput
              label="Primary color"
              value={shown('primaryColor')}
              onChange={change('primaryColor')}
              error={errors.primaryColor}
              w={160}
            />
            <ColorInput
              label="Secondary color"
              value={shown('secondaryColor')}
              onChange={change('secondaryColor')}
              error={errors.secondaryColor}
              w={160}
            />
          </Group>
          {problem && <Alert color="red">{problem}</Alert>}
          <Group>
            <Button type="submit" loading={saving.isLoading}>
              Save details
            </Button>
            {saved && (
              <Text component="output" size="sm">
                Saved.
              </Text>
            )}
          </Group>
        </Stack>
      </form>
    </Group>
  );
}

// Deletes the team, after saying what goes with it.
function DeleteTeam({ team }: { team: Team }) {
  const [deleteTeam, { isLoading }] = useDeleteTeamMutation();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const navigate = useNavigate();
  const count = team.members.length;
  const members = count === 1 ? '1 member' : `${count} members`;

  const confirm = async () => {
    const result = await deleteTeam(team.id);
    setConfirming(false);
    if (result.error) setProblem(problemWith(result.error, GONE));
    else void navigate('/teams');
  };

  return (
    <Stack gap="xs" align="start">
      <Button color="red" variant="light" onClick={() => setConfirming(true)}>
        Delete team
      </Button>
      {problem && <Alert color="red">{problem}</Alert>}
      <Modal opened={confirming} onClose={() => setConfirming(false)} title={`Delete ${team.name}?`}>
        <Stack>
          <Text>Deletes the team, its {members}, its logo and photos. This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button color="red" loading={isLoading} onClick={() => void confirm()}>
              Delete team
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
