-- Add vala_name column for branded naming
ALTER TABLE public.source_code_catalog 
ADD COLUMN IF NOT EXISTS vala_name TEXT;

-- Add index for vala_name search
CREATE INDEX IF NOT EXISTS idx_catalog_vala_name ON public.source_code_catalog(vala_name);