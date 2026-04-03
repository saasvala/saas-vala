import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Search, Bell, User, Settings, LogOut, ShoppingCart, Sparkles, Moon, Sun, Monitor } from 'lucide-react';
import { WalletHeaderButton } from '@/components/wallet/WalletHeaderButton';
import { useCart } from '@/hooks/useCart';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';

const pageTitles: Record<string, string> = {
  '/': 'Marketplace',
  '/dashboard': 'Dashboard',
  '/products': 'Product Manager',
  '/admin/marketplace': 'Marketplace Admin',
  '/keys': 'License Keys',
  '/servers': 'Server Manager',
  '/ai-chat': 'AI Chat',
  '/saas-ai-dashboard': 'AI Dashboard',
  '/ai-apis': 'AI API Manager',
  '/wallet': 'Wallet & Billing',
  '/seo-leads': 'SEO & Leads',
  '/reseller-manager': 'Reseller Manager',
  '/resellers': 'Reseller Manager',
  '/audit-logs': 'Audit Logs',
  '/system-health': 'System Health',
  '/settings': 'Settings',
  '/support': 'Support',
  '/support/ticket': 'Support Ticket',
  '/feedback': 'Feedback',
  '/announcements': 'Announcements',
  '/dashboard/downloads': 'Download History',
  '/onboarding': 'Onboarding',
  '/email-logs': 'Email Logs',
  '/retry-actions': 'Retry Actions',
  '/archive': 'Archive',
  '/bulk-actions': 'Bulk Actions',
  '/tags': 'Tagging',
  '/education': 'Education Systems',
  '/role-detail': 'Role Configuration',
  '/automation': 'Auto-Pilot',
  '/auto-pilot': 'Auto-Pilot',
  '/auto-pilot/apk-pipeline': 'APK Pipeline',
  '/auto-pilot/system-monitor': 'System Monitor',
  '/apk-pipeline': 'APK Pipeline',
  '/vala-builder': 'VALA Builder',
};

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, signOut, isSuperAdmin } = useAuth();
  const { count: cartCount } = useCart();
  const { theme, setTheme } = useTheme();

  const pageTitle = pageTitles[location.pathname] || 'SaaS VALA';
  const canGoBack = location.pathname !== '/';
  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const broadcast = localStorage.getItem('sv_admin_broadcast') || '';

  return (
    <header className="sticky top-0 z-30 border-b border-border/30 bg-background/80 backdrop-blur-2xl">
      {broadcast && (
        <div className="h-7 px-5 flex items-center bg-primary/10 text-primary text-xs border-b border-primary/20">
          {broadcast}
        </div>
      )}
      <div className="flex h-14 items-center justify-between px-5">
      <div className="flex items-center gap-3">
        {canGoBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-lg font-bold text-foreground tracking-tight">
            {pageTitle}
          </h1>
          {isSuperAdmin && (
            <Badge className="text-[10px] font-semibold bg-primary/10 text-primary border-primary/20 px-1.5 py-0">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
              Admin
            </Badge>
          )}
          {role === 'reseller' && (
            <Badge variant="outline" className="text-[10px] border-secondary/30 text-secondary bg-secondary/5 px-1.5 py-0">
              Reseller
            </Badge>
          )}
        </div>
      </div>

      {/* Center - Search */}
      <div className="hidden md:flex flex-1 max-w-sm mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            type="search"
            placeholder="Search anything..."
            className="pl-9 h-8 text-sm bg-muted/20 border-border/30 focus:border-primary/40 focus:bg-muted/40 rounded-lg transition-all duration-200"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5">
        {/* Cart */}
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground h-8 w-8"
          onClick={() => navigate('/cart')}
        >
          <ShoppingCart className="h-4 w-4" />
          {cartCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center shadow-sm"
            >
              {cartCount > 9 ? '9+' : cartCount}
            </motion.span>
          )}
        </Button>

        <WalletHeaderButton />

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground h-8 w-8"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center shadow-sm">
            3
          </span>
        </Button>

        {/* Separator */}
        <div className="w-px h-6 bg-border/40 mx-1.5" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
              <Avatar className="h-8 w-8 ring-2 ring-primary/10 hover:ring-primary/25 transition-all duration-200">
                <AvatarImage src="" alt={user?.email || ''} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52 bg-popover/95 backdrop-blur-xl border-border/40 shadow-xl" align="end" sideOffset={8}>
            <DropdownMenuLabel className="font-normal py-2">
              <p className="text-sm font-semibold text-foreground truncate">
                {user?.email}
              </p>
              <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                {role?.replace('_', ' ')}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border/30" />
            <DropdownMenuItem className="cursor-pointer text-sm py-2" onClick={() => navigate('/settings')}>
              <User className="mr-2 h-3.5 w-3.5" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-sm py-2" onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-3.5 w-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/30" />
            <DropdownMenuItem className="cursor-pointer text-sm py-2" onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-3.5 w-3.5" />
              {theme === 'light' ? 'Light (Active)' : 'Switch to Light'}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-sm py-2" onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-3.5 w-3.5" />
              {theme === 'dark' ? 'Dark (Active)' : 'Switch to Dark'}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-sm py-2" onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-3.5 w-3.5" />
              {theme === 'system' ? 'System (Active)' : 'Use System Theme'}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/30" />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive text-sm py-2"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </header>
  );
}
