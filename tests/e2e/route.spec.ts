import { test, expect } from '@playwright/test';

const routes = [
  '/dashboard',
  '/products',
  '/products/create',
  '/products/upload',
  '/keys',
  '/keys/generate',
  '/servers',
  '/servers/deploy',
  '/ai',
  '/ai/chat',
  '/ai/apis',
  '/builder',
  '/billing/credits',
  '/logout',
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
});
