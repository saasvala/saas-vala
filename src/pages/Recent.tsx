import { useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRecentActions } from '@/hooks/useRecentActions';
import { useNavigate } from 'react-router-dom';

export default function Recent() {
  const { actions } = useRecentActions();
  const navigate = useNavigate();

  const items = useMemo(() => actions.slice(0, 30), [actions]);
  const openRoute = (href?: string) => {
    if (!href) {
      console.warn('Recent action missing href; redirecting to dashboard');
      navigate('/dashboard');
      return;
    }
    navigate(href);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Recent Activity</h1>
          <p className="text-sm text-muted-foreground">Route: /recent</p>
        </div>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Recent Actions</CardTitle>
            <CardDescription>Quick links to your latest flow actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 && <p className="text-sm text-muted-foreground">No recent actions yet.</p>}
            {items.map((item) => (
              <div key={`${item.href}-${item.at}`} className="flex items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString()}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => openRoute(item.href)}
                >
                  Open
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
