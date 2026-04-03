import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useFraudDetection } from './useFraudDetection';
import { generateSecureLicenseKey } from '@/lib/licenseUtils';
import { toast } from 'sonner';
import { marketplaceApi } from '@/lib/api';

interface ApkProduct {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  status: 'upcoming' | 'live' | 'bestseller' | 'draft';
  price: number;
}

interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  licenseKey?: string;
  downloadUrl?: string;
  error?: string;
}

export function useApkPurchase() {
  const { user } = useAuth();
  const { checkUserStatus, reportViolation } = useFraudDetection();
  const [processing, setProcessing] = useState(false);
  const inFlightRef = useRef<Set<string>>(new Set());

  // Helper: check if an ID looks like a valid UUID
  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const purchaseApk = async (product: ApkProduct): Promise<PurchaseResult> => {
    if (!user) {
      return { success: false, error: 'Please sign in to download APK' };
    }

    const isGeneratedProduct = !isUuid(product.id);

    const lockKey = `${user.id}:${product.id}`;
    if (inFlightRef.current.has(lockKey)) {
      return { success: false, error: 'Purchase already in progress. Please wait.' };
    }
    inFlightRef.current.add(lockKey);
    setProcessing(true);

    let paymentId = '';
    let transactionId = '';
    try {
      // Step 1: Check if user is blocked
      const fraudStatus = await checkUserStatus(user.id, user.email || '');
      
      if (fraudStatus.isBlocked) {
        setProcessing(false);
        toast.error(fraudStatus.message);
        return { success: false, error: fraudStatus.message };
      }

      // Step 2: Initialize payment via gateway create API
      const initRes = await marketplaceApi.paymentCreate({
        product_id: product.id,
        amount: product.price,
        currency: 'INR',
        payment_method: 'wallet',
        gateway: 'wallet',
        lock_wallet: true,
        meta: {
          product_id: product.id,
          product_title: product.title,
          flow: 'apk_purchase',
        },
      });
      paymentId = String((initRes as any)?.data?.payment?.id || '');
      if (!paymentId) {
        throw new Error('Failed to initialize payment');
      }
      try {
        sessionStorage.setItem('sv_pending_payment', JSON.stringify({ paymentId, productId: product.id, amount: product.price, ts: Date.now() }));
      } catch {}

      // Step 3: Verify payment and activate services
      const verifyRes = await marketplaceApi.paymentVerify({
        payment_id: paymentId,
        amount: product.price,
      });
      if (!(verifyRes as any)?.success) {
        throw new Error((verifyRes as any)?.error || 'Payment verification failed');
      }

      transactionId = String((verifyRes as any)?.result?.order_id || '');
      if (!transactionId) {
        throw new Error('Payment verification did not return an order id');
      }
      try {
        sessionStorage.removeItem('sv_pending_payment');
      } catch {}

      // Step 4: Generate secure crypto-random license key
      const licenseKey = generateSecureLicenseKey();


      if (!isGeneratedProduct) {
        await supabase.from('apk_downloads').insert({
          user_id: user.id,
          product_id: product.id,
          transaction_id: transactionId,
          license_key: licenseKey,
          is_verified: true,
          verification_attempts: 0,
          is_blocked: false
        });
      }

      // Step 5b: Save license key to license_keys table (so user can see it on /keys page)
      // Guard against duplicate license for the same transaction
      const { data: existingLicense } = await supabase
        .from('license_keys')
        .select('license_key')
        .filter('meta->>transaction_id', 'eq', transactionId)
        .maybeSingle();

      const finalLicenseKey = existingLicense ? existingLicense.license_key : licenseKey;

      if (!existingLicense) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30-day license
        await supabase.from('license_keys').insert({
          product_id: isGeneratedProduct ? null : product.id,
          license_key: licenseKey,
          key_type: 'monthly' as const,
          status: 'active' as const,
          owner_email: user.email || null,
          owner_name: user.user_metadata?.full_name || null,
          max_devices: 1,
          activated_devices: 0,
          activated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          created_by: user.id,
          notes: `Purchased: ${product.title}`,
          meta: { product_title: product.title, transaction_id: transactionId, product_id: product.id }
        });
      }

      // Step 6: Log activity
      await supabase.from('activity_logs').insert({
        entity_type: 'apk_download',
        entity_id: transactionId,
        action: 'apk_purchased',
        performed_by: user.id,
        details: {
          product_id: product.id,
          product_title: product.title,
          license_key: finalLicenseKey,
          amount: product.price,
          transaction_id: transactionId,
          is_generated: isGeneratedProduct
        }
      });

      // Step 7: Create notification
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: '📱 APK Ready for Download',
        message: `${product.title} purchased. Your License Key: ${finalLicenseKey}`,
        type: 'success',
        action_url: '/keys'
      });

      setProcessing(false);
      inFlightRef.current.delete(lockKey);
      
      return {
        success: true,
        transactionId,
        licenseKey: finalLicenseKey,
        downloadUrl: `/download/apk/${product.id}?key=${finalLicenseKey}`
      };
    } catch (error: any) {
      setProcessing(false);
      inFlightRef.current.delete(lockKey);
      const errorMessage = error.message || 'Purchase failed';
      
      // Log error
      await supabase.from('error_logs').insert({
        user_id: user?.id,
        error_type: 'apk_purchase_error',
        error_message: errorMessage,
        context: { product_id: product.id, product_title: product.title }
      });

      return { success: false, error: errorMessage };
    }
  };

  // Verify APK usage - call this when app starts
  const verifyApkUsage = async (
    licenseKey: string,
    deviceInfo?: Record<string, unknown>
  ): Promise<{ valid: boolean; message: string }> => {
    if (!user) {
      return { valid: false, message: 'User not authenticated' };
    }

    try {
      const { data: download, error } = await supabase
        .from('apk_downloads')
        .select('*')
        .eq('license_key', licenseKey)
        .single();

      if (error || !download) {
        // Potential fraud - key doesn't exist
        const fraudResult = await reportViolation(
          user.id,
          user.email || '',
          'Invalid license key used',
          licenseKey
        );
        
        return { 
          valid: false, 
          message: fraudResult.blocked 
            ? '⛔ Account blocked due to fraud' 
            : `⚠️ Invalid key. Fine: $${fraudResult.fine}`
        };
      }

      // Check if this user owns this license
      if (download.user_id !== user.id) {
        // Fraud - using someone else's license
        const fraudResult = await reportViolation(
          user.id,
          user.email || '',
          'Attempted to use license belonging to another user',
          licenseKey
        );
        
        return { 
          valid: false, 
          message: fraudResult.blocked 
            ? '⛔ Account blocked due to fraud' 
            : `⚠️ Unauthorized license use. Fine: $${fraudResult.fine}`
        };
      }

      if (download.is_blocked) {
        return { 
          valid: false, 
          message: '⛔ License blocked: ' + (download.blocked_reason || 'Fraud detected')
        };
      }

      // Update verification attempts
      await supabase
        .from('apk_downloads')
        .update({
          verification_attempts: (download.verification_attempts || 0) + 1,
          device_info: deviceInfo ? JSON.parse(JSON.stringify(deviceInfo)) : download.device_info
        })
        .eq('id', download.id);

      return { valid: true, message: 'License verified ✅' };
    } catch (_error) {
      return { valid: false, message: 'Verification failed' };
    }
  };

  return { 
    purchaseApk,
    verifyApkUsage, 
    processing
  };
}
