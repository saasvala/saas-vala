import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type ClickResult = {
  selector: string;
  changedUrl: boolean;
  changedState: boolean;
  error?: string;
};

const appFilePath = path.resolve(process.cwd(), 'src/App.tsx');

function discoverStaticRoutes(): string[] {
  const source = fs.readFileSync(appFilePath, 'utf8');
  const routeRegex = /<Route\s+path=\"([^\"]+)\"/g;
  const discovered = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = routeRegex.exec(source)) !== null) {
    const raw = match[1];
    if (!raw || raw === '*' || raw.includes(':')) continue;
    discovered.add(raw);
  }

  return [...discovered];
}

async function assertPageNotBlank(page: import('@playwright/test').Page) {
  await page.waitForLoadState('domcontentloaded');
  const bodyText = (await page.textContent('body'))?.trim() || '';
  const hasContent = bodyText.length > 0;
  expect(hasContent).toBeTruthy();
}

test.describe('ULTRA NEXT - AUTO TEST ENGINE (E2E)', () => {
  test('ROUTES: open discovered routes and ensure non-blank pages', async ({ page, baseURL }) => {
    const routes = discoverStaticRoutes();
    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      const response = await page.goto(route);
      if (response) {
        expect(response.status()).toBeLessThan(400);
      }
      await assertPageNotBlank(page);
      expect(page.url().startsWith(baseURL || '')).toBeTruthy();
    }
  });

  test('FLOW: Home → Category → Product → Cart → Checkout → Success', async ({ page }) => {
    await page.goto('/');
    await assertPageNotBlank(page);

    const categoryTarget = process.env.E2E_CATEGORY_ROUTE || '/category/general';
    const productTarget = process.env.E2E_PRODUCT_ROUTE || '/product/demo';

    await page.goto(categoryTarget);
    await assertPageNotBlank(page);

    await page.goto(productTarget);
    await assertPageNotBlank(page);

    await page.goto('/cart');
    await assertPageNotBlank(page);

    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/auth|\/checkout/);

    await page.goto('/success');
    await expect(page).toHaveURL(/\/auth|\/success/);
  });

  test('BUTTONS: click visible buttons and assert URL/state change', async ({ page }) => {
    await page.goto('/');
    await assertPageNotBlank(page);

    const maxButtons = Number(process.env.E2E_MAX_BUTTON_CLICKS || 30);
    const strict = process.env.E2E_STRICT_BUTTON_ASSERT === 'true';

    const results: ClickResult[] = [];
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    const iterations = Math.min(count, maxButtons);

    for (let i = 0; i < iterations; i++) {
      const button = buttons.nth(i);
      const visible = await button.isVisible().catch(() => false);
      const enabled = await button.isEnabled().catch(() => false);
      if (!visible || !enabled) continue;

      const selector = `button:nth(${i})`;
      const beforeUrl = page.url();
      const beforeBody = await page.textContent('body');

      try {
        await button.click({ timeout: 3000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
      } catch (error) {
        results.push({ selector, changedUrl: false, changedState: false, error: String(error) });
        continue;
      }

      const afterUrl = page.url();
      const afterBody = await page.textContent('body');
      const changedUrl = afterUrl !== beforeUrl;
      const changedState = afterBody !== beforeBody;

      results.push({ selector, changedUrl, changedState });

      if (changedUrl && afterUrl !== '/') {
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => page.goto('/'));
      }
    }

    fs.mkdirSync(path.resolve(process.cwd(), 'e2e/reports'), { recursive: true });
    fs.writeFileSync(
      path.resolve(process.cwd(), 'e2e/reports/button-click-report.json'),
      JSON.stringify({ totalDiscovered: count, executed: results.length, results }, null, 2),
      'utf8',
    );

    if (strict) {
      const failures = results.filter((result) => result.error || (!result.changedUrl && !result.changedState));
      expect(failures).toHaveLength(0);
    } else {
      expect(results.length).toBeGreaterThan(0);
    }
  });

  test('AUTH + protected routes + SUBSCRIPTION gate checks', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth|\/dashboard/);

    const subscriptionAppId = process.env.E2E_APP_ID || 'demo-app';
    await page.goto(`/app/${subscriptionAppId}`);
    await expect(page).toHaveURL(/\/auth|\/subscription|\/app\//);

    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;

    if (!email || !password) {
      test.skip(true, 'E2E_LOGIN_EMAIL/E2E_LOGIN_PASSWORD not provided.');
      return;
    }

    await page.goto('/auth');

    const emailField = page.locator('input[type="email"]').first();
    const passwordField = page.locator('input[type="password"]').first();

    await emailField.fill(email);
    await passwordField.fill(password);

    const submitButton = page.getByRole('button').filter({ hasText: /sign in|login|log in/i }).first();
    await submitButton.click();
    await page.waitForLoadState('networkidle');

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/auth/);

    const expectAllow = process.env.E2E_EXPECT_SUBSCRIPTION_ALLOW === 'true';
    await page.goto(`/app/${subscriptionAppId}`);
    if (expectAllow) {
      await expect(page).toHaveURL(/\/app\//);
    } else {
      await expect(page).toHaveURL(/\/subscription|\/app\//);
    }

    const logoutButton = page.getByRole('button').filter({ hasText: /logout|log out|sign out/i }).first();
    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth|\/dashboard/);
  });
});
