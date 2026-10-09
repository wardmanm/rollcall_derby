import { AppShell, Group, Title } from '@mantine/core';
import { Outlet } from 'react-router';
import { ServerStatus } from './ServerStatus.tsx';

export interface AppLayoutProps {
  /** The app's name in the header, such as "Rollcall" or "Rollcall Producer". */
  title: string;
}

// The shell every rcl app's GUI shares: a header with the app's name and the server badge, and the page below.
export function AppLayout({ title }: AppLayoutProps) {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={1} size="h3">
            {title}
          </Title>
          <ServerStatus />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
