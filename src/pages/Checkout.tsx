import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [restoring, setRestoring] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'upi' | 'card' | 'crypto'>('wallet');
  const payInFlightRef = useRef(false);
  const pendingRestoreAttemptedRef = useRef(false);

  const selected = useMemo(() => {
    const productId = searchParams.get('product_id');
    if (productId) {
      const byQuery = products.find((p) => String(p.id) === String(productId));
      if (byQuery) return byQuery;
    }
    if (items[0]) return items[0];
    return products[0] || null;
  }, [items, products, searchParams]);

  const hasInvalidProductParam = useMemo(() => {
    const productId = (searchParams.get('product_id') || '').trim();
    if (!productId) return false;
    if (products.length === 0) return false;
    return !products.some((p) => String(p.id) === String(productId));
  }, [products, searchParams]);

  const onPay = async () => {
    if (payInFlightRef.current) return;
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!selected) {
      toast.error('No product available to checkout');
      return;
    }
    payInFlightRef.current = true;
    setSubmitting(true);
    try {
      const result = await purchaseApk(selected, { paymentMethod: paymentMethod as any });
      if (!result.success) {
        toast.error(result.error || 'Payment failed');
        return;
      }

      const promoRef = localStorage.getItem('sv_last_promo_ref') || '';
      if (promoRef) {
        await trackPromoConversion(promoRef, Number(payable || 0)).catch(() => undefined);
      }
      localStorage.removeItem('sv_last_promo_ref');
      clearCart();
      navigate(`/success?product=${encodeURIComponent(selected.id)}&order=${encodeURIComponent(result.transactionId || '')}`);
      toast.success('Payment completed successfully');
    } finally {
      payInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const restorePendingPayment = async () => {
    if (restoring) return;
    setRestoring(true);
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
    } finally {
      setRestoring(false);
    }
  };

  const payable = total > 0 ? total : selected?.price || 0;

  useEffect(() => {
    if (pendingRestoreAttemptedRef.current) return;
    pendingRestoreAttemptedRef.current = true;
    try {
      const raw = sessionStorage.getItem('sv_pending_payment');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { paymentId?: string; ts?: number };
      if (!parsed?.paymentId) return;
      const createdAt = Number(parsed.ts || 0);
      if (createdAt && Date.now() - createdAt > 15 * 60 * 1000) return;
      void restorePendingPayment();
    } catch {
      // ignore malformed pending data
    }
  }, []);

  useEffect(() => {
    if (!hasInvalidProductParam) return;
    toast.info('Invalid product selected. Redirected to marketplace.');
    navigate('/marketplace', { replace: true });
  }, [hasInvalidProductParam, navigate]);

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

          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Payment Method</span>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={onPay} disabled={processing || submitting || !selected}>
            <CreditCard className="h-4 w-4 mr-2" />
            {processing || submitting ? 'Processing...' : `Pay $${payable} via ${paymentMethod.toUpperCase()}`}
          </Button>
          <Button variant="outline" className="w-full" onClick={restorePendingPayment} disabled={restoring}>
            {restoring ? 'Restoring...' : 'Retry Pending Payment'}
          </Button>
        </section>
      </main>
    </div>
  );
}
