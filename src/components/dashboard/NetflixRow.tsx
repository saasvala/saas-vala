import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NetflixRowProps {
  title: string;
  subtitle?: string;
  onViewAll?: () => void;
  children: ReactNode;
  className?: string;
}

export function NetflixRow({ title, subtitle, onViewAll, children, className }: NetflixRowProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-xs text-primary hover:text-primary/80 hover:bg-primary/5 h-7 px-2"
          >
            View All
            <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="netflix-scroll">{children}</div>
    </section>
  );
}
