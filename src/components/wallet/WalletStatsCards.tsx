import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Key,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WalletStatsCardsProps {
  balance: number;
  loading: boolean;
  thisMonthCredits: number;
  thisMonthDebits: number;
  pendingAmount: number;
  lastPaymentStatus: 'success' | 'failed' | 'pending' | null;
  lastPaymentAmount: number;
  activeLicenses: number;
  expiringLicenses: number;
}

export function WalletStatsCards({
  balance,
  loading,
  thisMonthCredits,
  thisMonthDebits,
  pendingAmount,
  lastPaymentStatus,
  lastPaymentAmount,
  activeLicenses,
  expiringLicenses,
}: WalletStatsCardsProps) {
  const getStatusIcon = () => {
    if (!lastPaymentStatus) return <Clock className="h-6 w-6 text-muted-foreground" />;
    switch (lastPaymentStatus) {
      case 'success':
        return <CheckCircle2 className="h-6 w-6 text-success" />;
      case 'failed':
        return <XCircle className="h-6 w-6 text-destructive" />;
      case 'pending':
        return <Clock className="h-6 w-6 text-warning" />;
    }
  };

  const getStatusText = () => {
    if (!lastPaymentStatus) return 'No payments yet';
    switch (lastPaymentStatus) {
      case 'success':
        return 'Payment Successful';
      case 'failed':
        return 'Payment Failed';
      case 'pending':
        return 'Payment Pending';
    }
  };

  const getStatusColor = () => {
    if (!lastPaymentStatus) return 'text-muted-foreground';
    switch (lastPaymentStatus) {
      case 'success':
        return 'text-success';
      case 'failed':
        return 'text-destructive';
      case 'pending':
        return 'text-warning';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Wallet Balance */}
      <Card className="glass-card-hover">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-orange-gradient flex items-center justify-center glow-orange">
              <Wallet className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold font-display text-foreground">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  `₹${balance.toLocaleString()}`
                )}
              </p>
              <p className="text-xs text-success flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" />
                +₹{thisMonthCredits.toLocaleString()} this month
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Payment Status */}
      <Card className="glass-card-hover">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Last Payment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className={cn(
              'h-12 w-12 rounded-xl flex items-center justify-center',
              lastPaymentStatus === 'success' && 'bg-success/20',
              lastPaymentStatus === 'failed' && 'bg-destructive/20',
              lastPaymentStatus === 'pending' && 'bg-warning/20',
              !lastPaymentStatus && 'bg-muted'
            )}>
              {getStatusIcon()}
            </div>
            <div>
              <p className={cn('text-lg font-bold font-display', getStatusColor())}>
                {getStatusText()}
              </p>
              {lastPaymentAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  ₹{lastPaymentAmount.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Licenses */}
      <Card className="glass-card-hover">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Active Licenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-cyan-gradient flex items-center justify-center glow-cyan">
              <Key className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold font-display text-foreground">
                {activeLicenses}
              </p>
              <p className="text-xs text-muted-foreground">
                Linked to wallet
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expiry Alerts */}
      <Card className="glass-card-hover">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Expiry Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className={cn(
              'h-12 w-12 rounded-xl flex items-center justify-center',
              expiringLicenses > 0 ? 'bg-warning/20' : 'bg-success/20'
            )}>
              {expiringLicenses > 0 ? (
                <AlertTriangle className="h-6 w-6 text-warning" />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-success" />
              )}
            </div>
            <div>
              <p className="text-2xl font-bold font-display text-foreground">
                {expiringLicenses}
              </p>
              <p className={cn(
                'text-xs',
                expiringLicenses > 0 ? 'text-warning' : 'text-success'
              )}>
                {expiringLicenses > 0 ? 'Expiring in 7 days' : 'All licenses healthy'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
