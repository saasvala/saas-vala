import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ServerListPanel } from '@/components/servers/ServerListPanel';

export default function ServerAdd() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">Add Server</h2>
          <p className="text-sm text-muted-foreground">Create and connect a new server.</p>
        </div>
        <ServerListPanel routeModeAdd />
      </div>
    </DashboardLayout>
  );
}
