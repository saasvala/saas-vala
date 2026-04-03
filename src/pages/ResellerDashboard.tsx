import { useSearchParams } from 'react-router-dom';
import { ResellerLayout } from '@/components/reseller/ResellerLayout';
import { ResellerOverview } from '@/components/reseller/ResellerOverview';
import { KeyGeneratorPanel } from '@/components/reseller/KeyGeneratorPanel';
import { ClientsPanel } from '@/components/reseller/ClientsPanel';
import { AddBalancePanel } from '@/components/reseller/AddBalancePanel';
import { ReferralPanel } from '@/components/reseller/ReferralPanel';
import { ChangePasswordPanel } from '@/components/reseller/ChangePasswordPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

function SalesPanel() {
  return (
    <Card className="glass-card border-border/50">
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold text-foreground">Sales</h2>
        <p className="text-muted-foreground mt-2">Track reseller sales performance, order volume, and trends.</p>
        <div className="mt-6">
          <KeyGeneratorPanel />
        </div>
      </CardContent>
    </Card>
  );
}

function CommissionsPanel() {
  return (
    <Card className="glass-card border-border/50">
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold text-foreground">Commissions</h2>
        <p className="text-muted-foreground mt-2">Review commission earnings and payout-ready totals.</p>
        <div className="mt-6">
          <ReferralPanel />
        </div>
      </CardContent>
    </Card>
  );
}

function UsersPanel() {
  return (
    <Card className="glass-card border-border/50">
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold text-foreground">Users</h2>
        <p className="text-muted-foreground mt-2">Manage assigned users and customer accounts.</p>
        <div className="mt-6">
          <ClientsPanel />
        </div>
      </CardContent>
    </Card>
  );
}

function WithdrawalsPanel() {
  const navigate = useNavigate();
  return (
    <Card className="glass-card border-border/50">
      <CardContent className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Withdrawals</h2>
          <p className="text-muted-foreground mt-2">
            Request and track withdrawal transactions from reseller wallet balance.
          </p>
        </div>
        <Button onClick={() => navigate('/wallet')}>Open Wallet Withdrawals</Button>
      </CardContent>
    </Card>
  );
}
 
export default function ResellerDashboard() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
 
  const renderContent = () => {
    switch (activeTab) {
      case 'sales':
        return <SalesPanel />;
      case 'commissions':
        return <CommissionsPanel />;
      case 'users':
        return <UsersPanel />;
      case 'wallet':
        return <AddBalancePanel />;
      case 'withdrawals':
        return <WithdrawalsPanel />;
      case 'settings':
        return <ChangePasswordPanel />;
      default:
        return <ResellerOverview />;
    }
  };
 
   return (
     <ResellerLayout>
       {renderContent()}
     </ResellerLayout>
   );
 }
