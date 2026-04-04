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

export const APP_ROUTE_PATTERNS = [
  '/',
  '/marketplace',
  '/auth',
  '/login',
  '/signup',
  '/support',
  '/dashboard',
  '/admin/dashboard',
  '/reseller/dashboard',
  '/reseller-dashboard',
  '/product/:id',
  '/category/:macro',
  '/category/:macro/:sub',
  '/category/:macro/:sub/:micro',
  '/cart',
  '/checkout',
  '/success',
  '/keys',
  '/app/:id',
];

const MASTER_ROUTE_REGISTRY: Record<string, boolean> = Object.fromEntries(
  APP_ROUTE_PATTERNS.map((route) => [route, true]),
);

const registeredRoutePatterns = new Set<string>(APP_ROUTE_PATTERNS);

export function registerRoutePatterns(routes: string[]) {
  routes.forEach((route) => registeredRoutePatterns.add(normalizePath(route)));
}

export function matchRoute(route: string | undefined): boolean {
  if (!route) return false;
  const normalized = normalizePath(route);
  for (const pattern of registeredRoutePatterns) {
    if (matchesPattern(normalized, pattern)) return true;
  }
  return false;
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
