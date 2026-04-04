import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

const normalizePath = (value: string) => {
  const [pathOnly] = String(value || '').split(/[?#]/, 1);
  const trimmed = pathOnly.trim();
  if (!trimmed) return '/';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.length > 1 ? withLeading.replace(/\/+$/, '') : withLeading;
};

const toSegments = (value: string) => normalizePath(value).split('/').filter(Boolean);

const matchesPattern = (candidate: string, pattern: string) => {
  const candidateSegments = toSegments(candidate);
  const patternSegments = toSegments(pattern);
  if (candidateSegments.length !== patternSegments.length) return false;
  return patternSegments.every((segment, index) => segment.startsWith(':') || segment === candidateSegments[index]);
};

export const MASTER_ROUTE_REGISTRY: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/signup': true,
  '/dashboard': true,
  '/reseller/dashboard': true,
  '/admin/dashboard': true,
  '/product/:id': true,
  '/category/:macro/:sub/:micro': true,
  '/cart': true,
  '/checkout': true,
  '/success': true,
};

const registeredRoutePatterns = new Set<string>(Object.keys(MASTER_ROUTE_REGISTRY));

export function registerRoutePatterns(routes: string[]) {
  routes.forEach((route) => registeredRoutePatterns.add(normalizePath(route)));
}

export function matchRoute(route: string | undefined): boolean {
  if (!route) return false;
  const normalized = normalizePath(route);
  return Array.from(registeredRoutePatterns).some((pattern) => matchesPattern(normalized, pattern));
}

export function resolveSafeRoute(route: string | undefined, fallback = '/') {
  const normalizedFallback = normalizePath(fallback);
  if (!route) return normalizedFallback;
  const normalizedRoute = normalizePath(route);
  return matchRoute(normalizedRoute) ? normalizedRoute : normalizedFallback;
}

export function safeNavigate(
  navigate: NavigateFunction,
  route: To | number | undefined,
  options?: NavigateOptions,
  fallback = '/',
) {
  if (typeof route === 'number') {
    navigate(route);
    return;
  }
  const safeRoute = resolveSafeRoute(typeof route === 'string' ? route : undefined, fallback);
  navigate(safeRoute, options);
}
