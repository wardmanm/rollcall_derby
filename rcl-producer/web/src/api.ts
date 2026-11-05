import {
  FontFamilySchema,
  TeamSchema,
  TeamSummarySchema,
  type FontFamily,
  type Team,
  type TeamSummary,
} from '@rollcall/core-contract';
import {
  IntroSchema,
  SetDefaultThemeRequestSchema,
  ThemeSchema,
  type CreateIntroRequest,
  type CreateThemeRequest,
  type Intro,
  type SetDefaultThemeRequest,
  type Theme,
  type UpdateIntroRequest,
  type UpdateThemeRequest,
} from '@rollcall/producer-contract';
import { api } from '@rollcall/web-sdk';

const themeUrl = (id: string) => `producer/themes/${encodeURIComponent(id)}`;
// A change to one theme: that theme, and the list that shows it.
const themeChanged = (_theme: unknown, _error: unknown, { id }: { id: string }) => [
  { type: 'Themes' as const, id },
  { type: 'Themes' as const, id: 'LIST' },
];

export const introUrl = (id: string) => `producer/intros/${encodeURIComponent(id)}`;
// A change to one intro: that intro, and the list that shows it.
const introChanged = (_intro: unknown, _error: unknown, { id }: { id: string }) => [
  { type: 'Intros' as const, id },
  { type: 'Intros' as const, id: 'LIST' },
];

// The Producer app's endpoints, added to the shared base API. Each reply is checked against the contract (ADR-0019).
// An intro's live run and its actions are in `intro-run-api.ts`. Body-less POSTs send `{}`: the server refuses an
// empty body labelled as JSON.
const producerApi = api.enhanceEndpoints({ addTagTypes: ['Themes', 'Fonts', 'Intros', 'Teams'] }).injectEndpoints({
  endpoints: (build) => ({
    // rcl-core's font library, which theme fonts are picked from.
    getFonts: build.query<FontFamily[], void>({
      query: () => 'core/fonts',
      transformResponse: (response: unknown) => FontFamilySchema.array().parse(response),
      providesTags: ['Fonts'],
    }),
    // rcl-core's teams, which an intro's two teams are picked from.
    getTeams: build.query<TeamSummary[], void>({
      query: () => 'core/teams',
      transformResponse: (response: unknown) => TeamSummarySchema.array().parse(response),
      providesTags: ['Teams'],
    }),
    getTeam: build.query<Team, string>({
      query: (id) => `core/teams/${encodeURIComponent(id)}`,
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      providesTags: ['Teams'],
    }),
    getIntros: build.query<Intro[], void>({
      query: () => 'producer/intros',
      transformResponse: (response: unknown) => IntroSchema.array().parse(response),
      providesTags: [{ type: 'Intros', id: 'LIST' }],
    }),
    getIntro: build.query<Intro, string>({
      query: (id) => introUrl(id),
      transformResponse: (response: unknown) => IntroSchema.parse(response),
      providesTags: (_intro, _error, id) => [{ type: 'Intros', id }],
    }),
    createIntro: build.mutation<Intro, CreateIntroRequest>({
      query: (body) => ({ url: 'producer/intros', method: 'POST', body }),
      transformResponse: (response: unknown) => IntroSchema.parse(response),
      invalidatesTags: [{ type: 'Intros', id: 'LIST' }],
    }),
    updateIntro: build.mutation<Intro, { id: string; changes: UpdateIntroRequest }>({
      query: ({ id, changes }) => ({ url: introUrl(id), method: 'PATCH', body: changes }),
      transformResponse: (response: unknown) => IntroSchema.parse(response),
      invalidatesTags: introChanged,
    }),
    deleteIntro: build.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: introUrl(id), method: 'DELETE' }),
      invalidatesTags: introChanged,
    }),
    getThemes: build.query<Theme[], void>({
      query: () => 'producer/themes',
      transformResponse: (response: unknown) => ThemeSchema.array().parse(response),
      providesTags: [{ type: 'Themes', id: 'LIST' }],
    }),
    getTheme: build.query<Theme, string>({
      query: (id) => themeUrl(id),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      providesTags: (_theme, _error, id) => [{ type: 'Themes', id }],
    }),
    createTheme: build.mutation<Theme, CreateThemeRequest>({
      query: (body) => ({ url: 'producer/themes', method: 'POST', body }),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      invalidatesTags: [{ type: 'Themes', id: 'LIST' }],
    }),
    updateTheme: build.mutation<Theme, { id: string; changes: UpdateThemeRequest }>({
      query: ({ id, changes }) => ({ url: themeUrl(id), method: 'PATCH', body: changes }),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      invalidatesTags: themeChanged,
    }),
    duplicateTheme: build.mutation<Theme, { id: string }>({
      query: ({ id }) => ({ url: `${themeUrl(id)}/duplicate`, method: 'POST', body: {} }),
      transformResponse: (response: unknown) => ThemeSchema.parse(response),
      invalidatesTags: [{ type: 'Themes', id: 'LIST' }],
    }),
    deleteTheme: build.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: themeUrl(id), method: 'DELETE' }),
      invalidatesTags: themeChanged,
    }),
    // Choosing the default changes two themes at once, so every theme is asked for again.
    setDefaultTheme: build.mutation<SetDefaultThemeRequest, SetDefaultThemeRequest>({
      query: (body) => ({ url: 'producer/default-theme', method: 'PUT', body }),
      transformResponse: (response: unknown) => SetDefaultThemeRequestSchema.parse(response),
      invalidatesTags: ['Themes'],
    }),
  }),
});

export const {
  useGetFontsQuery,
  useGetTeamsQuery,
  useGetTeamQuery,
  useGetIntrosQuery,
  useGetIntroQuery,
  useCreateIntroMutation,
  useUpdateIntroMutation,
  useDeleteIntroMutation,
  useGetThemesQuery,
  useGetThemeQuery,
  useLazyGetThemeQuery,
  useCreateThemeMutation,
  useUpdateThemeMutation,
  useDuplicateThemeMutation,
  useDeleteThemeMutation,
  useSetDefaultThemeMutation,
} = producerApi;

/**
 * After an import (docs/features/import-export.md): themes and fonts are fetched again wherever they're shown, and
 * anything cached but not shown is dropped, so no page shows what was there before.
 */
export const imported = () => producerApi.util.invalidateTags(['Themes', 'Fonts', 'Teams']);
