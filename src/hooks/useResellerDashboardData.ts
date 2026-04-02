import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ResellerKpis {
  totalSales: number;
  totalCommission: number;
  activeClients: number;
  keysGenerated: number;
  walletBalance: number;
  pendingPayout: number;
  referralEarnings: number;
}

export interface ResellerClient {
  id: string;
  client_name: string | null;
  client_email: string;
  client_phone: string | null;
  purchase_count: number;
  total_spent: number;
  last_purchase_at: string | null;
  status: string;
}

export interface ReferralItem {
  id: string;
  code: string;
  status: string;
  commission_earned: number;
  signup_at: string | null;
}

const defaultKpis: ResellerKpis = {
  totalSales: 0,
  totalCommission: 0,
  activeClients: 0,
  keysGenerated: 0,
  walletBalance: 0,
  pendingPayout: 0,
  referralEarnings: 0,
};

export function useResellerDashboardData() {
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<ResellerKpis>(defaultKpis);
  const [clients, setClients] = useState<ResellerClient[]>([]);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setKpis(defaultKpis);
        setClients([]);
        setReferrals([]);
        setResellerId(null);
        return;
      }

      const { data: reseller } = await supabase
        .from('resellers')
        .select('id, total_sales, total_commission')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!reseller?.id) {
        setKpis(defaultKpis);
        setClients([]);
        setReferrals([]);
        setResellerId(null);
        return;
      }

      setResellerId(reseller.id);

      const [
        walletRes,
        keysCountRes,
        payoutRes,
        clientRes,
        referralRes,
        commissionRes,
      ] = await Promise.all([
        supabase.from('wallets').select('balance').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('license_keys')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id),
        supabase
          .from('marketplace_payouts')
          .select('amount')
          .eq('seller_id', user.id)
          .in('status', ['pending', 'processing']),
        supabase
          .from('reseller_clients')
          .select('id, client_name, client_email, client_phone, purchase_count, total_spent, last_purchase_at, status')
          .eq('reseller_id', reseller.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('referral_codes')
          .select('id, code, status, commission_earned, signup_at')
          .eq('reseller_id', reseller.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('reseller_commission_logs')
          .select('amount')
          .eq('reseller_id', reseller.id),
      ]);

      const walletBalance = walletRes.data?.balance || 0;
      const keysGenerated = keysCountRes.count || 0;
      const pendingPayout = (payoutRes.data || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const dbClients = (clientRes.data || []) as ResellerClient[];
      const dbReferrals = (referralRes.data || []) as ReferralItem[];
      const referralEarnings = dbReferrals.reduce((sum, r) => sum + Number(r.commission_earned || 0), 0);

      const computedSales = dbClients.reduce((sum, c) => sum + Number(c.total_spent || 0), 0);
      const computedCommission = (commissionRes.data || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const activeClients = dbClients.filter((c) => c.status === 'active').length;

      setClients(dbClients);
      setReferrals(dbReferrals);
      setKpis({
        totalSales: Number(reseller.total_sales || computedSales || 0),
        totalCommission: Number(reseller.total_commission || computedCommission || 0),
        activeClients,
        keysGenerated,
        walletBalance: Number(walletBalance),
        pendingPayout,
        referralEarnings,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!resellerId) return;

    const channels: RealtimeChannel[] = [];

    channels.push(
      supabase
        .channel('reseller-kpi-resellers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resellers' }, fetchData)
        .subscribe()
    );
    channels.push(
      supabase
        .channel('reseller-kpi-wallets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, fetchData)
        .subscribe()
    );
    channels.push(
      supabase
        .channel('reseller-kpi-keys')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'license_keys' }, fetchData)
        .subscribe()
    );
    channels.push(
      supabase
        .channel('reseller-kpi-payouts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_payouts' }, fetchData)
        .subscribe()
    );
    channels.push(
      supabase
        .channel('reseller-kpi-clients')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reseller_clients' }, fetchData)
        .subscribe()
    );
    channels.push(
      supabase
        .channel('reseller-kpi-referrals')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_codes' }, fetchData)
        .subscribe()
    );
    channels.push(
      supabase
        .channel('reseller-kpi-commissions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reseller_commission_logs' }, fetchData)
        .subscribe()
    );

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [fetchData, resellerId]);

  return useMemo(
    () => ({
      loading,
      kpis,
      clients,
      referrals,
      resellerId,
      refresh: fetchData,
    }),
    [loading, kpis, clients, referrals, resellerId, fetchData]
  );
}
