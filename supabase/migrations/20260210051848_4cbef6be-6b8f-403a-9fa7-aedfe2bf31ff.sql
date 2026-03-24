
-- Fix: Add INSERT policy for transactions so wallet owners can create transactions
CREATE POLICY "Users can insert own wallet transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Fix: Add UPDATE policy for wallets so users can update own wallet balance
CREATE POLICY "Users can update own wallet"
ON public.wallets
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- Fix: Add INSERT policy for wallets (for trigger / new users)
CREATE POLICY "System can insert wallets"
ON public.wallets
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

-- Fix: Ensure user_roles trigger for auto_create_reseller exists
-- (already created in previous migration, but verify)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_create_reseller'
  ) THEN
    CREATE TRIGGER trigger_auto_create_reseller
    AFTER INSERT ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_reseller_on_role();
  END IF;
END $$;
