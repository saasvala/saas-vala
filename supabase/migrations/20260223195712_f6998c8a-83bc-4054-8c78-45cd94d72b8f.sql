
-- Fix remaining: skip views, only real tables

-- 9. ONDEMAND_REQUESTS
DROP POLICY IF EXISTS "Owner can view ondemand requests" ON public.ondemand_requests;
CREATE POLICY "Owner can view ondemand requests v2" ON public.ondemand_requests FOR SELECT USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin')
);

-- 10. APK_DOWNLOADS  
DROP POLICY IF EXISTS "Owner can view apk downloads" ON public.apk_downloads;
CREATE POLICY "Owner can view apk downloads v2" ON public.apk_downloads FOR SELECT USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin')
);

-- 11. PAYMENT_ATTEMPT_LOG
DROP POLICY IF EXISTS "Owner can view payment attempts" ON public.payment_attempt_log;
CREATE POLICY "Owner can view payment attempts v2" ON public.payment_attempt_log FOR SELECT USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin')
);

-- 13. RESELLERS self-view
DROP POLICY IF EXISTS "Reseller self view" ON public.resellers;
CREATE POLICY "Reseller self view v2" ON public.resellers FOR SELECT USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin')
);
