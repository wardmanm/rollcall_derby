// Shared web code for every rcl app's Mantine GUI (split spec): the app shell, the server badge, the RTK Query base
// API and the store. Overlay entries never import it (ADR-0006); the dev proxy helper is in `@rollcall/web-sdk/vite`.
export { App } from './App.tsx';
export { AppLayout } from './AppLayout.tsx';
export { ServerStatus } from './ServerStatus.tsx';
export { api, useGetHealthQuery } from './api.ts';
export { parseHealth } from './health.ts';
export { useAppDispatch, useAppSelector } from './hooks.ts';
export { makeStore, type AppDispatch, type AppStore, type RootState } from './store.ts';
