import {
  FontFamilySchema,
  TeamSchema,
  TeamSummarySchema,
  type FontFamily,
  type Team,
  type TeamSummary,
} from '@rollcall/core-contract';
import {
  INTRO_RUN_EVENT,
  IntroRunSchema,
  IntroSchema,
  SetDefaultThemeRequestSchema,
  ThemeSchema,
  type CreateIntroRequest,
  type CreateThemeRequest,
  type Intro,
  type IntroRun,
  type IntroTeamSlot,
  type SetDefaultThemeRequest,
  type Theme,
  type UpdateIntroRequest,
  type UpdateThemeRequest,
} from '@rollcall/producer-contract';
import { io } from 'socket.io-client';
import { api } from '@rollcall/web-sdk';

const themeUrl = (id: string) => `producer/themes/${encodeURIComponent(id)}`;
// A change to one theme: that theme, and the list that shows it.
const themeChanged = (_theme: unknown, _error: unknown, { id }: { id: string }) => [
  { type: 'Themes' as const, id },
  { type: 'Themes' as const, id: 'LIST' },
];

const introUrl = (id: string) => `producer/intros/${encodeURIComponent(id)}`;
// A change to one intro: that intro, and the list that shows it.
const introChanged = (_intro: unknown, _error: unknown, { id }: { id: string }) => [
  { type: 'Intros' as const, id },
  { type: 'Intros' as const, id: 'LIST' },
];

// The Producer app's endpoints, added to the shared base API. Each reply is checked against the contract (ADR-0019).
// Body-less POSTs send `{}`: the server refuses an empty body labelled as JSON.
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

/**
 * What the control page shows: the run as the server last said it, when this phone received it (the countdown
 * counts from that, never from the server's clock) and whether the live connection is up.
 */
export interface IntroRunView {
  connected: boolean;
  run: IntroRun;
  receivedAt: number;
}

// A newer state replaces the shown one; `force` takes it whatever its revision (the first after a reconnect).
function takeRun(draft: IntroRunView, run: IntroRun, force = false) {
  if (!force && run.revision <= draft.run.revision) return;
  draft.run = run;
  draft.receivedAt = Date.now();
}

const runQueries = producerApi.injectEndpoints({
  endpoints: (build) => ({
    // An intro's live run: fetched once, then kept current by the server's `intro:run` events (ADR-0019). Held in the
    // query cache, not a slice (hard rule 6).
    getIntroRun: build.query<IntroRunView, string>({
      query: (id) => `${introUrl(id)}/run`,
      transformResponse: (response: unknown): IntroRunView => ({
        connected: false,
        run: IntroRunSchema.parse(response),
        receivedAt: Date.now(),
      }),
      keepUnusedDataFor: 0,
      // A fetch again (such as on return to the tab) leaves the socket's `connected` alone and follows the same
      // newer-revision rule as the socket's own events.
      merge: (current, incoming) => takeRun(current, incoming.run),
      async onCacheEntryAdded(id, lifecycle) {
        try {
          await lifecycle.cacheDataLoaded;
        } catch {
          return; // The request failed (such as an intro that was deleted): the page shows that, and no socket opens.
        }
        const socket = io('/producer/intros', { auth: { intro: id } });
        // The first state after each (re)connect is taken as it comes: a server restart, or an intro deleted while
        // disconnected, can legitimately start again from a lower revision.
        let firstAfterConnect = true;
        socket.on('connect', () => {
          firstAfterConnect = true;
          lifecycle.updateCachedData((draft) => void (draft.connected = true));
        });
        socket.on('disconnect', () => lifecycle.updateCachedData((draft) => void (draft.connected = false)));
        socket.on(INTRO_RUN_EVENT, (payload: unknown) => {
          const run = IntroRunSchema.safeParse(payload);
          if (!run.success) return;
          const force = firstAfterConnect;
          firstAfterConnect = false;
          lifecycle.updateCachedData((draft) => takeRun(draft, run.data, force));
        });
        await lifecycle.cacheEntryRemoved;
        socket.close();
      },
    }),
  }),
});

// An action's reply goes into the run's cache entry, under the same newer-revision rule as the socket's.
const runApi = runQueries.injectEndpoints({
  endpoints: (build) => ({
    startIntro: build.mutation<IntroRun, { id: string; team: IntroTeamSlot }>({
      query: ({ id, team }) => ({ url: `${introUrl(id)}/start`, method: 'POST', body: { team } }),
      transformResponse: (response: unknown) => IntroRunSchema.parse(response),
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(runQueries.util.updateQueryData('getIntroRun', id, (draft) => takeRun(draft, data)));
        } catch {
          // The page shows the failure from the mutation's own result.
        }
      },
    }),
    nextIntro: build.mutation<IntroRun, { id: string; revision: number }>({
      query: ({ id, revision }) => ({ url: `${introUrl(id)}/next`, method: 'POST', body: { revision } }),
      transformResponse: (response: unknown) => IntroRunSchema.parse(response),
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(runQueries.util.updateQueryData('getIntroRun', id, (draft) => takeRun(draft, data)));
        } catch {
          // The page shows the failure from the mutation's own result.
        }
      },
    }),
    clearIntro: build.mutation<IntroRun, { id: string }>({
      query: ({ id }) => ({ url: `${introUrl(id)}/clear`, method: 'POST', body: {} }),
      transformResponse: (response: unknown) => IntroRunSchema.parse(response),
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(runQueries.util.updateQueryData('getIntroRun', id, (draft) => takeRun(draft, data)));
        } catch {
          // The page shows the failure from the mutation's own result.
        }
      },
    }),
  }),
});

export const { useGetIntroRunQuery, useStartIntroMutation, useNextIntroMutation, useClearIntroMutation } = runApi;

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
