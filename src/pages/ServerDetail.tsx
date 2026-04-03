import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatusCards } from '@/components/servers/StatusCards';
import { ServerListPanel } from '@/components/servers/ServerListPanel';

export default function ServerDetail() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">Server Details</h2>
          <p className="text-sm text-muted-foreground">View server status and manage server actions.</p>
        </div>
        <StatusCards />
        <ServerListPanel />
      </div>
    </DashboardLayout>
  );
}
