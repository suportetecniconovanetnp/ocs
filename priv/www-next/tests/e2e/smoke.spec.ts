import { test, expect } from '@playwright/test';

test('dashboard loads and renders nav', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /subscribers/i })).toBeVisible();
});

test('navigates to subscribers list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /subscribers/i }).click();
  await expect(page).toHaveURL(/\/subscribers$/);
});
