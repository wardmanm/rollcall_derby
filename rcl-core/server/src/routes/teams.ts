import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateMemberRequestSchema,
  CreateTeamRequestSchema,
  memberProblem,
  TeamSchema,
  TeamSummarySchema,
  UpdateMemberRequestSchema,
  UpdateTeamRequestSchema,
  type MemberFields,
} from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { removeMedia } from '../media.ts';
import {
  addMember,
  createTeam,
  deleteMember,
  deleteTeam,
  findMember,
  findTeam,
  listTeams,
  memberConflict,
  updateMember,
  updateTeam,
} from '../teams/teams.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'core:teams.read' } } };
const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'core:teams.manage' } } };
const TeamParamsSchema = z.strictObject({ id: z.string() });
const MemberParamsSchema = z.strictObject({ id: z.string(), memberId: z.string() });
const NOT_FOUND = { error: 'not_found' };
const TAGS = ['core/teams'];

// Teams and their members (docs/features/team-builder.md): anyone holding core:teams.read may look, and
// core:teams.manage may change them. Every change replies with the whole team, members in order, so the editor shows
// what the server has. Checks run with no `await` before their write, so two requests can't both take a number.
export function registerTeamRoutes(fastify: FastifyInstance, { db, mediaDir }: { db: AppDatabase; mediaDir: string }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/teams',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'List teams, by name',
        response: { 200: TeamSummarySchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listTeams(db),
  );

  api.get(
    '/teams/:id',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'A team with its members: skaters by number, then bench staff by name',
        params: TeamParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => findTeam(db, request.params.id) ?? reply.code(404).send(NOT_FOUND),
  );

  api.post(
    '/teams',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Create a team',
        body: CreateTeamRequestSchema,
        response: { 201: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => reply.code(201).send(createTeam(db, request.body)),
  );

  api.patch(
    '/teams/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Change a team's details: a missing field stays as it is, and null clears it",
        params: TeamParamsSchema,
        body: UpdateTeamRequestSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => updateTeam(db, request.params.id, request.body) ?? reply.code(404).send(NOT_FOUND),
  );

  api.delete(
    '/teams/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Delete a team, with its members, logo and photos',
        params: TeamParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const images = deleteTeam(db, request.params.id);
      if (!images) return reply.code(404).send(NOT_FOUND);
      removeMedia(db, mediaDir, images);
      return reply.code(204).send();
    },
  );

  api.post(
    '/teams/:id/members',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Add a skater or member of bench staff',
        params: TeamParamsSchema,
        body: CreateMemberRequestSchema,
        response: { 201: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!findTeam(db, id)) return reply.code(404).send(NOT_FOUND);
      const conflict = memberConflict(db, id, request.body);
      if (conflict) return reply.code(conflict.status).send({ error: conflict.error, message: conflict.message });
      return reply.code(201).send(addMember(db, id, request.body));
    },
  );

  api.patch(
    '/teams/:id/members/:memberId',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Change a member: a missing field stays as it is',
        params: MemberParamsSchema,
        body: UpdateMemberRequestSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      const member = findMember(db, id, memberId);
      if (!member) return reply.code(404).send(NOT_FOUND);
      const changed: MemberFields = { ...member, ...request.body };
      const problem = memberProblem(changed);
      if (problem) return reply.code(400).send({ error: 'validation_failed', message: problem.message });
      const conflict = memberConflict(db, id, changed, memberId);
      if (conflict) return reply.code(conflict.status).send({ error: conflict.error, message: conflict.message });
      return updateMember(db, id, memberId, request.body);
    },
  );

  api.delete(
    '/teams/:id/members/:memberId',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Remove a member, with their photo',
        params: MemberParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      if (!findMember(db, id, memberId)) return reply.code(404).send(NOT_FOUND);
      const { team, photo } = deleteMember(db, id, memberId);
      removeMedia(db, mediaDir, [photo]);
      return team;
    },
  );
}
