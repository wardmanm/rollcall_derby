import { expect, test } from '@playwright/test';

test('the Producer app shows its shell, a reachable server and where to point OBS', async ({ page, baseURL }) => {
  await page.goto('/producer/');
  await expect(page.getByRole('heading', { name: 'Rollcall Producer' })).toBeVisible();
  await expect(page.getByText(/^Server v\d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText(`${baseURL}/producer/overlay`)).toBeVisible();
});
