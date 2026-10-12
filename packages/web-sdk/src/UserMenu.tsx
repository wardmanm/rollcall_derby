import { Badge, Button, Group, Menu, Text } from '@mantine/core';
import { useHref, useLocation } from 'react-router';
import { useGetMeQuery, useLogoutMutation } from './api.ts';
import { CORE_PAGES, withNext } from './core-pages.ts';
import { useGoTo } from './navigation.ts';
import { ROLE_NAMES } from './roles.ts';

// Who's signed in, with their role, and the account actions every rcl app offers. The button's name is its visible
// text ("admin Admin"), as screen readers expect; Mantine marks it as opening a menu.
export function UserMenu() {
  const { data: me } = useGetMeQuery();
  const [logout] = useLogoutMutation();
  const here = useHref(useLocation());
  const goTo = useGoTo();
  if (!me) return null;
  return (
    // No focus placeholder: opening the menu focuses its first item, as the ARIA menu pattern expects, and axe
    // refuses the placeholder (a focusable element with role="presentation").
    <Menu position="bottom-end" withInitialFocusPlaceholder={false}>
      <Menu.Target>
        <Button variant="subtle">
          <Group gap="xs">
            <Text size="sm">{me.username}</Text>
            <Badge variant="light">{ROLE_NAMES[me.role]}</Badge>
          </Group>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => goTo(CORE_PAGES.home)}>All apps</Menu.Item>
        <Menu.Item onClick={() => goTo(withNext(CORE_PAGES.changePassword, here))}>Change password</Menu.Item>
        <Menu.Item onClick={() => void logout()}>Log out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
