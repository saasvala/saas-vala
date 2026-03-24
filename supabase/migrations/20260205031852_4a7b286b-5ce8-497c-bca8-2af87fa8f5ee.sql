-- Fix invoice_otp_codes RLS policies to prevent public data exposure

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Anyone can verify OTP for signing" ON public.invoice_otp_codes;
DROP POLICY IF EXISTS "Anyone can update OTP codes for verification" ON public.invoice_otp_codes;

-- Create secure policies that restrict access to invoice owners only
-- Policy for SELECT: Only invoice owner can view OTP codes
CREATE POLICY "Invoice owner can view OTP codes"
ON public.invoice_otp_codes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_otp_codes.invoice_id
    AND invoices.user_id = auth.uid()
  )
);

-- Policy for INSERT: Only invoice owner can create OTP codes
CREATE POLICY "Invoice owner can create OTP codes"
ON public.invoice_otp_codes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_otp_codes.invoice_id
    AND invoices.user_id = auth.uid()
  )
);

-- Policy for UPDATE: Only invoice owner can update OTP codes
CREATE POLICY "Invoice owner can update OTP codes"
ON public.invoice_otp_codes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_otp_codes.invoice_id
    AND invoices.user_id = auth.uid()
  )
);

-- Policy for DELETE: Only invoice owner can delete OTP codes
CREATE POLICY "Invoice owner can delete OTP codes"
ON public.invoice_otp_codes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.invoices
    WHERE invoices.id = invoice_otp_codes.invoice_id
    AND invoices.user_id = auth.uid()
  )
);