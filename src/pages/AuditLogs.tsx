import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  FileText,
  RefreshCw,
  Loader2,
  Eye,
  Download,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { listAuditLogs, type AuditEventCategory } from '@/observability/auditClient';
import type { Database } from '@/integrations/supabase/types';

type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
type AuditAction = Database['public']['Enums']['audit_action'];

const categoryColors: Record<AuditEventCategory, string> = {
  AUTH: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  CRUD: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  SYSTEM: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  API: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  FILE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  SECURITY: 'bg-red-500/20 text-red-400 border-red-500/30',
  PAYMENT: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  BACKGROUND: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
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

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AuditEventCategory | 'all'>('all');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await listAuditLogs({
        limit: 500,
        eventCategory: categoryFilter === 'all' ? null : categoryFilter,
        targetTable: tableFilter === 'all' ? null : tableFilter,
        search: searchQuery || null,
      });
      if (error) throw error;
      setLogs((data || []) as AuditLog[]);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [categoryFilter, tableFilter]);

  const filteredLogs = logs.filter((log) => {
    const table = log.target_table || log.table_name || '';
    const eventType = log.event_type || '';
    const targetId = log.target_id || log.record_id || '';
    return table.toLowerCase().includes(searchQuery.toLowerCase())
      || eventType.toLowerCase().includes(searchQuery.toLowerCase())
      || targetId.includes(searchQuery);
  });

  const uniqueTables = [...new Set(logs.map((l) => l.target_table || l.table_name || 'system'))];

  const exportLogs = () => {
    const csv = [
      ['ID', 'Category', 'Event Type', 'Action', 'Target Table', 'Target ID', 'Actor ID', 'Occurred At'].join(','),
      ...filteredLogs.map((log) => [
        log.id,
        log.event_category || '',
        log.event_type || '',
        log.action,
        log.target_table || log.table_name || '',
        log.target_id || log.record_id || '',
        log.actor_id || log.user_id || '',
        log.occurred_at || log.created_at || '',
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Logs exported successfully');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              Audit Logs
            </h2>
            <p className="text-muted-foreground">
              Tamper-evident, append-only system activity logs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={fetchLogs} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={exportLogs} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="relative flex-1 md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50 border-border"
              />
            </div>
            <div className="flex items-center gap-3">
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as AuditEventCategory | 'all')}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="AUTH">AUTH</SelectItem>
                  <SelectItem value="CRUD">CRUD</SelectItem>
                  <SelectItem value="SYSTEM">SYSTEM</SelectItem>
                  <SelectItem value="API">API</SelectItem>
                  <SelectItem value="FILE">FILE</SelectItem>
                  <SelectItem value="SECURITY">SECURITY</SelectItem>
                  <SelectItem value="PAYMENT">PAYMENT</SelectItem>
                  <SelectItem value="BACKGROUND">BACKGROUND</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Target Table" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Targets</SelectItem>
                  {uniqueTables.map((table) => (
                    <SelectItem key={table} value={table}>{table}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{logs.length}</p>
            <p className="text-sm text-muted-foreground">Total Logs</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">{logs.filter((l) => l.event_category === 'AUTH').length}</p>
            <p className="text-sm text-muted-foreground">AUTH</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">{logs.filter((l) => l.event_category === 'CRUD').length}</p>
            <p className="text-sm text-muted-foreground">CRUD</p>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">{logs.filter((l) => l.event_category === 'API').length}</p>
            <p className="text-sm text-muted-foreground">API</p>
          </div>
        </div>

        <div className="glass-card rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-foreground mb-2">No audit logs found</h3>
              <p className="text-muted-foreground">Activity will appear here as users interact with the system</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-muted/50">
                  <TableHead className="text-muted-foreground">Category</TableHead>
                  <TableHead className="text-muted-foreground">Event</TableHead>
                  <TableHead className="text-muted-foreground">Action</TableHead>
                  <TableHead className="text-muted-foreground">Target</TableHead>
                  <TableHead className="text-muted-foreground">Actor</TableHead>
                  <TableHead className="text-muted-foreground">Timestamp</TableHead>
                  <TableHead className="text-muted-foreground text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.slice(0, 100).map((log) => {
                  const category = (log.event_category || 'SYSTEM') as AuditEventCategory;
                  const action = log.action;
                  return (
                    <TableRow key={log.id} className="border-border hover:bg-muted/30">
                      <TableCell>
                        <Badge variant="outline" className={cn('uppercase text-xs', categoryColors[category])}>
                          {category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">{log.event_type || 'unknown'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('uppercase text-xs', actionColors[action])}>
                          {action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">{log.target_table || log.table_name || 'system'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {(log.actor_id || log.user_id || 'System').slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(log.occurred_at || log.created_at || '').toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{selectedLog.event_category}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Event</p>
                  <p className="font-medium">{selectedLog.event_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Action</p>
                  <p className="font-medium">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Target</p>
                  <p className="font-mono text-sm">{selectedLog.target_table || selectedLog.table_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Target ID</p>
                  <p className="font-mono text-sm">{selectedLog.target_id || selectedLog.record_id || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Actor ID</p>
                  <p className="font-mono text-sm">{selectedLog.actor_id || selectedLog.user_id || 'System'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Timestamp</p>
                  <p>{new Date(selectedLog.occurred_at || selectedLog.created_at || '').toLocaleString()}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Metadata</p>
                <pre className="bg-muted/50 p-4 rounded-lg text-xs overflow-auto max-h-48">
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>

              {selectedLog.old_data && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Old Data</p>
                  <pre className="bg-muted/50 p-4 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_data && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">New Data</p>
                  <pre className="bg-muted/50 p-4 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

