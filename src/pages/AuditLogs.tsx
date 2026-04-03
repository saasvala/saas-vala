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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export default function AuditLogs() {


  useEffect(() => {
    void fetchInitial();
    void fetchStats();
  }, [fetchInitial, fetchStats]);

  useEffect(() => {

  };

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

  const exportCsv = () => {
    const csv = buildCsv(filteredLogs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV complete');
  };

  const exportPdf = () => {
    const rows = filteredLogs.slice(0, 200);
    const htmlRows = rows.map((row) => `
      <tr>
        <td>${escapeHtml(new Date(row.time).toLocaleString())}</td>
        <td>${escapeHtml(row.role)}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml(row.module)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.message || '')}</td>
      </tr>
    `).join('');

    toast.info('Opening printable report in a new window');
    const win = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!win) {
      toast.error('Popup blocked; cannot open PDF report');
      return;
    }

    win.document.write(`
      <html lang="en">
        <head><title>Audit Logs Report</title></head>
        <body aria-label="Audit Logs Printable Report" style="font-family:Arial,sans-serif;padding:20px;">
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
    toast.success('Export PDF ready');
  };

  const shareLogs = async (platform: 'whatsapp' | 'telegram') => {
    if (filteredLogs.length === 0) {
      toast.error('No logs selected for sharing');
      return;
    }
    const { data, error } = await exportAuditLogs(
      'csv',
      {
        tableName: moduleFilter !== 'all' ? moduleFilter : null,
        action: actionFilter !== 'all' ? actionFilter : null,
        userId: userFilter.trim() || null,
        query: searchQuery.trim() || null,
      },
      5000,
    );

    if (error) {
      toast.error('Failed to prepare share export');
      return;
    }

    const shareRows = ((data || []) as AuditLog[]).map((log) => {
      const metadata = toObject(log.metadata);
      return {
        id: log.id,
        raw: log,
        time: log.occurred_at || log.created_at || new Date().toISOString(),
        role: stringFrom(metadata, ['role', 'user_role', 'actor_role', 'userRole', 'actorRole']) || (log.is_system ? 'system' : 'user'),
        action: log.action,
        module: log.target_table || log.table_name || log.entity || stringFrom(metadata, ['module', 'service']) || 'system',
        status: toStatus(log, metadata),
        message: stringFrom(metadata, ['message', 'description', 'event_message']) || `${log.event_type || 'event'} on ${log.target_table || log.table_name || 'system'}`,
      } as EnrichedAuditLog;
    });

    const csv = buildCsv(shareRows.slice(0, 1000));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const fileUrl = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = fileUrl;
    download.download = `audit-share-${new Date().toISOString().split('T')[0]}.csv`;
    download.click();
    URL.revokeObjectURL(fileUrl);

    const shareTarget = new URL('/audit-logs', window.location.origin);
    if (moduleFilter !== 'all') shareTarget.searchParams.set('table', moduleFilter);
    if (actionFilter !== 'all') shareTarget.searchParams.set('action', actionFilter);
    if (userFilter.trim()) shareTarget.searchParams.set('user', userFilter.trim());
    if (searchQuery.trim()) shareTarget.searchParams.set('q', searchQuery.trim());
    const text = encodeURIComponent(`Audit logs exported. Review link: ${shareTarget.toString()}`);
    const shareUrl = platform === 'whatsapp'
      ? `https://wa.me/?text=${text}`
      : `https://t.me/share/url?url=${encodeURIComponent(shareTarget.toString())}&text=${encodeURIComponent('Audit logs exported')}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
    toast.success(`Share link opened on ${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'}`);
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
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="glass-card rounded-xl p-4">

              </div>
            )}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
