import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AutoSubdomain } from '@/components/servers/AutoSubdomain';
import { CustomDomain } from '@/components/servers/CustomDomain';

export default function ServerDnsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">DNS & Domains</h2>
          <p className="text-sm text-muted-foreground">Manage DNS records, subdomains, and domain verification.</p>
        </div>
        <AutoSubdomain />
        <CustomDomain />
      </div>
    </DashboardLayout>
  );
}
