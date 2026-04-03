import { test, expect } from '@playwright/test';

const routes = [
  // Public
  '/marketplace',
  '/product/test123',
  '/search',
  '/login',
  '/signup',
  // User
  '/dashboard',
  '/wallet',
  '/cart',
  '/checkout',
  '/orders',
  '/app/test123',
  // Reseller
  '/reseller/dashboard',
  '/reseller/wallet',
  '/reseller/leads',
  '/reseller/keys',
  '/reseller/products',
  // Admin
  '/admin',
  '/admin/marketplace',
  '/admin/products',
  '/admin/orders',
  '/admin/keys',
  '/admin/servers',
  '/admin/seo',
  '/admin/ai',
  '/admin/resellers',
];

test.describe('route coverage', () => {
  for (const route of routes) {
    test(`open ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(route);
      await expect(page).not.toHaveURL(/404/);
      expect(errors, `console errors on ${route}`).toEqual([]);
    });
  }

  test('unknown route redirects to marketplace', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page).toHaveURL(/\/marketplace$/);
  });
});
