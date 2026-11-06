import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Access, TeamsService } from '@rollcall/app-sdk';
import { ApiErrorSchema } from '@rollcall/core-contract';
import {
  CreateIntroRequestSchema,
  IntroSchema,
  UpdateIntroRequestSchema,
  type Intro,
} from '@rollcall/producer-contract';
import {
  changesNothing,
  createIntro,
  deleteIntro,
  findIntro,
  introNameTaken,
  listIntros,
  updateIntro,
} from '../intros/intros.ts';
import { findTheme, type ProducerDatabase } from '../themes/themes.ts';

const RUN: { config: { access: Access } } = { config: { access: { permission: 'producer:intros.run' } } };
const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'producer:intros.manage' } } };
// Lets a route send core's { error, message? } replies (ADR-0014).
const ERROR_RESPONSES = { '4xx': ApiErrorSchema };
const IntroParamsSchema = z.strictObject({ id: z.string() });
const NOT_FOUND = { error: 'not_found' };
const NAME_TAKEN = { error: 'name_taken', message: 'That name is already taken' };
const SAME_TEAM = { error: 'same_team', message: 'Pick two different teams' };
const UNKNOWN_TEAM = { error: 'unknown_team', message: 'That team no longer exists' };
const UNKNOWN_THEME = { error: 'unknown_theme', message: 'That theme no longer exists' };
const TAGS = ['producer/intros'];

// Intros (docs/features/skater-intros.md): anyone holding producer:intros.run may look, and producer:intros.manage may
// create, set up and delete them. `onSaved` runs after each save with the intro before (none for a new one) and after,
// and `onDeleted` after a delete, so a live run can follow.
export function registerIntroRoutes(
  fastify: FastifyInstance,
  {
    db,
    teams,
    onSaved,
    onDeleted,
  }: {
    db: ProducerDatabase;
    teams: TeamsService;
    onSaved: (before: Intro | undefined, after: Intro) => void;
    onDeleted: (id: string) => void;
  },
) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/intros',
    {
      ...RUN,
      schema: {
        tags: TAGS,
        summary: 'List intros, by name',
        response: { 200: IntroSchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listIntros(db),
  );

  api.get(
    '/intros/:id',
    {
      ...RUN,
      schema: {
        tags: TAGS,
        summary: 'An intro',
        params: IntroParamsSchema,
        response: { 200: IntroSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => findIntro(db, request.params.id) ?? reply.code(404).send(NOT_FOUND),
  );

  api.post(
    '/intros',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Create an intro, with no teams, the default theme and the default settings',
        body: CreateIntroRequestSchema,
        response: { 201: IntroSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      if (introNameTaken(db, request.body.name)) return reply.code(409).send(NAME_TAKEN);
      const intro = createIntro(db, request.body);
      onSaved(undefined, intro);
      return reply.code(201).send(intro);
    },
  );

  api.patch(
    '/intros/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Change an intro's name, teams, theme or settings: a missing field stays as it is",
        description: 'A save that changes nothing answers with the intro as it is, without marking it updated.',
        params: IntroParamsSchema,
        body: UpdateIntroRequestSchema,
        response: { 200: IntroSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const changes = request.body;
      const before = findIntro(db, id);
      if (!before) return reply.code(404).send(NOT_FOUND);
      if (changes.name !== undefined && introNameTaken(db, changes.name, id)) return reply.code(409).send(NAME_TAKEN);
      for (const teamId of [changes.teamAId, changes.teamBId]) {
        if (teamId != null && !teams.get(teamId)) return reply.code(400).send(UNKNOWN_TEAM);
      }
      if (changes.themeId != null && !findTheme(db, changes.themeId)) return reply.code(400).send(UNKNOWN_THEME);
      const teamAId = changes.teamAId === undefined ? before.teamAId : changes.teamAId;
      const teamBId = changes.teamBId === undefined ? before.teamBId : changes.teamBId;
      if (teamAId !== null && teamAId === teamBId) return reply.code(400).send(SAME_TEAM);
      // Nothing to save, so nothing to tell: the intro stays as it is, updatedAt too.
      if (changesNothing(before, changes)) return before;
      const after = updateIntro(db, id, changes);
      if (!after) return reply.code(404).send(NOT_FOUND);
      onSaved(before, after);
      return after;
    },
  );

  api.delete(
    '/intros/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Delete an intro',
        params: IntroParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const intro = deleteIntro(db, request.params.id);
      if (!intro) return reply.code(404).send(NOT_FOUND);
      onDeleted(intro.id);
      return reply.code(204).send();
    },
  );
}
