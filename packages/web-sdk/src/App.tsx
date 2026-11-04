import { useEffect } from 'react';
import { MantineProvider } from '@mantine/core';
import { setupListeners } from '@reduxjs/toolkit/query/react';
import { Provider } from 'react-redux';
import { RouterProvider, type createBrowserRouter } from 'react-router';
import type { AppStore } from './store.ts';
import { theme } from './theme.ts';

interface AppProps {
  router: ReturnType<typeof createBrowserRouter>;
  store: AppStore;
}

// Providers for an rcl app's GUI. Its main.tsx passes a browser router; tests pass a memory router.
export function App({ router, store }: AppProps) {
  // Tells RTK Query when this tab comes back into view, so queries that ask to (who's signed in, in the sign-in gate)
  // are fetched again. The listeners go when the app does.
  useEffect(() => setupListeners(store.dispatch), [store]);
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </MantineProvider>
  );
}
