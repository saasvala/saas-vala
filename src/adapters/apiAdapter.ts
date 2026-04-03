import type { ZodSchema } from 'zod';
import { observability } from '@/observability/logger';

export type ApiResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

export function normalizeApiResult<T>(raw: unknown): ApiResult<T> {
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if ('success' in record || 'data' in record || 'error' in record) {
      return {
        success: Boolean(record.success ?? !record.error),
        data: (record.data as T | undefined) ?? null,
        error: (record.error as string | undefined) ?? null,
      };
    }
  }
  return { success: true, data: raw as T, error: null };
}

export function withValidation<T extends object>(schema: ZodSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const errorMessage = parsed.error.errors.map((e) => e.message).join(', ');
    throw new Error(errorMessage || 'Validation failed');
  }
  return parsed.data;
}

export function createIdempotentAction<T extends object, R>(key: string, action: (payload: T) => Promise<R>) {
  const inFlight = new Map<string, Promise<R>>();
  return async (payload: T): Promise<R> => {
    const lockKey = `${key}:${JSON.stringify(payload)}`;
    if (inFlight.has(lockKey)) {
      return inFlight.get(lockKey)!;
    }
    const request = action(payload)
      .catch((error) => {
        observability.error('idempotent_action_error', { key, error });
        throw error;
      })
      .finally(() => {
        inFlight.delete(lockKey);
      });

    inFlight.set(lockKey, request);
    return request;
  };
}
