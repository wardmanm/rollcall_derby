import { Badge, Loader } from '@mantine/core';
import { useGetHealthQuery } from '../store/api.ts';

// Header badge showing whether the obs-producer server answers, re-checked every 10 seconds.
export function ServerStatus() {
  const { data, isLoading, isError } = useGetHealthQuery(undefined, { pollingInterval: 10_000 });
  // `<output>` carries the "Checking server" name: Mantine's Loader renders a plain span, which can't take
  // aria-label without a role, and Oxlint's jsx-a11y rule wants `<output>` over a bare `role="status"`.
  if (isLoading)
    return (
      <output aria-label="Checking server">
        <Loader size="xs" />
      </output>
    );
  // Mantine's darkest red/green swatches (red.9, green.9) still fall short of 4.5:1 contrast with white text;
  // these hexes clear it while keeping the same red-for-trouble, green-for-ok meaning.
  if (isError || !data)
    return (
      <Badge color="#b71c1c" variant="filled">
        Server unreachable
      </Badge>
    );
  return (
    <Badge color="#1b5e20" variant="filled">
      Server v{data.version}
    </Badge>
  );
}
