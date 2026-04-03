import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export type AppGuardRole = 'super_admin' | 'admin' | 'reseller' | 'user';

export function RoleGuardWrapper({ children, allow, fallback = '/dashboard' }: { children: ReactNode; allow: AppGuardRole[]; fallback?: string }) {
  const { loading, isSuperAdmin, isReseller, user } = useAuth();
  if (loading) return null;

  const role: AppGuardRole = isSuperAdmin ? 'super_admin' : isReseller ? 'reseller' : user ? 'user' : 'user';
  const normalizedAllow = allow.flatMap((item) => (item === 'admin' ? ['super_admin'] : [item]));

  if (!normalizedAllow.includes(role)) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
