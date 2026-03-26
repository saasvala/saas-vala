import { KeyRound, Package, Server, DollarSign, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Activity {
  id: string;
  type: 'key' | 'product' | 'server' | 'payment' | 'user';
  message: string;
  time: string;
}

const iconMap = {
  key: KeyRound,
  product: Package,
  server: Server,
  payment: DollarSign,
  user: User,
};

const colorMap = {
  key: 'bg-primary/10 text-primary',
  product: 'bg-blue-500/10 text-blue-500',
  server: 'bg-violet-500/10 text-violet-500',
  payment: 'bg-emerald-500/10 text-emerald-500',
  user: 'bg-amber-500/10 text-amber-500',
};

interface ActivityFeedProps {
  activities: Activity[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Recent Activity
      </h3>
      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 scrollbar-none">
        {activities.map((activity, index) => {
          const Icon = iconMap[activity.type];
          return (
            <div
              key={activity.id}
              className={cn(
                'flex items-start gap-3 p-2.5 rounded-lg transition-colors duration-200',
                'hover:bg-muted/30 cursor-pointer'
              )}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className={cn(
                'h-7 w-7 rounded-md flex items-center justify-center shrink-0',
                colorMap[activity.type]
              )}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground leading-relaxed">{activity.message}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{activity.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
