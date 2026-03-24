import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import { fillToTarget } from '@/data/marketplaceProductGenerator';
import { SectionHeader } from './SectionHeader';

const TOP_5_RECRUITMENT_CLONES = [
  {
    id: 'recruit-clone-1', title: 'LinkedIn Jobs Platform Clone',
    subtitle: 'Professional networking and job marketplace platform for recruiters and candidates.',
    category: 'Recruitment', description: 'Professional networking and job marketplace platform for recruiters and candidates.',
    features: ['Job Listings', 'Professional Profiles', 'Employer Dashboard', 'Job Applications', 'Messaging System'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/linkedin-jobs-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'linkedin-jobs-clone-software',
  },
  {
    id: 'recruit-clone-2', title: 'Indeed Job Search Clone',
    subtitle: 'Job search platform aggregating job listings from companies worldwide.',
    category: 'Recruitment', description: 'Job search platform aggregating job listings from companies worldwide.',
    features: ['Job Listings', 'Resume Upload', 'Employer Dashboard', 'Job Applications', 'Job Alerts'],
    techStack: ['Next.js', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/indeed-job-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'indeed-job-clone-software',
  },
  {
    id: 'recruit-clone-3', title: 'Glassdoor Job & Company Reviews Clone',
    subtitle: 'Job marketplace with company reviews, salary insights, and job listings.',
    category: 'Recruitment', description: 'Job marketplace with company reviews, salary insights, and job listings.',
    features: ['Job Listings', 'Company Reviews', 'Salary Insights', 'Candidate Profiles', 'Employer Dashboard'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/glassdoor-jobs-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'glassdoor-jobs-clone-software',
  },
  {
    id: 'recruit-clone-4', title: 'AngelList Startup Jobs Clone',
    subtitle: 'Startup hiring platform connecting founders with talented candidates.',
    category: 'Recruitment', description: 'Startup hiring platform connecting founders with talented candidates.',
    features: ['Startup Job Listings', 'Candidate Profiles', 'Employer Dashboard', 'Messaging System', 'Hiring Analytics'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/angellist-startup-jobs-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'angellist-startup-jobs-clone-software',
  },
  {
    id: 'recruit-clone-5', title: 'Upwork Hiring Marketplace Clone',
    subtitle: 'Freelance hiring marketplace for companies and independent professionals.',
    category: 'Recruitment', description: 'Freelance hiring marketplace for companies and independent professionals.',
    features: ['Freelancer Profiles', 'Job Listings', 'Proposal System', 'Messaging System', 'Payment Integration'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/upwork-hiring-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'upwork-hiring-clone-software',
  },
];

export function RecruitmentJobSection({ onBuyNow }: { onBuyNow: (p: any) => void }) {
  const { products: dbProducts } = useProductsByCategory(['recruitment', 'job_board', 'hiring', 'freelance', 'career']);
  const generatedProducts = fillToTarget(dbProducts as any, 'recruitment_job', 'Recruitment & Jobs', 45);
  const displayProducts = [...TOP_5_RECRUITMENT_CLONES as any[], ...generatedProducts];

  return (
    <section className="py-4">
      <SectionHeader
        icon="💼"
        title="Recruitment & Job Platforms"
        subtitle="Job Listings, Candidate Profiles, Resume Upload & Employer Dashboards."
        badge="JOBS"
        badgeVariant="trending"
        totalCount={displayProducts.length}
      />
      <SectionSlider>
        {displayProducts.map((product, i) => (
          <MarketplaceProductCard key={product.id} product={product as any} index={i} onBuyNow={onBuyNow} rank={i + 1} />
        ))}
        {displayProducts.length === 0 && <ComingSoonCard label="Recruitment & Jobs" />}
      </SectionSlider>
    </section>
  );
}
