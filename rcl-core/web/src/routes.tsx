import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout, PageNotFound, SignInGate } from '@rollcall/web-sdk';
import { ChangePasswordPage } from './pages/ChangePasswordPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { SetupPage } from './pages/SetupPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';

// Pages behind the sign-in gate share the app's header. Setup, sign-in and choosing a password come before it, at
// the addresses every rcl app sends people to (CORE_PAGES in the web SDK). Teams is added here when it's built.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <SignInGate>
        <AppLayout title={APP_NAME} links={[{ label: 'Users', to: '/users', permission: 'core:users.manage' }]} />
      </SignInGate>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'users', element: <UsersPage /> },
      { path: '*', element: <PageNotFound /> },
    ],
  },
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password', element: <ChangePasswordPage /> },
];
