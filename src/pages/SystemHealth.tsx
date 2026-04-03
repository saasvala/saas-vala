import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Shield,
  Package,
  CreditCard,
  Activity,
  Cpu,
  HardDrive,
  Loader2,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { healthService } from '@/services/healthService';
import { toast } from 'sonner';

type ModuleKey = 'database' | 'auth' | 'api' | 'wallet' | 'server' | 'ai' | 'storage' | 'payment';
type ModuleStatus = 'healthy' | 'warning' | 'error' | 'checking';

interface HealthCheck {
  name: string;
  status: ModuleStatus;
  message: string;
  icon: React.ComponentType<{ className?: string }>;
  responseTime?: number;
}

type HealthSnapshot = {
  database: 'healthy' | 'warning' | 'error';
  auth: 'healthy' | 'warning' | 'error';
  api: 'healthy' | 'warning' | 'error';
  wallet: 'healthy' | 'warning' | 'error';
  server: 'healthy' | 'warning' | 'error';
  ai: 'healthy' | 'warning' | 'error';
  storage: 'healthy' | 'warning' | 'error';
  payment: 'healthy' | 'warning' | 'error';
  checked_at?: string;
  last_checked?: string;
  response_times?: Partial<Record<ModuleKey, number>>;
  details?: Partial<Record<ModuleKey, { message?: string }>>;
  health_score?: number;
};

const moduleConfig: Array<{ key: ModuleKey; name: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'database', name: 'Database', icon: Database },
  { key: 'auth', name: 'Authentication', icon: Shield },
  { key: 'api', name: 'API', icon: Activity },
  { key: 'wallet', name: 'Wallet', icon: CreditCard },
  { key: 'server', name: 'Server', icon: Server },
  { key: 'ai', name: 'AI', icon: Cpu },
  { key: 'storage', name: 'Storage', icon: HardDrive },
  { key: 'payment', name: 'Payment', icon: Package },
];

const buildCheckingState = (): HealthCheck[] =>
  moduleConfig.map((module) => ({
    name: module.name,
    status: 'checking',
    message: 'Checking...',
    icon: module.icon,
  }));

function unwrapHealthPayload(raw: unknown): HealthSnapshot {
  const payload = raw as Record<string, unknown> | null;
  const data = (payload?.data as Record<string, unknown> | undefined) || payload || {};
  return data as unknown as HealthSnapshot;
}

export default function SystemHealth() {
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>(buildCheckingState());
  const [healthPercentage, setHealthPercentage] = useState(0);
  const service = useMemo(() => healthService(5000), []);

  const applySnapshot = (raw: unknown) => {
    const snapshot = unwrapHealthPayload(raw);
    const checks = moduleConfig.map((module) => {
      const status = snapshot[module.key] || 'error';
      const responseTime = Number(snapshot.response_times?.[module.key] || 0);
      const message = snapshot.details?.[module.key]?.message || `${module.name} ${status}`;
      return {
        name: module.name,
        status,
        message,
        icon: module.icon,
        responseTime,
      } as HealthCheck;
    });

    setHealthChecks(checks);
    if (Number.isFinite(Number(snapshot.health_score))) {
      setHealthPercentage(Number(snapshot.health_score));
    }
    const checkedAt = snapshot.last_checked || snapshot.checked_at;
    setLastCheck(checkedAt ? new Date(checkedAt) : new Date());
  };

  const runHealthCheck = async () => {
    try {
      setLoading(true);
      await service.runCheck();
      toast.success('Health check completed');
    } catch (error) {
      console.error('Run check failed:', error);
      toast.error('Run check failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribeUpdate = service.onUpdate((result) => {
      applySnapshot(result);
      setLoading(false);
    });
    const unsubscribeError = service.onError((error) => {
      console.error('System health fetch failed:', error);
      setLoading(false);
      toast.error('Failed to fetch system health');
    });
    service.start();
    return () => {
      unsubscribeUpdate();
      unsubscribeError();
      service.stop();
    };
  }, [service]);

  const overallStatus = healthChecks.every((c) => c.status === 'healthy')
    ? 'healthy'
    : healthChecks.some((c) => c.status === 'error')
      ? 'error'
      : 'warning';

  const okCount = healthChecks.filter((c) => c.status === 'healthy').length;
  const hasErrors = healthChecks.some((c) => c.status === 'error');

  useEffect(() => {
    if (!loading && hasErrors) {
      toast.error('System health alert: one or more modules are in error state');
    }
  }, [hasErrors, loading]);

  const statusConfig = {
    healthy: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/20' },
    error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
    checking: { icon: Loader2, color: 'text-muted-foreground', bg: 'bg-muted' },
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              System Health
            </h2>
            <p className="text-muted-foreground">
              Real-time monitoring of all core system modules
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastCheck && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Last check: {lastCheck.toLocaleTimeString()}
              </div>
            )}
            <Button onClick={runHealthCheck} disabled={loading} className="gap-2">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              {loading ? 'Checking...' : 'Run Check'}
            </Button>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={cn('w-16 h-16 rounded-xl flex items-center justify-center', statusConfig[overallStatus].bg)}>
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  React.createElement(statusConfig[overallStatus].icon, {
                    className: cn('h-8 w-8', statusConfig[overallStatus].color)
                  })
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground uppercase">
                  {loading ? 'CHECKING...' : overallStatus === 'healthy' ? 'ALL SYSTEMS OPERATIONAL' : overallStatus === 'warning' ? 'MINOR ISSUES DETECTED' : 'CRITICAL ISSUES'}
                </h3>
                <p className="text-muted-foreground">
                  {okCount}/{healthChecks.length} modules healthy
                </p>
              </div>
            </div>
            <div className="flex-1 max-w-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Health Score</span>
                <span className={cn('font-bold', statusConfig[overallStatus].color)}>{healthPercentage}%</span>
              </div>
              <Progress value={healthPercentage} className="h-3" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {healthChecks.map((check) => {
            const StatusIcon = statusConfig[check.status].icon;
            return (
              <div
                key={check.name}
                className={cn(
                  'glass-card rounded-xl p-4 transition-all',
                  check.status === 'error' && 'border-red-500/30',
                  check.status === 'warning' && 'border-amber-500/30'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', statusConfig[check.status].bg)}>
                    <check.icon className={cn('h-5 w-5', statusConfig[check.status].color)} />
                  </div>
                  <StatusIcon className={cn(
                    'h-5 w-5',
                    statusConfig[check.status].color,
                    check.status === 'checking' && 'animate-spin'
                  )} />
                </div>
                <h4 className="font-semibold text-foreground mb-1">{check.name}</h4>
                <p className="text-sm text-muted-foreground">{check.message}</p>
                {check.responseTime !== undefined && check.responseTime > 0 && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {check.responseTime} ms
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

        <div className="glass-card rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => window.location.href = '/audit-logs'}>
              View Audit Logs
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/settings'}>
              System Settings
            </Button>
            <Button variant="outline" onClick={() => runHealthCheck()}>
              Refresh All Checks
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
