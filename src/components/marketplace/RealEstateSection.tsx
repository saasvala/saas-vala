import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import { fillToTarget } from '@/data/marketplaceProductGenerator';
import { SectionHeader } from './SectionHeader';

const TOP_5_REALESTATE_CLONES = [
  {
    id: 'realestate-clone-1',
    title: 'Zillow Real Estate Clone',
    subtitle: 'Online real estate marketplace for buying, selling, and renting properties.',
    category: 'Real Estate',
    description: 'Online real estate marketplace for buying, selling, and renting properties.',
    features: ['Property Listings', 'Price Estimates', 'Map Search', 'Agent Profiles', 'Mortgage Calculator', 'Property Analytics'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/zillow-realestate-clone-software',
    price: 5, old_price: 10, rating: 4.9,
    isAvailable: true, status: 'active', slug: 'zillow-realestate-clone-software',
  },
  {
    id: 'realestate-clone-2',
    title: 'Realtor.com Clone',
    subtitle: 'Real estate portal connecting property buyers with agents.',
    category: 'Real Estate',
    description: 'Real estate portal connecting property buyers with agents.',
    features: ['MLS Listings', 'Property Search Filters', 'Agent Directory', 'Buyer Lead System', 'Property Alerts'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/realtor-realestate-clone-software',
    price: 5, old_price: 10, rating: 4.9,
    isAvailable: true, status: 'active', slug: 'realtor-realestate-clone-software',
  },
  {
    id: 'realestate-clone-3',
    title: 'MagicBricks Clone',
    subtitle: 'Popular property portal used for buying, selling, and renting homes.',
    category: 'Real Estate',
    description: 'Popular property portal used for buying, selling, and renting homes.',
    features: ['Property Listings', 'Owner Posting', 'Buyer Dashboard', 'Property Recommendations', 'Lead Management'],
    techStack: ['Next.js', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/magicbricks-realestate-clone-software',
    price: 5, old_price: 10, rating: 4.9,
    isAvailable: true, status: 'active', slug: 'magicbricks-realestate-clone-software',
  },
  {
    id: 'realestate-clone-4',
    title: '99acres Real Estate Clone',
    subtitle: 'Property portal for residential and commercial real estate.',
    category: 'Real Estate',
    description: 'Property portal for residential and commercial real estate.',
    features: ['Property Listing Manager', 'Property Filters', 'Agent CRM', 'Buyer Inquiry System', 'Property Map Integration'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/99acres-realestate-clone-software',
    price: 5, old_price: 10, rating: 4.9,
    isAvailable: true, status: 'active', slug: '99acres-realestate-clone-software',
  },
  {
    id: 'realestate-clone-5',
    title: 'Redfin Real Estate Clone',
    subtitle: 'Modern real estate brokerage platform with advanced search.',
    category: 'Real Estate',
    description: 'Modern real estate brokerage platform with advanced search.',
    features: ['Real-Time Listings', 'Property Alerts', 'Agent Dashboard', 'Market Trends Analytics', 'Property Price Tracking'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/redfin-realestate-clone-software',
    price: 5, old_price: 10, rating: 4.9,
    isAvailable: true, status: 'active', slug: 'redfin-realestate-clone-software',
  },
];

export function RealEstateSection({ onBuyNow }: { onBuyNow: (p: any) => void }) {
  const { products: dbProducts } = useProductsByCategory(['real_estate', 'property', 'builder', 'rental']);
  const generatedProducts = fillToTarget(dbProducts as any, 'real_estate', 'Real Estate', 45);
  const displayProducts = [...TOP_5_REALESTATE_CLONES as any[], ...generatedProducts];

  return (
    <section className="py-4">
      <SectionHeader
        icon="🏠"
        title="Real Estate & Property Services"
        subtitle="CRM, Portal, Builder & Tenant Management."
        badge="HOT"
        badgeVariant="hot"
        totalCount={displayProducts.length}
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
        {displayProducts.length === 0 && <ComingSoonCard label="Real Estate" />}
      </SectionSlider>
    </section>
  );
}
