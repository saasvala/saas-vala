-- Additive global geo/language/currency/seo sync schema

CREATE TABLE IF NOT EXISTS public.languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.translated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL DEFAULT 'en',
  target_lang TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base TEXT NOT NULL DEFAULT 'USD',
  rates JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seo_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  seo_title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  slug TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'GLOBAL',
  language_code TEXT NOT NULL DEFAULT 'en',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, country_code, language_code)
);

CREATE INDEX IF NOT EXISTS idx_languages_status ON public.languages(status);
CREATE INDEX IF NOT EXISTS idx_translated_content_cache_key ON public.translated_content(cache_key);
CREATE INDEX IF NOT EXISTS idx_translated_content_target_lang ON public.translated_content(target_lang, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_currency_rates_updated_at ON public.currency_rates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_meta_product_id ON public.seo_meta(product_id);
CREATE INDEX IF NOT EXISTS idx_seo_meta_slug ON public.seo_meta(slug);
CREATE INDEX IF NOT EXISTS idx_seo_meta_country_lang ON public.seo_meta(country_code, language_code);

ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_meta ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regproc('public.has_role') IS NULL THEN
    RAISE NOTICE 'public.has_role function not found; skipping role-based RLS policies for geo locale seo sync tables';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'languages' AND policyname = 'Public can read active languages'
  ) THEN
    IF to_regproc('public.has_role') IS NOT NULL THEN
      CREATE POLICY "Public can read active languages"
        ON public.languages
        FOR SELECT
        USING (status = 'active' OR has_role(auth.uid(), 'super_admin'));
    ELSE
      CREATE POLICY "Public can read active languages"
        ON public.languages
        FOR SELECT
        USING (status = 'active');
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'languages' AND policyname = 'Super admin full access languages'
  ) THEN
    IF to_regproc('public.has_role') IS NOT NULL THEN
      CREATE POLICY "Super admin full access languages"
        ON public.languages
        FOR ALL
        USING (has_role(auth.uid(), 'super_admin'))
        WITH CHECK (has_role(auth.uid(), 'super_admin'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'translated_content' AND policyname = 'Authenticated can read translated content'
  ) THEN
    CREATE POLICY "Authenticated can read translated content"
      ON public.translated_content
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'translated_content' AND policyname = 'Super admin full access translated content'
  ) THEN
    IF to_regproc('public.has_role') IS NOT NULL THEN
      CREATE POLICY "Super admin full access translated content"
        ON public.translated_content
        FOR ALL
        USING (has_role(auth.uid(), 'super_admin'))
        WITH CHECK (has_role(auth.uid(), 'super_admin'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'currency_rates' AND policyname = 'Public can read currency rates'
  ) THEN
    CREATE POLICY "Public can read currency rates"
      ON public.currency_rates
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'currency_rates' AND policyname = 'Super admin full access currency rates'
  ) THEN
    IF to_regproc('public.has_role') IS NOT NULL THEN
      CREATE POLICY "Super admin full access currency rates"
        ON public.currency_rates
        FOR ALL
        USING (has_role(auth.uid(), 'super_admin'))
        WITH CHECK (has_role(auth.uid(), 'super_admin'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seo_meta' AND policyname = 'Public can read seo meta'
  ) THEN
    CREATE POLICY "Public can read seo meta"
      ON public.seo_meta
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seo_meta' AND policyname = 'Super admin full access seo meta'
  ) THEN
    IF to_regproc('public.has_role') IS NOT NULL THEN
      CREATE POLICY "Super admin full access seo meta"
        ON public.seo_meta
        FOR ALL
        USING (has_role(auth.uid(), 'super_admin'))
        WITH CHECK (has_role(auth.uid(), 'super_admin'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regproc('public.update_updated_at_column') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_languages_updated_at') THEN
      CREATE TRIGGER trg_languages_updated_at
      BEFORE UPDATE ON public.languages
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_translated_content_updated_at') THEN
      CREATE TRIGGER trg_translated_content_updated_at
      BEFORE UPDATE ON public.translated_content
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_currency_rates_updated_at') THEN
      CREATE TRIGGER trg_currency_rates_updated_at
      BEFORE UPDATE ON public.currency_rates
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_seo_meta_updated_at') THEN
      CREATE TRIGGER trg_seo_meta_updated_at
      BEFORE UPDATE ON public.seo_meta
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;

INSERT INTO public.languages (code, name, status)
VALUES
  ('en', 'English', 'active'),
  ('hi', 'Hindi', 'active'),
  ('ar', 'Arabic', 'active'),
  ('es', 'Spanish', 'active'),
  ('zh', 'Chinese', 'active')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO public.currency_rates (base, rates, source)
VALUES (
  'USD',
  '{"USD": 1, "INR": 83, "AED": 3.67, "EUR": 0.92, "GBP": 0.79, "SAR": 3.75}'::jsonb,
  'system-default'
)
ON CONFLICT DO NOTHING;
