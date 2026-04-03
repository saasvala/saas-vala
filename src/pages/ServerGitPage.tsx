import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GitConnect } from '@/components/servers/GitConnect';

export default function ServerGitPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">Git Integration</h2>
          <p className="text-sm text-muted-foreground">Connect repositories and trigger Git-based deploy flow.</p>
        </div>
        <GitConnect />
      </div>
    </DashboardLayout>
  );
}
