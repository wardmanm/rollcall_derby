import { ThemeItemSchema, type ThemeItem, type ThemeTokens } from '@rollcall/producer-contract';
import type { TransferKind } from '@rollcall/app-sdk';
import type { TransferFact } from '@rollcall/core-contract';
import type { z } from 'zod';
import {
  createTheme,
  findTheme,
  freeCopyName,
  listThemes,
  setDefaultTheme,
  updateTheme,
  type ProducerDatabase,
} from './themes.ts';

// Themes in Rollcall export files (docs/features/import-export.md, ADR-0024). A theme brings the uploaded faces of the
// font families it uses; core's font kind sends and saves those.

type ThemeData = z.output<typeof ThemeItemSchema>;

const factsOf = (tokens: ThemeTokens): TransferFact[] => [
  { label: 'Surface', value: tokens.colors.surface },
  { label: 'Accent', value: tokens.colors.accent },
  { label: 'Fonts', value: `${tokens.fonts.heading.family} / ${tokens.fonts.body.family}` },
];

// The font families a theme's heading and body use, each once, as needs of core's font kind.
const fontNeeds = (tokens: ThemeTokens) =>
  [...new Set([tokens.fonts.heading.family, tokens.fonts.body.family])].map((key) => ({
    kind: 'core:font-face' as const,
    key,
  }));

/**
 * The `producer:theme` kind: holders of producer:themes.read export themes, and of producer:themes.manage import them.
 * `announce` tells the OBS overlay about the default theme, after an import that changed it.
 */
export function themeKind({ db, announce }: { db: ProducerDatabase; announce: () => void }): TransferKind<ThemeData> {
  let defaultChanged = false;
  return {
    name: 'producer:theme',
    label: { one: 'Theme', many: 'themes' },
    version: 1,
    exportPermission: 'producer:themes.read',
    importPermission: 'producer:themes.manage',
    canBeDefault: true,

    list: () => listThemes(db).map(({ id, name }) => ({ id, name })),

    exportItem(id) {
      const theme = findTheme(db, id);
      if (!theme) return undefined;
      const data: ThemeItem = { name: theme.name, tokens: theme.tokens, default: theme.isDefault };
      return { name: theme.name, data, needs: fontNeeds(theme.tokens) };
    },

    check(data) {
      const checked = ThemeItemSchema.safeParse(data);
      return checked.success
        ? { ok: true, data: checked.data }
        : { ok: false, message: checked.error.issues[0]?.message ?? 'Not a theme' };
    },

    nameOf: (data) => data.name,
    facts: (data) => factsOf(data.tokens),
    media: () => [],
    needs: (data) => fontNeeds(data.tokens),
    wasDefault: (data) => data.default,

    // Theme names are unique as written, so at most one theme here conflicts.
    match(data) {
      const here = listThemes(db).find((theme) => theme.name === data.name);
      if (!here) return { status: 'new' };
      const facts = [...factsOf(here.tokens), { label: 'Default', value: here.isDefault ? 'yes' : 'no' }];
      return { status: 'conflict', targets: [{ id: here.id, name: here.name, facts, updatedAt: here.updatedAt }] };
    },

    // Replacing keeps the theme's name and whether it's the default. Only the theme chosen becomes the default.
    save(data, how, _mediaId, { makeDefault }) {
      let id: string;
      let name: string;
      if (how.as === 'replace') {
        const theme = updateTheme(db, how.id, { tokens: data.tokens });
        if (!theme) throw new Error(`Theme ${how.id} to replace is gone`);
        ({ id, name } = theme);
        if (theme.isDefault) defaultChanged = true;
      } else {
        const theme = createTheme(db, {
          name: how.as === 'copy' ? freeCopyName(db, data.name) : data.name,
          tokens: data.tokens,
        });
        ({ id, name } = theme);
      }
      if (makeDefault) {
        setDefaultTheme(db, id);
        defaultChanged = true;
      }
      return { name };
    },

    afterImport() {
      if (!defaultChanged) return;
      defaultChanged = false;
      announce();
    },
  };
}
