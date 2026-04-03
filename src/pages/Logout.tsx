import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function Logout() {
  const { signOut } = useAuth();

  useEffect(() => {
    void signOut();
  }, [signOut]);

  return <Navigate to="/auth" replace />;
}
