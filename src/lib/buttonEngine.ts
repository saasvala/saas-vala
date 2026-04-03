type Primitive = string | number | boolean | null | undefined;

export type ButtonActionConfig = {
  action: string;
  route?: string;
  api?: string;
  debounceMs?: number;
  throttleMs?: number;
  idempotent?: boolean;
  retries?: number;
  retryBackoffMs?: number;
};

type ExecuteButtonActionOptions<T> = {
  config: ButtonActionConfig;
  run: () => Promise<T> | T;
  onLoadingChange?: (loading: boolean) => void;
  validateResponse?: boolean;
};

const lastTriggeredAt = new Map<string, number>();
const inFlightActions = new Set<string>();
const lastTouchByAction = new Map<string, number>();
const routeSet = new Set<string>();

let soundPlaying = false;

const DEFAULT_DEBOUNCE_MS = 150;
const DEFAULT_THROTTLE_MS = 150;

function isLikelyNetworkError(error: unknown): boolean {
  const message = String((error as { message?: Primitive })?.message || '').toLowerCase();
  return message.includes('network') || message.includes('fetch') || message.includes('timeout') || message.includes('abort');
}

function normalizePath(path: string): string {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function registerKnownRoutes(routes: string[]) {
  routes.forEach((route) => routeSet.add(normalizePath(route)));
}

export function resolveSafeRoute(route: string | undefined, fallback = '/'): string {
  const normalizedFallback = normalizePath(fallback);
  if (!route) return normalizedFallback;
  const normalizedRoute = normalizePath(route);
  if (routeSet.size === 0) return normalizedRoute;
  if (routeSet.has(normalizedRoute)) return normalizedRoute;
  const dynamicCandidate = normalizedRoute.split('/').filter(Boolean);
  const hasPrefixMatch = Array.from(routeSet).some((known) => {
    const knownParts = known.split('/').filter(Boolean);
    if (knownParts.length === 0) return normalizedRoute === '/';
    if (knownParts.length > dynamicCandidate.length) return false;
    return knownParts.every((part, idx) => part.startsWith(':') || part === dynamicCandidate[idx]);
  });
  return hasPrefixMatch ? normalizedRoute : normalizedFallback;
}

export function getButtonInteractionClassName(extra = ''): string {
  return `pointer-events-auto touch-manipulation ${extra}`.trim();
}

export async function playSyncedButtonSound(play: () => Promise<void> | void): Promise<boolean> {
  if (soundPlaying) return false;
  soundPlaying = true;
  try {
    await play();
    return true;
  } finally {
    soundPlaying = false;
  }
}

export async function executeButtonAction<T>({
  config,
  run,
  onLoadingChange,
  validateResponse = true,
}: ExecuteButtonActionOptions<T>): Promise<T | undefined> {
  const actionKey = String(config.action || 'UNKNOWN_ACTION');
  const now = Date.now();
  const debounceMs = Math.max(0, config.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  const throttleMs = Math.max(0, config.throttleMs ?? DEFAULT_THROTTLE_MS);
  const retries = Math.max(0, config.retries ?? 0);
  const retryBackoffMs = Math.max(100, config.retryBackoffMs ?? 1000);
  const lockKey = config.idempotent === false ? `${actionKey}:${now}` : actionKey;
  const lastAt = lastTriggeredAt.get(actionKey) ?? 0;

  if (now - lastAt < debounceMs || now - lastAt < throttleMs) {
    return undefined;
  }
  if (inFlightActions.has(lockKey)) {
    return undefined;
  }

  const traceId = `${actionKey}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  lastTriggeredAt.set(actionKey, now);
  inFlightActions.add(lockKey);
  onLoadingChange?.(true);
  console.log('BTN_CLICK', { button: actionKey, route: config.route ?? null, api: config.api ?? null, traceId });

  let attempt = 0;
  try {
    while (attempt <= retries) {
      try {
        const response = await run();
        if (validateResponse && (response === null || response === undefined)) {
          throw new Error('Empty response');
        }
        window.dispatchEvent(new CustomEvent('button-engine:event', {
          detail: { action: actionKey, route: config.route ?? null, api: config.api ?? null, traceId, result: 'success' },
        }));
        return response;
      } catch (error) {
        if (attempt >= retries || !isLikelyNetworkError(error)) {
          window.dispatchEvent(new CustomEvent('button-engine:event', {
            detail: { action: actionKey, route: config.route ?? null, api: config.api ?? null, traceId, result: 'error', error: String((error as { message?: Primitive })?.message || error) },
          }));
          throw error;
        }
        const delay = retryBackoffMs * (2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
      }
    }
    return undefined;
  } finally {
    inFlightActions.delete(lockKey);
    onLoadingChange?.(false);
  }
}

export function createPressHandlers(handlerId: string, onPress: () => void) {
  return {
    onTouchStart: () => {
      const now = Date.now();
      lastTouchByAction.set(handlerId, now);
      onPress();
    },
    onClick: () => {
      const now = Date.now();
      const lastTouch = lastTouchByAction.get(handlerId) ?? 0;
      if (now - lastTouch < 500) return;
      onPress();
    },
  };
}
