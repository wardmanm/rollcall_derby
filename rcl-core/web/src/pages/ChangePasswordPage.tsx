import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Group, Loader, PasswordInput, Stack, Text } from '@mantine/core';
import { useHref, useLocation, useSearchParams } from 'react-router';
import { ChangePasswordRequestSchema } from '@rollcall/core-contract';
import { apiError, CORE_PAGES, safeNext, useGetMeQuery, useGoTo, useLogoutMutation, withNext } from '@rollcall/web-sdk';
import { useChangePasswordMutation } from '../api.ts';
import { fieldErrors, problemWith } from '../forms.ts';
import { AuthCard } from './AuthCard.tsx';

// Changing your own password: by choice from the account menu, or first thing after signing in with a temporary
// password, when nothing else works until it's done. Afterwards it goes back to `next`.
export function ChangePasswordPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const here = useHref(useLocation());
  const me = useGetMeQuery();
  const [changePassword, { isLoading, isSuccess, error }] = useChangePasswordMutation();
  const [logout] = useLogoutMutation();
  const goTo = useGoTo();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', repeat: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const signedOut = apiError(me.error)?.code === 'unauthenticated';
  // Changed: carry on once the server confirms no change is due any more, or the sign-in gate would see the old
  // answer and send you back here.
  const done = isSuccess && !me.isFetching && me.data?.mustChangePassword === false;
  useEffect(() => {
    if (signedOut) goTo(withNext(CORE_PAGES.signIn, here));
    else if (done) goTo(next);
  }, [signedOut, done, goTo, here, next]);

  if (!me.data) {
    return (
      <AuthCard title="Change your password">
        {me.isError && !signedOut ? <Alert color="red">{problemWith(me.error)}</Alert> : <Loader />}
      </AuthCard>
    );
  }
  const forced = me.data.mustChangePassword;
  const username = me.data.username;

  const change = (field: keyof typeof values) => (event: { currentTarget: { value: string } }) =>
    setValues({ ...values, [field]: event.currentTarget.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const request = { currentPassword: values.currentPassword, newPassword: values.newPassword };
    const checked = ChangePasswordRequestSchema.safeParse(request);
    const problems = checked.success ? {} : fieldErrors(checked.error);
    if (values.newPassword.toLowerCase() === username) problems.newPassword ??= 'The password must not be the username';
    if (values.newPassword !== values.repeat) problems.repeat ??= "The passwords don't match";
    setErrors(problems);
    if (!checked.success || Object.keys(problems).length > 0) return;
    await changePassword(checked.data);
  };

  return (
    <AuthCard title={forced ? 'Choose your own password' : 'Change your password'}>
      {forced && <Text>You signed in with a temporary password. Choose your own before you carry on.</Text>}
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack>
          <PasswordInput
            label={forced ? 'Temporary password' : 'Current password'}
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={change('currentPassword')}
            error={errors.currentPassword}
          />
          <PasswordInput
            label="New password"
            description="At least 10 characters, and not your username"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={change('newPassword')}
            error={errors.newPassword}
          />
          <PasswordInput
            label="Repeat new password"
            autoComplete="new-password"
            value={values.repeat}
            onChange={change('repeat')}
            error={errors.repeat}
          />
          {error && (
            <Alert color="red">
              {problemWith(error, {
                wrong_password: forced
                  ? "That isn't the temporary password you signed in with."
                  : "That isn't your current password.",
              })}
            </Alert>
          )}
          <Group justify="space-between">
            {forced ? (
              <Button variant="default" onClick={() => void logout()}>
                Log out
              </Button>
            ) : (
              <Button variant="default" onClick={() => goTo(next)}>
                Cancel
              </Button>
            )}
            <Button type="submit" loading={isLoading}>
              Change password
            </Button>
          </Group>
        </Stack>
      </form>
    </AuthCard>
  );
}
