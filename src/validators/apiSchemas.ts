import { z } from 'zod';

export const idSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);

export const productCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  price: z.number().min(0),
});

export const productUpdateSchema = productCreateSchema.partial();

export const productUploadSchema = z.object({
  product_id: idSchema.optional(),
  file_name: z.string().min(1),
});

export const keyCreateSchema = z.object({
  product_id: idSchema,
  license_key: z.string().min(8),
});

export const keyAssignSchema = z.object({
  key_id: idSchema,
  owner_email: z.string().email(),
});

export const keyStatusSchema = z.object({
  key_id: idSchema,
  status: z.enum(['active', 'suspended', 'revoked', 'expired']),
});

export const serverCreateSchema = z.object({
  name: z.string().min(1),
  runtime: z.string().min(1),
});

export const serverRestartSchema = z.object({
  server_id: idSchema,
});

export const resellerCreateSchema = z.object({
  name: z.string().min(1),
});

export const resellerAssignSchema = z.object({
  reseller_id: idSchema,
  product_id: idSchema,
});

export const billingCreditsSchema = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
});

export const aiChatSchema = z.object({
  message: z.string().min(1),
  model: z.string().optional(),
});
