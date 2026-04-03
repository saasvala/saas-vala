import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function SubscriptionGuardWrapper({ children, active, fallback = '/subscription' }: { children: ReactNode; active: boolean; fallback?: string }) {
  const { loading, user } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!active) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
