import { observability } from '@/observability/logger';
import { metrics } from '@/observability/metrics';
import { writeAuditEvent } from '@/observability/auditClient';

export function createApiMiddleware(route: string, userId?: string) {
  const started = Date.now();
  const reqId = observability.request('api_request', { route, userId });
  metrics.increment('requests');
  void writeAuditEvent({
    eventCategory: 'API',
    eventType: 'request',
    action: 'read',
    actorId: userId ?? null,
    targetTable: 'api',
    targetId: reqId,
    metadata: { route, reqId },
    ingestSource: 'api_middleware',
    isSystem: true,
  });

  return {
    success() {
      const latency = Date.now() - started;
      metrics.timing('api_latency', latency);
      observability.audit('api_success', { route, userId, reqId, latency });
      void writeAuditEvent({
        eventCategory: 'API',
        eventType: 'response',
        action: 'read',
        actorId: userId ?? null,
        targetTable: 'api',
        targetId: reqId,
        metadata: { route, reqId, latency, status: 'success' },
        ingestSource: 'api_middleware',
        isSystem: true,
      });
    },
    failure(error: unknown) {
      const latency = Date.now() - started;
      metrics.increment('errors');
      metrics.timing('api_latency', latency);
      const message = error instanceof Error ? error.message : String(error);
      observability.error('api_failure', { route, userId, reqId, latency, error: message });
      void writeAuditEvent({
        eventCategory: 'API',
        eventType: 'error',
        action: 'read',
        actorId: userId ?? null,
        targetTable: 'api',
        targetId: reqId,
        metadata: { route, reqId, latency, status: 'error', error: message },
        ingestSource: 'api_middleware',
        isSystem: true,
      });
    },
  };
}
