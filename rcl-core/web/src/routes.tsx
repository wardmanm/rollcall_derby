import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout, PageNotFound, SignInGate, type AppLink } from '@rollcall/web-sdk';
import { ApiKeysPage } from './pages/ApiKeysPage.tsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.tsx';
import { FontsPage } from './pages/FontsPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { SetupPage } from './pages/SetupPage.tsx';
import { TeamPage } from './pages/TeamPage.tsx';
import { TeamsPage } from './pages/TeamsPage.tsx';
import { TransferPage } from './pages/TransferPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';

// Pages behind the sign-in gate share the app's header. Setup, sign-in and choosing a password come before it, at
// the addresses every rcl app sends people to (CORE_PAGES in the web SDK).
// Each is shown only to people holding its permission; the server checks every request anyway (hard rule 5).
const LINKS: readonly AppLink[] = [
  { label: 'Teams', to: '/teams', permission: 'core:teams.read' },
  { label: 'Fonts', to: '/fonts', permission: 'core:fonts.read' },
  // Everyone who may import or export teams may import or export something; the page shows what.
  { label: 'Import / export', to: '/transfer', permission: 'core:teams.manage' },
  { label: 'Users', to: '/users', permission: 'core:users.manage' },
  { label: 'API keys', to: '/api-keys', permission: 'core:api-keys.manage' },
];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <SignInGate>
        <AppLayout title={APP_NAME} links={LINKS} />
      </SignInGate>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'teams/:id', element: <TeamPage /> },
      { path: 'fonts', element: <FontsPage /> },
      { path: 'transfer', element: <TransferPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'api-keys', element: <ApiKeysPage /> },
      { path: '*', element: <PageNotFound /> },
    ],
  },
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
];
