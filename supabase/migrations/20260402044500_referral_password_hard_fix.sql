-- Referral + password hard fix (additive only, no deletions)

-- 1) Canonical referral mapping table
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status
  ON public.referrals (referrer_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_referrer_referred
  ON public.referrals (referrer_id, referred_user_id);

-- no self-referral at DB level
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referrals_no_self_referral'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_user_id);
  END IF;
END $$;

-- 2) Referral commissions table linked to orders
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_referral_status
  ON public.referral_commissions (referral_id, status);

-- 3) Enable RLS + policies
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referrals' AND policyname='Users can view own referrals'
  ) THEN
    CREATE POLICY "Users can view own referrals"
      ON public.referrals
      FOR SELECT
      USING (referrer_id = auth.uid() OR referred_user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referrals' AND policyname='System can manage referrals'
  ) THEN
    CREATE POLICY "System can manage referrals"
      ON public.referrals
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referrals' AND policyname='Super admin full access referrals'
  ) THEN
    CREATE POLICY "Super admin full access referrals"
      ON public.referrals
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referral_commissions' AND policyname='Users can view own referral commissions'
  ) THEN
    CREATE POLICY "Users can view own referral commissions"
      ON public.referral_commissions
      FOR SELECT
      USING (
        referral_id IN (
          SELECT r.id FROM public.referrals r
          WHERE r.referrer_id = auth.uid() OR r.referred_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referral_commissions' AND policyname='System can manage referral commissions'
  ) THEN
    CREATE POLICY "System can manage referral commissions"
      ON public.referral_commissions
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referral_commissions' AND policyname='Super admin full access referral commissions'
  ) THEN
    CREATE POLICY "Super admin full access referral commissions"
      ON public.referral_commissions
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS trg_referrals_updated_at ON public.referrals;
CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_referral_commissions_updated_at ON public.referral_commissions;
CREATE TRIGGER trg_referral_commissions_updated_at
  BEFORE UPDATE ON public.referral_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
