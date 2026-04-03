-- Additive table for APK git-scan pipeline step
CREATE TABLE IF NOT EXISTS public.git_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  repo_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scanned', 'fixed', 'failed')),
  issues_found TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  detected_stack JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_git_scans_repo_url ON public.git_scans(repo_url);
CREATE INDEX IF NOT EXISTS idx_git_scans_status ON public.git_scans(status);
CREATE INDEX IF NOT EXISTS idx_git_scans_created_at ON public.git_scans(created_at DESC);

ALTER TABLE public.git_scans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'git_scans'
      AND policyname = 'Users can view own git scans'
  ) THEN
    CREATE POLICY "Users can view own git scans"
      ON public.git_scans
      FOR SELECT
      USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'git_scans'
      AND policyname = 'Users can insert own git scans'
  ) THEN
    CREATE POLICY "Users can insert own git scans"
      ON public.git_scans
      FOR INSERT
      WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'git_scans'
      AND policyname = 'Super admin full access git scans'
  ) THEN
    CREATE POLICY "Super admin full access git scans"
      ON public.git_scans
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_git_scans_updated_at ON public.git_scans;
CREATE TRIGGER trg_git_scans_updated_at
  BEFORE UPDATE ON public.git_scans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
