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
import { toast } from 'sonner';
import {
  createManualAuditLog,
  exportAuditLogs,
  getAuditStats,
  listAuditLogsApi,
  subscribeAuditLogsRealtime,
  type AuditStats,
} from '@/observability/auditClient';
import { Download, FileText, RefreshCw, Plus } from 'lucide-react';

type AuditAction = 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'activate' | 'suspend';
type AuditStatus = 'success' | 'warning' | 'error';

type AuditLog = {
  id: string;
  actor_id?: string | null;
  user_id?: string | null;
  action: string;
  event_type?: string | null;
  target_table?: string | null;
  table_name?: string | null;
  entity?: string | null;
  metadata?: Record<string, unknown> | null;
  is_system?: boolean | null;
  ip_address?: string | null;
  user_agent?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
};

type EnrichedAuditLog = {
  id: string;
  raw: AuditLog;
  time: string;
  role: string;
  action: string;
  module: string;
  status: AuditStatus;
  message: string;
};

function toObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function stringFrom(meta: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toStatus(log: AuditLog, meta: Record<string, unknown>): AuditStatus {
  const raw = String(meta.status || meta.level || '').toLowerCase();
  if (raw === 'fail' || raw === 'error' || raw === 'failed') return 'error';
  if (raw === 'warning' || raw === 'warn') return 'warning';
  if (String(log.event_type || '').toLowerCase().includes('error')) return 'error';
  return 'success';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<EnrichedAuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const mapLogs = useCallback((rows: AuditLog[]) => {
    return rows.map((log) => {
      const metadata = toObject(log.metadata);
      return {
        id: log.id,
        raw: log,
        time: log.occurred_at || log.created_at || new Date().toISOString(),
        role: stringFrom(metadata, ['role', 'user_role', 'actor_role']) || (log.is_system ? 'system' : 'user'),
        action: log.action,
        module: log.target_table || log.table_name || log.entity || stringFrom(metadata, ['module', 'service']) || 'system',
        status: toStatus(log, metadata),
        message:
          stringFrom(metadata, ['message', 'description', 'event_message']) ||
          `${log.event_type || 'event'} on ${log.target_table || log.table_name || 'system'}`,
      } as EnrichedAuditLog;
    });
  }, []);

  const fetchLogs = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { data, error } = await listAuditLogsApi({
          tableName: moduleFilter !== 'all' ? moduleFilter : null,
          action: actionFilter !== 'all' ? (actionFilter as AuditAction) : null,
          userId: userFilter.trim() || null,
          query: searchQuery.trim() || null,
          page: 1,
          pageSize: 200,
        });
        if (error) throw error;
        setLogs(mapLogs((data || []) as AuditLog[]));
      } catch {
        toast.error('Failed to fetch audit logs');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [actionFilter, mapLogs, moduleFilter, searchQuery, userFilter],
  );

  const fetchStats = useCallback(async () => {
    const { data, error } = await getAuditStats();
    if (!error && data) {
      const rows = Array.isArray(data) ? data : [data];
      setStats((rows[0] as AuditStats) || null);
    }
  }, []);

  useEffect(() => {
    void fetchLogs();
    void fetchStats();
  }, [fetchLogs, fetchStats]);

  useEffect(() => {
    const unsubscribe = subscribeAuditLogsRealtime(() => {
      void fetchLogs(true);
      void fetchStats();
    });
    return () => unsubscribe();
  }, [fetchLogs, fetchStats]);

  const filteredLogs = useMemo(() => logs, [logs]);

  const buildCsv = (rows: EnrichedAuditLog[]) => {
    const header = ['ID', 'User ID', 'Role', 'Action', 'Module', 'Event', 'Status', 'IP', 'Device', 'Time'];
    const body = rows.map((row) => [
      row.raw.id,
      row.raw.actor_id || row.raw.user_id || '',
      row.role,
      row.action,
      row.module,
      row.raw.event_type || '',
      row.status,
      row.raw.ip_address || '',
      row.raw.user_agent || '',
      row.time,
    ]);
    return [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
  };

  const exportCsv = async () => {
    const { data, error } = await exportAuditLogs(
      'csv',
      {
        tableName: moduleFilter !== 'all' ? moduleFilter : null,
        action: actionFilter !== 'all' ? (actionFilter as AuditAction) : null,
        userId: userFilter.trim() || null,
        query: searchQuery.trim() || null,
      },
      5000,
    );
    if (error) {
      toast.error('Failed to export CSV');
      return;
    }
    const csv = buildCsv(mapLogs((data || []) as AuditLog[]));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const exportPdf = () => {
    const rows = filteredLogs.slice(0, 200);
    const htmlRows = rows
      .map(
        (row) => `
      <tr>
        <td>${escapeHtml(new Date(row.time).toLocaleString())}</td>
        <td>${escapeHtml(row.role)}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml(row.module)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.message || '')}</td>
      </tr>
    `,
      )
      .join('');

    const win = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!win) {
      toast.error('Popup blocked; cannot open report');
      return;
    }
    win.document.write(`
      <html lang="en">
        <head><title>Audit Logs Report</title></head>
        <body style="font-family:Arial,sans-serif;padding:20px;">
          <h2>Audit Logs Report</h2>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr><th>Time</th><th>Role</th><th>Action</th><th>Module</th><th>Status</th><th>Message</th></tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    toast.success('PDF report ready');
  };

  const createManualLog = async () => {
    const module = window.prompt('Module (example: wallet/server/ai)', 'system');
    if (!module) return;
    const actionInput = window.prompt('Action (create/update/delete/login/logout/read)', 'create');
    const statusInput = window.prompt('Status (success/fail)', 'success');
    const note = window.prompt('Message', 'Manual audit log');
    const validActions: AuditAction[] = ['create', 'read', 'update', 'delete', 'login', 'logout', 'activate', 'suspend'];
    const actionRaw = String(actionInput || 'read').toLowerCase();
    const action = (validActions.includes(actionRaw as AuditAction) ? actionRaw : 'read') as AuditAction;
    const status = statusInput === 'fail' ? 'fail' : 'success';
    const { error } = await createManualAuditLog({
      role: 'admin',
      action,
      module,
      tableName: module,
      newData: { message: note || 'Manual audit log' },
      status,
    });
    if (error) {
      toast.error('Failed to create log');
      return;
    }
    toast.success('Manual audit log created');
    await fetchLogs(false);
    await fetchStats();
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="glass-card rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">Audit Logs</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void fetchLogs(false)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => void exportCsv()}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={exportPdf}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button onClick={() => void createManualLog()}>
                <Plus className="h-4 w-4 mr-2" />
                Manual Log
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => void fetchLogs(true)}
            />
            <Input
              placeholder="User ID"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              onBlur={() => void fetchLogs(true)}
            />
            <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v)}>
              <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                <SelectItem value="products">Products</SelectItem>
                <SelectItem value="orders">Orders</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="servers">Servers</SelectItem>
                <SelectItem value="keys">Keys</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v)}>
              <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Total: {stats?.total_logs ?? 0}</Badge>
            <Badge variant="outline">Create: {stats?.creates ?? 0}</Badge>
            <Badge variant="outline">Update: {stats?.updates ?? 0}</Badge>
            <Badge variant="outline">Delete: {stats?.deletes ?? 0}</Badge>
            <Badge variant="outline">Rows: {filteredLogs.length}</Badge>
          </div>
        </div>

        <div className="glass-card rounded-xl p-0 overflow-hidden">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background/95 backdrop-blur border-b">
                <tr>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Role</th>
                  <th className="text-left px-3 py-2">Action</th>
                  <th className="text-left px-3 py-2">Module</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-6 text-muted-foreground" colSpan={6}>Loading...</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td className="px-3 py-6 text-muted-foreground" colSpan={6}>No logs found</td></tr>
                ) : (
                  filteredLogs.map((row) => (
                    <tr key={row.id} className="border-b border-border/40">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(row.time).toLocaleString()}</td>
                      <td className="px-3 py-2">{row.role}</td>
                      <td className="px-3 py-2">{row.action}</td>
                      <td className="px-3 py-2">{row.module}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            row.status === 'error'
                              ? 'border-red-500/40 text-red-400'
                              : row.status === 'warning'
                              ? 'border-amber-500/40 text-amber-400'
                              : 'border-emerald-500/40 text-emerald-400'
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{row.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
