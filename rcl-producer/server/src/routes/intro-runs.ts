import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Access } from '@rollcall/app-sdk';
import { ApiErrorSchema } from '@rollcall/core-contract';
import {
  IntroRunSchema,
  NextIntroRequestSchema,
  StartIntroRequestSchema,
  type IntroTeamSlot,
} from '@rollcall/producer-contract';
import { findIntro } from '../intros/intros.ts';
import type { IntroRuns } from '../intros/runs.ts';
import type { ProducerDatabase } from '../themes/themes.ts';

const RUN: { config: { access: Access } } = { config: { access: { permission: 'producer:intros.run' } } };
// Lets a route send core's { error, message? } replies (ADR-0014).
const ERROR_RESPONSES = { '4xx': ApiErrorSchema };
const IntroParamsSchema = z.strictObject({ id: z.string() });
const ClearIntroRequestSchema = z.strictObject({});
const NOT_FOUND = { error: 'not_found' };
const noTeam = (slot: IntroTeamSlot) => ({ error: 'no_team', message: `Pick team ${slot.toUpperCase()} first` });
const TAGS = ['producer/intros'];

// An intro's live run (docs/features/skater-intros.md): anyone holding producer:intros.run may read it and press Start,
// Next and Clear. Each press answers with the run as it is after it, and `runs` tells the intro's rooms.
export function registerIntroRunRoutes(
  fastify: FastifyInstance,
  { db, runs }: { db: ProducerDatabase; runs: IntroRuns },
) {
  const api = fastify.withTypeProvider<ZodTypeProvider>();

  api.get(
    '/intros/:id/run',
    {
      ...RUN,
      schema: {
        tags: TAGS,
        summary: "An intro's live run: who's on screen, who's next and the timer",
        params: IntroParamsSchema,
        response: { 200: IntroRunSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const intro = findIntro(db, request.params.id);
      return intro ? runs.run(intro) : reply.code(404).send(NOT_FOUND);
    },
  );

  api.post(
    '/intros/:id/start',
    {
      ...RUN,
      schema: {
        tags: TAGS,
        summary: 'Start a team from its title card, taking off anything on air. Starting it again starts it over',
        description: 'On the timer, the countdown starts too. A slot with no team, or whose team is gone, answers 409.',
        params: IntroParamsSchema,
        body: StartIntroRequestSchema,
        response: { 200: IntroRunSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const intro = findIntro(db, request.params.id);
      if (!intro) return reply.code(404).send(NOT_FOUND);
      const { team } = request.body;
      const run = runs.start(intro, team);
      return run === 'no_team' ? reply.code(409).send(noTeam(team)) : run;
    },
  );

  api.post(
    '/intros/:id/next',
    {
      ...RUN,
      schema: {
        tags: TAGS,
        summary:
          'Show the next person, starting a fresh row when the row is full. After the last person, nothing changes',
        description:
          "Send the run's `revision` as shown: a press on a step that has passed changes nothing, so two presses at " +
          'once, or a retry, move on one step. On the timer, the countdown starts again.',
        params: IntroParamsSchema,
        body: NextIntroRequestSchema,
        response: { 200: IntroRunSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const intro = findIntro(db, request.params.id);
      return intro ? runs.next(intro, request.body.revision) : reply.code(404).send(NOT_FOUND);
    },
  );

  api.post(
    '/intros/:id/clear',
    {
      ...RUN,
      schema: {
        tags: TAGS,
        summary: "Take everything off air and stop the timer, keeping the team's place for the next Next",
        params: IntroParamsSchema,
        body: ClearIntroRequestSchema,
        response: { 200: IntroRunSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const intro = findIntro(db, request.params.id);
      return intro ? runs.clear(intro) : reply.code(404).send(NOT_FOUND);
    },
  );
}
