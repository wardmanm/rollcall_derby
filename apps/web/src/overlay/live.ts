import { configureStore } from '@reduxjs/toolkit';
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { io } from 'socket.io-client';
import { SERVER_HELLO_EVENT, ServerHelloSchema, type ServerHello } from '@obs-producer/shared';

// The overlay's live state comes only from the server over Socket.IO (ADR-0004), held in the RTK Query
// cache rather than a slice (hard rule 6, ADR-0003). A reload starts empty and rebuilds from what the
// server sends on connect; a dropped connection keeps the last known state on screen.

export interface LiveState {
  connected: boolean;
  server: ServerHello | null;
}

/** The part of a Socket.IO client the overlay uses; tests pass a fake. */
export interface LiveSocket {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  close(): unknown;
}
export type ConnectLive = () => LiveSocket;

interface LiveExtra {
  connect: ConnectLive;
}

export const liveApi = createApi({
  reducerPath: 'live',
  baseQuery: fakeBaseQuery(),
  endpoints: (build) => ({
    getLiveState: build.query<LiveState, void>({
      queryFn: () => ({ data: { connected: false, server: null } }),
      keepUnusedDataFor: 0,
      async onCacheEntryAdded(_arg, lifecycle) {
        await lifecycle.cacheDataLoaded;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- makeOverlayStore always sets this
        const socket = (lifecycle.extra as LiveExtra).connect();
        socket.on('connect', () => lifecycle.updateCachedData((draft) => void (draft.connected = true)));
        socket.on('disconnect', () => lifecycle.updateCachedData((draft) => void (draft.connected = false)));
        socket.on(SERVER_HELLO_EVENT, (payload) => {
          const hello = ServerHelloSchema.safeParse(payload);
          if (hello.success) lifecycle.updateCachedData((draft) => void (draft.server = hello.data));
        });
        await lifecycle.cacheEntryRemoved;
        socket.close();
      },
    }),
  }),
});

export const { useGetLiveStateQuery } = liveApi;

// The overlay's own lean store; it shares nothing with the admin store (ADR-0003, ADR-0006). It connects to the
// public /overlay namespace, because OBS browser sources can't log in (ADR-0008).
export function makeOverlayStore(connect: ConnectLive = () => io('/overlay')) {
  return configureStore({
    reducer: { [liveApi.reducerPath]: liveApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: { connect } satisfies LiveExtra } }).concat(liveApi.middleware),
  });
}
