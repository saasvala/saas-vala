import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Package } from 'lucide-react';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { useMarketplaceProducts } from '@/hooks/useMarketplaceProducts';

const normalize = (value?: string) => (value || '').toLowerCase().replace(/[-_]/g, ' ').trim();

export default function CategoryFlow() {
  const navigate = useNavigate();
  const { macro, sub, micro } = useParams();
  const { products, loading } = useMarketplaceProducts();

  const macroN = normalize(macro);
  const subN = normalize(sub);
  const microN = normalize(micro);
  const terms = [macroN, subN, microN].filter(Boolean);

  const filtered = useMemo(() => {
    if (terms.length === 0) return products;
    return products.filter((product) => {
      const hay = `${product.title} ${product.subtitle} ${product.category} ${product.businessType} ${(product.tags || []).join(' ')}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [products, terms]);

  const fallback = useMemo(() => {
    if (filtered.length > 0 || terms.length === 0) return filtered;
    return products.filter((product) => {
      const hay = `${product.title} ${product.subtitle} ${product.category} ${product.businessType}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    });
  }, [filtered, products, terms]);

  const listing = fallback.length > 0 ? fallback : products.slice(0, 24);
  const title = [macro, sub, micro].filter(Boolean).join(' / ') || 'Category';

  return (
    <div className="min-h-screen bg-background">
      <MarketplaceHeader />
      <main className="pt-20 pb-10 px-4 md:px-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-foreground uppercase">{title}</h1>
            <p className="text-sm text-muted-foreground">Showing {listing.length} products</p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading products...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listing.map((product) => (
              <div key={product.id} className="rounded-xl border border-border/50 p-4 bg-card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold text-foreground text-sm leading-snug">{product.title}</h2>
                  <Badge variant="outline" className="shrink-0">${product.price}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{product.subtitle}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{product.category || 'Software'}</span>
                  <Button size="sm" onClick={() => navigate(`/product/${product.id}`)}>
                    <Package className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
