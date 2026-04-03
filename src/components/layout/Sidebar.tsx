import { NavLink, useLocation } from 'react-router-dom';
import { useSidebarState } from '@/hooks/useSidebarState';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  Package,
  KeyRound,
  Server,
  MessageSquareText,
  BrainCircuit,
  Wallet,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UsersRound,
  Store,
  ScrollText,
  HeartPulse,
  BotMessageSquare,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Headset,
  Download,
  MessageCircle,
  BellRing,
  Mail,
  RefreshCw,
  Archive,
  Tags,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import saasValaLogo from '@/assets/saas-vala-logo.jpg';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  activePaths?: string[];
  adminOnly?: boolean;
  section?: string;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', section: 'core' },
  { title: 'Products', icon: Package, href: '/products', section: 'core' },
  { title: 'License Keys', icon: KeyRound, href: '/keys', section: 'core' },
  { title: 'Servers', icon: Server, href: '/servers', section: 'core' },
  { title: 'Wallet', icon: Wallet, href: '/wallet', section: 'core' },
  { title: 'Downloads', icon: Download, href: '/dashboard/downloads', section: 'core' },
  { title: 'Support', icon: Headset, href: '/support', section: 'core' },
  { title: 'Feedback', icon: MessageCircle, href: '/feedback', section: 'core' },
  { title: 'Announcements', icon: BellRing, href: '/announcements', section: 'core' },

  { title: 'Resellers', icon: UsersRound, href: '/reseller-manager', activePaths: ['/reseller-manager', '/resellers'], adminOnly: true, section: 'admin' },
  { title: 'Marketplace', icon: Store, href: '/admin/marketplace', adminOnly: true, section: 'admin' },
  { title: 'Auto-Pilot', icon: BotMessageSquare, href: '/auto-pilot', activePaths: ['/auto-pilot', '/auto-pilot/apk-pipeline', '/auto-pilot/system-monitor'], adminOnly: true, section: 'admin' },
  { title: 'APK Pipeline', icon: Smartphone, href: '/auto-pilot/apk-pipeline', activePaths: ['/auto-pilot/apk-pipeline'], adminOnly: true, section: 'admin' },
  { title: 'Audit Logs', icon: ScrollText, href: '/audit-logs', adminOnly: true, section: 'admin' },
  { title: 'System Health', icon: HeartPulse, href: '/system-health', adminOnly: true, section: 'admin' },
  { title: 'Email Logs', icon: Mail, href: '/email-logs', adminOnly: true, section: 'admin' },
  { title: 'Retry Actions', icon: RefreshCw, href: '/retry-actions', adminOnly: true, section: 'admin' },
  { title: 'Archive', icon: Archive, href: '/archive', adminOnly: true, section: 'admin' },
  { title: 'Bulk Actions', icon: ListChecks, href: '/bulk-actions', adminOnly: true, section: 'admin' },
  { title: 'Tagging', icon: Tags, href: '/tags', adminOnly: true, section: 'admin' },
  { title: 'Settings', icon: Settings, href: '/settings', adminOnly: true, section: 'admin' },

  { title: 'SaaS AI', icon: BrainCircuit, href: '/saas-ai-dashboard', section: 'ai' },
  { title: 'VALA Builder', icon: Sparkles, href: '/vala-builder', section: 'ai' },
  { title: 'AI Chat', icon: MessageSquareText, href: '/ai-chat', section: 'ai' },
  { title: 'AI APIs', icon: ShieldCheck, href: '/ai-apis', adminOnly: true, section: 'ai' },

  { title: 'SEO & Leads', icon: TrendingUp, href: '/seo-leads', section: 'marketing' },
];

const sectionLabels: Record<string, string> = {
  core: 'Main',
  admin: 'Admin',
  ai: 'AI Suite',
  marketing: 'Marketing',
};

export function Sidebar() {
  const { collapsed, toggle } = useSidebarState();
  const location = useLocation();
  const { isSuperAdmin, signOut } = useAuth();

  const isItemActive = (item: NavItem) => {
    const paths = item.activePaths ?? [item.href];
    return paths.includes(location.pathname);
  };

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || isSuperAdmin
  );

  // Group by section
  const sections = filteredNavItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const section = item.section || 'core';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r border-white/[0.06] transition-all duration-300 overflow-hidden',
        collapsed ? 'w-16' : 'w-64'
      )}
      style={{
        background: 'linear-gradient(180deg, hsl(220, 65%, 10%) 0%, hsl(225, 70%, 6%) 100%)',
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-0 w-full h-48 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 0%, hsl(215, 80%, 50%, 0.08) 0%, transparent 70%)',
        }}
      />

      <div className="flex h-full flex-col relative z-10">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-4">
          <AnimatePresence mode="wait">
            {!collapsed ? (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3"
              >
                <div className="relative">
                  <img src={saasValaLogo} alt="SaaS VALA" className="h-9 w-9 rounded-xl object-cover ring-2 ring-white/10 shadow-lg" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[hsl(225,70%,6%)] shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                </div>
                <div>
                  <span className="font-display text-[15px] font-bold text-white tracking-tight leading-none">
                    SaaS VALA
                  </span>
                  <p className="text-[10px] text-white/40 font-medium mt-0.5">Admin Panel</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative mx-auto"
              >
                <img src={saasValaLogo} alt="SaaS VALA" className="h-9 w-9 rounded-xl object-cover ring-2 ring-white/10" />
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[hsl(225,70%,6%)]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5 scrollbar-none">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              {/* Section label */}
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
                  {sectionLabels[section] || section}
                </p>
              )}
              {collapsed && <div className="h-px bg-white/[0.06] mx-2 mb-2" />}

              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive = isItemActive(item);
                  const Icon = item.icon;

                  const linkContent = (
                    <NavLink
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 relative group',
                        isActive
                          ? 'text-white'
                          : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                      )}
                      style={isActive ? {
                        background: 'linear-gradient(135deg, hsl(215, 60%, 28%, 0.8) 0%, hsl(215, 55%, 22%, 0.6) 100%)',
                        boxShadow: '0 0 20px rgba(59, 130, 246, 0.08)',
                      } : undefined}
                    >
                      {/* Active bar */}
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute left-0 top-[20%] bottom-[20%] w-[2.5px] rounded-r-full"
                          style={{
                            background: 'linear-gradient(180deg, hsl(215, 90%, 65%), hsl(215, 80%, 50%))',
                            boxShadow: '0 0 10px rgba(96, 165, 250, 0.6)',
                          }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        />
                      )}

                      <Icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-all duration-200',
                          isActive ? 'text-blue-400' : 'text-white/40 group-hover:text-white/70'
                        )}
                      />

                      {!collapsed && (
                        <span className="truncate">{item.title}</span>
                      )}

                      {/* Hover glow */}
                      {isActive && !collapsed && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
                      )}
                    </NavLink>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={`${item.href}-${item.title}`} delayDuration={0}>
                        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8} className="bg-[hsl(220,50%,15%)] text-white border-white/10 text-xs font-medium shadow-xl">
                          {item.title}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={`${item.href}-${item.title}`}>{linkContent}</div>;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/[0.06] p-2 space-y-1">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200',
                  'text-white/40 hover:bg-red-500/10 hover:text-red-400'
                )}
              >
                <LogOut className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Sign Out</span>}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8} className="bg-[hsl(220,50%,15%)] text-white border-white/10 text-xs">
                Sign Out
              </TooltipContent>
            )}
          </Tooltip>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className={cn(
              'w-full justify-center text-white/30 hover:bg-white/[0.05] hover:text-white/60 h-8',
              collapsed && 'px-0'
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </Button>

          {!collapsed && (
            <p className="mt-2 pb-1 text-center text-[10px] text-white/20 font-medium">
              © 2025 SaaS VALA
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
