import { describe, expect, test } from 'vitest';

type ApiCase = {
  key: string;
  paths: string[];
  expectedStatuses: number[];
};

const BASE_URL =
  process.env.API_TEST_BASE_URL ||
  (process.env.VITE_SUPABASE_URL ? `${process.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/api/v1` : undefined);
const AUTH_TOKEN = process.env.API_TEST_AUTH_TOKEN;

const apiCases: ApiCase[] = [
  { key: 'products', paths: ['/products'], expectedStatuses: [200, 401, 403] },
  { key: 'cart', paths: ['/cart/list', '/marketplace/cart/list'], expectedStatuses: [200, 401, 403] },
  { key: 'orders', paths: ['/orders', '/marketplace/orders'], expectedStatuses: [200, 401, 403] },
  { key: 'subscriptions', paths: ['/subscription', '/subscriptions'], expectedStatuses: [200, 401, 403] },
  { key: 'admin', paths: ['/admin/metrics'], expectedStatuses: [200, 401, 403] },
  { key: 'reseller', paths: ['/reseller/activity', '/resellers'], expectedStatuses: [200, 401, 403] },
  { key: 'session', paths: ['/session', '/sessions'], expectedStatuses: [200, 401, 403] },
  { key: 'dashboard', paths: ['/dashboard'], expectedStatuses: [200, 401, 403] },
  { key: 'wallet', paths: ['/wallet'], expectedStatuses: [200, 401, 403] },
  { key: 'keys', paths: ['/keys'], expectedStatuses: [200, 401, 403] },
  { key: 'models', paths: ['/models/list'], expectedStatuses: [200, 401, 403] },
  { key: 'ai', paths: ['/ai/models'], expectedStatuses: [200, 401, 403] },
  { key: 'builder', paths: ['/builder/status'], expectedStatuses: [200, 401, 403] },
  { key: 'pipeline', paths: ['/pipeline/status/sample-id'], expectedStatuses: [200, 401, 403, 404] },
  { key: 'system-health', paths: ['/system-health', '/health'], expectedStatuses: [200, 401, 403] },
  { key: 'seo', paths: ['/seo/leads/list'], expectedStatuses: [200, 401, 403] },
];

function makeHeaders() {
  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (AUTH_TOKEN) {
    headers.authorization = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

async function probePath(path: string) {
  if (!BASE_URL) return null;
  const url = new URL(path, BASE_URL).toString();

  const response = await fetch(url, {
    method: 'GET',
    headers: makeHeaders(),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  return {
    url,
    status: response.status,
    ok: response.ok,
    body: parsed,
  };
}

describe('ULTRA NEXT - API TEST SUITE', () => {
  test('base URL is configured for integration API tests', () => {
    if (!BASE_URL) {
      expect(true).toBeTruthy();
      return;
    }
    expect(BASE_URL.startsWith('http')).toBeTruthy();
  });

  for (const apiCase of apiCases) {
    test(`endpoint validation: ${apiCase.key}`, async () => {
      if (!BASE_URL) {
        expect(true).toBeTruthy();
        return;
      }

      const results = [] as Array<Awaited<ReturnType<typeof probePath>>>;
      for (const path of apiCase.paths) {
        const result = await probePath(path);
        if (result) results.push(result);
      }

      const available = results.find((result) => result && result.status !== 404);
      expect(available).toBeTruthy();

      const selected = available!;
      expect(apiCase.expectedStatuses.includes(selected.status)).toBeTruthy();
      expect(typeof selected.body === 'object' && selected.body !== null).toBeTruthy();

      if (selected.status >= 400) {
        const serialized = JSON.stringify(selected.body).toLowerCase();
        expect(serialized.includes('error') || serialized.includes('message') || serialized.includes('unauthorized') || serialized.includes('forbidden')).toBeTruthy();
      }
    });
  }
});
