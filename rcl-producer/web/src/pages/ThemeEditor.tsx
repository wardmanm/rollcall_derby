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
import { useUpdateThemeMutation } from '../api.ts';
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

// The first extra color name not already used: color-1, color-2 and so on.
function newExtraName(extras: ThemeTokens['extras']): string {
  let n = 1;
  while (extras.some((extra) => extra.name === `color-${n}`)) n += 1;
  return `color-${n}`;
}

// Editing a theme (docs/features/theme-builder.md): the form on the left, and on the right a live preview of every
// change. Changes stay here until Save, which checks them against the contract first; Discard goes back to the saved
// theme. The server checks again, and only holders of producer:themes.manage get this far.
export function ThemeEditor({ theme, families }: { theme: Theme; families: readonly FontFamily[] | undefined }) {
  const [updateTheme, { isLoading, error }] = useUpdateThemeMutation();
  const [name, setName] = useState(theme.name);
  const [tokens, setTokens] = useState<ThemeTokens>(theme.tokens);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const css = useMemo(() => themeToCss(tokens, families ?? []), [tokens, families]);

  // Changes a copy of the tokens, so the preview and form follow at once.
  const change = (edit: (draft: ThemeTokens) => void) =>
    setTokens((current) => {
      const draft = structuredClone(current);
      edit(draft);
      return draft;
    });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const checked = UpdateThemeRequestSchema.safeParse({ name, tokens });
    setErrors(checked.success ? {} : pathErrors(checked.error));
    if (!checked.success) return;
    const result = await updateTheme({ id: theme.id, changes: checked.data });
    if (!result.data) return;
    setName(result.data.name);
    setTokens(result.data.tokens);
  };

  const discard = () => {
    setName(theme.name);
    setTokens(theme.tokens);
    setErrors({});
  };

  // The library's families, plus the theme's own when it's missing from the library (once the library has loaded).
  const familyField = (role: 'heading' | 'body', label: string) => {
    const current = tokens.fonts[role].family;
    const missing = families !== undefined && !families.some((family) => sameFamily(family.name, current));
    const options = (families ?? []).map((family) => ({ value: family.name, label: family.name }));
    if (missing || families === undefined)
      options.unshift({ value: current, label: missing ? `${current} (missing)` : current });
    return (
      <NativeSelect
        label={label}
        data={options}
        value={current}
        description={missing ? MISSING_FONT : undefined}
        error={errors[`tokens.fonts.${role}.family`]}
        onChange={(event) => {
          const family = event.currentTarget.value;
          change((draft) => void (draft.fonts[role].family = family));
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
        change((draft) => void (draft.fonts[role].weight = weight));
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
            value={name}
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
                onChange={(color) => change((draft) => void (draft.colors[key] = color))}
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
              onChange={(value) => change((draft) => void (draft.fonts.size = numberOf(value)))}
            />
            <NativeSelect
              label="Heading case"
              data={HEADING_CASES}
              value={tokens.fonts.headingCase}
              onChange={(event) => {
                const headingCase = event.currentTarget.value === 'uppercase' ? 'uppercase' : 'none';
                change((draft) => void (draft.fonts.headingCase = headingCase));
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
              onChange={(value) => change((draft) => void (draft.shape.radius = numberOf(value)))}
            />
            <NumberInput
              label="Border width"
              suffix=" px"
              allowDecimal={false}
              value={Number.isNaN(tokens.shape.borderWidth) ? '' : tokens.shape.borderWidth}
              error={errors['tokens.shape.borderWidth']}
              onChange={(value) => change((draft) => void (draft.shape.borderWidth = numberOf(value)))}
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
                  change((draft) => void (draft.extras[index]!.name = extraName));
                }}
              />
              <ColorInput
                label={`Extra color ${index + 1}`}
                format="hexa"
                value={extra.color}
                error={errors[`tokens.extras.${index}.color`]}
                onChange={(color) => change((draft) => void (draft.extras[index]!.color = color))}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                mt={28}
                aria-label={`Remove extra color ${index + 1}`}
                onClick={() => change((draft) => void draft.extras.splice(index, 1))}
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
                change((draft) => void draft.extras.push({ name: newExtraName(draft.extras), color: '#ffffff' }))
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
