import { useState, type FormEvent } from 'react';
import { Alert, Button, Checkbox, Group, Modal, Stack, TagsInput, Text, TextInput } from '@mantine/core';
import {
  BENCH_ROLES,
  CreateMemberRequestSchema,
  MEMBER_ROLE_NAMES,
  SKATER_ROLES,
  type MemberKind,
  type MemberRole,
  type Team,
  type TeamMember,
} from '@rollcall/core-contract';
import { useAddMemberMutation, useRemovePhotoMutation, useSetPhotoMutation, useUpdateMemberMutation } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
import { ImagePicker } from './ImagePicker.tsx';

export interface MemberFormProps {
  team: Team;
  kind: MemberKind;
  /** The member being edited, or null to add one. */
  member: TeamMember | null;
  onClose: () => void;
}

/** What to say when a change finds the team or member gone: someone else deleted it meanwhile. */
export const GONE = { not_found: 'This team or member no longer exists. Someone else may have deleted it.' };

const ROLES: Record<MemberKind, readonly MemberRole[]> = { skater: SKATER_ROLES, bench: BENCH_ROLES };
const isRole = (value: string): value is MemberRole => Object.hasOwn(MEMBER_ROLE_NAMES, value);

// Adds or edits one skater or member of bench staff, in a dialog. Adding has "Save and add another", so a whole roster
// can be typed in without leaving the form. A new member's photo is uploaded once the member exists; an existing
// member's photo is uploaded as soon as it's picked.
export function MemberForm({ team, kind, member, onClose }: MemberFormProps) {
  const [addMember, adding] = useAddMemberMutation();
  const [updateMember, updating] = useUpdateMemberMutation();
  const [setPhoto, uploading] = useSetPhotoMutation();
  const [removePhoto, removing] = useRemovePhotoMutation();
  const [name, setName] = useState(member?.name ?? '');
  const [number, setNumber] = useState(member?.number ?? '');
  const [pronouns, setPronouns] = useState(member?.pronouns ?? '');
  const [roles, setRoles] = useState<string[]>(member ? [...member.roles] : []);
  const [customRoles, setCustomRoles] = useState<string[]>(member ? [...member.customRoles] : []);
  const [photo, setPendingPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  // The member as the server has it now, so a new photo shows at once.
  const current = member && (team.members.find((m) => m.id === member.id) ?? member);

  const clear = () => {
    setName('');
    setNumber('');
    setPronouns('');
    setRoles([]);
    setCustomRoles([]);
    setPendingPhoto(null);
  };

  const save = async (another: boolean) => {
    const checked = CreateMemberRequestSchema.safeParse({
      kind,
      name,
      number: kind === 'skater' ? number : null,
      pronouns,
      roles: roles.filter(isRole),
      customRoles,
    });
    setErrors(checked.success ? {} : fieldErrors(checked.error));
    setProblem(null);
    if (!checked.success) return;
    if (member) {
      const result = await updateMember({ id: team.id, memberId: member.id, changes: checked.data });
      if (result.error) setProblem(problemWith(result.error, GONE));
      else onClose();
      return;
    }
    const before = new Set(team.members.map((m) => m.id));
    const result = await addMember({ id: team.id, member: checked.data });
    if (result.error) {
      setProblem(problemWith(result.error, GONE));
      return;
    }
    // The member just saved: new to this page, and as typed. Someone else may have added members meanwhile, and the
    // reply lists them too.
    const { kind: savedKind, name: savedName, number: savedNumber } = checked.data;
    const added = result.data.members.find(
      (m) => !before.has(m.id) && m.kind === savedKind && m.name === savedName && m.number === savedNumber,
    );
    if (photo && added) {
      const uploaded = await setPhoto({ id: team.id, memberId: added.id, image: photo });
      if (uploaded.error) {
        setProblem(`${checked.data.name} was added, but the photo wasn't: ${problemWith(uploaded.error, GONE)}`);
        return;
      }
    }
    if (another) clear();
    else onClose();
  };

  // An existing member's photo changes at once, without waiting for Save.
  const changePhoto = async (change: Promise<{ error?: unknown }>) => {
    const result = await change;
    if (result.error) setProblem(problemWith(result.error, GONE));
  };

  const submit = (event: FormEvent, another = false) => {
    event.preventDefault();
    void save(another);
  };

  const title = member ? `Edit ${member.name}` : kind === 'skater' ? 'Add skater' : 'Add bench staff';
  return (
    <Modal opened onClose={onClose} title={title}>
      <form onSubmit={(event) => submit(event)} noValidate>
        <Stack gap="sm">
          <TextInput
            label="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.name}
            data-autofocus
          />
          {kind === 'skater' && (
            <TextInput
              label="Number"
              description="1–4 letters or digits, such as 00 or 12A"
              value={number}
              onChange={(event) => setNumber(event.currentTarget.value)}
              error={errors.number}
              w={160}
            />
          )}
          <TextInput
            label="Pronouns"
            placeholder="she/her"
            value={pronouns}
            onChange={(event) => setPronouns(event.currentTarget.value)}
            error={errors.pronouns}
            w={240}
          />
          <Checkbox.Group label="Roles" value={roles} onChange={setRoles} error={errors.roles}>
            <Group mt="xs">
              {ROLES[kind].map((role) => (
                <Checkbox key={role} value={role} label={MEMBER_ROLE_NAMES[role]} />
              ))}
            </Group>
          </Checkbox.Group>
          <TagsInput
            label="Custom roles"
            description="Up to 3, such as Lineup manager. Press Enter after each."
            value={customRoles}
            onChange={setCustomRoles}
            maxTags={3}
            error={errors.customRoles}
          />
          {current ? (
            <ImagePicker
              label="Photo"
              imageUrl={current.photoUrl}
              alt={`Photo of ${current.name}`}
              busy={uploading.isLoading || removing.isLoading}
              onPick={(image) => void changePhoto(setPhoto({ id: team.id, memberId: current.id, image }))}
              onRemove={() => void changePhoto(removePhoto({ id: team.id, memberId: current.id }))}
            />
          ) : (
            <Stack gap={4}>
              <ImagePicker label="Photo" imageUrl={null} alt="" onPick={setPendingPhoto} />
              {photo && <Text size="sm">{photo.name} will be uploaded when you save.</Text>}
            </Stack>
          )}
          {problem && <Alert color="red">{problem}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            {!member && (
              <Button variant="default" onClick={(event) => submit(event, true)} loading={adding.isLoading}>
                Save and add another
              </Button>
            )}
            <Button type="submit" loading={adding.isLoading || updating.isLoading}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
