import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useSidebarState } from '@/hooks/useSidebarState';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { collapsed } = useSidebarState();

  return (
    <div className="min-h-screen bg-background relative">
      {/* Very subtle background texture */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-30">
        <div
          className="absolute -top-60 -right-60 w-[700px] h-[700px] rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(215, 70%, 45%, 0.04) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-60 -left-60 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(195, 80%, 50%, 0.03) 0%, transparent 70%)',
          }}
        />
      </div>

      <Sidebar />
      <div
        className={cn(
          'transition-all duration-300 relative z-10',
          collapsed ? 'pl-16' : 'pl-16 lg:pl-64'
        )}
      >
        <Header />
        <main className="min-h-[calc(100vh-3.5rem)] p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
