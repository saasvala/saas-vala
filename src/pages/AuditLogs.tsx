import { useEffect, useMemo, useRef } from 'react';
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
  Download,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuditStore, type AuditStatus } from '@/stores/useAuditStore';

const actionColors: Record<string, string> = {
  create: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  update: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  delete: 'bg-red-500/20 text-red-400 border-red-500/30',
  read: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  login: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  logout: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  activate: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  suspend: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const statusColors: Record<AuditStatus, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

function statusIcon(status: AuditStatus) {
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === 'error') return <CircleX className="h-4 w-4 text-red-400" />;
  return <CircleAlert className="h-4 w-4 text-amber-400" />;
}

export default function AuditLogs() {
  const {
    logs,
    filters,
    selectedLog,
    loading,
    hasMore,
    stats,
    setFilters,
    selectLog,
    fetchInitial,
    fetchMore,
    refresh,
    fetchStats,
    createManualLog,
    exportLogs,
    setupRealtime,
  } = useAuditStore();

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchInitial();
    void fetchStats();
  }, [fetchInitial, fetchStats]);

  useEffect(() => {
    const cleanup = setupRealtime();
    return cleanup;
  }, [setupRealtime]);

  useEffect(() => {
    const target = bottomRef.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry?.isIntersecting && hasMore && !loading) {
        void fetchMore();
      }
    }, { threshold: 0.5 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchMore, hasMore, loading]);

  const roles = useMemo(() => [...new Set(logs.map((log) => log.role))], [logs]);
  const modules = useMemo(() => [...new Set(logs.map((log) => log.module))], [logs]);

  const statusCounts = useMemo(() => ({
    success: logs.filter((log) => log.status === 'success').length,
    warning: logs.filter((log) => log.status === 'warning').length,
    error: logs.filter((log) => log.status === 'error').length,
  }), [logs]);

  const onCreateManualLog = async () => {
    try {
      await createManualLog({
        action: 'create',
        module: 'audit',
        status: 'success',
        message: 'manual audit log created',
      });
      toast.success('Audit log created');
    } catch (error) {
      console.error(error);
      toast.error('Failed to create log');
    }
  };

  const onExport = async (type: 'csv' | 'pdf') => {
    try {
      const url = await exportLogs(type);
      if (!url) throw new Error('No export URL');
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs.${type}`;
      a.click();
      toast.success(`Exported ${type.toUpperCase()}`);
    } catch (error) {
      console.error(error);
      toast.error(`Failed to export ${type.toUpperCase()}`);
    }
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
                  value={filters.q}
                  onChange={(e) => setFilters({ q: e.target.value })}
                  className="pl-10"
                />
              </div>
              <Select value={filters.time} onValueChange={(value) => setFilters({ time: value as '15m' | '1h' | '24h' | '7d' | '30d' | 'all' })}>
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
              <Button variant="outline" onClick={() => setFilters({
                q: '',
                time: '24h',
                role: 'all',
                action: 'all',
                module: 'all',
                status: 'all',
                dateFrom: '',
                dateTo: '',
              })} className="gap-2">
                <Filter className="h-4 w-4" />
                Reset
              </Button>
              <Button variant="outline" onClick={() => void refresh()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" onClick={onCreateManualLog} className="gap-2">
                <Plus className="h-4 w-4" />
                Create
              </Button>
              <Button variant="outline" onClick={() => void onExport('csv')} className="gap-2">
                <Download className="h-4 w-4" />
                CSV
              </Button>
              <Button variant="outline" onClick={() => void onExport('pdf')} className="gap-2">
                <Download className="h-4 w-4" />
                PDF
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
                <Select value={filters.role} onValueChange={(value) => setFilters({ role: value })}>
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
                <Select value={filters.action} onValueChange={(value) => setFilters({ action: value })}>
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
                <Select value={filters.module} onValueChange={(value) => setFilters({ module: value })}>
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
                <Select value={filters.status} onValueChange={(value) => setFilters({ status: value })}>
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date from</p>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ dateFrom: e.target.value })} />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date to</p>
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ dateTo: e.target.value })} />
              </div>
            </div>
          </aside>

          <section role="table" aria-label="Audit logs list" className="glass-card rounded-xl overflow-hidden">
            <div
              role="rowgroup"
              className="grid grid-cols-[150px_120px_120px_1fr_110px_2fr] border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <span role="columnheader" aria-colindex={1}>Time</span>
              <span role="columnheader" aria-colindex={2}>Role</span>
              <span role="columnheader" aria-colindex={3}>Action</span>
              <span role="columnheader" aria-colindex={4}>Module</span>
              <span role="columnheader" aria-colindex={5}>Status</span>
              <span role="columnheader" aria-colindex={6}>Message</span>
            </div>

            {loading && logs.length === 0 ? (
              <div className="flex h-[70vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex h-[70vh] flex-col items-center justify-center px-6 text-center">
                <FileText className="mb-3 h-12 w-12 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">No logs found</h3>
                <p className="text-sm text-muted-foreground">Seeding default logs automatically when empty.</p>
              </div>
            ) : (
              <div role="rowgroup" aria-label="Audit log rows" className="h-[70vh] overflow-y-auto">
                {logs.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => selectLog(log)}
                    aria-label={`View details for ${log.action} on ${log.module} at ${new Date(log.created_at).toLocaleString()}`}
                    className={cn(
                      'grid w-full grid-cols-[150px_120px_120px_1fr_110px_2fr] items-center gap-2 border-b border-border px-4 py-3 text-left transition-colors',
                      'hover:bg-muted/30',
                      selectedLog?.id === log.id && 'bg-muted/40',
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {new Date(log.created_at).toLocaleTimeString()}
                    </div>
                    <span className="truncate text-sm text-foreground">{log.role}</span>
                    <Badge variant="outline" className={cn('w-fit uppercase text-xs', actionColors[log.action] || actionColors.read)}>
                      {log.action}
                    </Badge>
                    <span className="truncate text-sm text-foreground">{log.module}</span>
                    <Badge variant="outline" className={cn('w-fit capitalize text-xs', statusColors[log.status])}>
                      {log.status}
                    </Badge>
                    <div className="truncate text-sm text-muted-foreground">{log.message}</div>
                  </button>
                ))}
                <div ref={bottomRef} className="h-8 w-full" />
                {loading && (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
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
                    <p className="text-sm text-foreground">{new Date(selectedLog.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="text-sm text-foreground">{selectedLog.role}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">User</p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {selectedLog.user_id || 'System'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">IP</p>
                    <p className="text-sm text-foreground">{selectedLog.ip || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Device</p>
                    <p className="text-sm text-foreground">{selectedLog.device || 'Unknown'}</p>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    {statusIcon(selectedLog.status)}
                    <Badge variant="outline" className={cn('capitalize', statusColors[selectedLog.status])}>
                      {selectedLog.status}
                    </Badge>
                    <Badge variant="outline" className={cn('uppercase', actionColors[selectedLog.action] || actionColors.read)}>
                      {selectedLog.action}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">JSON</p>
                  <pre className="max-h-[220px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                    {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                  </pre>
                </div>

                {selectedLog.old_data && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Old Data</p>
                    <pre className="max-h-[170px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      {JSON.stringify(selectedLog.old_data, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.new_data && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Data</p>
                    <pre className="max-h-[170px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      {JSON.stringify(selectedLog.new_data, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border p-2 text-center">
                    <p className="text-lg font-semibold text-foreground">{logs.length}</p>
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

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stats API</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>Logs/min points: {stats?.logs_per_minute?.length || 0}</div>
                    <div>Success: {stats?.success_vs_error?.success || 0}</div>
                    <div>Error: {stats?.success_vs_error?.error || 0}</div>
                    <div>Warning: {stats?.success_vs_error?.warning || 0}</div>
                    <div>Top modules: {stats?.top_modules?.slice(0, 3).map((m) => m.module).join(', ') || 'N/A'}</div>
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
