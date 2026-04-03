import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProjectDeploy } from '@/components/servers/ProjectDeploy';

export default function ServerDeployPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">Server Deploy</h2>
          <p className="text-sm text-muted-foreground">Start, monitor, and rollback deployments.</p>
        </div>
        <ProjectDeploy />
      </div>
    </DashboardLayout>
  );
}
