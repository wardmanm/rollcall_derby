import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useSearchParams } from 'react-router';
import { CORE_PAGES, problemWith, safeNext, useGetSetupStatusQuery, useGoTo } from '@rollcall/web-sdk';
import { useLoginMutation } from '../api.ts';
import { AuthCard } from './AuthCard.tsx';

// Sign-in for every rcl app (split spec). Afterwards it goes back to `next`, the page that sent you here.
export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useGetSetupStatusQuery();
  const [login, { isLoading, error }] = useLoginMutation();
  const goTo = useGoTo();
  const [values, setValues] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (status.data?.needsSetup) goTo(CORE_PAGES.setup);
  }, [status.data, goTo]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (!values.username.trim()) problems.username = 'Enter your username';
    if (!values.password) problems.password = 'Enter your password';
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const result = await login(values);
    if (!result.error) goTo(next);
  };

  return (
    <AuthCard title="Sign in">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Stack>
          <TextInput
            label="Username"
            autoComplete="username"
            value={values.username}
            onChange={(event) => setValues({ ...values, username: event.currentTarget.value })}
            error={errors.username}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            value={values.password}
            onChange={(event) => setValues({ ...values, password: event.currentTarget.value })}
            error={errors.password}
          />
          {error && (
            <Alert color="red">{problemWith(error, { invalid_credentials: 'Wrong username or password.' })}</Alert>
          )}
          <Button type="submit" loading={isLoading}>
            Sign in
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
