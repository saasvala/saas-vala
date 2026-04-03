import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeAuditEvent, listAuditLogs } from './auditClient';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      rpc: vi.fn(),
    },
  };
});

describe('auditClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes audit event through log_audit_event rpc', async () => {
    vi.mocked((supabase as any).rpc).mockResolvedValue({ data: 'audit-id', error: null });

    const id = await writeAuditEvent({
      eventCategory: 'API',
      eventType: 'response',
      targetTable: 'api',
      targetId: 'req-1',
      metadata: { status: 'success' },
    });

    expect(id).toBe('audit-id');
    expect((supabase as any).rpc).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_event_category: 'API',
        p_event_type: 'response',
        p_target_table: 'api',
        p_target_id: 'req-1',
      }),
    );
  });

  it('lists audit logs through list_audit_logs rpc', async () => {
    vi.mocked((supabase as any).rpc).mockResolvedValue({ data: [], error: null });

    await listAuditLogs({
      limit: 50,
      eventCategory: 'AUTH',
      search: 'login',
    });

    expect((supabase as any).rpc).toHaveBeenCalledWith('list_audit_logs', {
      p_limit: 50,
      p_before: null,
      p_event_category: 'AUTH',
      p_event_type: null,
      p_actor_id: null,
      p_target_table: null,
      p_search: 'login',
    });
  });
});

