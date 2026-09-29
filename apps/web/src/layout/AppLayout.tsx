import { AppShell, Group, Title } from '@mantine/core';
import { Outlet } from 'react-router';
import { APP_NAME } from '@obs-producer/shared';
import { ServerStatus } from '../components/ServerStatus.tsx';

export function AppLayout() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={1} size="h3">
            {APP_NAME}
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
