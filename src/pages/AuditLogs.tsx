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

import type { Database } from '@/integrations/supabase/types';

type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
type AuditAction = Database['public']['Enums']['audit_action'];

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

      if (error) throw error;
      setLogs((data || []) as AuditLog[]);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      if (!suppressLoadingUI) {
        toast.error('Failed to fetch audit logs');
      }
    } finally {


  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const interval = window.setInterval(() => {

  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="glass-card rounded-xl p-4">

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
            )}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
