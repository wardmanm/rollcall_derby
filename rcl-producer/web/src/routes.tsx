import type { RouteObject } from 'react-router';
import { APP_NAME } from '@rollcall/core-contract';
import { AppLayout } from '@rollcall/web-sdk';
import { HomePage } from './pages/HomePage.tsx';

// Theme Builder, Screen Builder and Live Mode pages are added here as they're built.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout title={`${APP_NAME} Producer`} />,
    children: [{ index: true, element: <HomePage /> }],
  },
];
