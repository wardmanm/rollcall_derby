import { configureStore } from '@reduxjs/toolkit';
import { api } from './api.ts';

// The admin and dashboard store. The overlay entry gets its own lean store (ADR-0006).
export function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
