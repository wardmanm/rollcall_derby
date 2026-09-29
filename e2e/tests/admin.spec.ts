import { expect, test } from '@playwright/test';

test('the admin app shows its shell and a reachable server', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OBS Producer' })).toBeVisible();
  await expect(page.getByText(/^Server v\d+\.\d+\.\d+/)).toBeVisible();
});
