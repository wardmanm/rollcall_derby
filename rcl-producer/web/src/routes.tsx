import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout, PageNotFound, SignInGate, type AppLink } from '@rollcall/web-sdk';
import { HomePage } from './pages/HomePage.tsx';
import { ThemePage } from './pages/ThemePage.tsx';
import { ThemesPage } from './pages/ThemesPage.tsx';

// Every page is behind the sign-in gate, which sends people to rcl-core's sign-in page and back. The OBS overlay is a
// separate entry (overlay.html), so it stays public. Screen Builder and Live Mode are added here.
// Each link is shown only to people holding its permission; the server checks every request anyway (hard rule 5).
const LINKS: readonly AppLink[] = [{ label: 'Themes', to: '/themes', permission: 'producer:themes.read' }];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <SignInGate>
        <AppLayout title={`${APP_NAME} Producer`} links={LINKS} />
      </SignInGate>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'themes', element: <ThemesPage /> },
      { path: 'themes/:id', element: <ThemePage /> },
      { path: '*', element: <PageNotFound /> },
    ],
  },
];
