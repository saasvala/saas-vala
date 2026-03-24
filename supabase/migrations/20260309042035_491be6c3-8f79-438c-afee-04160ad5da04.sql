
CREATE TABLE public.product_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE public.product_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all ratings" ON public.product_ratings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own ratings" ON public.product_ratings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ratings" ON public.product_ratings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
