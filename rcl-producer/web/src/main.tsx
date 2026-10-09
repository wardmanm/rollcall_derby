import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App, makeStore } from '@rollcall/web-sdk';
import { PRODUCER_BASE } from './base.ts';
import { routes } from './routes.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={createBrowserRouter(routes, { basename: PRODUCER_BASE })} store={makeStore()} />
  </StrictMode>,
);
