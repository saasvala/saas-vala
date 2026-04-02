import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { resellersApi } from '@/lib/api';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';

export interface Reseller {
  id: string;
  user_id: string;
  company_name: string | null;
  tier?: string | null;
  status?: string | null;
  kyc_status?: string | null;
  commission_percent: number;
  credit_limit: number;
  total_sales: number;
  total_commission: number;
  order_count?: number;
  keys_generated?: number;
  is_active: boolean;
  is_verified: boolean;
  meta: Json;
  created_at: string;
  updated_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  };
}

export function useResellers() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchResellers = async (page = 1, limit = 25, search = '') => {
    setLoading(true);
    try {
      const res = await resellersApi.list({ page, limit, search });
      setResellers((res.data || []) as Reseller[]);
      setTotal(res.total || 0);
    } catch (e: any) {
      toast.error('Failed to fetch resellers');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const createReseller = async (reseller: Partial<Reseller>) => {
    try {
      const res = await resellersApi.create(reseller);
      toast.success('Reseller created');
      await fetchResellers();
      return res.data;
    } catch (e: any) {
      toast.error('Failed to create reseller');
      throw e;
    }
  };

  const updateReseller = async (id: string, updates: Partial<Reseller>) => {
    try {
      await resellersApi.update(id, updates);
      toast.success('Reseller updated');
      await fetchResellers();
    } catch (e: any) {
      toast.error('Failed to update reseller');
      throw e;
    }
  };

  const suspendReseller = async (id: string) => {
    await updateReseller(id, { status: 'suspended', is_active: false });
  };

  const activateReseller = async (id: string) => {
    await updateReseller(id, { status: 'active', is_active: true });
  };

  const verifyReseller = async (id: string) => {
    await updateReseller(id, { is_verified: true, kyc_status: 'verified' });
  };

  useEffect(() => {
    fetchResellers();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('resellers-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resellers' }, () => {
        fetchResellers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchResellers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reseller_commission_logs' }, () => {
        fetchResellers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'license_keys' }, () => {
        fetchResellers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    resellers,
    loading,
    total,
    fetchResellers,
    createReseller,
    updateReseller,
    suspendReseller,
    activateReseller,
    verifyReseller,
  };
}
