-- Additive schema for AI API Manager (providers, managed API keys, security metadata)

CREATE TABLE IF NOT EXISTS public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  api_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  priority INTEGER NOT NULL DEFAULT 100,
  rate_limit INTEGER NOT NULL DEFAULT 60,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('admin', 'reseller', 'user')),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT,
  key_masked TEXT NOT NULL,
  limit_per_min INTEGER NOT NULL DEFAULT 60,
  total_limit INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended', 'expired')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_key_ip_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES public.ai_api_keys(id) ON DELETE CASCADE,
  ip_cidr TEXT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_status_priority ON public.ai_providers(status, priority);
CREATE INDEX IF NOT EXISTS idx_ai_api_keys_user ON public.ai_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_api_keys_owner ON public.ai_api_keys(owner_user_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_ai_api_keys_status_expires ON public.ai_api_keys(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_provider_events_provider_created ON public.ai_provider_events(provider_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_ip_rules_key ON public.api_key_ip_rules(api_key_id);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_ip_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_providers' AND policyname = 'Super admin manage ai_providers'
  ) THEN
    CREATE POLICY "Super admin manage ai_providers"
      ON public.ai_providers FOR ALL
      USING (has_role(auth.uid(), 'super_admin'))
      WITH CHECK (has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_api_keys' AND policyname = 'Users and owners manage ai_api_keys'
  ) THEN
    CREATE POLICY "Users and owners manage ai_api_keys"
      ON public.ai_api_keys FOR ALL
      USING (
        auth.uid() = user_id
        OR auth.uid() = owner_user_id
        OR has_role(auth.uid(), 'admin')
        OR has_role(auth.uid(), 'super_admin')
      )
      WITH CHECK (
        auth.uid() = user_id
        OR auth.uid() = owner_user_id
        OR has_role(auth.uid(), 'admin')
        OR has_role(auth.uid(), 'super_admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_provider_events' AND policyname = 'Owners read ai_provider_events'
  ) THEN
    CREATE POLICY "Owners read ai_provider_events"
      ON public.ai_provider_events FOR SELECT
      USING (
        auth.uid() = user_id
        OR has_role(auth.uid(), 'admin')
        OR has_role(auth.uid(), 'super_admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'api_key_ip_rules' AND policyname = 'Owners manage api_key_ip_rules'
  ) THEN
    CREATE POLICY "Owners manage api_key_ip_rules"
      ON public.api_key_ip_rules FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.ai_api_keys k
          WHERE k.id = api_key_id
            AND (
              k.user_id = auth.uid()
              OR k.owner_user_id = auth.uid()
              OR has_role(auth.uid(), 'admin')
              OR has_role(auth.uid(), 'super_admin')
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.ai_api_keys k
          WHERE k.id = api_key_id
            AND (
              k.user_id = auth.uid()
              OR k.owner_user_id = auth.uid()
              OR has_role(auth.uid(), 'admin')
              OR has_role(auth.uid(), 'super_admin')
            )
        )
      );
  END IF;
END $$;

