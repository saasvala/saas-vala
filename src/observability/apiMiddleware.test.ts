import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiMiddleware } from './apiMiddleware';

const writeAuditEventMock = vi.fn();

vi.mock('@/observability/auditClient', () => ({
  writeAuditEvent: (...args: unknown[]) => writeAuditEventMock(...args),
}));

describe('apiMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits request and response audit events on success', () => {
    const middleware = createApiMiddleware('/test', 'user-1');
    middleware.success();

    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: 'API',
        eventType: 'request',
      }),
    );
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: 'API',
        eventType: 'response',
      }),
    );
  });

  it('emits request and error audit events on failure', () => {
    const middleware = createApiMiddleware('/test', 'user-2');
    middleware.failure(new Error('boom'));

    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: 'API',
        eventType: 'request',
      }),
    );
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: 'API',
        eventType: 'error',
      }),
    );
  });
});

