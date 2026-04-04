import { describe, expect, test } from 'vitest';
import { matchRoute, resolveSafeRoute } from '@/lib/routeRegistry';

describe('routeRegistry', () => {
  test('matches dynamic product route', () => {
    expect(matchRoute('/product/123')).toBe(true);
  });

  test('matches dynamic category route', () => {
    expect(matchRoute('/category/a/b/c')).toBe(true);
  });

  test('returns fallback for unknown routes', () => {
    expect(resolveSafeRoute('/unknown-route', '/')).toBe('/');
  });

  test('returns fallback for empty route', () => {
    expect(resolveSafeRoute('', '/')).toBe('/');
    expect(resolveSafeRoute(undefined, '/')).toBe('/');
  });

  test('strips query/hash during matching', () => {
    expect(resolveSafeRoute('/checkout?x=1#ok', '/')).toBe('/checkout');
  });
});
