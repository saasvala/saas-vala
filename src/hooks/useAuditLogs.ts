import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import { listAuditLogs, writeAuditEvent, type AuditEventCategory } from '@/observability/auditClient';

type LegacyAuditAction = 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'suspend' | 'activate';

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: LegacyAuditAction;
  event_category: AuditEventCategory;
  event_type: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Json;
  old_data: Json | null;
  new_data: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
}

export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async (filters?: {
    actorId?: string;
    tableName?: string;
    eventCategory?: AuditEventCategory;
    eventType?: string;
    search?: string;
  }) => {
    setLoading(true);
    const { data, error } = await listAuditLogs({
      limit: 500,
      actorId: filters?.actorId,
      targetTable: filters?.tableName,
      eventCategory: filters?.eventCategory,
      eventType: filters?.eventType,
      search: filters?.search,
    });

    if (error) {
      toast.error('Failed to fetch audit logs');
      console.error(error);
    } else {
      setLogs((data || []) as AuditLog[]);
    }
    setLoading(false);
  };

  const logAction = async (
    action: LegacyAuditAction,
    tableName: string,
    recordId?: string,
    oldData?: Record<string, unknown>,
    newData?: Record<string, unknown>
  ) => {
    const eventType = `${action}_${tableName}`;
    await writeAuditEvent({
      eventCategory: action === 'login' || action === 'logout' ? 'AUTH' : 'CRUD',
      eventType,
      action,
      targetTable: tableName,
      targetId: recordId ?? null,
      metadata: {
        old_data: oldData ?? null,
        new_data: newData ?? null,
      },
      ingestSource: 'hook',
    });
  };

  const exportLogs = () => {
    const csv = [
      ['ID', 'Actor ID', 'Category', 'Event', 'Action', 'Table', 'Target ID', 'Occurred At'].join(','),
      ...logs.map(log => [
        log.id,
        log.actor_id || '',
        log.event_category || '',
        log.event_type || '',
        log.action,
        log.target_table || '',
        log.target_id || '',
        log.occurred_at
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Logs exported');
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return {
    logs,
    loading,
    fetchLogs,
    logAction,
    exportLogs
  };
}
