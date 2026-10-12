import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import {
  CurrentUserSchema,
  SetupStatusSchema,
  type CurrentUser,
  type HealthResponse,
  type SetupStatus,
} from '@rollcall/core-contract';
import { apiError } from './errors.ts';
import { parseHealth } from './health.ts';

// Absolute so it also works where relative URLs can't be resolved (e.g. Node's fetch in tests).
const fetchFromServer = fetchBaseQuery({ baseUrl: `${window.location.origin}/api/` });

// A request refused because the session ended (`unauthenticated`) or a password change is now due means "who's signed
// in" has changed: ask again, so the sign-in gate sends the person to the right page.
const SESSION_CHANGED = new Set(['unauthenticated', 'password_change_required']);

const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, queryApi, extra) => {
  const result = await fetchFromServer(args, queryApi, extra);
  const code = apiError(result.error)?.code;
  if (code && SESSION_CHANGED.has(code) && queryApi.endpoint !== 'getMe') {
    queryApi.dispatch(api.util.invalidateTags(['Me']));
  }
  return result;
};

// All server data lives in RTK Query, never copied into slices (hard rule 6, ADR-0003). Responses are validated
// against the apps' Zod contracts (ADR-0019). Each app adds its own endpoints with `api.injectEndpoints`.
export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Me', 'Setup'],
  endpoints: (build) => ({
    getHealth: build.query<HealthResponse, void>({
      query: () => 'core/health',
      transformResponse: (response: unknown) => parseHealth(response),
    }),
    getSetupStatus: build.query<SetupStatus, void>({
      query: () => 'core/setup',
      transformResponse: (response: unknown) => SetupStatusSchema.parse(response),
      providesTags: ['Setup'],
    }),
    getMe: build.query<CurrentUser, void>({
      query: () => 'core/auth/me',
      transformResponse: (response: unknown) => CurrentUserSchema.parse(response),
      providesTags: ['Me'],
    }),
    // Body-less POSTs send `{}`: the server refuses an empty body labelled as JSON.
    logout: build.mutation<void, void>({
      query: () => ({ url: 'core/auth/logout', method: 'POST', body: {} }),
      invalidatesTags: ['Me'],
    }),
  }),
});

export const { useGetHealthQuery, useGetSetupStatusQuery, useGetMeQuery, useLogoutMutation } = api;
