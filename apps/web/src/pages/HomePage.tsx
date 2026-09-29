import { Card, Stack, Text, Title } from '@mantine/core';
import { useGetHealthQuery } from '../store/api.ts';

export function HomePage() {
  const { data } = useGetHealthQuery();
  return (
    <Stack maw={560}>
      <Title order={2}>Server</Title>
      <Card withBorder>
        {data ? (
          <Text>
            {data.name} v{data.version}, up {Math.round(data.uptimeSeconds)}s
          </Text>
        ) : (
          <Text c="dimmed">Waiting for the server…</Text>
        )}
      </Card>
    </Stack>
  );
}
