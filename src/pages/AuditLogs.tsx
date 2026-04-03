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

export default function AuditLogs() {


  useEffect(() => {
    void fetchInitial();
    void fetchStats();
  }, [fetchInitial, fetchStats]);

  useEffect(() => {

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
