import { useCallback, useMemo, useState } from 'react';
import { auditApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';

export type AuditStatus = 'success' | 'error' | 'warning';

export interface AuditLogItem {
  id: string;
  user_id: string | null;
  role: string;
  action: string;
  module: string;
  table_name: string;
  record_id: string | null;
  old_data: unknown;
  new_data: unknown;
  ip: string | null;
  device: string | null;
  status: AuditStatus;
  message: string;
  created_at: string;
  metadata: Record<string, unknown>;
  event_category: string;
  event_type: string;
  ingest_source: string;
}

export interface AuditFilters {
  q: string;
  time: '15m' | '1h' | '24h' | '7d' | '30d' | 'all';
  role: string;
  action: string;
  module: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const PAGE_SIZE = 50;

const defaultFilters: AuditFilters = {
  q: '',
  time: '24h',
  role: 'all',
  action: 'all',
  module: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

function buildFilterPayload(filters: AuditFilters) {
  return {
    role: filters.role !== 'all' ? filters.role : undefined,
    action: filters.action !== 'all' ? filters.action : undefined,
    module: filters.module !== 'all' ? filters.module : undefined,
    status: filters.status !== 'all' ? filters.status : undefined,
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
  };
}

function extractLogs(payload: any): AuditLogItem[] {
  const rows = payload?.data?.logs || payload?.logs || [];
  if (!Array.isArray(rows)) return [];
  return rows as AuditLogItem[];
}

function dedupeById(rows: AuditLogItem[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function useAuditStore() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [filters, setFiltersState] = useState<AuditFilters>(defaultFilters);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState<{
    logs_per_minute: Array<{ minute: string; count: number }>;
    success_vs_error: { success: number; error: number; warning: number };
    top_modules: Array<{ module: string; count: number }>;
  } | null>(null);

  const setFilters = useCallback((patch: Partial<AuditFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    try {
      const response = await auditApi.list({
        limit: PAGE_SIZE,
        offset: 0,
        q: filters.q || undefined,
        filters: buildFilterPayload(filters),
      });
      const nextLogs = extractLogs(response);
      setLogs(nextLogs);
      setHasMore(Boolean(response?.data?.has_more));
      setOffset(nextLogs.length);
      setSelectedLog((prev) => nextLogs.find((log) => log.id === prev?.id) || null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const response = await auditApi.list({
        limit: PAGE_SIZE,
        offset,
        q: filters.q || undefined,
        filters: buildFilterPayload(filters),
      });
      const nextLogs = extractLogs(response);
      setLogs((prev) => dedupeById([...prev, ...nextLogs]));
      setHasMore(Boolean(response?.data?.has_more));
      setOffset((prev) => prev + nextLogs.length);
    } finally {
      setLoading(false);
    }
  }, [filters, hasMore, loading, offset]);

  const fetchStats = useCallback(async () => {
    const response = await auditApi.stats({ q: filters.q || undefined });
    setStats(response?.data || {
      logs_per_minute: [],
      success_vs_error: { success: 0, error: 0, warning: 0 },
      top_modules: [],
    });
  }, [filters]);

  const refresh = useCallback(async () => {
    await fetchInitial();
    await fetchStats();
  }, [fetchInitial, fetchStats]);

  const createManualLog = useCallback(async (payload: {
    role?: string;
    action: string;
    module?: string;
    table_name?: string;
    record_id?: string;
    old_data?: Record<string, unknown> | null;
    new_data?: Record<string, unknown> | null;
    ip?: string | null;
    device?: string | null;
    status?: string;
    message?: string;
    event_category?: string;
    event_type?: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
  }) => {
    await auditApi.create(payload);
    await refresh();
  }, [refresh]);

  const exportLogs = useCallback(async (type: 'csv' | 'pdf') => {
    const response = await auditApi.export({ type, q: filters.q || undefined });
    return response?.data?.download_url || null;
  }, [filters.q]);

  const setupRealtime = useCallback(() => {
    const channel = supabase
      .channel(`audit-logs-live-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
        void fetchInitial();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitial]);

  return useMemo(() => ({
    logs,
    filters,
    selectedLog,
    loading,
    hasMore,
    offset,
    stats,
    setFilters,
    selectLog: setSelectedLog,
    fetchInitial,
    fetchMore,
    refresh,
    fetchStats,
    createManualLog,
    exportLogs,
    setupRealtime,
  }), [
    logs,
    filters,
    selectedLog,
    loading,
    hasMore,
    offset,
    stats,
    setFilters,
    fetchInitial,
    fetchMore,
    refresh,
    fetchStats,
    createManualLog,
    exportLogs,
    setupRealtime,
  ]);
}
