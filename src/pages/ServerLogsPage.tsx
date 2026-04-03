import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SimpleBuildLogs } from '@/components/servers/SimpleBuildLogs';

export default function ServerLogsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">Server Logs</h2>
          <p className="text-sm text-muted-foreground">Deployment and runtime logs.</p>
        </div>
        <SimpleBuildLogs />
      </div>
    </DashboardLayout>
  );
}
