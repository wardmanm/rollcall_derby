import { Alert, Card, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useGetAppsQuery } from '../api.ts';
import { CORE_BASE } from '../base.ts';
import { problemWith } from '../forms.ts';

// rcl-core's home: the app launcher (split spec). It lists the other rcl apps this server hosts that have a web app;
// rcl-core's own pages are in the header.
export function HomePage() {
  const apps = useGetAppsQuery();
  const others = apps.data?.filter((app) => app.url !== null && app.url !== CORE_BASE) ?? [];
  return (
    <Stack maw={880}>
      <Title order={2}>Apps</Title>
      {apps.isLoading && <Loader />}
      {apps.isError && <Alert color="red">{problemWith(apps.error)}</Alert>}
      {apps.data && others.length === 0 && <Text c="dimmed">No other apps are installed on this server.</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        {others.map((app) => (
          // A full page load: each app is its own web app.
          <Card key={app.id} component="a" href={app.url ?? undefined} withBorder>
            <Text fw={600}>{app.title}</Text>
            <Text size="sm" c="dimmed">
              v{app.version}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
