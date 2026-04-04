-- Device binding compatibility layer for APK runtime license enforcement
-- Additive only: does not alter existing binding behavior in apk_downloads/device_info

CREATE TABLE IF NOT EXISTS public.device_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  key_id UUID REFERENCES public.license_keys(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'revoked', 'pending_reverify')),
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key_id)
);

CREATE INDEX IF NOT EXISTS idx_device_bindings_user_id ON public.device_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_device_bindings_device_id ON public.device_bindings(device_id);
CREATE INDEX IF NOT EXISTS idx_device_bindings_last_active ON public.device_bindings(last_active DESC);

ALTER TABLE public.device_bindings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='device_bindings' AND policyname='Users can view own device bindings'
  ) THEN
    CREATE POLICY "Users can view own device bindings"
      ON public.device_bindings
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='device_bindings' AND policyname='System can manage device bindings'
  ) THEN
    CREATE POLICY "System can manage device bindings"
      ON public.device_bindings
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_device_bindings_updated_at') THEN
      CREATE TRIGGER update_device_bindings_updated_at
      BEFORE UPDATE ON public.device_bindings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;
