import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { autoPilotApi, billingApi, paymentApi, subscriptionsApi } from '@/lib/api';

// INR threshold above which OTP verification is required for billing payments.
const HIGH_AMOUNT_THRESHOLD = 10000;
const BILLING_ALERT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const OTP_EXPIRY_MS = 15 * 60 * 1000;
const HOURLY_BILLING_CHECK_INTERVAL_MS = 60 * 60 * 1000;

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
  due_date?: string | null;
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
  const getSecureRandomInt = (min: number, max: number) => {
    const range = max - min + 1;
    if (range <= 0) {
      throw new Error('Invalid secure random range');
    }
    const maxUnbiasedValue = Math.floor(0x100000000 / range) * range;
    const buffer = new Uint32Array(1);
    do {
      globalThis.crypto.getRandomValues(buffer);
    } while (buffer[0] >= maxUnbiasedValue);
    return min + (buffer[0] % range);
  };

  const getClientEmail = (clientId?: string) => `${(clientId || 'client').slice(0, 8)}@example.com`;

  const hashOtp = async (otp: string) => {
    const data = new TextEncoder().encode(otp);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const generateInvoiceNumber = () => {
    const rand = getSecureRandomInt(0, 0xffffff).toString(36).padStart(6, '0').toUpperCase();
    return `INV-${new Date().getFullYear()}-${rand}`;
  };

  const parseToIsoString = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
  };

  const dueDateFromCycle = (cycle?: string) => {
    const now = new Date();
    const period = (cycle || 'monthly').toLowerCase();
    if (period === 'yearly') now.setFullYear(now.getFullYear() + 1);
    else if (period === 'quarterly') now.setMonth(now.getMonth() + 3);
    else now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  };

  const isHighAmount = (amount: number) => amount >= HIGH_AMOUNT_THRESHOLD;

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
  const fetchData = useCallback(async () => {
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
  }, []);

  const refreshData = useCallback(async () => {
    await fetchData();
  }, [fetchData]);


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
        await refreshData();
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
        await refreshData();
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

  const deriveBillingAlerts = useCallback((items: BillingTracker[]) => {
    const now = new Date();
    return items
      .filter((item) => item.status !== 'paid')
      .map((item) => {
        const due = item.due_date ? new Date(item.due_date) : null;
        if (!due || Number.isNaN(due.getTime())) return null;
        const delta = due.getTime() - now.getTime();
        if (delta < 0) {
          return {
            type: 'expired_payment',
            message: `${item.service_name} payment expired`,
            billingId: item.id,
            userId: item.user_id,
          };
        }
        if (delta <= BILLING_ALERT_WINDOW_MS) {
          return {
            type: 'upcoming_due',
            message: `${item.service_name} is due within 2 days`,
            billingId: item.id,
            userId: item.user_id,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, []);

  const notifyUsers = useCallback(async (userIds: string[], title: string, message: string, actionUrl = '/wallet') => {
    if (!userIds.length) return;
    await Promise.all(
      [...new Set(userIds)].map((uid) =>
        supabase.from('notifications').insert({
          user_id: uid,
          title,
          message,
          type: 'billing',
          action_url: actionUrl,
          read: false,
        })
      )
    );
  }, []);

  const handleBillingCheck = useCallback(async () => {
    setQuickActionLoading((prev) => ({ ...prev, billingCheck: true }));
    try {
      let alerts: any[] = [];

      try {
        const response = await billingApi.alerts();
        const apiAlerts = response?.data?.alerts || response?.alerts;
        if (Array.isArray(apiAlerts)) alerts = apiAlerts;
      } catch (error) {
        console.warn('billingApi.alerts unavailable, using fallback', error);
      }

      if (!alerts.length) {
        const fallbackFromAutoPilot = await autoPilotApi.billingCheck().catch(() => null);
        const fallbackAlerts = fallbackFromAutoPilot?.data?.alerts || fallbackFromAutoPilot?.alerts;
        if (Array.isArray(fallbackAlerts)) alerts = fallbackAlerts;
      }

      if (!alerts.length) {
        const { data: billingData } = await supabase
          .from('billing_items')
          .select('id,user_id,service_name,amount,billing_cycle,status,due_date')
          .order('created_at', { ascending: false })
          .limit(250);
        alerts = deriveBillingAlerts((billingData || []) as BillingTracker[]);
      }

      if (alerts.length) {
        const upcoming = alerts.filter((a) => a?.type === 'upcoming_due').length;
        const expired = alerts.filter((a) => a?.type === 'expired_payment').length;
        if (expired > 0) {
          toast.error(`Billing Alerts: ${expired} expired, ${upcoming} upcoming`);
        } else {
          toast.warning(`Billing Alerts: ${alerts.length} item(s) need attention`);
        }

        const userIds = alerts.map((a: any) => a.userId).filter(Boolean) as string[];
        await notifyUsers(userIds, 'Billing Alert', 'A billing alert needs your attention.', '/wallet');
      } else {
        toast.success('Billing Checked: no alerts');
      }

      await refreshData();
      return alerts;
    } catch (error) {
      console.error('handleBillingCheck error:', error);
      toast.error('Server Error');
      return [];
    } finally {
      setQuickActionLoading((prev) => ({ ...prev, billingCheck: false }));
    }
  }, [refreshData]);

  // Add billing item
  const addBillingItem = async (item: {
    user_id?: string;
    service_name: string;
    amount: number;
    billing_cycle?: string;
    due_date?: string;
    notes?: string;
    type?: 'one-time' | 'subscription';
  }) => {
    try {
      const dueDate = item.due_date ? parseToIsoString(item.due_date) : dueDateFromCycle(item.billing_cycle);

      const { data: createdBilling, error } = await supabase
        .from('billing_items')
        .insert({
          user_id: item.user_id ?? null,
          service_name: item.service_name,
          amount: item.amount,
          billing_cycle: item.billing_cycle || 'monthly',
          status: 'pending',
          due_date: dueDate,
        })
        .select('id,user_id,service_name,amount,billing_cycle,status,due_date')
        .single();

      if (error) throw error;

      const invoiceNumber = generateInvoiceNumber();
      const { data: createdInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          user_id: item.user_id || '',
          customer_name: item.service_name,
          customer_email: getClientEmail(item.user_id),
          items: [
            {
              title: item.service_name,
              amount: item.amount,
              type: item.type || (item.billing_cycle === 'one-time' ? 'one-time' : 'subscription'),
              notes: item.notes || null,
            },
          ],
          subtotal: item.amount,
          tax_percent: 0,
          tax_amount: 0,
          discount_percent: 0,
          discount_amount: 0,
          total_amount: item.amount,
          currency: 'INR',
          status: 'sent',
          due_date: dueDate,
          notes: item.notes || null,
          terms: 'Auto-generated by billing automation',
          otp_verified: !isHighAmount(item.amount),
        })
        .select('id,user_id,total_amount')
        .single();

      if (invoiceError) throw invoiceError;

      const shouldRequireOtp = isHighAmount(item.amount);
      if (shouldRequireOtp) {
        const otpRaw = String(getSecureRandomInt(100000, 999999));
        const otpHash = await hashOtp(otpRaw);
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();
        const { error: otpInsertError } = await supabase.from('invoice_otp_codes').insert({
          invoice_id: createdInvoice.id,
          otp_code: otpHash,
          email: getClientEmail(item.user_id),
          expires_at: expiresAt,
          verified: false,
        });
        if (otpInsertError) {
          console.warn('invoice OTP insert failed', otpInsertError);
        } else {
          await billingApi.otpSend({
            invoice_id: createdInvoice.id,
            client_id: item.user_id || '',
            amount: item.amount,
            email: getClientEmail(item.user_id),
            otp: otpRaw,
          }).catch((sendError) => {
            console.warn('billing otp send api failed', sendError);
          });
        }
      }

      await billingApi.send({
        billing_id: createdBilling.id,
        invoice_id: createdInvoice.id,
        client_id: item.user_id || '',
      }).catch((sendError) => {
        console.warn('billing send api failed', sendError);
      });

      if (item.user_id) {
        await notifyUsers(
          [item.user_id],
          'New Invoice Generated',
          `Invoice ${invoiceNumber} is ready for payment.`,
          '/wallet'
        );
      }

      toast.success('📅 Billing item added');
      await fetchData();
      return { billing: createdBilling, invoice: createdInvoice };
    } catch (error) {
      console.error('Add billing error:', error);
      toast.error('Failed to add billing item');
      throw error;
    }
  };

  const handleAddBilling = async (item: {
    user_id?: string;
    service_name: string;
    amount: number;
    billing_cycle?: string;
    due_date?: string;
    notes?: string;
    type?: 'one-time' | 'subscription';
  }) => {
    setQuickActionLoading((prev) => ({ ...prev, addBilling: true }));
    try {
      const apiPayload = {
        client_id: item.user_id || '',
        title: item.service_name,
        amount: item.amount,
        type: item.type || (item.billing_cycle === 'one-time' ? 'one-time' : 'subscription'),
        due_date: item.due_date || dueDateFromCycle(item.billing_cycle),
        notes: item.notes,
      };

      let apiSucceeded = false;
      try {
        const response = await billingApi.create(apiPayload);
        apiSucceeded = !!response?.success;
      } catch (primaryApiError) {
        console.warn('billing create api unavailable, falling back', primaryApiError);
      }

      if (!apiSucceeded) {
        const fallback = await autoPilotApi.addBilling(item).catch(() => null);
        apiSucceeded = !!fallback?.success;
      }

      if (apiSucceeded) {
        toast.success('Billing Added');
        await refreshData();
        return true;
      }

      const created = await addBillingItem(item);
      if (created) {
        toast.success('Billing Added');
        await refreshData();
        return true;
      }
      toast.error('Failed to add billing');
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

  const handleInvoicePayment = useCallback(async (payload: {
    invoice_id: string;
    billing_id?: string;
    client_id: string;
    amount: number;
    method?: string;
    otp?: string;
  }) => {
    try {
      const requestedAmount = Number(payload.amount);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        toast.error('Invalid payment amount');
        return false;
      }

      const { data: invoice } = await supabase
        .from('invoices')
        .select('id,status,otp_verified,total_amount,user_id')
        .eq('id', payload.invoice_id)
        .maybeSingle();

      if (!invoice) {
        toast.error('Invoice not found');
        return false;
      }

      const { data: existingOtp } = await supabase
        .from('invoice_otp_codes')
        .select('id')
        .eq('invoice_id', payload.invoice_id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const requiresOtp =
        isHighAmount(Number(invoice.total_amount || requestedAmount)) ||
        invoice.otp_verified === false ||
        !!existingOtp;
      if (requiresOtp && payload.otp) {
        await billingApi.otpVerify({ invoice_id: payload.invoice_id, otp: payload.otp }).catch(() => undefined);
        const otpHash = await hashOtp(payload.otp);
        const { data: otpRow } = await supabase
          .from('invoice_otp_codes')
          .select('id,verified')
          .eq('invoice_id', payload.invoice_id)
          .eq('otp_code', otpHash)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!otpRow) {
          toast.error('OTP verification required');
          return false;
        }
        if (!otpRow.verified) {
          await supabase.from('invoice_otp_codes').update({ verified: true }).eq('id', otpRow.id);
        }
        await supabase
          .from('invoices')
          .update({ otp_verified: true, otp_verified_at: new Date().toISOString() })
          .eq('id', payload.invoice_id);
      } else if (requiresOtp && !payload.otp) {
        toast.error('OTP is required for this payment');
        return false;
      }

      const paymentResponse = await paymentApi.create(payload);
      if (paymentResponse?.success === false || paymentResponse?.error) {
        const msg = typeof paymentResponse?.error === 'string'
          ? paymentResponse.error
          : paymentResponse?.error?.message || 'Payment gateway rejected the transaction';
        toast.error(msg);
        return false;
      }

      const { data: wallet } = await supabase
        .from('wallets')
        .select('id,balance')
        .eq('user_id', payload.client_id)
        .maybeSingle();

      if (wallet?.id) {
        const nextBalance = Number(wallet.balance || 0) - requestedAmount;
        if (nextBalance < 0) {
          toast.error('Insufficient wallet balance');
          return false;
        }
        await supabase.from('wallets').update({ balance: nextBalance }).eq('id', wallet.id);
        await supabase.from('transactions').insert({
          wallet_id: wallet.id,
          type: 'debit',
          amount: requestedAmount,
          status: 'completed',
          description: `Invoice payment ${payload.invoice_id}`,
          reference_id: payload.invoice_id,
          reference_type: 'invoice',
          balance_after: nextBalance,
          meta: {
            billing_id: payload.billing_id || null,
            payment_method: payload.method || 'manual',
          },
        });
      }

      await supabase.from('invoices').update({ status: 'paid' }).eq('id', payload.invoice_id);
      if (payload.billing_id) {
        await supabase.from('billing_items').update({ status: 'paid' }).eq('id', payload.billing_id);
      }

      await notifyUsers(
        [payload.client_id],
        'Payment Received',
        `Payment for invoice ${payload.invoice_id} was successful.`,
        '/wallet'
      );

      await refreshData();
      return true;
    } catch (error) {
      console.error('handleInvoicePayment error:', error);
      toast.error('Payment failed');
      return false;
    }
  }, [notifyUsers, refreshData]);

  const runSubscriptionRenewals = useCallback(async () => {
    try {
      await subscriptionsApi.cronRun().catch(() => undefined);
      const nowIso = new Date().toISOString();
      const { data: dueSubscriptions } = await supabase
        .from('subscriptions')
        .select('id,user_id,plan_name,amount,billing_cycle,current_period_end,status')
        .neq('status', 'cancelled')
        .lte('current_period_end', nowIso)
        .limit(100);

      if (!dueSubscriptions?.length) return;

      for (const sub of dueSubscriptions) {
        const nextDue = dueDateFromCycle(sub.billing_cycle || 'monthly');
        await handleAddBilling({
          user_id: sub.user_id,
          service_name: sub.plan_name,
          amount: Number(sub.amount || 0),
          billing_cycle: sub.billing_cycle || 'monthly',
          type: 'subscription',
          due_date: nextDue,
          notes: `Auto-renew for subscription ${sub.id}`,
        });

        await notifyUsers(
          [sub.user_id],
          'Subscription Renewal Generated',
          `New renewal invoice generated for ${sub.plan_name}.`,
          '/wallet'
        );
      }
    } catch (error) {
      console.error('runSubscriptionRenewals error:', error);
    }
  }, [handleAddBilling, notifyUsers]);

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

  useEffect(() => {
    let isRunning = false;
    const run = async () => {
      if (isRunning) return;
      isRunning = true;
      await handleBillingCheck();
      await runSubscriptionRenewals();
      isRunning = false;
    };

    run();
    const timer = window.setInterval(run, HOURLY_BILLING_CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      isRunning = false;
    };
  }, [handleBillingCheck, runSubscriptionRenewals]);

  return {
    clientRequests,
    softwareQueue,
    billingItems,
    backlinks,
    loading,
    processing,
    quickActionLoading,
    fetchData,
    submitClientRequest,
    handleNewRequest,
    generateDailySoftware,
    handleGenerateSoftware,
    generateSeo,
    checkBillingAlerts,
    handleBillingCheck,
    addBillingItem,
    handleAddBilling,
    handleInvoicePayment,
    runSubscriptionRenewals,
    getUpcomingBills,
    getPendingRequests,
    getTodaysQueue
  };
}
