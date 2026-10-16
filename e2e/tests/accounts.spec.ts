import { expect, test, type Page } from '@playwright/test';

// Accounts on a fresh install (users-and-access R1–R4), in order: each step needs the one before. Each run starts
// from an empty data folder (playwright.config.ts), so the first step always finds first-run setup. Each test has its
// own browser, so it signs in for itself.
test.describe.configure({ mode: 'serial' });

const ADMIN = { username: 'admin', password: 'admin password 1' };
const PRODUCER = { username: 'producer1', password: 'producer password 1' };
let temporaryPassword = '';

// Request options sending `key` the way a device or script does.
const withKey = (key: string) => ({ headers: { authorization: `Bearer ${key}` } });

async function signIn(page: Page, { username, password }: { username: string; password: string }) {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('a fresh install opens first-run setup, which creates the first Admin and signs them in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/core\/setup$/);
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Repeat password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create Admin and sign in' }).click();
  await expect(page).toHaveURL(/\/core\/$/);
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await expect(page.getByText(/^Server v\d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Rollcall Producer/ })).toHaveAttribute('href', '/producer/');
});

test('another app sends you to sign in and back, and logging out there asks you to sign in again', async ({
  page,
  baseURL,
}) => {
  await page.goto('/producer/');
  await expect(page).toHaveURL(/\/core\/login\?next=%2Fproducer%2F$/);
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/producer\/$/);
  await expect(page.getByText(`${baseURL}/producer/overlay`)).toBeVisible();
  await page.getByRole('button', { name: 'admin Admin' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/core\/login\?next=%2Fproducer%2F$/);
  await page.goto('/core/');
  await expect(page).toHaveURL(/\/core\/login\?next=%2Fcore%2F$/);
});

test('an Admin creates a Producer, and sees their temporary password once', async ({ page }) => {
  await page.goto('/core/users');
  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByLabel('Username').fill(PRODUCER.username);
  await page.getByLabel('Role', { exact: true }).selectOption('producer');
  await page.getByRole('button', { name: 'Create' }).click();
  const dialog = page.getByRole('dialog', { name: `Temporary password for ${PRODUCER.username}` });
  temporaryPassword = await dialog.getByLabel('Temporary password').inputValue();
  expect(temporaryPassword).toMatch(/^.{20}$/);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('row', { name: new RegExp(PRODUCER.username) })).toContainText('Temporary password');
});

test('the Producer must choose a password first, then reaches the Producer app but not user management', async ({
  page,
  baseURL,
}) => {
  await page.goto('/producer/');
  await expect(page).toHaveURL(/\/core\/login\?next=%2Fproducer%2F$/);
  await signIn(page, { username: PRODUCER.username, password: temporaryPassword });
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  await page.getByLabel('Temporary password').fill(temporaryPassword);
  await page.getByLabel('New password', { exact: true }).fill(PRODUCER.password);
  await page.getByLabel('Repeat new password').fill(PRODUCER.password);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/producer\/$/);
  await expect(page.getByRole('heading', { name: 'Rollcall Producer' })).toBeVisible();
  await expect(page.getByText(`${baseURL}/producer/overlay`)).toBeVisible();

  await page.goto('/core/');
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  // Hiding the link is only for convenience: the server refuses anyway.
  expect((await page.request.get('/api/core/users')).status()).toBe(403);
});

test('an Admin creates an API key: it works for a device, never as the Admin, and stops when revoked', async ({
  page,
}) => {
  await page.goto('/core/api-keys');
  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible();
  await page.getByLabel('Name').fill('Companion');
  await page.getByRole('button', { name: 'Create key' }).click();
  const dialog = page.getByRole('dialog', { name: 'API key: Companion' });
  const key = await dialog.getByLabel('API key').inputValue();
  expect(key).toMatch(/^rcl_[\w-]{43}$/);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('row', { name: /Companion/ })).toContainText(`${key.slice(0, 8)}…`);

  // This page's requests carry the Admin's session cookie too: with a key, the cookie is ignored.
  expect((await page.request.get('/api/core/health', withKey(key))).status()).toBe(200);
  expect((await page.request.get('/api/core/users', withKey(key))).status()).toBe(403);
  expect((await page.request.get('/api/core/users', withKey('rcl_made-up'))).status()).toBe(401);

  await page.getByRole('button', { name: 'Actions for Companion' }).click();
  await page.getByRole('menuitem', { name: 'Revoke' }).click();
  await page.getByRole('dialog', { name: 'Revoke Companion?' }).getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('No API keys yet.')).toBeVisible();
  expect((await page.request.get('/api/core/users', withKey(key))).status()).toBe(401);
});
