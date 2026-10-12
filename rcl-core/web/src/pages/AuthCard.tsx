import type { ReactNode } from 'react';
import { Center, Paper, Stack, Text, Title } from '@mantine/core';
import { APP_NAME } from '@rollcall/core-contract';

// The frame for the pages people see before they're fully signed in (setup, sign-in, choosing a password): centred,
// without the app's header.
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={420}>
        <Stack>
          <div>
            <Text c="dimmed" size="sm">
              {APP_NAME}
            </Text>
            <Title order={1} size="h2">
              {title}
            </Title>
          </div>
          {children}
        </Stack>
      </Paper>
    </Center>
  );
}
