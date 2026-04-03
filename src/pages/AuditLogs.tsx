import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Search,
  FileText,
  RefreshCw,
  Loader2,
  Clock3,
  Filter,
  Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { listAuditLogs } from '@/observability/auditClient';
import type { Database } from '@/integrations/supabase/types';

type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
type AuditAction = Database['public']['Enums']['audit_action'];
type AuditStatus = 'success' | 'error' | 'warning';
type TimeRange = '15m' | '1h' | '24h' | '7d' | '30d' | 'all';
type DateFilter = 'today' | '7d' | '30d' | 'all';

interface EnrichedAuditLog {
  id: string;
  raw: AuditLog;
  time: string;
  role: string;
  action: AuditAction;
  module: string;
  status: AuditStatus;
  message: string;
}

const statusColors: Record<AuditStatus, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const actionColors: Record<AuditAction, string> = {
  create: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  update: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  delete: 'bg-red-500/20 text-red-400 border-red-500/30',
  read: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  login: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  logout: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  activate: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  suspend: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const LIVE_REFRESH_INTERVAL_MILLISECONDS = 8000;

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringFrom(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function toStatus(log: AuditLog, metadata: Record<string, unknown>): AuditStatus {
  const status = (stringFrom(metadata, ['status', 'result', 'outcome', 'severity', 'level']) || '').toLowerCase();
  if (status.includes('error') || status.includes('fail') || status.includes('denied') || status.includes('unauthorized')) {
    return 'error';
  }
  if (status.includes('warn') || status.includes('pending') || status.includes('suspicious')) {
    return 'warning';
  }
  if (log.event_category === 'SECURITY') {
    return 'warning';
  }
  return 'success';
}

function isWithinTimeRange(dateIso: string, range: TimeRange): boolean {
  if (range === 'all') return true;
  const now = Date.now();
  const time = new Date(dateIso).getTime();
  if (Number.isNaN(time)) return false;
  const windowMs: Record<Exclude<TimeRange, 'all'>, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return now - time <= windowMs[range];
}

function isInDateFilter(dateIso: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const now = new Date();
  const time = new Date(dateIso);
  if (Number.isNaN(time.getTime())) return false;
  if (filter === 'today') {
    return time.toDateString() === now.toDateString();
  }
  if (filter === '7d') {
    return now.getTime() - time.getTime() <= 7 * 24 * 60 * 60 * 1000;
  }
  return now.getTime() - time.getTime() <= 30 * 24 * 60 * 60 * 1000;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [roleFilter, setRoleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AuditStatus>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadingRef = useRef(true);
  const refreshingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    refreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const fetchLogs = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      if (refreshingRef.current || loadingRef.current) {
        return;
      }
      setIsRefreshing(true);
    }
    try {
      const { data, error } = await listAuditLogs({ limit: 500 });
      if (error) throw error;
      setLogs((data || []) as AuditLog[]);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Failed to fetch audit logs');
    } finally {
      if (showLoader) {
        setLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchLogs(false);
    }, LIVE_REFRESH_INTERVAL_MILLISECONDS);
    return () => window.clearInterval(interval);
  }, [fetchLogs]);

  const enrichedLogs = useMemo<EnrichedAuditLog[]>(() => {
    return logs.map((log) => {
      const metadata = toObject(log.metadata);
      const role = stringFrom(metadata, ['role', 'user_role', 'actor_role', 'userRole', 'actorRole']) || (log.is_system ? 'system' : 'user');
      const module = log.target_table || log.table_name || log.entity || stringFrom(metadata, ['module', 'service']) || 'system';
      const message = stringFrom(metadata, ['message', 'description', 'event_message']) || `${log.event_type || 'event'} on ${module}`;
      const time = log.occurred_at || log.created_at || new Date().toISOString();
      return {
        id: log.id,
        raw: log,
        time,
        role,
        action: log.action,
        module,
        status: toStatus(log, metadata),
        message,
      };
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedLogs.filter((log) => {
      if (!isWithinTimeRange(log.time, timeRange)) return false;
      if (!isInDateFilter(log.time, dateFilter)) return false;
      if (roleFilter !== 'all' && log.role !== roleFilter) return false;
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;
      if (!q) return true;
      return (
        log.message.toLowerCase().includes(q)
        || log.role.toLowerCase().includes(q)
        || log.action.toLowerCase().includes(q)
        || log.module.toLowerCase().includes(q)
        || (log.raw.event_type || '').toLowerCase().includes(q)
        || (log.raw.target_id || '').toLowerCase().includes(q)
      );
    });
  }, [actionFilter, dateFilter, enrichedLogs, moduleFilter, roleFilter, searchQuery, statusFilter, timeRange]);

  const roles = useMemo(() => [...new Set(enrichedLogs.map((log) => log.role))], [enrichedLogs]);
  const modules = useMemo(() => [...new Set(enrichedLogs.map((log) => log.module))], [enrichedLogs]);

  const selectedLog = useMemo(() => {
    if (!selectedLogId) return null;
    return enrichedLogs.find((log) => log.id === selectedLogId) || null;
  }, [enrichedLogs, selectedLogId]);

  useEffect(() => {
    if (selectedLogId && !selectedLog) {
      setSelectedLogId(null);
    }
  }, [selectedLog, selectedLogId]);

  const resetFilters = () => {
    setSearchQuery('');
    setTimeRange('24h');
    setRoleFilter('all');
    setActionFilter('all');
    setModuleFilter('all');
    setStatusFilter('all');
    setDateFilter('all');
  };

  const statusCounts = useMemo(() => {
    return {
      success: filteredLogs.filter((log) => log.status === 'success').length,
      warning: filteredLogs.filter((log) => log.status === 'warning').length,
      error: filteredLogs.filter((log) => log.status === 'error').length,
    };
  }, [filteredLogs]);

  const statusIcon = (status: AuditStatus) => {
    if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    if (status === 'error') return <CircleX className="h-4 w-4 text-red-400" />;
    return <CircleAlert className="h-4 w-4 text-amber-400" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search logs, users, module, message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">15m</SelectItem>
                  <SelectItem value="1h">1h</SelectItem>
                  <SelectItem value="24h">24h</SelectItem>
                  <SelectItem value="7d">7d</SelectItem>
                  <SelectItem value="30d">30d</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400">
                <Wifi className="h-3 w-3" />
                Live
              </Badge>
              <Button variant="outline" onClick={resetFilters} className="gap-2">
                <Filter className="h-4 w-4" />
                Reset
              </Button>
              <Button variant="outline" onClick={() => fetchLogs()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr_360px]">
          <aside className="glass-card rounded-xl p-4">
            <div className="mb-4">
              <h2 className="font-display text-xl font-bold text-foreground">Audit Logs</h2>
              <p className="text-sm text-muted-foreground">Datadog-style live activity stream</p>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</p>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</p>
                <Select value={actionFilter} onValueChange={(value) => setActionFilter(value as 'all' | AuditAction)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="create">create</SelectItem>
                    <SelectItem value="read">read</SelectItem>
                    <SelectItem value="update">update</SelectItem>
                    <SelectItem value="delete">delete</SelectItem>
                    <SelectItem value="login">login</SelectItem>
                    <SelectItem value="logout">logout</SelectItem>
                    <SelectItem value="activate">activate</SelectItem>
                    <SelectItem value="suspend">suspend</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module</p>
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Module" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modules</SelectItem>
                    {modules.map((module) => (
                      <SelectItem key={module} value={module}>{module}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | AuditStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</p>
                <Select value={dateFilter} onValueChange={(value) => setDateFilter(value as DateFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </aside>

          <section className="glass-card rounded-xl overflow-hidden">
            <div
              role="row"
              className="grid grid-cols-[150px_120px_120px_1fr_110px_2fr] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <span role="columnheader">Time</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Action</span>
              <span role="columnheader">Module</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Message</span>
            </div>

            {loading ? (
              <div className="flex h-[70vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex h-[70vh] flex-col items-center justify-center px-6 text-center">
                <FileText className="mb-3 h-12 w-12 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">No logs found</h3>
                <p className="text-sm text-muted-foreground">No audit events match the current filters.</p>
              </div>
            ) : (
              <div
                role="rowgroup"
                aria-label="Audit log rows"
                tabIndex={0}
                className="h-[70vh] overflow-y-auto"
              >
                {filteredLogs.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => setSelectedLogId(log.id)}
                    aria-label={`View details for ${log.action} on ${log.module} at ${new Date(log.time).toLocaleString()}`}
                    className={cn(
                      'grid w-full grid-cols-[150px_120px_120px_1fr_110px_2fr] items-center gap-2 border-b border-border px-4 py-3 text-left transition-colors',
                      'hover:bg-muted/30',
                      selectedLogId === log.id && 'bg-muted/40',
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {new Date(log.time).toLocaleTimeString()}
                    </div>
                    <span className="truncate text-sm text-foreground">{log.role}</span>
                    <Badge variant="outline" className={cn('w-fit uppercase text-xs', actionColors[log.action])}>
                      {log.action}
                    </Badge>
                    <span className="truncate text-sm text-foreground">{log.module}</span>
                    <Badge variant="outline" className={cn('w-fit capitalize text-xs', statusColors[log.status])}>
                      {log.status}
                    </Badge>
                    <div className="truncate text-sm text-muted-foreground">{log.message}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="glass-card rounded-xl p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Log Details</h3>
              <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400">
                <Wifi className="h-3 w-3" />
                Live
              </Badge>
            </div>

            {!selectedLog ? (
              <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
                Select a log row to inspect details
              </div>
            ) : (
              <div className="h-[70vh] space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="text-sm text-foreground">{new Date(selectedLog.time).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="text-sm text-foreground">{selectedLog.role}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">User</p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {selectedLog.raw.actor_id || selectedLog.raw.user_id || 'System'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">IP</p>
                    <p className="text-sm text-foreground">
                      {selectedLog.raw.ip_address || stringFrom(toObject(selectedLog.raw.metadata), ['ip', 'ipAddress']) || 'N/A'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Device</p>
                    <p className="text-sm text-foreground">
                      {selectedLog.raw.user_agent || stringFrom(toObject(selectedLog.raw.metadata), ['device', 'deviceName']) || 'Unknown'}
                    </p>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    {statusIcon(selectedLog.status)}
                    <Badge variant="outline" className={cn('capitalize', statusColors[selectedLog.status])}>
                      {selectedLog.status}
                    </Badge>
                    <Badge variant="outline" className={cn('uppercase', actionColors[selectedLog.action])}>
                      {selectedLog.action}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">JSON</p>
                  <pre className="max-h-[220px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                    {JSON.stringify(selectedLog.raw.metadata || {}, null, 2)}
                  </pre>
                </div>

                {selectedLog.raw.old_data && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Old Data</p>
                    <pre className="max-h-[170px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      {JSON.stringify(selectedLog.raw.old_data, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.raw.new_data && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Data</p>
                    <pre className="max-h-[170px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      {JSON.stringify(selectedLog.raw.new_data, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border p-2 text-center">
                    <p className="text-lg font-semibold text-foreground">{filteredLogs.length}</p>
                    <p className="text-xs text-muted-foreground">Visible</p>
                  </div>
                  <div className="rounded-lg border border-border p-2 text-center">
                    <p className="text-lg font-semibold text-emerald-400">{statusCounts.success}</p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="rounded-lg border border-border p-2 text-center">
                    <p className="text-lg font-semibold text-amber-400">{statusCounts.warning + statusCounts.error}</p>
                    <p className="text-xs text-muted-foreground">Issues</p>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
