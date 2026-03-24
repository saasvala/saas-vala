import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import { fillToTarget } from '@/data/marketplaceProductGenerator';
import { SectionHeader } from './SectionHeader';

const TOP_5_SOCIAL_CLONES = [
  {
    id: 'social-clone-1', title: 'Facebook Social Network Clone',
    subtitle: 'Global social networking platform for connecting with friends and communities.',
    category: 'Social Media', description: 'Global social networking platform for connecting with friends and communities.',
    features: ['User Profiles', 'News Feed', 'Friend Requests', 'Groups & Pages', 'Messaging System'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/facebook-social-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'facebook-social-clone-software',
  },
  {
    id: 'social-clone-2', title: 'Instagram Social Media Clone',
    subtitle: 'Photo and video sharing social network with follower system.',
    category: 'Social Media', description: 'Photo and video sharing social network with follower system.',
    features: ['Photo & Video Upload', 'Stories Feature', 'Likes & Comments', 'Followers System', 'Explore Feed'],
    techStack: ['Next.js', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/instagram-social-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'instagram-social-clone-software',
  },
  {
    id: 'social-clone-3', title: 'Twitter (X) Microblog Clone',
    subtitle: 'Microblogging platform for short posts, discussions, and trends.',
    category: 'Social Media', description: 'Microblogging platform for short posts, discussions, and trends.',
    features: ['Tweet Posting', 'Follow System', 'Likes & Retweets', 'Trending Topics', 'Notifications'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/twitter-x-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'twitter-x-clone-software',
  },
  {
    id: 'social-clone-4', title: 'LinkedIn Professional Network Clone',
    subtitle: 'Professional networking platform for career connections and job discovery.',
    category: 'Social Media', description: 'Professional networking platform for career connections and job discovery.',
    features: ['Professional Profiles', 'Job Listings', 'Messaging', 'Networking Connections', 'Company Pages'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/linkedin-network-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'linkedin-network-clone-software',
  },
  {
    id: 'social-clone-5', title: 'Reddit Community Platform Clone',
    subtitle: 'Community discussion platform based on forums and topic communities.',
    category: 'Social Media', description: 'Community discussion platform based on forums and topic communities.',
    features: ['Sub-Communities', 'Post Voting', 'Comments Threads', 'Moderation Tools', 'Content Feeds'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/reddit-community-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'reddit-community-clone-software',
  },
];

export function SocialMediaSection({ onBuyNow }: { onBuyNow: (p: any) => void }) {
  const { products: dbProducts } = useProductsByCategory(['social', 'community', 'network', 'forum']);
  const generatedProducts = fillToTarget(dbProducts as any, 'social_media', 'Social Media', 45);
  const displayProducts = [...TOP_5_SOCIAL_CLONES as any[], ...generatedProducts];

  return (
    <section className="py-4">
      <SectionHeader
        icon="📱"
        title="Social Media & Community Platforms"
        subtitle="Social Networks, Forums & Community solutions."
        badge="VIRAL"
        badgeVariant="hot"
        totalCount={displayProducts.length}
      />
      <SectionSlider>
        {displayProducts.map((product, i) => (
          <MarketplaceProductCard key={product.id} product={product as any} index={i} onBuyNow={onBuyNow} rank={i + 1} />
        ))}
        {displayProducts.length === 0 && <ComingSoonCard label="Social Media" />}
      </SectionSlider>
    </section>
  );
}
