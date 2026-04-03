import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useMarketplaceProducts } from '@/hooks/useMarketplaceProducts';
import { useApkPurchase } from '@/hooks/useApkPurchase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useMarketplaceActions } from '@/hooks/useMarketplaceActions';

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { items, total, clearCart } = useCart();
  const { products } = useMarketplaceProducts();
  const { purchaseApk, processing } = useApkPurchase();
  const { trackPromoConversion } = useMarketplaceActions();
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(() => {
    const productId = searchParams.get('product_id');
    if (productId) {
      const byQuery = products.find((p) => String(p.id) === String(productId));
      if (byQuery) return byQuery;
    }
    if (items[0]) return items[0];
    return products[0] || null;
  }, [items, products, searchParams]);

  const onPay = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!selected) {
      toast.error('No product available to checkout');
      return;
    }
    setSubmitting(true);
    const result = await purchaseApk({
      id: selected.id,
      title: selected.title,
      subtitle: selected.subtitle || '',
      image: selected.image || '',
      status: 'live',
      price: selected.price,
    });
    setSubmitting(false);
    if (result.success) {
      try {
        sessionStorage.removeItem('sv_pending_payment');
      } catch {}
      const promoRef = (() => {
        try { return localStorage.getItem('sv_last_promo_ref') || ''; } catch { return ''; }
      })();
      if (promoRef) {
        void trackPromoConversion(promoRef, selected.price || 0).catch(() => undefined);
      }
      clearCart();
      const next = new URLSearchParams();
      if (result.transactionId) next.set('tx', result.transactionId);
      if (result.licenseKey) next.set('key', result.licenseKey);
      if (selected.id) next.set('product', selected.id);
      navigate(`/success${next.toString() ? `?${next.toString()}` : ''}`);
    } else {
      toast.error(result.error || 'Payment failed');
    }
  };

  const restorePendingPayment = async () => {
    try {
      const raw = sessionStorage.getItem('sv_pending_payment');
      if (!raw) {
        toast.info('No pending payment found');
        return;
      }
      const parsed = JSON.parse(raw) as { paymentId?: string };
      if (!parsed?.paymentId) {
        toast.info('No pending payment found');
        return;
      }
      const { marketplaceApi } = await import('@/lib/api');
      await marketplaceApi.retryPayment(parsed.paymentId);
      toast.success('Payment restore initiated');
    } catch {
      toast.error('Failed to restore payment');
    }
  };

  const payable = total > 0 ? total : selected?.price || 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <h1 className="text-xl font-black text-foreground">Checkout</h1>
          {selected ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="font-semibold text-foreground text-sm">{selected.title}</p>
                <p className="text-xs text-muted-foreground">{selected.subtitle}</p>
              </div>
              <Badge variant="outline">${selected.price}</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No product selected.</p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-black text-primary">${payable}</span>
          </div>

          <Button className="w-full" onClick={onPay} disabled={processing || submitting || !selected}>
            <CreditCard className="h-4 w-4 mr-2" />
            {processing || submitting ? 'Processing...' : `Pay $${payable}`}
          </Button>
          <Button variant="outline" className="w-full" onClick={restorePendingPayment}>
            Retry Pending Payment
          </Button>
        </section>
      </main>
    </div>
  );
}
