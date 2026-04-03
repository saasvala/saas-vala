 import { useRef, useState } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from './useAuth';
 import { generateSecureLicenseKey } from '@/lib/licenseUtils';
 import { toast } from 'sonner';
 
interface Product {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  status: 'upcoming' | 'live' | 'bestseller';
  price: number;
  category?: string;
}
 
 interface PurchaseResult {
   success: boolean;
   orderId?: string;
   licenseKey?: string;
   error?: string;
 }
 
  export function useMarketplacePurchase() {
    const { user } = useAuth();
    const [processing, setProcessing] = useState(false);
    const inFlightRef = useRef<Set<string>>(new Set());
 
   const purchaseProduct = async (product: Product): Promise<PurchaseResult> => {
      if (!user) {
        return { success: false, error: 'Please sign in to make a purchase' };
      }

      const lockKey = `${user.id}:${product.id}`;
      if (inFlightRef.current.has(lockKey)) {
        return { success: false, error: 'Purchase already in progress. Please wait.' };
      }
      inFlightRef.current.add(lockKey);
  
      setProcessing(true);
      let orderId: string | null = null;
      let walletId: string | null = null;
      let walletBefore = 0;
      let walletDeducted = false;
  
      try {
        // Step 1: Check wallet balance
        const { data: wallet, error: walletError } = await supabase
          .from('wallets')
          .select('id, balance, version')
          .eq('user_id', user.id)
          .single();
 
       if (walletError || !wallet) {
         throw new Error('Could not fetch wallet balance');
       }
 
        if ((wallet.balance || 0) < product.price) {
          throw new Error(`Insufficient balance. You need ₹${product.price.toLocaleString()} but have ₹${(wallet.balance || 0).toLocaleString()}`);
        }
        walletId = wallet.id;
        walletBefore = Number(wallet.balance || 0);
        const walletVersion = Number(wallet.version || 0);
  
        // Step 2: Create marketplace order
        const { data: order, error: orderError } = await supabase
          .from('marketplace_orders')
          .insert({
            buyer_id: user.id,
            seller_id: user.id, // For demo products, seller is system
            amount: product.price,
            status: 'pending',
            payment_method: 'wallet',
            product_name: product.title,
          })
          .select()
          .single();
  
        if (orderError) {
          throw new Error('Failed to create order');
        }
        orderId = order.id;
  
        // Step 3: Deduct from wallet (create transaction)
        const newBalance = walletBefore - product.price;
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            wallet_id: wallet.id,
            type: 'debit',
            amount: product.price,
            description: `Purchase: ${product.title}`,
            status: 'completed',
            reference_type: 'marketplace_order',
            reference_id: order.id,
            balance_after: newBalance,
          });
  
        if (transactionError) {
          throw new Error('Failed to create wallet transaction');
        }
  
        // Step 4: Update wallet balance
        const { data: updatedWalletRow, error: updateError } = await supabase
          .from('wallets')
          .update({
            balance: newBalance,
            version: walletVersion + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', wallet.id)
          .eq('version', walletVersion)
          .select('id')
          .maybeSingle();

        if (updateError) {
          throw new Error('Failed to update wallet balance');
        }
        if (!updatedWalletRow) {
          throw new Error('Wallet mismatch detected. Please retry payment.');
        }
        walletDeducted = true;
 
       // Step 5: Generate secure crypto-random license key
        const licenseKey = generateSecureLicenseKey();

       // Step 5b: Save license key to license_keys table (guard against duplicate for same order)
        const { data: existingLicense } = await supabase
          .from('license_keys')
          .select('license_key')
          .filter('meta->>order_id', 'eq', order.id)
          .maybeSingle();

        const finalLicenseKey = existingLicense ? existingLicense.license_key : licenseKey;

        if (!existingLicense) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await supabase.from('license_keys').insert({
            product_id: /^[0-9a-f]{8}-/i.test(product.id) ? product.id : null,
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
            meta: { product_title: product.title, order_id: order.id, product_id: product.id },
          });
        }

        // Step 6: Complete order + log activity
        await supabase
          .from('marketplace_orders')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', order.id);

        await supabase.from('activity_logs').insert({
          entity_type: 'marketplace_order',
          entity_id: order.id,
         action: 'purchase_completed',
         performed_by: user.id,
         details: {
           product_title: product.title,
           amount: product.price,
           payment_method: 'wallet',
           license_key: finalLicenseKey,
         },
       });
 
       // Step 7: Create notification
       await supabase.from('notifications').insert({
         user_id: user.id,
         title: 'Purchase Successful',
         message: `You purchased ${product.title} for ₹${product.price.toLocaleString()}. Your License Key: ${finalLicenseKey}`,
         type: 'success',
         action_url: '/keys',
        });
  
        setProcessing(false);
        inFlightRef.current.delete(lockKey);
        return {
          success: true,
          orderId: order.id,
          licenseKey: finalLicenseKey,
        };
      } catch (error: any) {
        setProcessing(false);
        inFlightRef.current.delete(lockKey);
        const errorMessage = error.message || 'Purchase failed';

        if (walletId && walletDeducted) {
          const restoredBalance = walletBefore;
          await supabase
            .from('wallets')
            .update({ balance: restoredBalance, updated_at: new Date().toISOString() })
            .eq('id', walletId);
          await supabase.from('transactions').insert({
            wallet_id: walletId,
            type: 'refund',
            amount: product.price,
            description: `Rollback refund: ${product.title}`,
            status: 'completed',
            reference_type: 'marketplace_order_rollback',
            reference_id: orderId,
            balance_after: restoredBalance,
          });
        }

        if (orderId) {
          await supabase
            .from('marketplace_orders')
            .update({ status: 'failed', completed_at: null })
            .eq('id', orderId);
        }
        
        // Log error
        await supabase.from('error_logs').insert({
         user_id: user.id,
         error_type: 'purchase_error',
         error_message: errorMessage,
         context: { product_id: product.id, product_title: product.title },
       });
 
       return { success: false, error: errorMessage };
     }
   };
 
   return { purchaseProduct, processing };
 }
