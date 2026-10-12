import {
  CreateUserResponseSchema,
  HostedAppSchema,
  PasswordResetResponseSchema,
  SessionUserSchema,
  UserSchema,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type CreateUserResponse,
  type HostedApp,
  type LoginRequest,
  type PasswordResetResponse,
  type Role,
  type SessionUser,
  type SetupRequest,
  type User,
} from '@rollcall/core-contract';
import { api } from '@rollcall/web-sdk';

// rcl-core's own endpoints, added to the shared base API. Each reply is checked against the contract (ADR-0019).
// Body-less POSTs send `{}`: the server refuses an empty body labelled as JSON.
const coreApi = api.enhanceEndpoints({ addTagTypes: ['Users'] }).injectEndpoints({
  endpoints: (build) => ({
    setup: build.mutation<SessionUser, SetupRequest>({
      query: (body) => ({ url: 'core/setup', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Setup', 'Me'],
    }),
    // Someone else may have been signed in on this browser: forget their user list too.
    login: build.mutation<SessionUser, LoginRequest>({
      query: (body) => ({ url: 'core/auth/login', method: 'POST', body }),
      transformResponse: (response: unknown) => SessionUserSchema.parse(response),
      invalidatesTags: ['Me', 'Users'],
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
    getUsers: build.query<User[], void>({
      query: () => 'core/users',
      transformResponse: (response: unknown) => UserSchema.array().parse(response),
      providesTags: ['Users'],
    }),
    createUser: build.mutation<CreateUserResponse, CreateUserRequest>({
      query: (body) => ({ url: 'core/users', method: 'POST', body }),
      transformResponse: (response: unknown) => CreateUserResponseSchema.parse(response),
      invalidatesTags: ['Users'],
    }),
    // Your own role may be the one changing, so who you are is asked again too.
    updateUserRole: build.mutation<User, { id: string; role: Role }>({
      query: ({ id, role }) => ({ url: `core/users/${encodeURIComponent(id)}`, method: 'PATCH', body: { role } }),
      transformResponse: (response: unknown) => UserSchema.parse(response),
      invalidatesTags: ['Users', 'Me'],
    }),
    resetPassword: build.mutation<PasswordResetResponse, string>({
      query: (id) => ({ url: `core/users/${encodeURIComponent(id)}/password-reset`, method: 'POST', body: {} }),
      transformResponse: (response: unknown) => PasswordResetResponseSchema.parse(response),
      invalidatesTags: ['Users'],
    }),
    signOutUser: build.mutation<void, string>({
      query: (id) => ({ url: `core/users/${encodeURIComponent(id)}/sign-out`, method: 'POST', body: {} }),
      invalidatesTags: ['Users', 'Me'],
    }),
    deleteUser: build.mutation<void, string>({
      query: (id) => ({ url: `core/users/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: ['Users'],
    }),
  }),
});

export const {
  useSetupMutation,
  useLoginMutation,
  useChangePasswordMutation,
  useGetAppsQuery,
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserRoleMutation,
  useResetPasswordMutation,
  useSignOutUserMutation,
  useDeleteUserMutation,
} = coreApi;
