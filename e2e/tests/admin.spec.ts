import { expect, test } from '@playwright/test';

test('the admin app lives at /core/, where / takes you, and shows a reachable server', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/core\/$/);
  await expect(page.getByRole('heading', { name: 'Rollcall' })).toBeVisible();
  await expect(page.getByText(/^Server v\d+\.\d+\.\d+/)).toBeVisible();
});
