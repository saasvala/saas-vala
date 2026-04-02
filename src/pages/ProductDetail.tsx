import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingCart, CreditCard, ExternalLink } from 'lucide-react';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { useMarketplaceProducts } from '@/hooks/useMarketplaceProducts';
import { useCart } from '@/hooks/useCart';

export default function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { products, loading } = useMarketplaceProducts();
  const { toggleItem, isInCart } = useCart();

  const product = useMemo(() => products.find((item) => item.id === id), [products, id]);

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

  const inCart = isInCart(product.id);

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
            <Badge variant="outline" className="text-base font-black">${product.price}</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {(product.features || []).map((feature, index) => (
              <Badge key={index} variant="secondary">{feature.text}</Badge>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant={inCart ? 'secondary' : 'outline'}
              onClick={() => toggleItem({
                id: product.id,
                title: product.title,
                subtitle: product.subtitle || '',
                image: product.image || '',
                price: product.price,
                category: product.category || 'Software',
              })}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              {inCart ? 'Remove from Cart' : 'Add to Cart'}
            </Button>
            <Button onClick={() => navigate('/checkout')}>
              <CreditCard className="h-4 w-4 mr-2" /> Buy Now
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
