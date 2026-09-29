import { Badge, Loader } from '@mantine/core';
import { useGetHealthQuery } from '../store/api.ts';

// Header badge showing whether the obs-producer server answers, re-checked every 10 seconds.
export function ServerStatus() {
  const { data, isLoading, isError } = useGetHealthQuery(undefined, { pollingInterval: 10_000 });
  if (isLoading) return <Loader size="xs" aria-label="Checking server" />;
  if (isError || !data) return <Badge color="red">Server unreachable</Badge>;
  return <Badge color="green">Server v{data.version}</Badge>;
}
