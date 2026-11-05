import { INTRO_RUN_EVENT, IntroRunSchema, type IntroRun, type IntroTeamSlot } from '@rollcall/producer-contract';
import { io } from 'socket.io-client';
import { api, type AppDispatch } from '@rollcall/web-sdk';
import { introUrl } from './api.ts';

/**
 * What the control page shows: the run as the server last said it, when this phone received it (the countdown
 * counts from that, never from the server's clock) and the live connection: not up yet, up, or dropped since.
 */
export interface IntroRunView {
  connection: 'connecting' | 'connected' | 'reconnecting';
  run: IntroRun;
  receivedAt: number;
}

// A newer state replaces the shown one; `force` takes it whatever its revision (the first after a reconnect).
function takeRun(draft: IntroRunView, run: IntroRun, force = false) {
  if (!force && run.revision <= draft.run.revision) return;
  draft.run = run;
  draft.receivedAt = Date.now();
}

const runQueries = api.injectEndpoints({
  endpoints: (build) => ({
    // An intro's live run: fetched once, then kept current by the server's `intro:run` events (ADR-0019). Held in the
    // query cache, not a slice (hard rule 6).
    getIntroRun: build.query<IntroRunView, string>({
      query: (id) => `${introUrl(id)}/run`,
      transformResponse: (response: unknown): IntroRunView => ({
        connection: 'connecting',
        run: IntroRunSchema.parse(response),
        receivedAt: Date.now(),
      }),
      keepUnusedDataFor: 0,
      // A fetch again (such as on return to the tab) leaves the socket's `connection` alone and follows the same
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
          lifecycle.updateCachedData((draft) => void (draft.connection = 'connected'));
        });
        socket.on('disconnect', () => lifecycle.updateCachedData((draft) => void (draft.connection = 'reconnecting')));
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
async function takeReply(
  { id }: { id: string },
  { dispatch, queryFulfilled }: { dispatch: AppDispatch; queryFulfilled: Promise<{ data: IntroRun }> },
) {
  try {
    const { data } = await queryFulfilled;
    dispatch(runQueries.util.updateQueryData('getIntroRun', id, (draft) => takeRun(draft, data)));
  } catch {
    // The page shows the failure from the mutation's own result.
  }
}

// Start, Next and Clear (docs/features/skater-intros.md). Body-less POSTs send `{}`: the server refuses an empty body
// labelled as JSON.
const runApi = runQueries.injectEndpoints({
  endpoints: (build) => ({
    startIntro: build.mutation<IntroRun, { id: string; team: IntroTeamSlot }>({
      query: ({ id, team }) => ({ url: `${introUrl(id)}/start`, method: 'POST', body: { team } }),
      transformResponse: (response: unknown) => IntroRunSchema.parse(response),
      onQueryStarted: takeReply,
    }),
    nextIntro: build.mutation<IntroRun, { id: string; revision: number }>({
      query: ({ id, revision }) => ({ url: `${introUrl(id)}/next`, method: 'POST', body: { revision } }),
      transformResponse: (response: unknown) => IntroRunSchema.parse(response),
      onQueryStarted: takeReply,
    }),
    clearIntro: build.mutation<IntroRun, { id: string }>({
      query: ({ id }) => ({ url: `${introUrl(id)}/clear`, method: 'POST', body: {} }),
      transformResponse: (response: unknown) => IntroRunSchema.parse(response),
      onQueryStarted: takeReply,
    }),
  }),
});

export const { useGetIntroRunQuery, useStartIntroMutation, useNextIntroMutation, useClearIntroMutation } = runApi;
