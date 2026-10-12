import { useEffect, type ReactNode } from 'react';
import { Alert, Button, Center, Loader, Stack } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useHref, useLocation } from 'react-router';
import { useGetMeQuery, useGetSetupStatusQuery } from './api.ts';
import { CORE_PAGES, withNext } from './core-pages.ts';
import { apiError } from './errors.ts';
import { useGoTo } from './navigation.ts';

// Shows its pages only to someone signed in who has chosen their own password (split spec). Anyone else goes to
// rcl-core's setup, sign-in or change-password page, which bring them back here afterwards. It only hides pages:
// the server checks every request (hard rule 5).
export function SignInGate({ children }: { children: ReactNode }) {
  const setup = useGetSetupStatusQuery();
  const me = useGetMeQuery(setup.data?.needsSetup === false ? undefined : skipToken);
  const here = useHref(useLocation());
  const goTo = useGoTo();

  const target = setup.data?.needsSetup
    ? CORE_PAGES.setup
    : apiError(me.error)?.code === 'unauthenticated'
      ? withNext(CORE_PAGES.signIn, here)
      : me.data?.mustChangePassword
        ? withNext(CORE_PAGES.changePassword, here)
        : undefined;
  useEffect(() => {
    if (target) goTo(target);
  }, [target, goTo]);

  if (!target && (setup.isError || me.isError)) {
    return (
      <Center mih="100vh">
        <Stack align="center">
          <Alert color="red" title="Can't reach the Rollcall server">
            Check that the server is running and this device is on the venue network.
          </Alert>
          <Button
            onClick={() => {
              void setup.refetch();
              if (setup.data) void me.refetch();
            }}
          >
            Try again
          </Button>
        </Stack>
      </Center>
    );
  }
  if (target || !me.data) {
    return (
      <Center mih="100vh">
        <output aria-label="Checking who's signed in">
          <Loader />
        </output>
      </Center>
    );
  }
  return children;
}
