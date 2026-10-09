import { Card, Code, Stack, Text, Title } from '@mantine/core';
import { PRODUCER_BASE } from '../base.ts';

// The Producer app's home until the builders and Live Mode arrive: where to point OBS.
export function HomePage() {
  const overlayUrl = `${window.location.origin}${PRODUCER_BASE}overlay`;
  return (
    <Stack maw={560}>
      <Title order={2}>OBS overlay</Title>
      <Card withBorder>
        <Stack gap="xs">
          <Text>Add this address to OBS as a browser source:</Text>
          <Code block>{overlayUrl}</Code>
        </Stack>
      </Card>
    </Stack>
  );
}
