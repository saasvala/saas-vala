import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { resellersApi } from '@/lib/api';

export interface ResellerClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  keys: number;
  last_purchase: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface ResellerClientStats {
  total_clients: number;
  active_clients: number;
  total_keys: number;
}

export function useResellerClients() {
  const [clients, setClients] = useState<ResellerClient[]>([]);
  const [stats, setStats] = useState<ResellerClientStats>({ total_clients: 0, active_clients: 0, total_keys: 0 });
  const [loading, setLoading] = useState(true);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await resellersApi.clients();
      setClients((res.data || []) as ResellerClient[]);
      setStats((res.stats || { total_clients: 0, active_clients: 0, total_keys: 0 }) as ResellerClientStats);
    } catch (e: any) {
      toast.error('Failed to fetch reseller clients');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  return {
    clients,
    stats,
    loading,
    fetchClients,
  };
}
