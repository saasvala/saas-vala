import { useCallback, useRef, useState } from 'react';

type ButtonActionConfig = {
  action: string;
  button?: string;
  route?: string;
  api?: string;
  debounce?: number;
  idempotent?: boolean;
  retries?: number;
};

type ButtonActionContext = {
  traceId: string;
  attempt: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const makeTraceId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function useButtonEngine() {
  const [processingActions, setProcessingActions] = useState<Record<string, boolean>>({});
  const lastRunRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  const isProcessing = useCallback(
    (key: string) => Boolean(processingActions[key]),
    [processingActions],
  );

  const runAction = useCallback(
    async <T>(
      config: ButtonActionConfig,
      executor: (ctx: ButtonActionContext) => Promise<T>,
    ): Promise<{ ok: boolean; response?: T; error?: Error; skipped?: 'debounce' | 'processing' }> => {
      const key = config.action;
      const now = Date.now();
      const debounceMs = Math.max(0, Number(config.debounce ?? 200));
      const idempotent = config.idempotent !== false;
      const lastRun = lastRunRef.current.get(key) ?? 0;
      if (now - lastRun < debounceMs) {
        return { ok: false, skipped: 'debounce' };
      }
      if (idempotent && inFlightRef.current.has(key)) {
        return { ok: false, skipped: 'processing' };
      }

      lastRunRef.current.set(key, now);
      inFlightRef.current.add(key);
      setProcessingActions((prev) => ({ ...prev, [key]: true }));

      const traceId = makeTraceId();
      const button = config.button || config.action;
      const route = config.route || window.location.pathname;
      const api = config.api || null;
      console.log('BTN_CLICK', { button, route, api, traceId });

      const maxAttempts = Math.max(1, Number(config.retries ?? 0) + 1);
      let lastError: Error | undefined;
      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const response = await executor({ traceId, attempt });
            if (!response) throw new Error('Empty response');
            window.dispatchEvent(new CustomEvent('button:action:success', { detail: { action: key, traceId, route, api } }));
            return { ok: true, response };
          } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown button action error');
            const message = String(lastError.message || '').toLowerCase();
            const retryable = message.includes('network') || message.includes('fetch') || message.includes('timeout');
            if (attempt >= maxAttempts || !retryable) break;
            await wait(attempt === 1 ? 1000 : attempt === 2 ? 2000 : 4000);
          }
        }
        window.dispatchEvent(new CustomEvent('button:action:error', { detail: { action: key, traceId, route, api, error: lastError?.message || 'Unknown error' } }));
        return { ok: false, error: lastError || new Error('Action failed') };
      } finally {
        inFlightRef.current.delete(key);
        setProcessingActions((prev) => ({ ...prev, [key]: false }));
      }
    },
    [],
  );

  return {
    runAction,
    isProcessing,
  };
}
