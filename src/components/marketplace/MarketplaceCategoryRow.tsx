import { SectionHeader } from './SectionHeader';
import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import type { MarketplaceCategory } from '@/data/marketplaceCategories';
import { useNavigate } from 'react-router-dom';
import { executeButtonAction, resolveSafeRoute } from '@/lib/buttonEngine';

interface Props {
  category: MarketplaceCategory;
  onBuyNow: (p: any) => void;
}

export function MarketplaceCategoryRow({ category, onBuyNow }: Props) {
  const navigate = useNavigate();
  const { products, loading } = useProductsByCategory(category.keywords);
  // Category IDs are expected to be underscore-delimited segments; fallback keeps routes valid when only one segment exists.
  const [macro = category.id, sub = 'all', ...microParts] = category.id.split('_');
  const micro = microParts.length > 0 ? microParts.join('_') : (category.keywords[0] || 'software');
  const categoryPath = `/category/${encodeURIComponent(macro)}/${encodeURIComponent(sub)}/${encodeURIComponent(micro)}`;

  const displayProducts = products;

  if (!loading && displayProducts.length === 0) {
    return (
      <section className="py-4">
        <SectionHeader
          icon={category.icon}
          title={category.title}
          subtitle={category.subtitle}
          badge={category.badge}
          badgeVariant={category.badgeVariant}
          totalCount={0}
          onViewAll={() => {
            void executeButtonAction<void>({
              config: { action: 'CATEGORY_CLICK', route: '/category/:macro/:sub/:micro', debounceMs: 150, throttleMs: 200, idempotent: false },
              run: () => navigate(resolveSafeRoute(categoryPath, '/')),
              validateResponse: false,
            });
          }}
        />
        <SectionSlider>
          <ComingSoonCard label={category.title} />
        </SectionSlider>
      </section>
    );
  }

  return (
    <section className="py-4">
      <SectionHeader
        icon={category.icon}
        title={category.title}
        subtitle={category.subtitle}
        badge={category.badge}
        badgeVariant={category.badgeVariant}
        totalCount={displayProducts.length}
        onViewAll={() => {
          void executeButtonAction<void>({
            config: { action: 'CATEGORY_CLICK', route: '/category/:macro/:sub/:micro', debounceMs: 150, throttleMs: 200, idempotent: false },
            run: () => navigate(resolveSafeRoute(categoryPath, '/')),
            validateResponse: false,
          });
        }}
      />
      <SectionSlider>
        {displayProducts.map((product, i) => (
          <MarketplaceProductCard
            key={product.id}
            product={product as any}
            index={i}
            onBuyNow={onBuyNow}
            rank={i + 1}
          />
        ))}
      </SectionSlider>
    </section>
  );
}
