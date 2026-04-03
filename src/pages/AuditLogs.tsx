import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Search, FileText, RefreshCw, Loader2, Download, Clock3, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { listAuditLogs } from '@/observability/auditClient';
import type { Json } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';

type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
type AuditAction = Database['public']['Enums']['audit_action'];
type AuditStatus = 'success' | 'warning' | 'error';
type TimeWindow = '15m' | '1h' | '24h' | '7d' | '30d';
type DateFilter = 'all' | 'today' | '7d' | '30d';

const statusColors: Record<AuditStatus, string> = {
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const actionOptions: AuditAction[] = [
  'create',
  'read',
  'update',
  'delete',
  'login',
  'logout',
  'activate',
  'suspend',
];
const logGridColumns = 'grid-cols-[130px_120px_120px_140px_120px_minmax(240px,1fr)]';

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1h');
  const [topFilter, setTopFilter] = useState<AuditStatus | 'all'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<AuditStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const getTimeCutoff = useCallback((windowFilter: TimeWindow | DateFilter): number => {
    const now = Date.now();
    if (windowFilter === '15m') return now - (15 * 60 * 1000);
    if (windowFilter === '1h') return now - (60 * 60 * 1000);
    if (windowFilter === '24h') return now - (24 * 60 * 60 * 1000);
    if (windowFilter === '7d') return now - (7 * 24 * 60 * 60 * 1000);
    if (windowFilter === '30d') return now - (30 * 24 * 60 * 60 * 1000);
    if (windowFilter === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return start.getTime();
    }
    return 0;
  }, []);

  const getMetaObject = useCallback((log: AuditLog): Record<string, unknown> => {
    const metadata = log.metadata as Json;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, unknown>;
    }
    return {};
  }, []);

  const getRole = useCallback((log: AuditLog): string => {
    const metadata = getMetaObject(log);
    return String(metadata.role || metadata.user_role || (log.is_system ? 'system' : 'user'));
  }, [getMetaObject]);

  const getModule = useCallback((log: AuditLog): string => {
    return log.target_table || log.table_name || log.entity || log.event_category || 'system';
  }, []);

  const getStatus = useCallback((log: AuditLog): AuditStatus => {
    const metadata = getMetaObject(log);
    const rawStatus = String(metadata.status || metadata.level || '').toLowerCase();
    if (rawStatus.includes('error') || rawStatus.includes('fail')) {
      return 'error';
    }
    if (rawStatus.includes('warn')) {
      return 'warning';
    }
    return 'success';
  }, [getMetaObject]);

  const getMessage = useCallback((log: AuditLog): string => {
    const metadata = getMetaObject(log);
    return String(metadata.message || metadata.description || log.event_type || 'Audit log entry');
  }, [getMetaObject]);

  const fetchLogs = useCallback(async (suppressLoadingUI = false) => {
    if (!suppressLoadingUI) {
      setLoading(true);
    }
    try {
      const { data, error } = await listAuditLogs({
        limit: 500,
        search: searchQuery || null,
      });
      if (error) throw error;
      setLogs((data || []) as AuditLog[]);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      if (!suppressLoadingUI) {
        toast.error('Failed to fetch audit logs');
      }
    } finally {
      if (!suppressLoadingUI) {
        setLoading(false);
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchLogs(true);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    const cutoffTop = getTimeCutoff(timeWindow);
    const cutoffDate = getTimeCutoff(dateFilter);
    const effectiveCutoff = Math.max(cutoffTop, cutoffDate);
    const query = searchQuery.trim().toLowerCase();

    return logs.filter((log) => {
      const occurredAt = new Date(log.occurred_at || log.created_at || '').getTime();
      const role = getRole(log).toLowerCase();
      const action = (log.action || '').toLowerCase();
      const moduleName = getModule(log).toLowerCase();
      const status = getStatus(log);
      const message = getMessage(log).toLowerCase();
      const targetId = String(log.target_id || log.record_id || '').toLowerCase();

      const matchesTime = occurredAt >= effectiveCutoff;
      const matchesRole = roleFilter === 'all' || role === roleFilter;
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const matchesModule = moduleFilter === 'all' || moduleName === moduleFilter;
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesTopStatus = topFilter === 'all' || status === topFilter;
      const matchesSearch = !query
        || message.includes(query)
        || role.includes(query)
        || moduleName.includes(query)
        || action.includes(query)
        || targetId.includes(query);

      return matchesTime
        && matchesRole
        && matchesAction
        && matchesModule
        && matchesStatus
        && matchesTopStatus
        && matchesSearch;
    });
  }, [
    logs,
    timeWindow,
    dateFilter,
    searchQuery,
    roleFilter,
    actionFilter,
    moduleFilter,
    statusFilter,
    topFilter,
    getRole,
    getModule,
    getStatus,
    getMessage,
    getTimeCutoff,
  ]);

  const roles = useMemo(
    () => [...new Set(logs.map((log) => getRole(log).toLowerCase()))].sort(),
    [logs, getRole],
  );

  const modules = useMemo(
    () => [...new Set(logs.map((log) => getModule(log).toLowerCase()))].sort(),
    [logs, getModule],
  );

  useEffect(() => {
    if (!selectedLog && filteredLogs.length > 0) {
      setSelectedLog(filteredLogs[0]);
      return;
    }
    if (selectedLog && !filteredLogs.find((log) => log.id === selectedLog.id)) {
      setSelectedLog(filteredLogs[0] || null);
    }
  }, [filteredLogs, selectedLog]);

  const exportLogs = () => {
    const sanitizeCsvValue = (value: string): string => {
      const trimmed = value.trimStart();
      const formulaUnsafe = /^[=+\-@]/.test(trimmed);
      return formulaUnsafe ? `'${trimmed}` : value;
    };

    const escapeCsv = (value: string): string => {
      const sanitizedValue = sanitizeCsvValue(value);
      return `"${sanitizedValue.replaceAll('"', '""')}"`;
    };

    const csv = [
      ['Time', 'Role', 'Action', 'Module', 'Status', 'Message', 'Actor ID', 'IP', 'Device'].join(','),
      ...filteredLogs.map((log) => [
        escapeCsv(log.occurred_at || log.created_at || ''),
        escapeCsv(getRole(log)),
        escapeCsv(log.action),
        escapeCsv(getModule(log)),
        escapeCsv(getStatus(log)),
        escapeCsv(getMessage(log)),
        escapeCsv(log.actor_id || log.user_id || ''),
        escapeCsv(log.ip_address || ''),
        escapeCsv(log.user_agent || ''),
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported successfully');
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs, users, modules, IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50 border-border"
              />
            </div>
            <div className="flex items-center gap-3">
              <Select value={timeWindow} onValueChange={(v) => setTimeWindow(v as TimeWindow)}>
                <SelectTrigger className="w-[120px]">
                  <Clock3 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">Last 15m</SelectItem>
                  <SelectItem value="1h">Last 1h</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7d</SelectItem>
                  <SelectItem value="30d">Last 30d</SelectItem>
                </SelectContent>
              </Select>
              <Select value={topFilter} onValueChange={(v) => setTopFilter(v as AuditStatus | 'all')}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => fetchLogs()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={exportLogs} className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_360px] gap-4">
          <aside className="glass-card rounded-xl p-4 space-y-4 h-fit">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">Filters</h2>
              <p className="text-xs text-muted-foreground">Role, action, module, status, date</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Role</p>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Action</p>
              <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as AuditAction | 'all')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionOptions.map((action) => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Module</p>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {modules.map((moduleName) => (
                    <SelectItem key={moduleName} value={moduleName}>{moduleName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AuditStatus | 'all')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Date</p>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setRoleFilter('all');
                setActionFilter('all');
                setModuleFilter('all');
                setStatusFilter('all');
                setDateFilter('all');
                setTimeWindow('1h');
                setTopFilter('all');
                setSearchQuery('');
              }}
              className="w-full"
            >
              Reset filters
            </Button>
          </aside>

          <section className="glass-card rounded-xl overflow-hidden min-h-[560px]">
            <div className={cn('grid gap-3 px-4 py-3 border-b border-border text-xs uppercase tracking-wide text-muted-foreground', logGridColumns)}>
              <p>Time</p>
              <p>Role</p>
              <p>Action</p>
              <p>Module</p>
              <p>Status</p>
              <p>Message</p>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-foreground mb-2">No logs found</h3>
                  <p className="text-muted-foreground">Try adjusting filters or search terms.</p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const status = getStatus(log);
                  return (
                    <button
                      type="button"
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={cn(
                        'w-full text-left grid gap-3 px-4 py-3 border-b border-border transition-colors',
                        logGridColumns,
                        'hover:bg-muted/30',
                        selectedLog?.id === log.id && 'bg-muted/30',
                      )}
                    >
                      <p className="text-xs text-muted-foreground truncate">
                        {log.occurred_at || log.created_at
                          ? new Date(log.occurred_at || log.created_at || '').toLocaleTimeString()
                          : 'N/A'}
                      </p>
                      <p className="text-sm text-foreground truncate">{getRole(log)}</p>
                      <p className="text-sm text-foreground uppercase truncate">{log.action}</p>
                      <p className="text-sm text-foreground truncate">{getModule(log)}</p>
                      <div>
                        <Badge variant="outline" className={cn('uppercase text-xs', statusColors[status])}>
                          {status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{getMessage(log)}</p>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <aside className="glass-card rounded-xl p-4 min-h-[560px]">
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">Log Details</h2>
            {selectedLog ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">User</p>
                    <p className="font-mono break-all">{selectedLog.actor_id || selectedLog.user_id || 'System'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">IP</p>
                    <p className="font-mono break-all">{selectedLog.ip_address || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase">User Agent</p>
                    <p className="break-all text-sm text-foreground">{selectedLog.user_agent || 'Unknown'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-2">JSON</p>
                  <pre className="bg-muted/50 p-3 rounded-lg text-xs overflow-auto max-h-[360px]">
                    {JSON.stringify(
                      {
                        id: selectedLog.id,
                        time: selectedLog.occurred_at || selectedLog.created_at,
                        role: getRole(selectedLog),
                        action: selectedLog.action,
                        module: getModule(selectedLog),
                        status: getStatus(selectedLog),
                        message: getMessage(selectedLog),
                        metadata: selectedLog.metadata || {},
                        old_data: selectedLog.old_data,
                        new_data: selectedLog.new_data,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground text-sm">
                Select a log row to inspect details.
              </div>
            )}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
