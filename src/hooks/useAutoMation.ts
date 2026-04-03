import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { autoPilotApi } from '@/lib/api';

interface ClientRequest {
  id: string;
  name: string;
  business_type: string;
  country: string;
  language: string;
  budget: number | null;
  features_required: string;
  status: string;
  ai_score: number | null;
  assigned_to: string | null;
  queue_status: string | null;
  created_at: string;
}

interface SoftwareQueue {
  id: string;
  type: string;
  priority: number;
  status: string;
  logs: string | null;
  retry_count: number;
  created_at: string;
}

interface BillingTracker {
  id: string;
  user_id: string | null;
  service_name: string;
  amount: number;
  billing_cycle: string;
  status: string;
  created_at: string;
}

interface SeoBacklink {
  id: string;
  product_id: string | null;
  target_url: string;
  backlink_url: string;
  anchor_text: string | null;
  domain_authority: number | null;
  status: string;
  backlink_type: string;
  source_type: string | null;
}

export function useAutomation() {
  const [clientRequests, setClientRequests] = useState<ClientRequest[]>([]);
  const [softwareQueue, setSoftwareQueue] = useState<SoftwareQueue[]>([]);
  const [billingItems, setBillingItems] = useState<BillingTracker[]>([]);
  const [backlinks, setBacklinks] = useState<SeoBacklink[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [quickActionLoading, setQuickActionLoading] = useState({
    newRequest: false,
    generate: false,
    billingCheck: false,
    addBilling: false,
  });

  // Fetch all data
  const fetchData = async () => {
    setLoading(true);
    
    const [requestsRes, queueRes, billingRes, backlinksRes] = await Promise.all([
      supabase.from('client_requests').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('build_queue').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('billing_items').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('seo_backlinks').select('*').order('created_at', { ascending: false }).limit(100)
    ]);

    if (requestsRes.data) setClientRequests(requestsRes.data as ClientRequest[]);
    if (queueRes.data) setSoftwareQueue(queueRes.data as SoftwareQueue[]);
    if (billingRes.data) setBillingItems(billingRes.data as BillingTracker[]);
    if (backlinksRes.data) setBacklinks(backlinksRes.data as SeoBacklink[]);
    
    setLoading(false);
  };

  const refreshDashboard = async () => {
    await fetchData();
  };

  const refreshQueue = async () => {
    await fetchData();
  };

  const refreshBilling = async () => {
    await fetchData();
  };

  // Submit new client request
  const submitClientRequest = async (request: {
    name: string;
    business_type: string;
    country: string;
    language: string;
    budget?: number;
    features_required: string;
  }) => {
    setProcessing(true);
    
    try {
      // Insert request
      const { data: newRequest, error } = await supabase
        .from('client_requests')
        .insert({
          name: request.name,
          business_type: request.business_type,
          country: request.country,
          language: request.language,
          budget: request.budget ?? null,
          features_required: request.features_required,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      // Process with AI
      const { error: fnError } = await supabase.functions.invoke('ai-auto-pilot', {
        body: {
          action: 'handle_client_request',
          data: {
            requestId: newRequest.id,
            name: request.name,
            businessType: request.business_type,
            country: request.country,
            language: request.language,
            budget: request.budget ?? null,
            featuresRequired: request.features_required
          }
        }
      });

      if (fnError) {
        console.error('AI processing error:', fnError);
      }

      toast.success('✅ Request submitted - AI is processing');
      await fetchData();
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Failed to submit request');
    }
    
    setProcessing(false);
  };

  const handleNewRequest = async (request: {
    name: string;
    business_type: string;
    country: string;
    language: string;
    budget?: number;
    features_required: string;
  }) => {
    setQuickActionLoading((prev) => ({ ...prev, newRequest: true }));

    try {
      const response = await autoPilotApi.newRequest(request);
      if (response?.success) {
        toast.success('Request Created');
        await refreshDashboard();
        return true;
      }

      const msg = typeof response?.error === 'string'
        ? response.error
        : response?.error?.message || 'Failed to create request';
      toast.error(msg);
      return false;
    } catch (error) {
      console.error('handleNewRequest error:', error);
      toast.error('Server Error');
      return false;
    } finally {
      setQuickActionLoading((prev) => ({ ...prev, newRequest: false }));
    }
  };

  // Generate daily software (2 per day)
  const generateDailySoftware = async () => {
    setProcessing(true);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase.functions.invoke('ai-auto-pilot', {
        body: {
          action: 'generate_daily_software',
          data: { date: today }
        }
      });

      if (error) throw error;

      toast.success(`🚀 Generated ${data.products?.length || 0} new software products`);
      await fetchData();
    } catch (error) {
      console.error('Generate error:', error);
      toast.error('Failed to generate software');
    }
    
    setProcessing(false);
  };

  const handleGenerateSoftware = async () => {
    setQuickActionLoading((prev) => ({ ...prev, generate: true }));

    try {
      const response = await autoPilotApi.generate();
      if (response?.success) {
        toast.success('Software Generation Started');
        await refreshQueue();
        return true;
      }

      const msg = typeof response?.error === 'string'
        ? response.error
        : response?.error?.message || 'Failed to start software generation';
      toast.error(msg);
      return false;
    } catch (error) {
      console.error('handleGenerateSoftware error:', error);
      toast.error('Server Error');
      return false;
    } finally {
      setQuickActionLoading((prev) => ({ ...prev, generate: false }));
    }
  };

  // Generate SEO for a product
  const generateSeo = async (productId: string, productName: string, productDescription: string) => {
    setProcessing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-auto-pilot', {
        body: {
          action: 'generate_seo_backlinks',
          data: { productId, productName, productDescription }
        }
      });

      if (error) throw error;

      toast.success('✅ SEO strategy generated');
      return data.seoData;
    } catch (error) {
      console.error('SEO error:', error);
      toast.error('Failed to generate SEO');
      return null;
    } finally {
      setProcessing(false);
    }
  };

  // Check billing alerts
  const checkBillingAlerts = async (userId?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-auto-pilot', {
        body: {
          action: 'check_billing_alerts',
          data: { userId }
        }
      });

      if (error) throw error;

      if (data.alerts && data.alerts.length > 0) {
        data.alerts.forEach((alert: { type: string; message: string }) => {
          if (alert.type === '1_day_urgent') {
            toast.error(alert.message);
          } else {
            toast.warning(alert.message);
          }
        });
      }

      return data.alerts;
    } catch (error) {
      console.error('Billing check error:', error);
      return [];
    }
  };

  const handleBillingCheck = async () => {
    setQuickActionLoading((prev) => ({ ...prev, billingCheck: true }));
    try {
      const response = await autoPilotApi.billingCheck();
      if (response?.success) {
        toast.success('Billing Checked');
        await refreshBilling();
        return response.data?.alerts || [];
      }
      const msg = typeof response?.error === 'string'
        ? response.error
        : response?.error?.message || 'Billing check failed';
      toast.error(msg);
      return [];
    } catch (error) {
      console.error('handleBillingCheck error:', error);
      toast.error('Server Error');
      return [];
    } finally {
      setQuickActionLoading((prev) => ({ ...prev, billingCheck: false }));
    }
  };

  // Add billing item
  const addBillingItem = async (item: {
    user_id?: string;
    service_name: string;
    amount: number;
    billing_cycle?: string;
  }) => {
    try {
      const { error } = await supabase.from('billing_items').insert({
        user_id: item.user_id ?? null,
        service_name: item.service_name,
        amount: item.amount,
        billing_cycle: item.billing_cycle || 'monthly',
        status: 'pending'
      });

      if (error) throw error;

      toast.success('📅 Billing item added');
      await fetchData();
    } catch (error) {
      console.error('Add billing error:', error);
      toast.error('Failed to add billing item');
    }
  };

  const handleAddBilling = async (item: {
    user_id?: string;
    service_name: string;
    amount: number;
    billing_cycle?: string;
  }) => {
    setQuickActionLoading((prev) => ({ ...prev, addBilling: true }));
    try {
      const response = await autoPilotApi.addBilling(item);
      if (response?.success) {
        toast.success('Billing Added');
        await refreshBilling();
        return true;
      }

      const msg = typeof response?.error === 'string'
        ? response.error
        : response?.error?.message || 'Failed to add billing';
      toast.error(msg);
      return false;
    } catch (error) {
      console.error('handleAddBilling error:', error);
      toast.error('Server Error');
      return false;
    } finally {
      setQuickActionLoading((prev) => ({ ...prev, addBilling: false }));
    }
  };

  // Get upcoming bills (next 7 days)
  const getUpcomingBills = () => {
    return billingItems.filter(bill => bill.status !== 'paid').slice(0, 7);
  };

  // Get pending client requests
  const getPendingRequests = () => {
    return clientRequests.filter(req => req.status === 'pending' || req.status === 'approved');
  };

  // Get today's software queue
  const getTodaysQueue = () => {
    const todayUtc = new Date().toISOString().slice(0, 10);
    return softwareQueue.filter(sw => {
      const createdUtc = new Date(sw.created_at).toISOString().slice(0, 10);
      return createdUtc === todayUtc;
    });
  };

  useEffect(() => {
    fetchData();
    // Check billing alerts on load
    checkBillingAlerts();
  }, []);

  return {
    clientRequests,
    softwareQueue,
    billingItems,
    backlinks,
    loading,
    processing,
    quickActionLoading,
    fetchData,
    refreshDashboard,
    refreshQueue,
    refreshBilling,
    submitClientRequest,
    handleNewRequest,
    generateDailySoftware,
    handleGenerateSoftware,
    generateSeo,
    checkBillingAlerts,
    handleBillingCheck,
    addBillingItem,
    handleAddBilling,
    getUpcomingBills,
    getPendingRequests,
    getTodaysQueue
  };
}
