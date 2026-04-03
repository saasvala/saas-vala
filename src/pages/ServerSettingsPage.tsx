import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SimpleSettings } from '@/components/servers/SimpleSettings';

export default function ServerSettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">Server Settings</h2>
          <p className="text-sm text-muted-foreground">Apply server settings and toggles instantly.</p>
        </div>
        <SimpleSettings />
      </div>
    </DashboardLayout>
  );
}
