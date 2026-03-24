-- Create storage bucket for source code uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('source-code', 'source-code', false, 524288000)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for source code bucket
CREATE POLICY "Users can upload their own source code"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'source-code' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own source code"
ON storage.objects
FOR SELECT
USING (bucket_id = 'source-code' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own source code"
ON storage.objects
FOR DELETE
USING (bucket_id = 'source-code' AND auth.uid()::text = (storage.foldername(name))[1]);