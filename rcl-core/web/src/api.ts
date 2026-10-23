import {
  ApiKeySchema,
  CreateApiKeyResponseSchema,
  CreateUserResponseSchema,
  GrantablePermissionSchema,
  HostedAppSchema,
  PasswordResetResponseSchema,
  SessionUserSchema,
  TeamSchema,
  TeamSummarySchema,
  UserSchema,
  type ApiKey,
  type ChangePasswordRequest,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
  type CreateMemberRequest,
  type CreateTeamRequest,
  type CreateUserRequest,
  type CreateUserResponse,
  type GrantablePermission,
  type HostedApp,
  type LoginRequest,
  type PasswordResetResponse,
  type Role,
  type SessionUser,
  type SetupRequest,
  type Team,
  type TeamSummary,
  type UpdateMemberRequest,
  type UpdateTeamRequest,
  type User,
} from '@rollcall/core-contract';
import { api } from '@rollcall/web-sdk';

const teamUrl = (id: string) => `core/teams/${encodeURIComponent(id)}`;
const memberUrl = (id: string, memberId: string) => `${teamUrl(id)}/members/${encodeURIComponent(memberId)}`;
const imageHeaders = (image: File) => ({ 'content-type': image.type });
// A change to one team: that team, and the list that summarizes it.
const teamChanged = (_team: unknown, _error: unknown, { id }: { id: string }) => [
  { type: 'Teams' as const, id },
  { type: 'Teams' as const, id: 'LIST' },
];

// rcl-core's own endpoints, added to the shared base API. Each reply is checked against the contract (ADR-0019).
// Body-less POSTs send `{}`: the server refuses an empty body labelled as JSON.
const coreApi = api.enhanceEndpoints({ addTagTypes: ['Users', 'ApiKeys', 'Teams'] }).injectEndpoints({
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
    getApiKeys: build.query<ApiKey[], void>({
      query: () => 'core/api-keys',
      transformResponse: (response: unknown) => ApiKeySchema.array().parse(response),
      providesTags: ['ApiKeys'],
    }),
    getGrantablePermissions: build.query<GrantablePermission[], void>({
      query: () => 'core/api-keys/grantable',
      transformResponse: (response: unknown) => GrantablePermissionSchema.array().parse(response),
    }),
    createApiKey: build.mutation<CreateApiKeyResponse, CreateApiKeyRequest>({
      query: (body) => ({ url: 'core/api-keys', method: 'POST', body }),
      transformResponse: (response: unknown) => CreateApiKeyResponseSchema.parse(response),
      invalidatesTags: ['ApiKeys'],
    }),
    revokeApiKey: build.mutation<void, string>({
      query: (id) => ({ url: `core/api-keys/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: ['ApiKeys'],
    }),
    getTeams: build.query<TeamSummary[], void>({
      query: () => 'core/teams',
      transformResponse: (response: unknown) => TeamSummarySchema.array().parse(response),
      providesTags: [{ type: 'Teams', id: 'LIST' }],
    }),
    getTeam: build.query<Team, string>({
      query: (id) => `core/teams/${encodeURIComponent(id)}`,
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      providesTags: (_team, _error, id) => [{ type: 'Teams', id }],
    }),
    createTeam: build.mutation<Team, CreateTeamRequest>({
      query: (body) => ({ url: 'core/teams', method: 'POST', body }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: [{ type: 'Teams', id: 'LIST' }],
    }),
    deleteTeam: build.mutation<void, string>({
      query: (id) => ({ url: `core/teams/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Teams', id: 'LIST' }],
    }),
    // Every change to a team replies with the whole team, and refreshes the list (counts, logo, when updated).
    updateTeam: build.mutation<Team, { id: string; changes: UpdateTeamRequest }>({
      query: ({ id, changes }) => ({ url: teamUrl(id), method: 'PATCH', body: changes }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    addMember: build.mutation<Team, { id: string; member: CreateMemberRequest }>({
      query: ({ id, member }) => ({ url: `${teamUrl(id)}/members`, method: 'POST', body: member }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    updateMember: build.mutation<Team, { id: string; memberId: string; changes: UpdateMemberRequest }>({
      query: ({ id, memberId, changes }) => ({ url: memberUrl(id, memberId), method: 'PATCH', body: changes }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    removeMember: build.mutation<Team, { id: string; memberId: string }>({
      query: ({ id, memberId }) => ({ url: memberUrl(id, memberId), method: 'DELETE' }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    // An image is sent as it is, with its own type as the Content-Type, never as JSON (ADR-0022).
    setLogo: build.mutation<Team, { id: string; image: File }>({
      query: ({ id, image }) => ({
        url: `${teamUrl(id)}/logo`,
        method: 'PUT',
        body: image,
        headers: imageHeaders(image),
      }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    removeLogo: build.mutation<Team, { id: string }>({
      query: ({ id }) => ({ url: `${teamUrl(id)}/logo`, method: 'DELETE' }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    setPhoto: build.mutation<Team, { id: string; memberId: string; image: File }>({
      query: ({ id, memberId, image }) => ({
        url: `${memberUrl(id, memberId)}/photo`,
        method: 'PUT',
        body: image,
        headers: imageHeaders(image),
      }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
    }),
    removePhoto: build.mutation<Team, { id: string; memberId: string }>({
      query: ({ id, memberId }) => ({ url: `${memberUrl(id, memberId)}/photo`, method: 'DELETE' }),
      transformResponse: (response: unknown) => TeamSchema.parse(response),
      invalidatesTags: teamChanged,
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
  useGetApiKeysQuery,
  useGetGrantablePermissionsQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
  useGetTeamsQuery,
  useGetTeamQuery,
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useUpdateTeamMutation,
  useAddMemberMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
  useSetLogoMutation,
  useRemoveLogoMutation,
  useSetPhotoMutation,
  useRemovePhotoMutation,
} = coreApi;
