import { Alert, Anchor, Stack } from '@mantine/core';
import { Link } from 'react-router';

// For an address inside an app that matches none of its pages (the server sends every path below an app's base to
// its index.html, so the app's router decides).
export function PageNotFound() {
  return (
    <Stack maw={560}>
      <Alert color="gray" title="There's no page at this address">
        <Anchor component={Link} to="/">
          Go to this app&apos;s home page
        </Anchor>
      </Alert>
    </Stack>
  );
}
