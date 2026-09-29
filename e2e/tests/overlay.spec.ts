import { expect, test } from '@playwright/test';

// The OBS output page (ADR-0006): transparent, lean, and fed live by the server.
test.describe('overlay', () => {
  test('shows live server info on a transparent page', async ({ page }) => {
    await page.goto('/overlay');
    await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
    const backgrounds = await page.evaluate(() => [
      getComputedStyle(document.documentElement).backgroundColor,
      getComputedStyle(document.body).backgroundColor,
    ]);
    expect(backgrounds).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  });

  test('loads no Mantine styles', async ({ page }) => {
    await page.goto('/overlay');
    await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
    const mantineVariable = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--mantine-color-body'),
    );
    expect(mantineVariable).toBe('');
  });

  test('also answers below /overlay, where output URLs will live', async ({ page }) => {
    await page.goto('/overlay/some-output-token');
    await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  });
});
