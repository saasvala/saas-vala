-- ULTRA GOD MODE — additive SEO + lead automation core tables
-- Strict additive migration (no destructive change)

-- 1) SEO keyword intelligence
CREATE TABLE IF NOT EXISTS public.seo_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'global',
  difficulty INTEGER DEFAULT 0 CHECK (difficulty >= 0 AND difficulty <= 100),
  volume INTEGER DEFAULT 0 CHECK (volume >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_country ON public.seo_keywords(country);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_status ON public.seo_keywords(status);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_keyword ON public.seo_keywords(keyword);

ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seo_keywords' AND policyname = 'Super admin full access seo_keywords'
  ) THEN
    CREATE POLICY "Super admin full access seo_keywords"
    ON public.seo_keywords FOR ALL
    USING (has_role(auth.uid(), 'super_admin'))
    WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_seo_keywords_updated_at'
  ) THEN
    CREATE TRIGGER update_seo_keywords_updated_at
    BEFORE UPDATE ON public.seo_keywords
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

-- 2) SEO pages projection table
CREATE TABLE IF NOT EXISTS public.seo_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  meta_title TEXT,
  meta_desc TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_pages_status ON public.seo_pages(status);

ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seo_pages' AND policyname = 'Super admin full access seo_pages'
  ) THEN
    CREATE POLICY "Super admin full access seo_pages"
    ON public.seo_pages FOR ALL
    USING (has_role(auth.uid(), 'super_admin'))
    WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_seo_pages_updated_at'
  ) THEN
    CREATE TRIGGER update_seo_pages_updated_at
    BEFORE UPDATE ON public.seo_pages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

-- 3) reseller assignment rules
CREATE TABLE IF NOT EXISTS public.reseller_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  category TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, country, category)
);

CREATE INDEX IF NOT EXISTS idx_reseller_rules_country_category ON public.reseller_rules(country, category);
CREATE INDEX IF NOT EXISTS idx_reseller_rules_priority ON public.reseller_rules(priority);

ALTER TABLE public.reseller_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reseller_rules' AND policyname = 'Super admin full access reseller_rules'
  ) THEN
    CREATE POLICY "Super admin full access reseller_rules"
    ON public.reseller_rules FOR ALL
    USING (has_role(auth.uid(), 'super_admin'))
    WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_reseller_rules_updated_at'
  ) THEN
    CREATE TRIGGER update_reseller_rules_updated_at
    BEFORE UPDATE ON public.reseller_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

-- 4) lead billing transactions
CREATE TABLE IF NOT EXISTS public.lead_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_transactions_reseller ON public.lead_transactions(reseller_id);
CREATE INDEX IF NOT EXISTS idx_lead_transactions_status ON public.lead_transactions(status);

ALTER TABLE public.lead_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lead_transactions' AND policyname = 'Super admin full access lead_transactions'
  ) THEN
    CREATE POLICY "Super admin full access lead_transactions"
    ON public.lead_transactions FOR ALL
    USING (has_role(auth.uid(), 'super_admin'))
    WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_lead_transactions_updated_at'
  ) THEN
    CREATE TRIGGER update_lead_transactions_updated_at
    BEFORE UPDATE ON public.lead_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;
