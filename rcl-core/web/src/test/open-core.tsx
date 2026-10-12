import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App, makeStore } from '@rollcall/web-sdk';
import { CORE_BASE } from '../base.ts';
import { routes } from '../routes.tsx';

/** rcl-core's web app opened at `url` (such as `/core/users`), as a browser would. Returns its router. */
export function openCore(url: string) {
  const router = createMemoryRouter(routes, { basename: CORE_BASE, initialEntries: [url] });
  render(<App router={router} store={makeStore()} />);
  return router;
}

/** Where the app is now, such as `/core/login?next=%2Fcore%2F`. */
export const whereIs = (router: ReturnType<typeof openCore>) =>
  `${router.state.location.pathname}${router.state.location.search}`;
