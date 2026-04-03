import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingCart, CreditCard, ExternalLink, Download } from 'lucide-react';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { useMarketplaceProducts } from '@/hooks/useMarketplaceProducts';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { apkApi } from '@/lib/api';
import { toast } from 'sonner';


function hasScreenshots(value: unknown): value is { screenshots?: unknown[] } {
  return typeof value === 'object' && value !== null && 'screenshots' in value;
}

export default function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { products, loading } = useMarketplaceProducts();
  const { toggleItem, isInCart } = useCart();
  const { user } = useAuth();
  const { trackPromoClick, addToCart: addToCartServer } = useMarketplaceActions();

  const product = useMemo(() => products.find((item) => item.id === id), [products, id]);
  const refCode = useMemo(() => new URLSearchParams(window.location.search).get('ref') || '', []);
  const trackedPromoRef = useRef('');

  useEffect(() => {
    if (!refCode) return;
    if (trackedPromoRef.current === refCode) return;
    trackedPromoRef.current = refCode;
    void trackPromoClick(refCode).catch(() => undefined);
    try { localStorage.setItem('sv_last_promo_ref', refCode); } catch {}
  }, [refCode, trackPromoClick]);

  useEffect(() => {
    if (!loading && id && !product) {
      navigate('/marketplace', { replace: true });
    }
  }, [loading, id, product, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MarketplaceHeader />
        <main className="pt-20 px-4 md:px-8">
          <p className="text-sm text-muted-foreground">Loading product...</p>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <MarketplaceHeader />
        <main className="pt-20 px-4 md:px-8 space-y-4">
          <p className="text-sm text-muted-foreground">Product not found.</p>
          <Button onClick={() => navigate('/')}>Go Marketplace</Button>
        </main>
      </div>
    );
  }

  if (product.status === 'draft' || product.isAvailable === false) {
    return (
      <div className="min-h-screen bg-background">
        <MarketplaceHeader />
        <main className="pt-20 px-4 md:px-8 space-y-4">
          <p className="text-sm text-muted-foreground">This product is unavailable right now.</p>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/marketplace')}>Go Marketplace</Button>
            <Button variant="outline" onClick={() => navigate('/subscription')}>View Subscription</Button>
          </div>
        </main>
      </div>
    );
  }

  const inCart = isInCart(product.id);

  const screenshots = useMemo(() => {
    const rawScreenshots = hasScreenshots(product) ? product.screenshots : undefined;
    if (Array.isArray(rawScreenshots)) {
      const unique = rawScreenshots.filter((shot: unknown) => typeof shot === 'string' && shot.trim());
      return Array.from(new Set(unique));
    }
    return product.image ? [product.image] : [];
  }, [product]);

  const handleBuyNow = () => {
    if (!user) {
      toast.error('Please sign in to continue');
      navigate('/auth');
      return;
    }
    navigate(`/checkout?product_id=${encodeURIComponent(product.id)}`);
  };

  const handleDownload = async () => {
    if (!user) {
      toast.error('Please sign in to download');
      navigate('/auth');
      return;
    }
    if (!product.apk_enabled) {
      toast.info('Coming Soon');
      return;
    }
    if (isBuilding) {
      toast.info('Building...');
      return;
    }
    try {
      const res = await apkApi.download(product.id);
      if (res?.allowed && (res?.download_url || res?.url)) {
        window.open(res.download_url || res.url, '_blank');
        return;
      }
      toast.error(res?.message || 'Please purchase first');
    } catch (_e) {
      toast.error('Download failed');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MarketplaceHeader />
      <main className="pt-20 pb-10 px-4 md:px-8 max-w-4xl mx-auto space-y-6">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <section className="rounded-2xl border border-border/50 bg-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-foreground">{product.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{product.subtitle}</p>
            </div>
            <Badge variant="outline" className="text-base font-black">{localizedPrice}</Badge>
          </div>

          {screenshots.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {screenshots.map((shot, idx) => (
                <div key={`screenshot-${idx}`} className="overflow-hidden rounded-lg border border-border/40">
                  <img src={shot} alt={`Screenshot ${idx + 1}`} className="w-full h-40 object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(product.features || []).map((feature, index) => (
              <Badge key={index} variant="secondary">{feature.text}</Badge>
            ))}
            {Array.isArray(product.tags) && product.tags.map((tag: string) => (
              <Badge key={tag} variant="outline">{tag}</Badge>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant={inCart ? 'secondary' : 'outline'}
              onClick={async () => {
                toggleItem({
                  id: product.id,
                  title: product.title,
                  subtitle: product.subtitle || '',
                  image: product.image || '',
                  price: product.price,
                  category: product.category || 'Software',
                });
                if (!inCart && user) {
                  try { await addToCartServer(product.id, 1); } catch {}
                }
              }}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {inCart ? 'Remove from Cart' : 'Add to Cart'}
            </Button>
            <Button onClick={handleBuyNow}>
              <CreditCard className="h-4 w-4 mr-2" /> Buy Now
            </Button>
            <Button variant="secondary" onClick={handleDownload} disabled={!product.apk_enabled || isBuilding}>
              <Download className="h-4 w-4 mr-2" /> Download APK
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/app/${product.id}`)}>
              <ExternalLink className="h-4 w-4 mr-2" /> Access
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
