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
