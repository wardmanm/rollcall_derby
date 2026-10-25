import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Access } from '@rollcall/app-sdk';
import { ApiErrorSchema } from '@rollcall/core-contract';
import {
  CreateThemeRequestSchema,
  SetDefaultThemeRequestSchema,
  ThemeSchema,
  UpdateThemeRequestSchema,
} from '@rollcall/producer-contract';
import {
  createTheme,
  deleteTheme,
  duplicateTheme,
  findTheme,
  listThemes,
  setDefaultTheme,
  themeNameTaken,
  updateTheme,
  type ProducerDatabase,
} from '../themes/themes.ts';

const READ: { config: { access: Access } } = { config: { access: { permission: 'producer:themes.read' } } };
const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'producer:themes.manage' } } };
// Lets a route send core's { error, message? } replies (ADR-0014).
const ERROR_RESPONSES = { '4xx': ApiErrorSchema };
const ThemeParamsSchema = z.strictObject({ id: z.string() });
const NOT_FOUND = { error: 'not_found' };
const NAME_TAKEN = { error: 'name_taken', message: 'That name is already taken' };
const TAGS = ['producer/themes'];

// Themes (docs/features/theme-builder.md): anyone holding producer:themes.read may look, and producer:themes.manage
// may change them and choose the default.
export function registerThemeRoutes(fastify: FastifyInstance, { db }: { db: ProducerDatabase }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/themes',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'List themes, by name',
        response: { 200: ThemeSchema.array(), ...ERROR_RESPONSES },
      },
    },
    async () => listThemes(db),
  );

  api.get(
    '/themes/:id',
    {
      ...READ,
      schema: {
        tags: TAGS,
        summary: 'A theme',
        params: ThemeParamsSchema,
        response: { 200: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => findTheme(db, request.params.id) ?? reply.code(404).send(NOT_FOUND),
  );

  api.post(
    '/themes',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Create a theme. Without tokens, it starts from the built-in look',
        body: CreateThemeRequestSchema,
        response: { 201: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      if (themeNameTaken(db, request.body.name)) return reply.code(409).send(NAME_TAKEN);
      return reply.code(201).send(createTheme(db, request.body));
    },
  );

  api.patch(
    '/themes/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Change a theme's name or tokens: a missing field stays as it is, and tokens are replaced whole",
        params: ThemeParamsSchema,
        body: UpdateThemeRequestSchema,
        response: { 200: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body;
      if (!findTheme(db, id)) return reply.code(404).send(NOT_FOUND);
      if (name !== undefined && themeNameTaken(db, name, id)) return reply.code(409).send(NAME_TAKEN);
      return updateTheme(db, id, request.body) ?? reply.code(404).send(NOT_FOUND);
    },
  );

  api.post(
    '/themes/:id/duplicate',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Copy a theme as "<name> copy", or "<name> copy 2" and so on. The copy is not the default',
        params: ThemeParamsSchema,
        response: { 201: ThemeSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const copy = duplicateTheme(db, request.params.id);
      return copy ? reply.code(201).send(copy) : reply.code(404).send(NOT_FOUND);
    },
  );

  api.delete(
    '/themes/:id',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Delete a theme. Deleting the default leaves no default',
        params: ThemeParamsSchema,
        response: { 204: z.undefined(), ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      if (!deleteTheme(db, request.params.id)) return reply.code(404).send(NOT_FOUND);
      return reply.code(204).send();
    },
  );

  api.put(
    '/default-theme',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: 'Choose the theme the OBS overlay uses, or with null leave none',
        body: SetDefaultThemeRequestSchema,
        response: { 200: SetDefaultThemeRequestSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { themeId } = request.body;
      if (!setDefaultTheme(db, themeId)) return reply.code(404).send(NOT_FOUND);
      return { themeId };
    },
  );
}
