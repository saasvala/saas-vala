import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { resellerOnboardingApi } from '@/lib/api';

export interface ResellerApplication {
  id: string;
  user_id: string;
  business_name: string;
  contact: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
  updated_at?: string;
  profile?: {
    full_name?: string | null;
    phone?: string | null;
    company_name?: string | null;
  } | null;
  features_checklist?: string[] | null;
  terms_version?: string | null;
  terms_accepted_at?: string | null;
}

export function useResellerApplications() {
  const [myApplications, setMyApplications] = useState<ResellerApplication[]>([]);
  const [adminApplications, setAdminApplications] = useState<ResellerApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchMyApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await resellerOnboardingApi.myApplications();
      setMyApplications((res.data || []) as ResellerApplication[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const submitApplication = async (data: { business_name: string; contact: string; notes?: string }) => {
    try {
      const res = await resellerOnboardingApi.apply(data);
      toast.success('Reseller application submitted');
      await fetchMyApplications();
      return res.data as ResellerApplication;
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit reseller application');
      throw e;
    }
  };

  const fetchAdminApplications = useCallback(async (params?: { page?: number; limit?: number; status?: string; search?: string }) => {
    setAdminLoading(true);
    try {
      const res = await resellerOnboardingApi.adminListApplications(params);
      setAdminApplications((res.data || []) as ResellerApplication[]);
      setTotal(res.total || 0);
    } catch (e: any) {
      toast.error(e.message || 'Failed to fetch reseller applications');
      throw e;
    } finally {
      setAdminLoading(false);
    }
  }, []);

  const approveApplication = async (
    applicationId: string,
    options?: {
      notes?: string;
      tier?: string;
      commission_percent?: number;
      credit_limit?: number;
      selected_features?: string[];
      terms_version?: string;
    }
  ) => {
    try {
      await resellerOnboardingApi.adminApprove(applicationId, options);
      toast.success('Application approved');
      await fetchAdminApplications();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve application');
      throw e;
    }
  };

  const rejectApplication = async (applicationId: string, reason: string) => {
    try {
      await resellerOnboardingApi.adminReject(applicationId, reason);
      toast.success('Application rejected');
      await fetchAdminApplications();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject application');
      throw e;
    }
  };

  useEffect(() => {
    fetchMyApplications();
  }, [fetchMyApplications]);

  return {
    myApplications,
    adminApplications,
    loading,
    adminLoading,
    total,
    fetchMyApplications,
    submitApplication,
    fetchAdminApplications,
    approveApplication,
    rejectApplication,
  };
}
