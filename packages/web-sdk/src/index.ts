// Shared web code for every rcl app's Mantine GUI (split spec): the app shell, the sign-in gate, the account menu, the
// server badge, the RTK Query base API and the store. Overlay entries never import it (ADR-0006). The dev proxy
// helper is in `@rollcall/web-sdk/vite`, and test helpers are in `@rollcall/web-sdk/testing`.
export { App } from './App.tsx';
export { AppLayout, type AppLink, type AppLayoutProps } from './AppLayout.tsx';
export { PageNotFound } from './PageNotFound.tsx';
export { ServerStatus } from './ServerStatus.tsx';
export { SignInGate } from './SignInGate.tsx';
export { UserMenu } from './UserMenu.tsx';
export { api, useGetHealthQuery, useGetMeQuery, useGetSetupStatusQuery, useLogoutMutation } from './api.ts';
export { CORE_PAGES, safeNext, withNext } from './core-pages.ts';
export { apiError } from './errors.ts';
export { fieldErrors, pathErrors, problemWith } from './forms.ts';
export { parseHealth } from './health.ts';
export { useAppDispatch, useAppSelector } from './hooks.ts';
export { browser, useGoTo } from './navigation.ts';
export { ROLE_NAMES } from './roles.ts';
export { makeStore, type AppDispatch, type AppStore, type RootState } from './store.ts';
export { theme } from './theme.ts';
