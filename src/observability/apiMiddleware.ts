import { observability } from '@/observability/logger';
import { metrics } from '@/observability/metrics';

export function createApiMiddleware(route: string, userId?: string) {
  const started = Date.now();
  const reqId = observability.request('api_request', { route, userId });
  metrics.increment('requests');

  return {
    success() {
      const latency = Date.now() - started;
      metrics.timing('api_latency', latency);
      observability.audit('api_success', { route, userId, reqId, latency });
    },
    failure(error: unknown) {
      const latency = Date.now() - started;
      metrics.increment('errors');
      metrics.timing('api_latency', latency);
      observability.error('api_failure', { route, userId, reqId, latency, error: error instanceof Error ? error.message : String(error) });
    },
  };
}
