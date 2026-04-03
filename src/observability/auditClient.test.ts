import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  writeAuditEvent,
  listAuditLogs,
  listAuditLogsApi,
  searchAuditLogs,
  getAuditStats,
  exportAuditLogs,
  createManualAuditLog,
} from './auditClient';
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

  it('lists audit logs with api style filters through audit_list rpc', async () => {
    vi.mocked((supabase as any).rpc).mockResolvedValue({ data: [], error: null });

    await listAuditLogsApi({
      tableName: 'products',
      action: 'update',
      userId: 'u-1',
      query: 'products',
      page: 2,
      pageSize: 25,
    });

    expect((supabase as any).rpc).toHaveBeenCalledWith('audit_list', {
      p_table_name: 'products',
      p_action: 'update',
      p_user_id: 'u-1',
      p_from: null,
      p_to: null,
      p_q: 'products',
      p_page: 2,
      p_page_size: 25,
    });
  });

  it('searches audit logs through audit_search rpc', async () => {
    vi.mocked((supabase as any).rpc).mockResolvedValue({ data: [], error: null });
    await searchAuditLogs('login', 30);
    expect((supabase as any).rpc).toHaveBeenCalledWith('audit_search', {
      p_q: 'login',
      p_limit: 30,
    });
  });

  it('gets stats through audit_stats rpc', async () => {
    vi.mocked((supabase as any).rpc).mockResolvedValue({ data: [], error: null });
    await getAuditStats();
    expect((supabase as any).rpc).toHaveBeenCalledWith('audit_stats', {
      p_from: null,
      p_to: null,
    });
  });

  it('exports logs through audit_export rpc', async () => {
    vi.mocked((supabase as any).rpc).mockResolvedValue({ data: [], error: null });
    await exportAuditLogs('csv', { tableName: 'orders', query: 'sales' }, 300);
    expect((supabase as any).rpc).toHaveBeenCalledWith('audit_export', {
      p_type: 'csv',
      p_table_name: 'orders',
      p_action: null,
      p_user_id: null,
      p_from: null,
      p_to: null,
      p_q: 'sales',
      p_limit: 300,
    });
  });

  it('creates manual logs through audit_create rpc', async () => {
    vi.mocked((supabase as any).rpc).mockResolvedValue({ data: 'id-1', error: null });
    await createManualAuditLog({
      role: 'admin',
      action: 'create',
      module: 'wallet',
      tableName: 'transactions',
      recordId: 'txn-1',
      status: 'success',
    });
    expect((supabase as any).rpc).toHaveBeenCalledWith(
      'audit_create',
      expect.objectContaining({
        p_role: 'admin',
        p_action: 'create',
        p_module: 'wallet',
        p_table_name: 'transactions',
        p_record_id: 'txn-1',
        p_status: 'success',
      }),
    );
  });
});
