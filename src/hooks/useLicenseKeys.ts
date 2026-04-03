import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { keysApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { subscribeQuickActionEvents } from '@/lib/quickActionEvents';

export interface LicenseKey {
  id: string;
  key_id?: string;
  key_value?: string;
  type?: string;
  user_id?: string | null;
  reseller_id?: string | null;
  usage_limit?: number;
  used_count?: number;
  expiry_date?: string | null;
  product_id: string;
  license_key: string;
  key_type: 'lifetime' | 'yearly' | 'monthly' | 'trial';
  status: 'active' | 'expired' | 'suspended' | 'revoked';
  owner_email: string | null;
  owner_name: string | null;
  device_id: string | null;
  max_devices: number;
  activated_devices: number;
  expires_at: string | null;
  activated_at: string | null;
  notes: string | null;
  created_at: string;
}

export function useLicenseKeys() {
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await keysApi.list();
      const normalized = (res.data || []).map((key: any) => ({
        ...key,
        id: key.id || key.key_id,
        key_id: key.key_id || key.id,
        license_key: key.license_key || key.key_value || '',
        key_value: key.key_value || key.license_key || '',
        type: key.type || key.key_type,
        usage_limit: Number(key.usage_limit ?? key.max_devices ?? 0) || 0,
        used_count: Number(key.used_count ?? 0) || 0,
        expiry_date: key.expiry_date || key.expires_at || null,
      }));
      setKeys(normalized as LicenseKey[]);
    } catch (e: any) {
      toast.error('Failed to fetch license keys');
      console.error(e);
    }
    setLoading(false);
  };

  const generateKeyString = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let j = 0; j < 4; j++) {
      if (j > 0) result += '-';
      for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    return result;
  };

  const createKey = async (key: Partial<LicenseKey>) => {
    try {
      const res = await keysApi.generate(key);
      toast.success('License key created: ' + res.data.license_key);
      await fetchKeys();
      return res.data;
    } catch (e: any) {
      toast.error('Failed to create license key');
      throw e;
    }
  };

  const updateKey = async (id: string, updates: Partial<LicenseKey>) => {
    try {
      if (updates.status === 'active') {
        await keysApi.activate(id);
      } else if (updates.status === 'suspended') {
        await keysApi.deactivate(id);
      } else if (updates.status === 'revoked') {
        await keysApi.revoke(id);
      }
      toast.success('License key updated');
      await fetchKeys();
    } catch (e: any) {
      toast.error('Failed to update license key');
      throw e;
    }
  };

  const deleteKey = async (id: string) => {
    try {
      await keysApi.delete(id);
      toast.success('License key deleted');
      await fetchKeys();
    } catch (e: any) {
      toast.error('Failed to delete license key');
      throw e;
    }
  };

  const suspendKey = async (id: string) => {
    await updateKey(id, { status: 'suspended' });
  };

  const activateKey = async (id: string) => {
    await updateKey(id, { status: 'active' });
  };

  const revokeKey = async (id: string) => {
    await updateKey(id, { status: 'revoked' });
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('license-keys-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'license_keys' }, () => {
        fetchKeys();
      })
      .subscribe();

    const unsubscribeQuickEvents = subscribeQuickActionEvents((event) => {
      if (event === 'key_generated') {
        fetchKeys();
      }
    });

    return () => {
      unsubscribeQuickEvents();
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    keys,
    loading,
    fetchKeys,
    createKey,
    updateKey,
    deleteKey,
    suspendKey,
    activateKey,
    revokeKey,
    generateKeyString
  };
}
