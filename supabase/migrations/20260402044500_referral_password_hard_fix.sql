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
      AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
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

-- 5) Signup-time referral mapping from auth metadata ref_code
CREATE OR REPLACE FUNCTION public.handle_new_user_referral_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  incoming_ref_code TEXT;
  matched_referral_code RECORD;
  matched_referrer_user_id UUID;
  inserted_referral_id UUID;
BEGIN
  incoming_ref_code := upper(trim(COALESCE(NEW.raw_user_meta_data->>'ref_code', '')));
  IF incoming_ref_code = '' THEN
    RETURN NEW;
  END IF;

  SELECT id, code, reseller_id, referred_user_id
  INTO matched_referral_code
  FROM public.referral_codes
  WHERE code = incoming_ref_code
  ORDER BY primary_code DESC, created_at ASC
  LIMIT 1;

  IF matched_referral_code.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id
  INTO matched_referrer_user_id
  FROM public.resellers
  WHERE id = matched_referral_code.reseller_id
  LIMIT 1;

  IF matched_referrer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF matched_referrer_user_id = NEW.id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, code, status)
  VALUES (matched_referrer_user_id, NEW.id, matched_referral_code.code, 'pending')
  ON CONFLICT (referred_user_id) DO NOTHING
  RETURNING id INTO inserted_referral_id;

  IF inserted_referral_id IS NOT NULL THEN
    UPDATE public.referral_codes
    SET
      referred_user_id = NEW.id,
      signup_at = now(),
      status = 'active',
      updated_at = now()
    WHERE id = matched_referral_code.id
      AND (referred_user_id IS NULL OR referred_user_id = NEW.id);

    INSERT INTO public.activity_logs (entity_type, entity_id, action, performed_by, details)
    VALUES (
      'referral',
      inserted_referral_id::text,
      'linked',
      NEW.id,
      jsonb_build_object(
        'ref_code', matched_referral_code.code,
        'referrer_id', matched_referrer_user_id,
        'source', 'signup_trigger'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_referral ON auth.users;
CREATE TRIGGER on_auth_user_created_link_referral
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_referral_link();
