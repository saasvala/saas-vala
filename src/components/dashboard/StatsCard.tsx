import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface StatsCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  accentColor?: 'blue' | 'emerald' | 'violet' | 'amber';
  index?: number;
}

const accentStyles = {
  blue: {
    bg: 'bg-blue-500/10',
    icon: 'text-blue-500',
    ring: 'ring-blue-500/20',
    trend: 'text-blue-500',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    icon: 'text-emerald-500',
    ring: 'ring-emerald-500/20',
    trend: 'text-emerald-500',
  },
  violet: {
    bg: 'bg-violet-500/10',
    icon: 'text-violet-500',
    ring: 'ring-violet-500/20',
    trend: 'text-violet-500',
  },
  amber: {
    bg: 'bg-amber-500/10',
    icon: 'text-amber-500',
    ring: 'ring-amber-500/20',
    trend: 'text-amber-500',
  },
};

export function StatsCard({
  title,
  value,
  prefix = '',
  suffix = '',
  icon: Icon,
  trend,
  accentColor = 'blue',
  index = 0,
}: StatsCardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const styles = accentStyles[accentColor];

  useEffect(() => {
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 hover:border-border/60 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <motion.p
            key={displayValue}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold font-display text-foreground tracking-tight"
          >
            {prefix}{displayValue.toLocaleString()}{suffix}
          </motion.p>
          {trend && (
            <div className={cn(
              'flex items-center gap-1 text-xs font-medium',
              trend.positive ? 'text-emerald-500' : 'text-red-400'
            )}>
              <span>{trend.positive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground font-normal">vs last month</span>
            </div>
          )}
        </div>
        <div className={cn(
          'h-10 w-10 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110',
          styles.bg
        )}>
          <Icon className={cn('h-5 w-5', styles.icon)} />
        </div>
      </div>
    </motion.div>
  );
}
