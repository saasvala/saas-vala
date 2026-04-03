import { test, expect } from '@playwright/test';

test('product flow shell route loads', async ({ page }) => {
  await page.goto('/products');
  await expect(page).not.toHaveURL(/404/);
});

test('keys flow shell route loads', async ({ page }) => {
  await page.goto('/keys');
  await expect(page).not.toHaveURL(/404/);
});

test('servers flow shell route loads', async ({ page }) => {
  await page.goto('/servers');
  await expect(page).not.toHaveURL(/404/);
});

test('reseller flow shell route loads', async ({ page }) => {
  await page.goto('/reseller');
  await expect(page).not.toHaveURL(/404/);
});
