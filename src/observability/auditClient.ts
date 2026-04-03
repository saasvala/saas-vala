import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type AuditEventCategory =
  | 'AUTH'
  | 'CRUD'
  | 'SYSTEM'
  | 'API'
  | 'FILE'
  | 'SECURITY'
  | 'PAYMENT'
  | 'BACKGROUND';

type LegacyAuditAction = 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'suspend' | 'activate';

export interface AuditWriteInput {
  eventCategory: AuditEventCategory;
  eventType: string;
  action?: LegacyAuditAction;
  actorId?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  ingestSource?: string;
  isSystem?: boolean;
  occurredAt?: string;
}

export interface AuditListInput {
  limit?: number;
  before?: string | null;
  eventCategory?: AuditEventCategory | null;
  eventType?: string | null;
  actorId?: string | null;
  targetTable?: string | null;
  search?: string | null;
}

export interface AuditListApiInput {
  tableName?: string | null;
  action?: LegacyAuditAction | null;
  userId?: string | null;
  from?: string | null;
  to?: string | null;
  query?: string | null;
  page?: number;
  pageSize?: number;
}

export interface AuditCreateInput {
  role?: string;
  action?: LegacyAuditAction;
  module?: string;
  tableName?: string;
  recordId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  status?: 'success' | 'fail';
  ipAddress?: string | null;
  device?: string | null;
}

export interface AuditStats {
  total_logs: number;
  creates: number;
  updates: number;
  deletes: number;
}

function toJson(value: Record<string, unknown> | null | undefined): Json {
  return (value ?? {}) as Json;
}

export async function writeAuditEvent(input: AuditWriteInput): Promise<string | null> {
  const action = input.action ?? 'read';
  const payload = {
    p_event_category: input.eventCategory,
    p_event_type: input.eventType,
    p_action: action,
    p_actor_id: input.actorId ?? undefined,
    p_target_table: input.targetTable ?? undefined,
    p_target_id: input.targetId ?? undefined,
    p_metadata: toJson(input.metadata),
    p_ip_address: input.ipAddress ?? undefined,
    p_user_agent: input.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
    p_ingest_source: input.ingestSource ?? 'app',
    p_is_system: input.isSystem ?? false,
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.rpc('log_audit_event', payload);
  if (error) {
    console.error('Failed to write audit event', error);
    return null;
  }
  return (data as string | null) ?? null;
}

export async function listAuditLogs(input: AuditListInput = {}) {
  return supabase.rpc('list_audit_logs', {
    p_limit: input.limit ?? 100,
    p_before: input.before ?? null,
    p_event_category: input.eventCategory ?? null,
    p_event_type: input.eventType ?? null,
    p_actor_id: input.actorId ?? null,
    p_target_table: input.targetTable ?? null,
    p_search: input.search ?? null,
  });
}

export async function listAuditLogsApi(input: AuditListApiInput = {}) {
  return supabase.rpc('audit_list', {
    p_table_name: input.tableName ?? null,
    p_action: input.action ?? null,
    p_user_id: input.userId ?? null,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_q: input.query ?? null,
    p_page: input.page ?? 1,
    p_page_size: input.pageSize ?? 50,
  });
}

export async function searchAuditLogs(query: string, limit = 100) {
  return supabase.rpc('audit_search', {
    p_q: query,
    p_limit: limit,
  });
}

export async function getAuditStats(from?: string | null, to?: string | null) {
  return supabase.rpc('audit_stats', {
    p_from: from ?? null,
    p_to: to ?? null,
  });
}

export async function exportAuditLogs(
  type: 'csv' | 'pdf',
  filters: Omit<AuditListApiInput, 'page' | 'pageSize'> = {},
  limit = 5000,
) {
  return supabase.rpc('audit_export', {
    p_type: type,
    p_table_name: filters.tableName ?? null,
    p_action: filters.action ?? null,
    p_user_id: filters.userId ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_q: filters.query ?? null,
    p_limit: limit,
  });
}

export async function createManualAuditLog(input: AuditCreateInput = {}) {
  // Device is best-effort client context; SSR/non-browser environments intentionally send null.
  const device = input.device ?? (typeof navigator !== 'undefined' ? navigator.userAgent : null);
  return supabase.rpc('audit_create', {
    p_role: input.role ?? 'system',
    p_action: input.action ?? 'read',
    p_module: input.module ?? input.tableName ?? 'system',
    p_table_name: input.tableName ?? input.module ?? 'system',
    p_record_id: input.recordId ?? null,
    p_old_data: toJson(input.oldData ?? null),
    p_new_data: toJson(input.newData ?? null),
    p_status: input.status ?? 'success',
    p_ip_address: input.ipAddress ?? null,
    p_device: device,
  });
}

export function subscribeAuditLogsRealtime(onInsert: () => void) {
  const channel = supabase
    .channel('audit-logs-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'audit_logs' },
      () => onInsert(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
