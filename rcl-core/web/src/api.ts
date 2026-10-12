import {
  HostedAppSchema,
  SessionUserSchema,
  type ChangePasswordRequest,
  type HostedApp,
  type LoginRequest,
  type SessionUser,
  type SetupRequest,
} from '@rollcall/core-contract';
import { api } from '@rollcall/web-sdk';

// rcl-core's own endpoints, added to the shared base API. Each reply is checked against the contract (ADR-0019).
// Body-less POSTs send `{}`: the server refuses an empty body labelled as JSON.
const coreApi = api.injectEndpoints({
  endpoints: (build) => ({
    setup: build.mutation<SessionUser, SetupRequest>({
      query: (body) => ({ url: 'core/setup', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Setup', 'Me'],
    }),
    login: build.mutation<SessionUser, LoginRequest>({
      query: (body) => ({ url: 'core/auth/login', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Me'],
    }),
    changePassword: build.mutation<SessionUser, ChangePasswordRequest>({
      query: (body) => ({ url: 'core/auth/password', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Me'],
    }),
    getApps: build.query<HostedApp[], void>({
      query: () => 'core/apps',
      transformResponse: (response: unknown) => HostedAppSchema.array().parse(response),
    }),
  }),
});

export const { useSetupMutation, useLoginMutation, useChangePasswordMutation, useGetAppsQuery } = coreApi;
