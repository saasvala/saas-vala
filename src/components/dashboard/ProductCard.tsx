import { Badge } from '@/components/ui/badge';
import { Package, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  name: string;
  description?: string;
  price?: number;
  status: 'active' | 'draft' | 'archived';
  type: 'product' | 'demo' | 'apk';
  onClick?: () => void;
}

const statusStyles = {
  active: 'bg-success/20 text-success border-success/30',
  draft: 'bg-warning/20 text-warning border-warning/30',
  archived: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

const typeStyles = {
  product: 'border-l-primary',
  demo: 'border-l-cyan',
  apk: 'border-l-purple',
};

export function ProductCard({ name, description, price, status, type, onClick }: ProductCardProps) {
  return (
    <div
      className={cn(
        'glass-card-hover min-w-[280px] max-w-[280px] rounded-xl p-4 border-l-4 cursor-pointer',
        typeStyles[type]
      )}
      onClick={onClick}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border bg-popover">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="mb-1 truncate font-semibold text-foreground">{name}</h3>
      {description && <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{description}</p>}

      <div className="flex items-center justify-between">
        <Badge variant="outline" className={cn('capitalize', statusStyles[status])}>
          {status}
        </Badge>
        {price !== undefined && <span className="font-semibold text-primary">${price.toFixed(2)}</span>}
      </div>
    </div>
  );
}
