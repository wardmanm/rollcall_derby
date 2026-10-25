import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, Anchor, Badge, Group, Loader, Stack, Title } from '@mantine/core';
import { themeToCss, type Theme } from '@rollcall/producer-contract';
import { problemWith, useGetMeQuery } from '@rollcall/web-sdk';
import { useGetFontsQuery, useGetThemeQuery } from '../api.ts';
import { ThemeEditor } from './ThemeEditor.tsx';
import { ThemePreview } from './ThemePreview.tsx';

// One theme (docs/features/theme-builder.md). With producer:themes.manage it's the editor; with only
// producer:themes.read it's a read-only preview. The server checks every change anyway (hard rule 5).
export function ThemePage() {
  const { id = '' } = useParams();
  const { data: me } = useGetMeQuery();
  if (!me?.permissions.includes('producer:themes.read')) {
    return <Alert color="gray">Your account can't view themes.</Alert>;
  }
  return <ThemeView id={id} canManage={me.permissions.includes('producer:themes.manage')} />;
}

function ThemeView({ id, canManage }: { id: string; canManage: boolean }) {
  const theme = useGetThemeQuery(id);
  const fonts = useGetFontsQuery();
  if (theme.isError) {
    return (
      <Stack maw={980} align="start">
        <Alert color="red">
          {problemWith(theme.error, { not_found: 'That theme doesn’t exist. It may have been deleted.' })}
        </Alert>
        <Anchor component={Link} to="/themes">
          Back to themes
        </Anchor>
      </Stack>
    );
  }
  if (!theme.data) return <Loader />;
  return (
    <Stack>
      <Group gap="xs">
        <Title order={2}>{theme.data.name}</Title>
        {theme.data.isDefault && <Badge variant="light">Default</Badge>}
      </Group>
      {canManage ? (
        <ThemeEditor key={theme.data.id} theme={theme.data} families={fonts.data} />
      ) : (
        <ReadOnlyPreview theme={theme.data} families={fonts.data} />
      )}
    </Stack>
  );
}

function ReadOnlyPreview({
  theme,
  families,
}: {
  theme: Theme;
  families: Parameters<typeof themeToCss>[1] | undefined;
}) {
  const css = useMemo(() => themeToCss(theme.tokens, families ?? []), [theme.tokens, families]);
  return <ThemePreview css={css} extras={theme.tokens.extras.map((extra) => extra.name)} />;
}
