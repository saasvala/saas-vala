import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import { fillToTarget } from '@/data/marketplaceProductGenerator';
import { SectionHeader } from './SectionHeader';

const TOP_5_FINTECH_CLONES = [
  {
    id: 'fintech-clone-1', title: 'PayPal Payment Gateway Clone',
    subtitle: 'Online payment processing platform for secure digital transactions.',
    category: 'FinTech', description: 'Online payment processing platform for secure digital transactions.',
    features: ['Payment Processing', 'Digital Wallet', 'Transaction Dashboard', 'Fraud Detection', 'Secure Authentication'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/paypal-payment-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'paypal-payment-clone-software',
  },
  {
    id: 'fintech-clone-2', title: 'Stripe Payment Platform Clone',
    subtitle: 'Developer-focused payment platform with API integrations.',
    category: 'FinTech', description: 'Developer-focused payment platform with API integrations.',
    features: ['Payment APIs', 'Subscription Billing', 'Payment Dashboard', 'Transaction Reports', 'Payment Integration'],
    techStack: ['Next.js', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/stripe-payment-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'stripe-payment-clone-software',
  },
  {
    id: 'fintech-clone-3', title: 'Razorpay Payment Gateway Clone',
    subtitle: 'Indian payment gateway platform for businesses and startups.',
    category: 'FinTech', description: 'Indian payment gateway platform for businesses and startups.',
    features: ['Payment Gateway', 'Merchant Dashboard', 'Transaction Reports', 'Subscription Billing', 'Payment Links'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/razorpay-payment-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'razorpay-payment-clone-software',
  },
  {
    id: 'fintech-clone-4', title: 'Square POS & Payments Clone',
    subtitle: 'Point-of-sale payment platform for retail and service businesses.',
    category: 'FinTech', description: 'Point-of-sale payment platform for retail and service businesses.',
    features: ['POS System', 'Payment Processing', 'Sales Dashboard', 'Inventory Tracking', 'Financial Reports'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/square-pos-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'square-pos-clone-software',
  },
  {
    id: 'fintech-clone-5', title: 'Wise International Payments Clone',
    subtitle: 'International money transfer platform with transparent fees.',
    category: 'FinTech', description: 'International money transfer platform with transparent fees.',
    features: ['International Transfers', 'Currency Conversion', 'Transaction Dashboard', 'Payment Tracking', 'Secure Payments'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/wise-payments-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'wise-payments-clone-software',
  },
];

export function FinanceFintechSection({ onBuyNow }: { onBuyNow: (p: any) => void }) {
  const { products: dbProducts } = useProductsByCategory(['fintech', 'payment', 'gateway', 'wallet', 'billing']);
  const generatedProducts = fillToTarget(dbProducts as any, 'finance_fintech', 'Finance & FinTech', 45);
  const displayProducts = [...TOP_5_FINTECH_CLONES as any[], ...generatedProducts];

  return (
    <section className="py-4">
      <SectionHeader
        icon="💳"
        title="Finance & FinTech Platforms"
        subtitle="Payment Processing, Digital Wallets, Transaction Dashboards & Financial Reports."
        badge="FINTECH"
        badgeVariant="hot"
        totalCount={displayProducts.length}
      />
      <SectionSlider>
        {displayProducts.map((product, i) => (
          <MarketplaceProductCard key={product.id} product={product as any} index={i} onBuyNow={onBuyNow} rank={i + 1} />
        ))}
        {displayProducts.length === 0 && <ComingSoonCard label="Finance & FinTech" />}
      </SectionSlider>
    </section>
  );
}
