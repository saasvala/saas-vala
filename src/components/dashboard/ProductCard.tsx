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
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  draft: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  archived: 'bg-muted text-muted-foreground border-border/40',
};

const typeBorderColor = {
  product: 'border-l-primary',
  demo: 'border-l-blue-500',
  apk: 'border-l-violet-500',
};

export function ProductCard({ name, description, price, status, type, onClick }: ProductCardProps) {
  return (
    <div
      className={cn(
        'min-w-[260px] max-w-[260px] rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 border-l-[3px] cursor-pointer',
        'hover:border-border/60 hover:bg-card/80 transition-all duration-200',
        typeBorderColor[type]
      )}
      onClick={onClick}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center">
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border/40 bg-popover">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="mb-1 truncate text-sm font-semibold text-foreground">{name}</h3>
      {description && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground leading-relaxed">{description}</p>}

      <div className="flex items-center justify-between">
        <Badge variant="outline" className={cn('capitalize text-[10px] font-medium', statusStyles[status])}>
          {status}
        </Badge>
        {price !== undefined && <span className="text-sm font-semibold text-foreground">${price.toFixed(2)}</span>}
      </div>
    </div>
  );
}
