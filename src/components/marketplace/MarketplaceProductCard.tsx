import React, { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Box, Copy, Download, ExternalLink, Heart, Package, Play, ShoppingCart, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import type { MarketplaceProduct } from '@/hooks/useMarketplaceProducts';
import { apkApi } from '@/lib/api';
import type { ApkDownloadResponse } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { useMarketplaceActions } from '@/hooks/useMarketplaceActions';
import { useButtonEngine } from '@/hooks/useButtonEngine';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatLocalizedPrice, getCurrencySymbol } from '@/lib/locale';
import { createPressHandlers, executeButtonAction, getButtonInteractionClassName } from '@/lib/buttonEngine';
import { resolveSafeRoute } from '@/lib/routeRegistry';

interface MarketplaceProductCardProps {
  product: MarketplaceProduct;
  index?: number;
  onBuyNow: (p: MarketplaceProduct) => void;
  rank?: number;
}

type LicenseRecord = {
  license_key?: string;
  status?: string;
  expires_at?: string | null;
  meta?: {
    product_id?: string;
    product_title?: string;
  } | null;
};

const catColors: Record<string, string> = {
  Healthcare: '#60a5fa',
  Finance: '#4ade80',
  Education: '#a78bfa',
  Retail: '#fb923c',
  Food: '#f87171',
  Transport: '#22d3ee',
  Marketing: '#e879f9',
  HR: '#818cf8',
  Logistics: '#facc15',
};

const CARD_HOVER_TRANSITION_SECONDS = 0.24;
const CARD_HOVER_SCALE = 1.05;
const CARD_HOVER_SHADOW = '0 14px 38px rgba(37,99,235,0.24)';
const CARD_HOVER_BORDER = 'rgba(37,99,235,0.45)';
const CARD_BASE_BORDER = 'rgba(255,255,255,0.07)';
const CARD_TOUCH_ACTION = 'manipulation' as const;

export const MarketplaceProductCard = React.memo<MarketplaceProductCardProps>(({ product, index = 0, onBuyNow, rank }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);
  const [notified, setNotified] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [downloadChecking, setDownloadChecking] = useState(false);

  const { user } = useAuth();
  const { isInCart, toggleItem } = useCart();
  const {
    isFavorited: isFavoritedServer,
    toggleFavorite: toggleFavoriteServer,
    addToCart: addToCartServer,
    refreshCart,
    refreshFavorites,
  } = useMarketplaceActions();
  const { runAction, isProcessing } = useButtonEngine();

  const inCart = isInCart(product.id);
  const favoriteActive = useMemo(
    () => favorited || isFavoritedServer(product.id),
    [favorited, isFavoritedServer, product.id],
  );

  const normalizedBuildStatus = String(product.build_status || '').toLowerCase();
  const isBuilding = normalizedBuildStatus === 'pending';
  const isPipeline = !product.isAvailable || product.status === 'draft' || product.status === 'upcoming' || isBuilding;
  const downloadButtonText = downloadChecking ? '...' : isBuilding ? 'Building...' : isPipeline ? 'PIPELINE' : 'APK';
  const iconColor = catColors[product.category] || '#f97316';
  const cardRank = rank ?? index + 1;

  const price = product.price || 5;
  const priceSymbol = getCurrencySymbol(product.currency);
  const localizedPrice = formatLocalizedPrice(price, product.currency, priceSymbol);
  const discount = product.discount_percent || 0;
  const rating = product.rating || 4.5;
  const originalPrice = discount > 0 ? Math.round(price / (1 - discount / 100)) : price * 2;
  const localizedOriginalPrice = formatLocalizedPrice(originalPrice, product.currency, priceSymbol);
  const apkEnabled = product.apk_enabled !== false;
  const licenseEnabled = product.license_enabled !== false;

  const features: string[] = Array.isArray(product.features)
    ? product.features.slice(0, 4).map((f: any) => (typeof f === 'string' ? f : f.text))
    : ['Dashboard', 'Reports', 'Analytics', 'API'];

  const parseHttpUrl = useCallback((value: string | null | undefined): URL | null => {
    if (!value) return null;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const isGitHubHost = useCallback((hostname: string) => {
    const host = hostname.toLowerCase();
    return host === 'github.com' || host.endsWith('.github.com');
  }, []);

  const getDemoUrl = useCallback((): string | null => {
    const demoUrl = parseHttpUrl((product as any).demoUrl || (product as any).demo_url);
    if (demoUrl && !isGitHubHost(demoUrl.hostname)) return demoUrl.toString();
    const repoUrl = parseHttpUrl((product as any).gitRepoUrl || (product as any).git_repo_url);
    if (repoUrl) return repoUrl.toString();
    return null;
  }, [product, parseHttpUrl, isGitHubHost]);

  const isIframeable = (url: string | null) => {
    const parsed = parseHttpUrl(url);
    if (!parsed) return false;
    return !isGitHubHost(parsed.hostname);
  };

  const handleFavorite = useCallback(async () => {
    if (!user) {
      toast.error('Sign in to add to favorites');
      return;
    }

    const result = await runAction(
      {
        action: `FAVORITE_${product.id}`,
        button: 'Favorite',
        route: '/marketplace',
        api: '/marketplace/favorite/toggle',
        debounce: 150,
        idempotent: true,
        retries: 1,
      },
      async () => {
        const active = await toggleFavoriteServer(product.id, product.title);
        setFavorited(active);
        await refreshFavorites();
        toast.success(active ? 'Added to favorites' : 'Removed from favorites');
        return { active };
      },
    );

    if (!result.ok && !('skipped' in result)) {
      toast.error(result.error.message || 'Favorite update failed');
    }
  }, [user, runAction, product.id, product.title, toggleFavoriteServer, refreshFavorites]);

  const handleAddToCart = useCallback(async () => {
    if (!user) {
      toast.error('Sign in to add items to cart');
      return;
    }

    const result = await runAction(
      {
        action: `CART_${product.id}`,
        button: 'Add Cart',
        route: '/cart',
        api: '/marketplace/cart/add',
        debounce: 150,
        idempotent: true,
        retries: 1,
      },
      async () => {
        await addToCartServer(product.id, 1);
        toggleItem({
          id: product.id,
          title: product.title,
          subtitle: product.subtitle || '',
          image: product.image || '',
          price: Number(product.price || 0),
          category: product.category || '',
        });
        await refreshCart();
        toast.success(inCart ? 'Removed from cart' : 'Added to cart');
        return { inCart: !inCart };
      },
    );

    if (!result.ok && !('skipped' in result)) {
      toast.error(result.error.message || 'Cart update failed');
    }
  }, [user, runAction, product, addToCartServer, toggleItem, refreshCart, inCart]);

  const handleNotifyMe = useCallback(() => {
    if (!user) {
      toast.error('Sign in to get notified');
      return;
    }
    void executeButtonAction<void>({
      config: { action: `NOTIFY_${product.id}`, route: `/product/${encodeURIComponent(product.id)}`, debounceMs: 150, throttleMs: 200, idempotent: true },
      run: () => {
        setNotified(true);
        toast.success(`🔔 You'll be notified when ${product.title} is ready!`);
      },
      validateResponse: false,
    });
  }, [user, product.id, product.title]);

  const handleDemo = useCallback(() => {
    void executeButtonAction<void>({
      config: { action: `VIEW_DETAILS_DEMO_${product.id}`, route: '/product/:id', debounceMs: 150, throttleMs: 200, idempotent: false },
      run: () => {
        const url = getDemoUrl();
        if (!url) {
          setFeaturesOpen(true);
          return;
        }
        if (!isIframeable(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
        } else {
          setDemoOpen(true);
        }
      },
      validateResponse: false,
    });
  }, [product.id, getDemoUrl]);

  const handleBuyNow = useCallback(async () => {
    const result = await runAction(
      {
        action: `BUY_${product.id}`,
        button: 'Buy Now',
        route: `/checkout?product_id=${encodeURIComponent(product.id)}`,
        api: '/payment/intent',
        debounce: 150,
        idempotent: true,
        retries: 0,
      },
      async () => {
        await Promise.resolve(onBuyNow(product));
        return { queued: true };
      },
    );
    if (!result.ok && !('skipped' in result)) {
      toast.error(result.error.message || 'Unable to continue');
    }
  }, [runAction, onBuyNow, product]);

  const handleDownloadApk = useCallback(async () => {
    if (!apkEnabled) {
      toast.info('APK download is currently disabled for this product.');
      return;
    }
    if (!user) {
      toast.error('Please sign in to download APK');
      return;
    }
    setDownloadChecking(true);

    const result = await runAction(
      {
        action: `DOWNLOAD_${product.id}`,
        button: 'Download',
        route: `/product/${encodeURIComponent(product.id)}`,
        api: '/apk/download/:id',
        debounce: 150,
        idempotent: true,
        retries: 1,
      },
      async () => {
        const res = await apkApi.download(product.id) as ApkDownloadResponse;
        const url = res?.url || res?.download_url;
        if (res?.allowed && url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          toast.success('Download started');
          return { downloaded: true };
        }

        const { data } = await supabase
          .from('license_keys')
          .select('license_key,status,expires_at,meta')
          .eq('created_by', user.id)
          .eq('status', 'active')
          .limit(50);

        const now = new Date();
        const match = (data as LicenseRecord[] | null)?.find((row) => {
          const linkedProductId = String(row?.meta?.product_id || '');
          const productMatched = linkedProductId === String(product.id);
          const notExpired = !row.expires_at || new Date(row.expires_at) > now;
          return productMatched && notExpired && !!row.license_key;
        });

        if (!match?.license_key) {
          throw new Error('Please purchase first to download APK');
        }

        toast.success(`✅ License Key: ${match.license_key}`, {
          duration: 10000,
          action: {
            label: 'Copy',
            onClick: () => navigator.clipboard.writeText(match.license_key),
          },
        });
        return { downloaded: false };
      },
    );

    if (!result.ok && !('skipped' in result)) {
      const message = result.error.message || 'APK download will be available soon.';
      if (message.includes('Please purchase first')) {
        toast.error(message, { action: { label: 'BUY NOW', onClick: () => { void handleBuyNow(); } } });
      } else {
        toast.error(message);
      }
    }

    setDownloadChecking(false);
  }, [runAction, user, product, apkEnabled, handleBuyNow]);

  const demoUrl = getDemoUrl();
  const displayTags = (() => {
    if (Array.isArray(product.tags) && product.tags.length > 0) return product.tags.slice(0, 3);
    const cat = String(product.category || '').toLowerCase();
    if (cat.includes('ai')) return ['AI'];
    if (cat.includes('seo') || cat.includes('marketing')) return ['SEO'];
    if (apkEnabled) return ['APK'];
    return [];
  })();

  return (
    <>
      <div
        className="flex-shrink-0 rounded-2xl overflow-hidden flex flex-col group cursor-pointer relative"
        style={{
          width: 280,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${CARD_BASE_BORDER}`,
          transition: `transform ${CARD_HOVER_TRANSITION_SECONDS}s ease, box-shadow ${CARD_HOVER_TRANSITION_SECONDS}s ease, border-color ${CARD_HOVER_TRANSITION_SECONDS}s ease`,
          pointerEvents: 'auto',
          touchAction: CARD_TOUCH_ACTION,
        }}
        onClick={() => {
          void executeButtonAction<void>({
            config: { action: `VIEW_DETAILS_${product.id}`, route: '/product/:id', debounceMs: 150, throttleMs: 200, idempotent: false },
            run: () => navigate(resolveSafeRoute(`/product/${encodeURIComponent(product.id)}`, '/')),
            validateResponse: false,
          });
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = `scale(${CARD_HOVER_SCALE})`;
          e.currentTarget.style.boxShadow = CARD_HOVER_SHADOW;
          e.currentTarget.style.borderColor = CARD_HOVER_BORDER;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = '';
          e.currentTarget.style.borderColor = CARD_BASE_BORDER;
        }}
      >
        <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="secondary"
            className={getButtonInteractionClassName('h-6 text-[10px] px-2')}
            {...createPressHandlers(`view-top-${product.id}`, () => navigate(resolveSafeRoute(`/product/${encodeURIComponent(product.id)}`, '/')))}
          >
            View
          </Button>
          <Button
            size="sm"
            className={getButtonInteractionClassName('h-6 text-[10px] px-2')}
            disabled={isProcessing(`BUY_${product.id}`)}
            {...createPressHandlers(`buy-top-${product.id}`, () => {
              void handleBuyNow();
            })}
          >
            Buy Now
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={getButtonInteractionClassName('h-6 text-[10px] px-2')}
            disabled={isProcessing(`DOWNLOAD_${product.id}`)}
            {...createPressHandlers(`download-top-${product.id}`, () => {
              void handleDownloadApk();
            })}
          >
            Download
          </Button>
        </div>

        {!!product.image && (
          <div className="relative h-36 w-full overflow-hidden">
            <img src={product.image} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
        )}

        <div className="relative px-4 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.08), transparent)' }}>
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)' }}>
            <Box style={{ width: 24, height: 24, color: iconColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[13px] text-foreground truncate leading-tight">{product.title}</h3>
            <p className="text-[11px] truncate" style={{ color: iconColor }}>{product.category}</p>
          </div>
          {!isPipeline ? (
            <span className="text-[9px] font-black text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(90deg,#22C55E,#16A34A)' }}>LIVE</span>
          ) : (
            <span className="text-[9px] font-black text-black px-2 py-0.5 rounded-full bg-amber-400">PIPELINE</span>
          )}
          <span className="absolute top-2 right-3 text-[10px] font-bold text-white/20">#{cardRank}</span>
        </div>

        <div className="flex-1 px-4 py-3 flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
            {product.subtitle || 'Complete solution with all features, reports, and integrations.'}
          </p>
          <div className="flex flex-wrap gap-1">
            {features.slice(0, 3).map((f, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-muted/80 text-muted-foreground border border-border/50">{f}</span>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-auto pt-1">
            <span className="text-xs line-through text-muted-foreground/40">{localizedOriginalPrice}</span>
            <span className="text-xl font-black text-primary">{localizedPrice}</span>
            {discount > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                {discount}% OFF
              </span>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <Star className="fill-yellow-400 text-yellow-400" style={{ width: 11, height: 11 }} />
              <span className="text-[10px] font-bold text-yellow-400">{rating}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {displayTags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[9px] uppercase border-white/20 text-white/80">
                {tag}
              </Badge>
            ))}
            {isBuilding && <Badge className="text-[9px] uppercase bg-amber-500/20 text-amber-300 border-0">Building...</Badge>}
            {String(product.build_status || '').toLowerCase() === 'generated' && (
              <Badge className="text-[9px] uppercase bg-emerald-500/20 text-emerald-400 border-0">Generated</Badge>
            )}
          </div>
        </div>

        <div className="px-4 pb-4 flex flex-col gap-1.5">
          {isPipeline ? (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className={getButtonInteractionClassName(cn('flex-1 h-8 text-[10px] font-bold rounded-lg', notified ? 'bg-emerald-600' : 'bg-amber-500 text-black hover:bg-amber-400'))}
                {...createPressHandlers(`notify-${product.id}`, handleNotifyMe)}
              >
                <Bell style={{ width: 12, height: 12 }} className="mr-1" />
                {notified ? 'NOTIFIED' : 'NOTIFY ME'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={getButtonInteractionClassName('h-8 w-8 p-0 rounded-lg border-pink-400/40 text-pink-400 hover:bg-pink-500/10')}
                disabled={isProcessing(`FAVORITE_${product.id}`)}
                {...createPressHandlers(`favorite-pipeline-${product.id}`, () => {
                  void handleFavorite();
                })}
              >
                <Heart style={{ width: 14, height: 14 }} className={favoriteActive ? 'fill-pink-400 text-pink-400' : 'text-muted-foreground'} />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className={getButtonInteractionClassName('flex-1 h-8 text-[10px] font-bold rounded-lg')}
                  {...createPressHandlers(`demo-${product.id}`, handleDemo)}
                >
                  <Play style={{ width: 12, height: 12 }} className="mr-1" />
                  DEMO
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={getButtonInteractionClassName('h-8 w-8 p-0 rounded-lg border-pink-400/40 text-pink-400 hover:bg-pink-500/10')}
                  disabled={isProcessing(`FAVORITE_${product.id}`)}
                  {...createPressHandlers(`favorite-live-${product.id}`, () => {
                    void handleFavorite();
                  })}
                >
                  <Heart style={{ width: 14, height: 14 }} className={favoriteActive ? 'fill-pink-400 text-pink-400' : 'text-muted-foreground'} />
                </Button>
                <Button
                  size="sm"
                  className={getButtonInteractionClassName('flex-1 h-8 text-[10px] font-black rounded-lg')}
                  disabled={isProcessing(`BUY_${product.id}`)}
                  {...createPressHandlers(`buy-${product.id}`, () => {
                    void handleBuyNow();
                  })}
                >
                  <ShoppingCart style={{ width: 12, height: 12 }} className="mr-1" />
                  BUY
                </Button>
              </div>
            </>
          )}
          <div className="flex gap-1.5">
            {apkEnabled && (
              <Button
                size="sm"
                variant="secondary"
                className={getButtonInteractionClassName('flex-1 h-8 text-[10px] font-bold rounded-lg')}
                disabled={isProcessing(`DOWNLOAD_${product.id}`)}
                {...createPressHandlers(`download-${product.id}`, () => {
                  void handleDownloadApk();
                })}
              >
                <Download style={{ width: 12, height: 12 }} className="mr-1" />
                {downloadButtonText}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className={getButtonInteractionClassName('flex-1 h-8 text-[10px] font-bold rounded-lg')}
              disabled={isProcessing(`CART_${product.id}`)}
              {...createPressHandlers(`cart-${product.id}`, () => {
                void handleAddToCart();
              })}
            >
              <ShoppingCart style={{ width: 12, height: 12 }} className="mr-1" />
              {inCart ? 'IN CART' : 'ADD CART'}
            </Button>
          </div>
        </div>
      </div>

      {demoOpen && (
        <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
          <DialogContent className="max-w-4xl w-[95vw] h-[80vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-4 pt-3 pb-2 border-b border-border shrink-0">
              <DialogTitle className="text-sm font-black uppercase">{product.title} — Live Demo</DialogTitle>
              <DialogDescription className="text-xs">{(product as any).demoLogin || 'demo@softwarevala.com'} / {(product as any).demoPassword || 'Demo@2026'}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 relative bg-muted/30 overflow-hidden">
              {demoUrl && isIframeable(demoUrl) ? (
                <iframe src={demoUrl} className="w-full h-full border-0" title="Demo" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" loading="lazy" />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Demo coming soon</p>
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-t border-border flex items-center gap-2 shrink-0">
              {demoUrl && (
                <>
                  <code className="text-xs bg-muted px-2 py-1 rounded truncate flex-1">{demoUrl}</code>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => { navigator.clipboard.writeText(demoUrl); toast.success('Copied!'); }}>
                    <Copy style={{ width: 12, height: 12 }} />
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => window.open(demoUrl, '_blank')}>
                    <ExternalLink style={{ width: 12, height: 12 }} className="mr-1" />
                    Open
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {featuresOpen && (
        <Dialog open={featuresOpen} onOpenChange={setFeaturesOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm font-black uppercase">{product.title}</DialogTitle>
              <DialogDescription>Features & details</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border/60 p-3">
                <h4 className="text-[11px] font-black text-primary uppercase mb-2">Features</h4>
                <ul className="space-y-1">
                  {features.map((f, i) => (
                    <li key={i} className="text-[12px] text-foreground flex gap-2">
                      <span className="text-primary">✓</span>
                      {f}
                    </li>
                  ))}
                  <li className="text-[12px] text-foreground flex gap-2">
                    <span className="text-primary">✓</span>
                    Full Source Code
                  </li>
                  {licenseEnabled && (
                    <li className="text-[12px] text-foreground flex gap-2">
                      <span className="text-primary">✓</span>
                      Lifetime License
                    </li>
                  )}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 h-10 text-xs font-black" onClick={() => { setFeaturesOpen(false); void handleBuyNow(); }}>
                  <ShoppingCart style={{ width: 14, height: 14 }} className="mr-1" />
                  BUY — {localizedPrice}
                </Button>
                <Button variant="outline" className="flex-1 h-10 text-xs font-bold" onClick={() => { setFeaturesOpen(false); handleDemo(); }}>
                  <Play style={{ width: 14, height: 14 }} className="mr-1" />
                  DEMO
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
});

MarketplaceProductCard.displayName = 'MarketplaceProductCard';

export function ComingSoonCard({ label }: { label: string }) {
  return (
    <div className="flex-shrink-0" style={{ width: 280 }}>
      <div
        className="rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3 text-center"
        style={{ minHeight: 320, borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}
      >
        <Package style={{ width: 28, height: 28 }} className="text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Coming Soon</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        <Badge variant="outline" className="text-[10px]">ON PIPELINE</Badge>
      </div>
    </div>
  );
}
