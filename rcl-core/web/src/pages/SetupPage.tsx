import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Code, Loader, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { SetupRequestSchema } from '@rollcall/core-contract';
import { CORE_PAGES, fieldErrors, problemWith, useGetSetupStatusQuery, useGoTo } from '@rollcall/web-sdk';
import { useSetupMutation } from '../api.ts';
import { AuthCard } from './AuthCard.tsx';

// First-run setup (users-and-access R2): creates the first Admin, only on the server machine and only while there
// are no accounts. Anywhere else it says where to go instead.
export function SetupPage() {
  const status = useGetSetupStatusQuery();
  const [setup, { isLoading, isSuccess, error }] = useSetupMutation();
  const goTo = useGoTo();
  const [values, setValues] = useState({ username: '', password: '', repeat: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Once the server says it's set up: home for the Admin just created here, else sign-in (set up already, perhaps in
  // another tab). Waiting for the server stops the sign-in gate seeing the old answer and sending them back here.
  useEffect(() => {
    if (status.data && !status.data.needsSetup) goTo(isSuccess ? CORE_PAGES.home : CORE_PAGES.signIn);
  }, [status.data, isSuccess, goTo]);

  if (!status.data?.needsSetup) {
    return (
      <AuthCard title="Set up Rollcall">
        {status.isError ? <Alert color="red">{problemWith(status.error)}</Alert> : <Loader />}
      </AuthCard>
    );
  }

  if (!status.data.canSetupHere) {
    // The server only accepts setup from itself, reached by a localhost name (ADR-0018).
    const port = window.location.port ? `:${window.location.port}` : '';
    return (
      <AuthCard title="Set up Rollcall">
        <Text>
          Rollcall has no accounts yet. Create the first Admin on the server machine: open this address in its browser.
        </Text>
        <Code block>{`http://localhost${port}${CORE_PAGES.setup}`}</Code>
      </AuthCard>
    );
  }

  const change = (field: keyof typeof values) => (event: { currentTarget: { value: string } }) =>
    setValues({ ...values, [field]: event.currentTarget.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = SetupRequestSchema.safeParse({ username: values.username, password: values.password });
    const problems = checked.success ? {} : fieldErrors(checked.error);
    if (values.password !== values.repeat) problems.repeat ??= "The passwords don't match";
    setErrors(problems);
    if (!checked.success || problems.repeat) return;
    await setup(checked.data);
  };

  return (
    <AuthCard title="Create the first Admin">
      <Text>This account can create everyone else&apos;s. Choose a password only you know.</Text>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack>
          <TextInput
            label="Username"
            description="3–32 letters, digits, dots, dashes or underscores"
            autoComplete="username"
            value={values.username}
            onChange={change('username')}
            error={errors.username}
          />
          <PasswordInput
            label="Password"
            description="At least 10 characters"
            autoComplete="new-password"
            value={values.password}
            onChange={change('password')}
            error={errors.password}
          />
          <PasswordInput
            label="Repeat password"
            autoComplete="new-password"
            value={values.repeat}
            onChange={change('repeat')}
            error={errors.repeat}
          />
          {error && (
            <Alert color="red">
              {problemWith(error, { already_set_up: 'Someone has already created the first Admin. Sign in instead.' })}
            </Alert>
          )}
          <Button type="submit" loading={isLoading}>
            Create Admin and sign in
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
