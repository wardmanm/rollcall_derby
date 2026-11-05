import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  Alert,
  Anchor,
  Button,
  Code,
  Group,
  Loader,
  NativeSelect,
  NumberInput,
  Radio,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  DEFAULT_TOKENS,
  ROSTER_ENTRANCES,
  ROSTER_SPOTS,
  themeToCss,
  UpdateIntroRequestSchema,
  type Intro,
  type IntroPlacement,
  type RosterOptions,
  type RosterSpot,
  type UpdateIntroRequest,
} from '@rollcall/producer-contract';
import { pathErrors, problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import {
  useGetFontsQuery,
  useGetIntroQuery,
  useGetTeamQuery,
  useGetTeamsQuery,
  useGetThemesQuery,
  useUpdateIntroMutation,
} from '../api.ts';
import { PRODUCER_BASE } from '../base.ts';
import { IntroPreview } from './IntroPreview.tsx';

const ENTRANCE_NAMES: Record<(typeof ROSTER_ENTRANCES)[number], string> = {
  pop: 'Pop',
  'slide-up': 'Slide up',
  fade: 'Fade',
  wipe: 'Wipe',
};
const SPOT_NAMES: Record<RosterSpot, string> = {
  'top-left': 'Top left',
  'top-center': 'Top center',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  'middle-center': 'Middle center',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom center',
  'bottom-right': 'Bottom right',
};
const AT_ONCE = [
  ...Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  { value: 'team', label: 'Whole team' },
];
const ADVANCE = [
  { value: 'next', label: 'When I press Next' },
  { value: 'timer', label: 'On a timer' },
];
const DEFAULT_SECONDS = 5;
const DELETED_TEAM = 'This team was deleted. Pick another.';
const DELETED_THEME = 'This theme was deleted. Pick another.';

// A number field's value: a cleared field is NaN, which the contract refuses in plain words.
const numberOf = (value: string | number) => (typeof value === 'number' ? value : Number.NaN);
const isEntrance = (value: string): value is RosterOptions['entrance'] =>
  ROSTER_ENTRANCES.some((entrance) => entrance === value);
const isSpot = (value: string): value is RosterSpot => ROSTER_SPOTS.some((spot) => spot === value);

// One intro's setup (docs/features/skater-intros.md). Only producer:intros.manage gets this far; the server checks
// every change anyway (hard rule 5).
export function IntroSetupPage() {
  const { id = '' } = useParams();
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('producer:intros.manage')) {
    return <Alert color="gray">Your account can't set up intros.</Alert>;
  }
  return <IntroSetup id={id} canReadThemes={me.permissions.includes('producer:themes.read')} />;
}

function IntroSetup({ id, canReadThemes }: { id: string; canReadThemes: boolean }) {
  const intro = useGetIntroQuery(id);
  if (intro.isError) {
    return (
      <Stack maw={980} align="start">
        <Alert color="red">
          {problemWith(intro.error, { not_found: 'That intro doesn’t exist. It may have been deleted.' })}
        </Alert>
        <Anchor component={Link} to="/intros">
          Back to intros
        </Anchor>
      </Stack>
    );
  }
  if (!intro.data) return <Loader />;
  return <IntroForm key={intro.data.id} intro={intro.data} canReadThemes={canReadThemes} />;
}

// Your changes, by field. A changed field replaces the saved one whole (the placement and options are each one field).
interface Edits {
  name?: string;
  teamAId?: string | null;
  teamBId?: string | null;
  themeId?: string | null;
  placement?: IntroPlacement;
  options?: RosterOptions;
}

const isEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const orNull = (value: string) => (value === '' ? null : value);

function IntroForm({ intro, canReadThemes }: { intro: Intro; canReadThemes: boolean }) {
  const [updateIntro, { isLoading, error }] = useUpdateIntroMutation();
  const [edits, setEdits] = useState<Edits>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The reply to your last save, until the intro is fetched again and catches up with it.
  const [lastSaved, setLastSaved] = useState<Intro | undefined>(undefined);
  const saved = lastSaved && lastSaved.updatedAt > intro.updatedAt ? lastSaved : intro;

  const teams = useGetTeamsQuery();
  const themes = useGetThemesQuery(undefined, { skip: !canReadThemes });
  const fonts = useGetFontsQuery(undefined, { skip: !canReadThemes });

  const current = {
    name: edits.name ?? saved.name,
    teamAId: edits.teamAId === undefined ? saved.teamAId : edits.teamAId,
    teamBId: edits.teamBId === undefined ? saved.teamBId : edits.teamBId,
    themeId: edits.themeId === undefined ? saved.themeId : edits.themeId,
    placement: edits.placement ?? saved.placement,
    options: edits.options ?? saved.options,
  };
  const change = (fields: Edits) => setEdits((previous) => ({ ...previous, ...fields }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const checked = UpdateIntroRequestSchema.safeParse(current);
    setErrors(checked.success ? {} : pathErrors(checked.error));
    if (!checked.success) return;
    // Only what you changed is sent, so a colleague's change to anything else is kept.
    const changes: UpdateIntroRequest = {};
    if (checked.data.name !== saved.name) changes.name = checked.data.name;
    if (checked.data.teamAId !== saved.teamAId) changes.teamAId = checked.data.teamAId;
    if (checked.data.teamBId !== saved.teamBId) changes.teamBId = checked.data.teamBId;
    if (checked.data.themeId !== saved.themeId) changes.themeId = checked.data.themeId;
    if (!isEqual(checked.data.placement, saved.placement)) changes.placement = checked.data.placement;
    if (!isEqual(checked.data.options, saved.options)) changes.options = checked.data.options;
    if (Object.keys(changes).length > 0) {
      const result = await updateIntro({ id: intro.id, changes });
      if (!result.data) return;
      setLastSaved(result.data);
    }
    setEdits({});
  };

  const discard = () => {
    setEdits({});
    setErrors({});
  };

  const teamField = (label: string, field: 'teamAId' | 'teamBId') => {
    const value = current[field];
    const deleted = value !== null && teams.data !== undefined && !teams.data.some((team) => team.id === value);
    const options = [
      { value: '', label: 'No team' },
      ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ];
    if (value !== null && teams.data === undefined) {
      options.push({ value, label: teams.isError ? 'Teams unavailable' : '…' });
    }
    if (deleted) options.push({ value, label: 'Deleted team' });
    return (
      <NativeSelect
        label={label}
        data={options}
        value={value ?? ''}
        error={errors[field] ?? (deleted ? DELETED_TEAM : undefined)}
        onChange={(event) => change({ [field]: orNull(event.currentTarget.value) })}
      />
    );
  };

  // The theme stays as saved until you pick another. One the list can't show is named by why.
  const unlistedTheme = (value: string | null) => {
    if (value === null || themes.data?.some((t) => t.id === value)) return undefined;
    if (!canReadThemes) return 'Saved theme';
    if (themes.data) return 'Deleted theme';
    return themes.isError ? 'Themes unavailable' : '…';
  };
  const themeField = () => {
    const value = current.themeId;
    const unlisted = unlistedTheme(value);
    const choices = [
      { value: '', label: 'Default theme' },
      ...(themes.data ?? [])
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ value: t.id, label: t.name })),
    ];
    if (value !== null && unlisted) choices.push({ value, label: unlisted });
    return (
      <NativeSelect
        label="Theme"
        data={choices}
        value={value ?? ''}
        onChange={(event) => change({ themeId: orNull(event.currentTarget.value) })}
        error={errors.themeId ?? (unlisted === 'Deleted theme' ? DELETED_THEME : undefined)}
      />
    );
  };

  const { options, placement } = current;
  const setOptions = (fields: Partial<RosterOptions>) => change({ options: { ...options, ...fields } });
  const setAdvance = (mode: string) =>
    setOptions({
      advance:
        mode === 'timer'
          ? {
              mode: 'timer',
              seconds: edits.options?.advance.mode === 'timer' ? edits.options.advance.seconds : DEFAULT_SECONDS,
            }
          : { mode: 'next' },
    });

  // The preview shows team A on the chosen theme, or the default theme, or the built-in look.
  const teamA = useGetTeamQuery(current.teamAId ?? '', { skip: current.teamAId === null });
  const theme = themes.data?.find((t) => t.id === current.themeId) ?? themes.data?.find((t) => t.isDefault);
  const css = useMemo(() => themeToCss(theme?.tokens ?? DEFAULT_TOKENS, fonts.data ?? []), [theme, fonts.data]);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{saved.name}</Title>
        <Anchor component={Link} to="/intros">
          Back to intros
        </Anchor>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <form onSubmit={(event) => void save(event)} noValidate>
          <Stack>
            <TextInput
              label="Name"
              value={current.name}
              onChange={(event) => change({ name: event.currentTarget.value })}
              error={errors.name}
            />
            <SimpleGrid cols={2}>
              {teamField('Team A', 'teamAId')}
              {teamField('Team B', 'teamBId')}
            </SimpleGrid>
            {themeField()}

            <Title order={3}>Steps</Title>
            <NativeSelect
              label="How many at once"
              data={AT_ONCE}
              value={String(options.atOnce)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setOptions({ atOnce: value === 'team' ? 'team' : Number(value) });
              }}
              error={errors['options.atOnce']}
            />
            <SimpleGrid cols={2}>
              <NativeSelect
                label="Moves on"
                data={ADVANCE}
                value={options.advance.mode}
                onChange={(event) => setAdvance(event.currentTarget.value)}
              />
              {options.advance.mode === 'timer' && (
                <NumberInput
                  label="Seconds per step"
                  min={2}
                  max={60}
                  allowDecimal={false}
                  value={Number.isNaN(options.advance.seconds) ? '' : options.advance.seconds}
                  onChange={(value) => setOptions({ advance: { mode: 'timer', seconds: numberOf(value) } })}
                  error={errors['options.advance.seconds']}
                />
              )}
            </SimpleGrid>
            <NativeSelect
              label="Entrance"
              data={ROSTER_ENTRANCES.map((value) => ({ value, label: ENTRANCE_NAMES[value] }))}
              value={options.entrance}
              onChange={(event) => {
                const entrance = event.currentTarget.value;
                if (isEntrance(entrance)) setOptions({ entrance });
              }}
            />
            <Switch
              label="Show pronouns"
              checked={options.showPronouns}
              onChange={(event) => setOptions({ showPronouns: event.currentTarget.checked })}
            />

            <Title order={3}>Where it sits</Title>
            <Radio.Group
              label="Position"
              value={placement.spot}
              onChange={(spot) => isSpot(spot) && change({ placement: { ...placement, spot } })}
            >
              <SimpleGrid cols={3} mt="xs" maw={360}>
                {ROSTER_SPOTS.map((spot) => (
                  <Radio key={spot} value={spot} label={SPOT_NAMES[spot]} />
                ))}
              </SimpleGrid>
            </Radio.Group>
            <NumberInput
              label="Distance from the edge (px)"
              min={0}
              max={200}
              allowDecimal={false}
              value={Number.isNaN(placement.edge) ? '' : placement.edge}
              onChange={(value) => change({ placement: { ...placement, edge: numberOf(value) } })}
              error={errors['placement.edge']}
            />

            {error && <Alert color="red">{problemWith(error)}</Alert>}
            <Group>
              <Button type="submit" loading={isLoading}>
                Save
              </Button>
              <Button variant="default" onClick={discard}>
                Discard changes
              </Button>
            </Group>
          </Stack>
        </form>
        <Stack gap="xl">
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Preview
            </Text>
            <IntroPreview team={teamA.data} options={options} placement={placement} theme={css} />
          </Stack>
          <ObsAddress id={intro.id} />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

// The intro's OBS browser source: its address, which the server serves publicly, to copy.
function ObsAddress({ id }: { id: string }) {
  const address = `${location.origin}${PRODUCER_BASE}overlay/intros/${encodeURIComponent(id)}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Stack gap="xs">
      <Title order={3}>OBS browser source</Title>
      <Group wrap="nowrap">
        <Code>{address}</Code>
        <Button variant="default" size="compact-sm" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Group>
      <Text size="sm">Add it to OBS as a browser source sized 1920×1080.</Text>
    </Stack>
  );
}
