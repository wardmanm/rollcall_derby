import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout, PageNotFound, SignInGate } from '@rollcall/web-sdk';
import { HomePage } from './pages/HomePage.tsx';

// Every page is behind the sign-in gate, which sends people to rcl-core's sign-in page and back. The OBS overlay is a
// separate entry (overlay.html), so it stays public. Theme Builder, Screen Builder and Live Mode are added here.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <SignInGate>
        <AppLayout title={`${APP_NAME} Producer`} />
      </SignInGate>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <PageNotFound /> },
    ],
  },
];
