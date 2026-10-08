import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { routes } from './routes.tsx';
import { makeStore } from './store/store.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={createBrowserRouter(routes)} store={makeStore()} />
  </StrictMode>,
);
