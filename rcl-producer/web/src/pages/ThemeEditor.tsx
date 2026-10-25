import { useMemo, useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  ColorInput,
  Group,
  NativeSelect,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { FontFamily } from '@rollcall/core-contract';
import {
  MAX_EXTRA_COLORS,
  themeToCss,
  UpdateThemeRequestSchema,
  type Theme,
  type ThemeTokens,
} from '@rollcall/producer-contract';
import { pathErrors, problemWith } from '@rollcall/web-sdk';
import { useLazyGetThemeQuery, useUpdateThemeMutation } from '../api.ts';
import { ThemePreview } from './ThemePreview.tsx';

type Colors = ThemeTokens['colors'];
const COLORS: readonly { key: keyof Colors; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
  { key: 'surface', label: 'Surface' },
  { key: 'surfaceAlt', label: 'Alternate surface' },
  { key: 'accent', label: 'Accent' },
  { key: 'onAccent', label: 'Text on accent' },
  { key: 'border', label: 'Border' },
];
const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
const HEADING_CASES = [
  { value: 'none', label: 'As typed' },
  { value: 'uppercase', label: 'Capitals' },
];
const MISSING_FONT = 'This font isn’t in the font library, so the overlay uses a system font.';

// A number field's value as a token: a cleared field is NaN, which the contract refuses in plain words.
const numberOf = (value: string | number) => (typeof value === 'number' ? value : Number.NaN);
const sameFamily = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Your changes, by token: each one a change to make to the theme as it is now. Changing a token again replaces its
// earlier change, and the extra colors count as one token.
type Edits = Readonly<Record<string, (draft: ThemeTokens) => void>>;

// `tokens` with `edits` made to a copy of them.
function withEdits(tokens: ThemeTokens, edits: Edits): ThemeTokens {
  const draft = structuredClone(tokens);
  for (const edit of Object.values(edits)) edit(draft);
  return draft;
}

// The first extra color name not already used: color-1, color-2 and so on.
function newExtraName(extras: ThemeTokens['extras']): string {
  let n = 1;
  while (extras.some((extra) => extra.name === `color-${n}`)) n += 1;
  return `color-${n}`;
}

// Editing a theme (docs/features/theme-builder.md): the form on the left, and on the right a live preview of every
// change. Changes stay here until Save, which checks them against the contract first; Discard goes back to the saved
// theme. The form shows your changes on the theme as the server last sent it, and Save puts them on the theme as it is
// then, so a colleague's change to anything you didn't touch is kept. The server checks again, and only holders of
// producer:themes.manage get this far.
export function ThemeEditor({ theme, families }: { theme: Theme; families: readonly FontFamily[] | undefined }) {
  const [updateTheme, { isLoading, error }] = useUpdateThemeMutation();
  const [loadTheme] = useLazyGetThemeQuery();
  const [name, setName] = useState<string | undefined>(undefined);
  const [edits, setEdits] = useState<Edits>({});
  // The reply to your last save, until the theme is fetched again and catches up with it.
  const [lastSaved, setLastSaved] = useState<Theme | undefined>(undefined);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saved = lastSaved && lastSaved.updatedAt > theme.updatedAt ? lastSaved : theme;
  const tokens = useMemo(() => withEdits(saved.tokens, edits), [saved.tokens, edits]);
  const css = useMemo(() => themeToCss(tokens, families ?? []), [tokens, families]);

  // Records your change to one token, so the preview and form follow at once.
  const change = (token: string, edit: (draft: ThemeTokens) => void) =>
    setEdits((current) => ({ ...current, [token]: edit }));
  // The extra colors are one token: a change to them sets the whole list.
  const changeExtras = (edit: (extras: ThemeTokens['extras']) => void) => {
    const extras = structuredClone(tokens.extras);
    edit(extras);
    change('extras', (draft) => void (draft.extras = extras));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const checked = UpdateThemeRequestSchema.safeParse({ name: name ?? saved.name, tokens });
    setErrors(checked.success ? {} : pathErrors(checked.error));
    if (!checked.success) return;
    // Your changes go on the theme as it is now, so a colleague's save in the meantime isn't undone.
    const latest = await loadTheme(theme.id);
    const changes = UpdateThemeRequestSchema.safeParse({
      ...(name === undefined ? {} : { name }),
      tokens: withEdits((latest.data ?? saved).tokens, edits),
    });
    if (!changes.success) {
      setErrors(pathErrors(changes.error));
      return;
    }
    const result = await updateTheme({ id: theme.id, changes: changes.data });
    if (!result.data) return;
    setLastSaved(result.data);
    setEdits({});
    setName(undefined);
  };

  const discard = () => {
    setName(undefined);
    setEdits({});
    setErrors({});
  };

  // The library's families, plus the theme's own when it's missing from the library (once the library has loaded). A
  // family in the library shows with the library's spelling, since names match regardless of case.
  const familyField = (role: 'heading' | 'body', label: string) => {
    const current = tokens.fonts[role].family;
    const inLibrary = families?.find((family) => sameFamily(family.name, current));
    const missing = families !== undefined && !inLibrary;
    const options = (families ?? []).map((family) => ({ value: family.name, label: family.name }));
    if (missing || families === undefined)
      options.unshift({ value: current, label: missing ? `${current} (missing)` : current });
    return (
      <NativeSelect
        label={label}
        data={options}
        value={inLibrary?.name ?? current}
        description={missing ? MISSING_FONT : undefined}
        error={errors[`tokens.fonts.${role}.family`]}
        onChange={(event) => {
          const family = event.currentTarget.value;
          change(`fonts.${role}.family`, (draft) => void (draft.fonts[role].family = family));
        }}
      />
    );
  };

  const weightField = (role: 'heading' | 'body', label: string) => (
    <NativeSelect
      label={label}
      data={WEIGHTS}
      value={String(tokens.fonts[role].weight)}
      error={errors[`tokens.fonts.${role}.weight`]}
      onChange={(event) => {
        const weight = Number(event.currentTarget.value);
        change(`fonts.${role}.weight`, (draft) => void (draft.fonts[role].weight = weight));
      }}
    />
  );

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
      <form onSubmit={(event) => void save(event)} noValidate>
        <Stack>
          {theme.isDefault && (
            <Alert color="blue">This is the default theme: saving changes the OBS overlay at once.</Alert>
          )}
          <TextInput
            label="Name"
            value={name ?? saved.name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={errors.name}
          />

          <Title order={3}>Colors</Title>
          <SimpleGrid cols={2}>
            {COLORS.map(({ key, label }) => (
              <ColorInput
                key={key}
                label={label}
                format="hexa"
                value={tokens.colors[key]}
                error={errors[`tokens.colors.${key}`]}
                onChange={(color) => change(`colors.${key}`, (draft) => void (draft.colors[key] = color))}
              />
            ))}
          </SimpleGrid>

          <Title order={3}>Fonts</Title>
          <SimpleGrid cols={2}>
            {familyField('heading', 'Heading font')}
            {weightField('heading', 'Heading weight')}
            {familyField('body', 'Body font')}
            {weightField('body', 'Body weight')}
            <NumberInput
              label="Base size"
              suffix=" px"
              allowDecimal={false}
              value={Number.isNaN(tokens.fonts.size) ? '' : tokens.fonts.size}
              error={errors['tokens.fonts.size']}
              onChange={(value) => change('fonts.size', (draft) => void (draft.fonts.size = numberOf(value)))}
            />
            <NativeSelect
              label="Heading case"
              data={HEADING_CASES}
              value={tokens.fonts.headingCase}
              onChange={(event) => {
                const headingCase = event.currentTarget.value === 'uppercase' ? 'uppercase' : 'none';
                change('fonts.headingCase', (draft) => void (draft.fonts.headingCase = headingCase));
              }}
            />
          </SimpleGrid>

          <Title order={3}>Shape</Title>
          <SimpleGrid cols={2}>
            <NumberInput
              label="Corner radius"
              suffix=" px"
              allowDecimal={false}
              value={Number.isNaN(tokens.shape.radius) ? '' : tokens.shape.radius}
              error={errors['tokens.shape.radius']}
              onChange={(value) => change('shape.radius', (draft) => void (draft.shape.radius = numberOf(value)))}
            />
            <NumberInput
              label="Border width"
              suffix=" px"
              allowDecimal={false}
              value={Number.isNaN(tokens.shape.borderWidth) ? '' : tokens.shape.borderWidth}
              error={errors['tokens.shape.borderWidth']}
              onChange={(value) =>
                change('shape.borderWidth', (draft) => void (draft.shape.borderWidth = numberOf(value)))
              }
            />
          </SimpleGrid>

          <Title order={3}>Extra colors</Title>
          <Text size="sm">Named colors for later overlay components, as --theme-extra-name.</Text>
          {tokens.extras.map((extra, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a row's name changes as it's typed, so it can't be the key
            <Group key={index} align="start">
              <TextInput
                label={`Extra color ${index + 1} name`}
                value={extra.name}
                error={errors[`tokens.extras.${index}.name`]}
                onChange={(event) => {
                  const extraName = event.currentTarget.value;
                  changeExtras((extras) => void (extras[index]!.name = extraName));
                }}
              />
              <ColorInput
                label={`Extra color ${index + 1}`}
                format="hexa"
                value={extra.color}
                error={errors[`tokens.extras.${index}.color`]}
                onChange={(color) => changeExtras((extras) => void (extras[index]!.color = color))}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                mt={28}
                aria-label={`Remove extra color ${index + 1}`}
                onClick={() => changeExtras((extras) => void extras.splice(index, 1))}
              >
                ✕
              </ActionIcon>
            </Group>
          ))}
          {errors['tokens.extras'] && (
            <Text size="sm" c="red">
              {errors['tokens.extras']}
            </Text>
          )}
          <Group>
            <Button
              variant="default"
              disabled={tokens.extras.length >= MAX_EXTRA_COLORS}
              onClick={() =>
                changeExtras((extras) => void extras.push({ name: newExtraName(extras), color: '#ffffff' }))
              }
            >
              Add color
            </Button>
          </Group>

          {error && <Alert color="red">{problemWith(error)}</Alert>}
          <Group>
            <Button type="submit" loading={isLoading}>
              Save theme
            </Button>
            <Button variant="default" onClick={discard}>
              Discard changes
            </Button>
          </Group>
        </Stack>
      </form>
      <ThemePreview css={css} extras={tokens.extras.map((extra) => extra.name)} />
    </SimpleGrid>
  );
}
