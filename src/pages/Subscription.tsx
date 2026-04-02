import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SubscriptionRow {
  id: string;
  plan_name: string;
  status: string | null;
  current_period_end: string | null;
  product_id: string | null;
}

export default function Subscription() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('subscriptions')
        .select('id, plan_name, status, current_period_end, product_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (mounted) {
        setRows((data || []) as SubscriptionRow[]);
        setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const active = rows.find((row) => {
    const status = String(row.status || '').toLowerCase();
    const notExpired = !row.current_period_end || new Date(row.current_period_end) > new Date();
    return (status === 'active' || status === 'trialing') && notExpired;
  });

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-black text-foreground">Subscription</h1>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading subscriptions...</p>
        ) : active ? (
          <div className="rounded-xl border border-border p-5 bg-card space-y-3">
            <Badge variant="outline" className="bg-success/20 text-success border-success/30">Active</Badge>
            <p className="text-sm text-foreground">Plan: {active.plan_name}</p>
            <p className="text-xs text-muted-foreground">
              Expires: {active.current_period_end ? new Date(active.current_period_end).toLocaleString() : 'No expiry'}
            </p>
            <Button onClick={() => navigate(active.product_id ? `/app/${active.product_id}` : '/dashboard')}>
              Access App
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border p-5 bg-card space-y-3">
            <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">No Active Plan</Badge>
            <p className="text-sm text-muted-foreground">You need an active subscription to access app routes.</p>
            <Button onClick={() => navigate('/')}>Browse Products</Button>
          </div>
        )}
      </main>
    </div>
  );
}
