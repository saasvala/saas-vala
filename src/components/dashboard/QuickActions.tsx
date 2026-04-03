import { Button } from '@/components/ui/button';
import { Plus, KeyRound, Upload, Server, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRecentActions } from '@/hooks/useRecentActions';

const actions = [
  {
    label: 'Add Product',
    icon: Plus,
    href: '/products',
    className: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm',
  },
  {
    label: 'Generate Key',
    icon: KeyRound,
    href: '/keys',
    className: 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20',
  },
  {
    label: 'Upload APK',
    icon: Upload,
    href: '/products',
    className: 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 border border-violet-500/20',
  },
  {
    label: 'Deploy Server',
    icon: Server,
    href: '/servers',
    className: 'bg-muted hover:bg-muted/80 text-foreground border border-border/40',
  },
  {
    label: 'Add Credits',
    icon: Wallet,
    href: '/wallet',
    className: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20',
  },
  {
    label: 'Support Ticket',
    icon: Server,
    href: '/support/ticket',
    className: 'bg-muted hover:bg-muted/80 text-foreground border border-border/40',
  },
];

export function QuickActions() {
  const navigate = useNavigate();
  const { actions: recentActions, pushAction } = useRecentActions();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5"
    >
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Quick Actions
      </h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35 + i * 0.05 }}
          >
            <Button
              onClick={() => {
                pushAction({ label: action.label, href: action.href });
                navigate(action.href);
              }}
              size="sm"
              className={`gap-1.5 text-xs font-medium h-8 ${action.className}`}
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </Button>
          </motion.div>
        ))}
      </div>
      {recentActions.length > 0 && (
        <div className="mt-4 border-t border-border/40 pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Recent Actions</h4>
          <div className="flex flex-wrap gap-2">
            {recentActions.slice(0, 5).map((item) => (
              <Button
                key={`${item.href}-${item.at}`}
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => navigate(item.href)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
