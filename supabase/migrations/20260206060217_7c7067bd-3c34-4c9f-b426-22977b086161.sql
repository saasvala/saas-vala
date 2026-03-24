-- Client Requests table for AI to auto-handle
CREATE TABLE public.client_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID,
  client_name TEXT NOT NULL,
  client_email TEXT,
  request_type TEXT NOT NULL, -- 'payment_gateway', 'ai_api', 'server', 'custom', etc.
  request_details TEXT NOT NULL,
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  ai_response TEXT,
  ai_action_taken TEXT,
  estimated_cost NUMERIC(10,2),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto Software Builder queue
CREATE TABLE public.auto_software_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  software_name TEXT NOT NULL,
  software_type TEXT NOT NULL, -- 'billing', 'crm', 'inventory', etc.
  target_industry TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]',
  tech_stack JSONB DEFAULT '["React", "Node.js", "PostgreSQL", "AWS", "SSL"]',
  status TEXT DEFAULT 'queued', -- 'queued', 'building', 'testing', 'completed', 'published'
  build_logs TEXT,
  apk_url TEXT,
  marketplace_id TEXT,
  ai_generated_description TEXT,
  ai_generated_meta JSONB,
  scheduled_date DATE DEFAULT CURRENT_DATE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Billing & Subscription tracker for alerts
CREATE TABLE public.billing_tracker (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_type TEXT NOT NULL, -- 'ai_api', 'server', 'domain', 'subscription', 'license'
  service_name TEXT NOT NULL,
  provider TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  billing_cycle TEXT DEFAULT 'monthly', -- 'monthly', 'yearly', 'one-time'
  next_due_date DATE NOT NULL,
  auto_pay BOOLEAN DEFAULT false,
  alert_sent_4_days BOOLEAN DEFAULT false,
  alert_sent_1_day BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- 'active', 'paid', 'overdue', 'cancelled'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SEO Backlinks tracker
CREATE TABLE public.seo_backlinks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT,
  target_url TEXT NOT NULL,
  backlink_url TEXT NOT NULL,
  anchor_text TEXT,
  domain_authority INTEGER,
  status TEXT DEFAULT 'pending', -- 'pending', 'active', 'broken', 'removed'
  backlink_type TEXT DEFAULT 'dofollow', -- 'dofollow', 'nofollow', 'sponsored'
  source_type TEXT, -- 'directory', 'guest_post', 'social', 'forum', 'press_release'
  ai_generated BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_software_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_tracker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_backlinks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin access)
CREATE POLICY "Authenticated users can manage client requests" ON public.client_requests FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage software queue" ON public.auto_software_queue FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage billing" ON public.billing_tracker FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage backlinks" ON public.seo_backlinks FOR ALL USING (auth.uid() IS NOT NULL);

-- Indexes for performance
CREATE INDEX idx_client_requests_status ON public.client_requests(status);
CREATE INDEX idx_software_queue_date ON public.auto_software_queue(scheduled_date);
CREATE INDEX idx_billing_due_date ON public.billing_tracker(next_due_date);
CREATE INDEX idx_backlinks_product ON public.seo_backlinks(product_id);