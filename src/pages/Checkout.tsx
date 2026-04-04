import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCart } from '@/hooks/useCart';
import { useMarketplaceProducts } from '@/hooks/useMarketplaceProducts';
import { useApkPurchase } from '@/hooks/useApkPurchase';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplaceActions } from '@/hooks/useMarketplaceActions';
import { geoApi, offerApi } from '@/lib/api';

const SAFE_PRODUCT_PARAM = /^[a-zA-Z0-9_-]+$/;
const PENDING_PAYMENT_MAX_AGE_MS = 15 * 60 * 1000;
type PaymentMethod = 'wallet' | 'upi' | 'card' | 'crypto';
type ActiveOffer = {
  id: string;
  festival: string;
  discount: number;
  country: string;
  expires_in: string;
};

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  return `fallback-${Date.now()}-${rand}`;
}

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { items, total, clearCart } = useCart();
  const { products } = useMarketplaceProducts();
  const { purchaseApk, processing } = useApkPurchase();
  const { trackPromoConversion } = useMarketplaceActions();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [activeOffer, setActiveOffer] = useState<ActiveOffer | null>(null);
  const [couponCode, setCouponCode] = useState('');

  const payInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  const pendingRestoreAttemptedRef = useRef(false);
  const trackedConversionRef = useRef<string | null>(null);

  const requestedProductId = searchParams.get('product_id')?.trim() || '';
  const refCode = searchParams.get('ref')?.trim() || '';
  const hasInvalidProductParam = requestedProductId.length > 0 && !SAFE_PRODUCT_PARAM.test(requestedProductId);

  const selected = useMemo(() => {
    if (requestedProductId) {
      const byQuery = products.find((p) => String(p.id) === requestedProductId);
      if (byQuery) return byQuery;
    }
    if (items[0]) return items[0];
    return products[0] || null;
  }, [requestedProductId, products, items]);

  const payable = useMemo(() => {
    if (selected) return Math.max(0, Number(selected.price || 0));
    return Math.max(0, Number(total || 0));
  }, [selected, total]);

  const effectiveDiscountPercent = useMemo(
    () => Math.max(0, Math.min(100, Number(activeOffer?.discount || 0))),
    [activeOffer],
  );

  const finalPayable = useMemo(() => {
    const discountAmount = (payable * effectiveDiscountPercent) / 100;
    return Math.max(0, Number((payable - discountAmount).toFixed(2)));
  }, [payable, effectiveDiscountPercent]);

  const resolvedCouponCode = useMemo(() => {
    const typed = couponCode.trim();
    if (typed) return typed;
    return activeOffer ? activeOffer.festival.toUpperCase().replace(/\s+/g, '') : '';
  }, [couponCode, activeOffer]);

  const restorePendingPayment = async () => {
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;
    setRestoring(true);
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
      if (createdAt && Date.now() - createdAt > PENDING_PAYMENT_MAX_AGE_MS) {
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
    } finally {
      restoreInFlightRef.current = false;
      setRestoring(false);
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
    const idempotencyKey = makeIdempotencyKey();

    try {
      const result = await purchaseApk(selected, {
        paymentMethod,
        idempotencyKey,
        amountOverride: finalPayable,
        couponCode: resolvedCouponCode || null,
        appliedOfferId: activeOffer?.id || null,
      });
      if (!result.success) {
        toast.error(result.error || 'Payment failed');
        return;
      }

      if (refCode && trackedConversionRef.current !== refCode) {
        trackedConversionRef.current = refCode;
        try {
          await trackPromoConversion(refCode, finalPayable);
        } catch {
          // non-blocking
        }
      }

      if (items.length > 0) clearCart();

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
      if (createdAt && Date.now() - createdAt > PENDING_PAYMENT_MAX_AGE_MS) return;
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

  useEffect(() => {
    let mounted = true;
    const loadActiveOffers = async () => {
      try {
        const geo = await geoApi.detect().catch(() => ({ country_code: 'ALL' }));
        const country = String((geo as any)?.country_code || 'ALL').toUpperCase();
        const response = await offerApi.active(country);
        const rows = Array.isArray((response as any)?.data)
          ? (response as any).data
          : (response as any)?.id
            ? [response as any]
            : [];
        if (!mounted) return;
        if (rows.length > 0) {
          const row = rows[0];
          setActiveOffer({
            id: String(row.id || ''),
            festival: String(row.festival || 'Festival Offer'),
            discount: Number(row.discount || 0),
            country: String(row.country || country),
            expires_in: String(row.expires_in || '0 days'),
          });
        } else {
          setActiveOffer(null);
        }
      } catch {
        if (mounted) setActiveOffer(null);
      }
    };
    void loadActiveOffers();
    return () => {
      mounted = false;
    };
  }, []);

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
          {activeOffer && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-sm font-semibold text-foreground">🎉 {activeOffer.festival} Offer</p>
              <p className="text-xs text-muted-foreground">🔥 Flat {activeOffer.discount}% OFF • ⏳ Ends in {activeOffer.expires_in}</p>
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder={`Coupon (optional): ${activeOffer.festival.toUpperCase().replace(/\s+/g, '')}`}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Final Total</span>
                <span className="text-2xl font-black text-primary">${finalPayable}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Payment Method</span>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
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
            {processing || submitting ? 'Processing...' : `Pay $${finalPayable} via ${paymentMethod.toUpperCase()}`}
          </Button>
          <Button variant="outline" className="w-full" onClick={restorePendingPayment} disabled={restoring}>
            {restoring ? 'Restoring...' : 'Retry Pending Payment'}
          </Button>
        </section>
      </main>
    </div>
  );
}
