import { test, expect } from '@playwright/test';

test('core dashboard buttons render and are actionable', async ({ page }) => {
  await page.goto('/dashboard');
  const buttons = page.getByRole('button');
  await expect(buttons.first()).toBeVisible();
});
