import type { RouteObject } from 'react-router';
import { AppLayout } from './layout/AppLayout.tsx';
import { HomePage } from './pages/HomePage.tsx';

// Feature pages (Teams, Themes, Screens, Live Mode) are added here as they're built.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [{ index: true, element: <HomePage /> }],
  },
];
