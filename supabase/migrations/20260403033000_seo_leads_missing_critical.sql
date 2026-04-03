-- Additive schema for SEO/Leads missing critical capabilities
-- 1) Lead fraud + duplicate protection
-- 2) Real call/WhatsApp tracking
-- 3) Landing page auto builder

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_fingerprint_hash ON public.leads (fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_leads_is_blocked ON public.leads (is_blocked, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_fingerprint (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT,
  device_id TEXT,
  hash TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 0),
  is_spam BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_fingerprint_hash ON public.lead_fingerprint (hash);
CREATE INDEX IF NOT EXISTS idx_lead_fingerprint_device ON public.lead_fingerprint (device_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_fingerprint_ip ON public.lead_fingerprint (ip, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_call_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone TEXT,
  dynamic_number TEXT,
  call_status TEXT NOT NULL DEFAULT 'initiated' CHECK (call_status IN ('initiated', 'connected', 'missed', 'completed', 'failed')),
  call_duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (call_duration_seconds >= 0),
  recording_url TEXT,
  source TEXT NOT NULL DEFAULT 'phone',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_call_tracks_lead_id ON public.lead_call_tracks (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_call_tracks_reseller_id ON public.lead_call_tracks (reseller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lead_whatsapp_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone TEXT,
  click_source TEXT NOT NULL DEFAULT 'button',
  message_template TEXT,
  status TEXT NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked', 'opened', 'sent', 'failed')),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_tracks_lead_id ON public.lead_whatsapp_tracks (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_whatsapp_tracks_reseller_id ON public.lead_whatsapp_tracks (reseller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.seo_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  keyword TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'global',
  slug TEXT NOT NULL,
  url_path TEXT NOT NULL,
  title TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_fast_page BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country, slug)
);

CREATE INDEX IF NOT EXISTS idx_seo_landing_pages_keyword ON public.seo_landing_pages (keyword, country);
CREATE INDEX IF NOT EXISTS idx_seo_landing_pages_reseller_id ON public.seo_landing_pages (reseller_id, created_at DESC);

ALTER TABLE public.lead_fingerprint ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_call_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_whatsapp_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_landing_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_fingerprint'
      AND policyname = 'Super admin full access lead_fingerprint'
  ) THEN
    CREATE POLICY "Super admin full access lead_fingerprint"
      ON public.lead_fingerprint
      FOR ALL
      USING (has_role(auth.uid(), 'super_admin'))
      WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_call_tracks'
      AND policyname = 'Super admin full access lead_call_tracks'
  ) THEN
    CREATE POLICY "Super admin full access lead_call_tracks"
      ON public.lead_call_tracks
      FOR ALL
      USING (has_role(auth.uid(), 'super_admin'))
      WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_whatsapp_tracks'
      AND policyname = 'Super admin full access lead_whatsapp_tracks'
  ) THEN
    CREATE POLICY "Super admin full access lead_whatsapp_tracks"
      ON public.lead_whatsapp_tracks
      FOR ALL
      USING (has_role(auth.uid(), 'super_admin'))
      WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'seo_landing_pages'
      AND policyname = 'Super admin full access seo_landing_pages'
  ) THEN
    CREATE POLICY "Super admin full access seo_landing_pages"
      ON public.seo_landing_pages
      FOR ALL
      USING (has_role(auth.uid(), 'super_admin'))
      WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_set_updated_at_lead_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_lead_fingerprint ON public.lead_fingerprint;
CREATE TRIGGER set_updated_at_lead_fingerprint
BEFORE UPDATE ON public.lead_fingerprint
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_updated_at_lead_fingerprint();

CREATE OR REPLACE FUNCTION public.trg_set_updated_at_seo_landing_pages()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_seo_landing_pages ON public.seo_landing_pages;
CREATE TRIGGER set_updated_at_seo_landing_pages
BEFORE UPDATE ON public.seo_landing_pages
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_updated_at_seo_landing_pages();
