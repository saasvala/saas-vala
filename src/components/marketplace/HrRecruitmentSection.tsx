import { SectionSlider } from './SectionSlider';
import { MarketplaceProductCard, ComingSoonCard } from './MarketplaceProductCard';
import { useProductsByCategory } from '@/hooks/useMarketplaceProducts';
import { fillToTarget } from '@/data/marketplaceProductGenerator';
import { SectionHeader } from './SectionHeader';

const TOP_5_HR_CLONES = [
  {
    id: 'hr-clone-1', title: 'LinkedIn Jobs Recruitment Clone',
    subtitle: 'Professional recruitment platform connecting employers and job seekers.',
    category: 'HR', description: 'Professional recruitment platform connecting employers and job seekers.',
    features: ['Job Listings', 'Candidate Profiles', 'Resume Upload', 'Job Applications', 'Recruitment Dashboard'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/linkedin-jobs-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'linkedin-jobs-clone-software',
  },
  {
    id: 'hr-clone-2', title: 'Indeed Job Board Clone',
    subtitle: 'Global job search platform where employers post openings and candidates apply.',
    category: 'HR', description: 'Global job search platform where employers post openings and candidates apply.',
    features: ['Job Listings', 'Resume Database', 'Candidate Applications', 'Employer Dashboard', 'Job Alerts'],
    techStack: ['Next.js', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/indeed-jobboard-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'indeed-jobboard-clone-software',
  },
  {
    id: 'hr-clone-3', title: 'Workday HR Management Clone',
    subtitle: 'Enterprise HR management platform for recruiting, payroll, and employee data.',
    category: 'HR', description: 'Enterprise HR management platform for recruiting, payroll, and employee data.',
    features: ['Employee Profiles', 'Recruitment Tracking', 'Payroll Management', 'HR Analytics', 'HR Dashboard'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/workday-hr-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'workday-hr-clone-software',
  },
  {
    id: 'hr-clone-4', title: 'Greenhouse Recruiting Clone',
    subtitle: 'Recruitment platform used by companies to manage hiring pipelines.',
    category: 'HR', description: 'Recruitment platform used by companies to manage hiring pipelines.',
    features: ['Applicant Tracking', 'Interview Scheduling', 'Candidate Pipeline', 'Hiring Workflow', 'Recruitment Reports'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/greenhouse-recruiting-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'greenhouse-recruiting-clone-software',
  },
  {
    id: 'hr-clone-5', title: 'BambooHR Platform Clone',
    subtitle: 'HR management platform designed for employee records and recruitment.',
    category: 'HR', description: 'HR management platform designed for employee records and recruitment.',
    features: ['Employee Records', 'Recruitment Tracking', 'Time Off Management', 'HR Analytics', 'HR Dashboard'],
    techStack: ['React', 'Node.js', 'PostgreSQL'],
    github_repo: 'https://github.com/saasvala/bamboohr-clone-software',
    price: 5, old_price: 10, rating: 4.9, isAvailable: true, status: 'active', slug: 'bamboohr-clone-software',
  },
];

export function HrRecruitmentSection({ onBuyNow }: { onBuyNow: (p: any) => void }) {
  const { products: dbProducts } = useProductsByCategory(['hr', 'recruitment', 'hiring', 'job', 'applicant']);
  const generatedProducts = fillToTarget(dbProducts as any, 'hr_recruitment', 'HR & Recruitment', 45);
  const displayProducts = [...TOP_5_HR_CLONES as any[], ...generatedProducts];

  return (
    <section className="py-4">
      <SectionHeader
        icon="👔"
        title="HR & Recruitment Platforms"
        subtitle="Job Listings, Applicant Tracking, Resume Management & HR Analytics."
        badge="HR"
        badgeVariant="trending"
        totalCount={displayProducts.length}
      />
      <SectionSlider>
        {displayProducts.map((product, i) => (
          <MarketplaceProductCard key={product.id} product={product as any} index={i} onBuyNow={onBuyNow} rank={i + 1} />
        ))}
        {displayProducts.length === 0 && <ComingSoonCard label="HR & Recruitment" />}
      </SectionSlider>
    </section>
  );
}
