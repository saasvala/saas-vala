import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import { fillToTarget } from '@/data/marketplaceProductGenerator';
import { SectionHeader } from './SectionHeader';

const TOP_5_TRAVEL_CLONES = [
  {
    id: 'travel-clone-1', title: 'Airbnb Rental Marketplace Clone',
    subtitle: 'Vacation rental marketplace connecting hosts with travelers worldwide.',
    category: 'Travel', description: 'Vacation rental marketplace connecting hosts with travelers worldwide.',
    features: ['Property Listings', 'Booking System', 'Host Dashboard', 'Reviews & Ratings', 'Payment Integration'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/airbnb-rental-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'airbnb-rental-clone-software',
  },
  {
    id: 'travel-clone-2', title: 'Booking.com Hotel Platform Clone',
    subtitle: 'Hotel booking platform offering global accommodation listings.',
    category: 'Travel', description: 'Hotel booking platform offering global accommodation listings.',
    features: ['Hotel Listings', 'Booking System', 'Customer Reviews', 'Payment Integration', 'Booking Dashboard'],
    techStack: ['Next.js', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/booking-hotel-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'booking-hotel-clone-software',
  },
  {
    id: 'travel-clone-3', title: 'Expedia Travel Booking Clone',
    subtitle: 'Travel booking platform for flights, hotels, and travel packages.',
    category: 'Travel', description: 'Travel booking platform for flights, hotels, and travel packages.',
    features: ['Flight Search', 'Hotel Booking', 'Travel Packages', 'Booking Management', 'Payment Integration'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/expedia-travel-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'expedia-travel-clone-software',
  },
  {
    id: 'travel-clone-4', title: 'TripAdvisor Reviews & Travel Clone',
    subtitle: 'Travel discovery platform featuring reviews and booking integrations.',
    category: 'Travel', description: 'Travel discovery platform featuring reviews and booking integrations.',
    features: ['Travel Listings', 'Reviews & Ratings', 'Booking Links', 'Travel Guides', 'User Profiles'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/tripadvisor-travel-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'tripadvisor-travel-clone-software',
  },
  {
    id: 'travel-clone-5', title: 'Agoda Hotel Booking Clone',
    subtitle: 'Online hotel booking platform offering deals on accommodations worldwide.',
    category: 'Travel', description: 'Online hotel booking platform offering deals on accommodations worldwide.',
    features: ['Hotel Listings', 'Booking System', 'Payment Integration', 'Reviews & Ratings', 'Booking Dashboard'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/agoda-booking-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'agoda-booking-clone-software',
  },
];

export function TravelBookingSection({ onBuyNow }: { onBuyNow: (p: any) => void }) {
  const { products: dbProducts } = useProductsByCategory(['travel', 'booking', 'hotel', 'flight', 'tourism']);
  const generatedProducts = fillToTarget(dbProducts as any, 'travel_booking', 'Travel & Booking', 45);
  const displayProducts = [...TOP_5_TRAVEL_CLONES as any[], ...generatedProducts];

  return (
    <section className="py-4">
      <SectionHeader
        icon="✈️"
        title="Travel & Booking Platforms"
        subtitle="Property Listings, Booking Systems, Travel Search & Payment Integration."
        badge="TRAVEL"
        badgeVariant="trending"
        totalCount={displayProducts.length}
      />
      <SectionSlider>
        {displayProducts.map((product, i) => (
          <MarketplaceProductCard key={product.id} product={product as any} index={i} onBuyNow={onBuyNow} rank={i + 1} />
        ))}
        {displayProducts.length === 0 && <ComingSoonCard label="Travel & Booking" />}
      </SectionSlider>
    </section>
  );
}
