import { AppShell, Anchor, Group, Title } from '@mantine/core';
import { Link, Outlet } from 'react-router';
import { useGetMeQuery } from './api.ts';
import { ServerStatus } from './ServerStatus.tsx';
import { UserMenu } from './UserMenu.tsx';

export interface AppLink {
  label: string;
  /** A path in this app's router, such as `/users`. */
  to: string;
  /** Shown only to people whose role holds this permission. The server still checks every request. */
  permission?: string;
}

export interface AppLayoutProps {
  /** The app's name in the header, such as "Rollcall" or "Rollcall Producer". */
  title: string;
  /** Links to the app's pages, in the header. */
  links?: readonly AppLink[];
}

// The shell every rcl app's GUI shares, inside the sign-in gate: the app's name (linking to its home), its links, the
// server badge and the account menu, with the page below.
const NO_LINKS: readonly AppLink[] = [];

export function AppLayout({ title, links = NO_LINKS }: AppLayoutProps) {
  const { data: me } = useGetMeQuery();
  const shown = links.filter((link) => !link.permission || me?.permissions.includes(link.permission));
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="lg">
            <Anchor component={Link} to="/" underline="never" c="inherit">
              <Title order={1} size="h3">
                {title}
              </Title>
            </Anchor>
            {shown.map((link) => (
              <Anchor key={link.to} component={Link} to={link.to}>
                {link.label}
              </Anchor>
            ))}
          </Group>
          <Group gap="sm">
            <ServerStatus />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
