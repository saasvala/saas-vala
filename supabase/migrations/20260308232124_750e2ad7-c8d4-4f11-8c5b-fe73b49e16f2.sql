-- Allow product_id to be nullable for generated/marketplace products
ALTER TABLE public.license_keys ALTER COLUMN product_id DROP NOT NULL;

-- Buyers can view their own license keys
CREATE POLICY "Buyers view own license_keys"
ON public.license_keys
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Buyers can insert their own license keys (after purchase)
CREATE POLICY "Buyers insert own license_keys"
ON public.license_keys
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());