import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, TeamSchema } from '@rollcall/core-contract';
import type { AppDatabase } from '../db.ts';
import type { Access } from '../auth/access.ts';
import { ERROR_RESPONSES } from '../http.ts';
import { removeMedia, saveMedia } from '../media.ts';
import { findMember, findTeamRow, updateMember, updateTeam } from '../teams/teams.ts';
import { registerUploads } from './uploads.ts';

const MANAGE: { config: { access: Access } } = { config: { access: { permission: 'core:teams.manage' } } };
const TeamParamsSchema = z.strictObject({ id: z.string() });
const MemberParamsSchema = z.strictObject({ id: z.string(), memberId: z.string() });
const NOT_FOUND = { error: 'not_found' };
const UNSUPPORTED = { error: 'unsupported_image', message: 'Use a PNG, JPEG or WebP image' };
const TOO_LARGE = { error: 'too_large', message: 'That image is over 5 MB' };
const TAGS = ['core/teams'];

// The upload routes' options: the image arrives as the raw body, up to 5 MB, as one of the image types. The explorer
// lists those types (`consumes`).
const UPLOAD = { ...MANAGE, bodyLimit: MAX_IMAGE_BYTES } as const;

// Team logos and member photos (ADR-0022). An upload is the raw image, with its type as the Content-Type. The server
// keeps it only if its bytes are a PNG, JPEG or WebP, then deletes the image it replaces.
export function registerTeamImageRoutes(fastify: FastifyInstance, deps: { db: AppDatabase; mediaDir: string }) {
  registerUploads(
    fastify,
    { types: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES, tooLarge: TOO_LARGE, unsupported: UNSUPPORTED },
    (uploads) => imageRoutes(uploads, deps),
  );
}

function imageRoutes(fastify: FastifyInstance, { db, mediaDir }: { db: AppDatabase; mediaDir: string }) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();
  // The upload as a new image, or null when the body isn't an image (such as JSON, or a renamed SVG).
  const save = (body: unknown) => (Buffer.isBuffer(body) ? saveMedia(db, mediaDir, body) : null);

  api.put(
    '/teams/:id/logo',
    {
      ...UPLOAD,
      schema: {
        tags: TAGS,
        summary: "Set the team's logo: the body is the image (PNG, JPEG or WebP, up to 5 MB)",
        consumes: [...IMAGE_TYPES],
        params: TeamParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const team = findTeamRow(db, request.params.id);
      if (!team) return reply.code(404).send(NOT_FOUND);
      const logo = save(request.body);
      if (!logo) return reply.code(415).send(UNSUPPORTED);
      const updated = updateTeam(db, team.id, { logoMediaId: logo });
      removeMedia(db, mediaDir, [team.logoMediaId]);
      return updated;
    },
  );

  api.delete(
    '/teams/:id/logo',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Remove the team's logo",
        params: TeamParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const team = findTeamRow(db, request.params.id);
      if (!team) return reply.code(404).send(NOT_FOUND);
      const updated = updateTeam(db, team.id, { logoMediaId: null });
      removeMedia(db, mediaDir, [team.logoMediaId]);
      return updated;
    },
  );

  api.put(
    '/teams/:id/members/:memberId/photo',
    {
      ...UPLOAD,
      schema: {
        tags: TAGS,
        summary: "Set a member's photo: the body is the image (PNG, JPEG or WebP, up to 5 MB)",
        consumes: [...IMAGE_TYPES],
        params: MemberParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      const member = findMember(db, id, memberId);
      if (!member) return reply.code(404).send(NOT_FOUND);
      const photo = save(request.body);
      if (!photo) return reply.code(415).send(UNSUPPORTED);
      const team = updateMember(db, id, memberId, { photoMediaId: photo });
      removeMedia(db, mediaDir, [member.photoMediaId]);
      return team;
    },
  );

  api.delete(
    '/teams/:id/members/:memberId/photo',
    {
      ...MANAGE,
      schema: {
        tags: TAGS,
        summary: "Remove a member's photo",
        params: MemberParamsSchema,
        response: { 200: TeamSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const { id, memberId } = request.params;
      const member = findMember(db, id, memberId);
      if (!member) return reply.code(404).send(NOT_FOUND);
      const team = updateMember(db, id, memberId, { photoMediaId: null });
      removeMedia(db, mediaDir, [member.photoMediaId]);
      return team;
    },
  );
}
