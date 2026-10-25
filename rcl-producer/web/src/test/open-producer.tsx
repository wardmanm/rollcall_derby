import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { App, makeStore } from '@rollcall/web-sdk';
import { PRODUCER_BASE } from '../base.ts';
import { routes } from '../routes.tsx';

/** The Producer app opened at `url` (such as `/producer/themes`), as a browser would. Returns its router. */
export function openProducer(url: string) {
  const router = createMemoryRouter(routes, { basename: PRODUCER_BASE, initialEntries: [url] });
  render(<App router={router} store={makeStore()} />);
  return router;
}

/** Where the app is now, such as `/producer/themes/t1`. */
export const whereIs = (router: ReturnType<typeof openProducer>) => router.state.location.pathname;
