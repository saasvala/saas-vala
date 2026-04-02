import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplaceProducts } from '@/hooks/useMarketplaceProducts';

interface SubscriptionRow {
  status: string | null;
  current_period_end: string | null;
  product_id: string | null;
}

export default function AppAccess() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const { products } = useMarketplaceProducts();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!user?.id) {
        navigate('/auth', { replace: true });
        return;
      }

      const { data } = await supabase
        .from('subscriptions')
        .select('status, current_period_end, product_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      const rows = (data || []) as SubscriptionRow[];
      const access = rows.some((row) => {
        const status = String(row.status || '').toLowerCase();
        const notExpired = !row.current_period_end || new Date(row.current_period_end) > new Date();
        const productMatch = !row.product_id || row.product_id === id;
        return productMatch && (status === 'active' || status === 'trialing') && notExpired;
      });

      if (mounted) {
        if (!access) {
          navigate('/subscription', { replace: true });
          return;
        }
        setAllowed(true);
        setChecking(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [user?.id, id, navigate]);

  if (checking) {
    return <div className="min-h-screen bg-background p-8 text-sm text-muted-foreground">Checking subscription access...</div>;
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-black text-foreground">App Access</h1>
        <div className="rounded-xl border border-border p-5 bg-card space-y-3">
          <Badge variant="outline" className="bg-success/20 text-success border-success/30">Access Granted</Badge>
          <p className="text-sm text-foreground">
            {product ? `${product.title} is ready to use.` : `App ID ${id} is accessible.`}
          </p>
          <div className="flex gap-2">
            {product?.demoUrl ? (
              <Button onClick={() => window.open(product.demoUrl!, '_blank', 'noopener,noreferrer')}>Open App</Button>
            ) : (
              <Button onClick={() => navigate('/dashboard')}>Open Dashboard</Button>
            )}
            <Button variant="outline" onClick={() => navigate('/keys')}>View License</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
