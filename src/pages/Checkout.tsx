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

const SAFE_PRODUCT_PARAM = /^[a-zA-Z0-9_-]+$/;

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { items, total, clearCart } = useCart();
  const { products } = useMarketplaceProducts();
  const { purchaseApk, processing } = useApkPurchase();
  const { trackPromoConversion } = useMarketplaceActions();
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'upi' | 'card' | 'crypto'>('wallet');

  const payInFlightRef = useRef(false);
  const pendingRestoreAttemptedRef = useRef(false);
  const trackedConversionRef = useRef('');
  const refCode = useMemo(() => new URLSearchParams(window.location.search).get('ref') || '', []);

  const requestedProductId = String(searchParams.get('product_id') || '').trim();
  const hasInvalidProductParam = Boolean(requestedProductId && !SAFE_PRODUCT_PARAM.test(requestedProductId));

  const selected = useMemo(() => {
    if (requestedProductId) {
      const byQuery = products.find((p) => String(p.id) === requestedProductId);
      if (byQuery) return byQuery;
    }
    if (items[0]) return items[0];
    return products[0] || null;
  }, [items, products, requestedProductId]);

  const payable = total > 0 ? total : selected?.price || 0;

  const restorePendingPayment = async () => {
    try {
      const raw = sessionStorage.getItem('sv_pending_payment');
      if (!raw) {
        toast.info('No pending payment found');
        return;
      }
      const parsed = JSON.parse(raw) as { paymentId?: string; ts?: number };
      if (!parsed?.paymentId) {
        toast.info('No pending payment found');
        return;
      }
      const createdAt = Number(parsed.ts || 0);
      if (createdAt && Date.now() - createdAt > 15 * 60 * 1000) {
        toast.info('Pending payment expired. Please start again.');
        try {
          sessionStorage.removeItem('sv_pending_payment');
        } catch {
          // ignore
        }
        return;
      }
      const { marketplaceApi } = await import('@/lib/api');
      await marketplaceApi.retryPayment(parsed.paymentId);
      toast.success('Payment restore initiated');
    } catch {
      toast.error('Failed to restore payment');
    }
  };

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
    const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const result = await purchaseApk(selected, { paymentMethod, idempotencyKey: requestId });
      if (!result.success) {
        toast.error(result.error || 'Payment failed');
        return;
      }

      if (refCode && trackedConversionRef.current !== refCode) {
        trackedConversionRef.current = refCode;
        try {
          await trackPromoConversion(refCode, payable);
        } catch {
          // non-blocking
        }
      }

      if (items.length > 0) {
        clearCart();
      }

      const qs = new URLSearchParams();
      if (result.licenseKey) qs.set('key', result.licenseKey);
      if (selected.id) qs.set('product', selected.id);
      if (result.transactionId) qs.set('tx', result.transactionId);
      navigate(`/success${qs.toString() ? `?${qs.toString()}` : ''}`, { replace: true });
    } finally {
      payInFlightRef.current = false;
      setSubmitting(false);
    }
  };

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
          <Button variant="outline" className="w-full" onClick={restorePendingPayment}>
            Retry Pending Payment
          </Button>
        </section>
      </main>
    </div>
  );
}
