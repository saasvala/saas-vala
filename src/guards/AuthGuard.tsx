import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function AuthGuardWrapper({ children, fallback = '/auth' }: { children: ReactNode; fallback?: string }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
