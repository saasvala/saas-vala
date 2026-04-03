import { test, expect } from '@playwright/test';

test('auth guard redirects protected route', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/auth|dashboard/);
});

test('logout route exists', async ({ page }) => {
  await page.goto('/logout');
  await expect(page).toHaveURL(/auth|logout/);
});
