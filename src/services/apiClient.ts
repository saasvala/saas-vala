import { supabase } from '@/integrations/supabase/client';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
const RETRY_DELAY_BASE_MS = 250;
const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/api/v1`;

export type ApiClientOptions = {
  timeoutMs?: number;
  retries?: number;
  interceptors?: {
    onRequest?: (input: RequestInfo | URL, init: RequestInit) => void;
    onResponse?: (response: Response) => void;
    onError?: (error: unknown) => void;
  };
};

export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  [key: string]: unknown;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (!session?.access_token) {
    throw new Error('AUTH_TOKEN_MISSING');
  }
  headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`API timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function normalizeResponse<T>(raw: ApiEnvelope<T> | T): ApiEnvelope<T> {
  if (
    raw &&
    typeof raw === 'object' &&
    ('success' in (raw as Record<string, unknown>) || 'data' in (raw as Record<string, unknown>) || 'error' in (raw as Record<string, unknown>))
  ) {
    return raw as ApiEnvelope<T>;
  }
  return { success: true, data: raw as T };
}

export function createApiClient(options: ApiClientOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  const request = async <T = unknown>(method: string, path: string, payload?: Record<string, unknown>): Promise<ApiEnvelope<T>> => {
    const headers = await getAuthHeaders();
    const url = new URL(`${API_BASE}/${path.replace(/^\//, '')}`);
    const init: RequestInit = { method, headers };

    if (method === 'GET' && payload) {
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      });
    } else if (payload && method !== 'GET') {
      init.body = JSON.stringify(payload);
    }

    options.interceptors?.onRequest?.(url, init);

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await withTimeout(fetch(url, init), timeoutMs);
        options.interceptors?.onResponse?.(response);

        const json = await response.json();
        const envelope = normalizeResponse<T>(json);

        if (!response.ok) {
          throw new Error(envelope.error || `API error: ${response.status}`);
        }
        return envelope;
      } catch (error) {
        lastError = error;
        options.interceptors?.onError?.(error);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_BASE_MS * (attempt + 1)));
          continue;
        }
      }
    }

    const finalError = lastError instanceof Error ? lastError : new Error('Unknown API client error');
    return { success: false, error: finalError.message };
  };

  return {
    get: <T = unknown>(path: string, params?: Record<string, unknown>) => request<T>('GET', path, params),
    post: <T = unknown>(path: string, body?: Record<string, unknown>) => request<T>('POST', path, body),
    put: <T = unknown>(path: string, body?: Record<string, unknown>) => request<T>('PUT', path, body),
    del: <T = unknown>(path: string, body?: Record<string, unknown>) => request<T>('DELETE', path, body),
  };
}

export const apiClient = createApiClient();
