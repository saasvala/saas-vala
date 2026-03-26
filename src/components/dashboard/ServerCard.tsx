import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Server, GitBranch, ExternalLink, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ServerCardProps {
  name: string;
  domain?: string;
  repo?: string;
  status: 'online' | 'offline' | 'deploying';
  lastDeployed?: string;
  onClick?: () => void;
}

const statusConfig = {
  online: {
    label: 'Online',
    dotClass: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  offline: {
    label: 'Offline',
    dotClass: 'bg-red-400',
    badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  deploying: {
    label: 'Deploying',
    dotClass: 'bg-amber-400 animate-pulse',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
};

export function ServerCard({ name, domain, repo, status, lastDeployed, onClick }: ServerCardProps) {
  const config = statusConfig[status];

  return (
    <div
      className="min-w-[280px] max-w-[280px] rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 cursor-pointer hover:border-border/60 hover:bg-card/80 transition-all duration-200"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
          <Server className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', config.dotClass)} />
            <Badge variant="outline" className={cn('text-[10px] font-medium', config.badgeClass)}>
              {config.label}
            </Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border/40">
              <DropdownMenuItem>View Logs</DropdownMenuItem>
              <DropdownMenuItem>Redeploy</DropdownMenuItem>
              <DropdownMenuItem>Rollback</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-foreground mb-1">{name}</h3>

      {domain && (
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline mb-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          {domain}
        </a>
      )}

      {repo && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <GitBranch className="h-3 w-3" />
          <span className="truncate">{repo}</span>
        </div>
      )}

      {lastDeployed && (
        <p className="text-[11px] text-muted-foreground/70">
          Deployed: {lastDeployed}
        </p>
      )}
    </div>
  );
}
