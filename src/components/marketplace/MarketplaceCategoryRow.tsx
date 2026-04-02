import { SectionHeader } from './SectionHeader';
import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import { fillToTarget } from '@/data/marketplaceProductGenerator';
import type { MarketplaceCategory } from '@/data/marketplaceCategories';
import { useNavigate } from 'react-router-dom';

interface Props {
  category: MarketplaceCategory;
  onBuyNow: (p: any) => void;
}

export function MarketplaceCategoryRow({ category, onBuyNow }: Props) {
  const navigate = useNavigate();
  const { products, loading } = useProductsByCategory(category.keywords);
  const [macro = category.id, sub = 'all', ...microParts] = category.id.split('_');
  const micro = microParts.length > 0 ? microParts.join('-') : (category.keywords[0] || 'software');
  const categoryPath = `/category/${encodeURIComponent(macro)}/${encodeURIComponent(sub)}/${encodeURIComponent(micro)}`;

  const displayProducts = fillToTarget(products as any, category.id, category.title, 50);

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
          onViewAll={() => navigate(categoryPath)}
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
        onViewAll={() => navigate(categoryPath)}
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
