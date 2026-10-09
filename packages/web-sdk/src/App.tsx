import { MantineProvider } from '@mantine/core';
import { Provider } from 'react-redux';
import { RouterProvider, type createBrowserRouter } from 'react-router';
import type { AppStore } from './store.ts';

interface AppProps {
  router: ReturnType<typeof createBrowserRouter>;
  store: AppStore;
}

// Providers for an rcl app's GUI. Its main.tsx passes a browser router; tests pass a memory router.
export function App({ router, store }: AppProps) {
  return (
    <MantineProvider defaultColorScheme="auto">
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </MantineProvider>
  );
}
