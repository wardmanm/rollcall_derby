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
      async onCacheEntryAdded(_arg, { extra, updateCachedData, cacheDataLoaded, cacheEntryRemoved }) {
        await cacheDataLoaded;
        const socket = (extra as LiveExtra).connect();
        socket.on('connect', () => updateCachedData((draft) => void (draft.connected = true)));
        socket.on('disconnect', () => updateCachedData((draft) => void (draft.connected = false)));
        socket.on(SERVER_HELLO_EVENT, (payload) => {
          const hello = ServerHelloSchema.safeParse(payload);
          if (hello.success) updateCachedData((draft) => void (draft.server = hello.data));
        });
        await cacheEntryRemoved;
        socket.close();
      },
    }),
  }),
});

export const { useGetLiveStateQuery } = liveApi;

// The overlay's own lean store; it shares nothing with the admin store (ADR-0003, ADR-0006).
export function makeOverlayStore(connect: ConnectLive = () => io()) {
  return configureStore({
    reducer: { [liveApi.reducerPath]: liveApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: { connect } satisfies LiveExtra } }).concat(liveApi.middleware),
  });
}
