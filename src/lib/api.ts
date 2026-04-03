import { supabase } from '@/integrations/supabase/client';

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 10000);
const API_MAX_RETRIES = Number(import.meta.env.VITE_API_MAX_RETRIES || 2);
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

async function fetchWithTimeoutAndRetry(url: string, config: RequestInit): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...config, signal: controller.signal });
      clearTimeout(timeout);
      if (RETRYABLE_STATUS_CODES.has(res.status) && attempt < API_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < API_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
    }
  }
  throw new ApiError(lastError instanceof Error ? lastError.message : 'Network request failed', 0, 'NETWORK_ERROR', lastError);
}

async function apiCall<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers = await getAuthHeaders();

  const config: RequestInit = { method, headers };

  if (method === 'GET' && body) {
    const params = new URLSearchParams();
    Object.entries(body).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.set(k, String(v));
    });
    path += '?' + params.toString();
  } else if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    config.body = JSON.stringify(body);
  }

  const pathWithoutLeadingSlash = path.replace(/^\/+/, '');
  const res = await fetchWithTimeoutAndRetry(`${API_BASE}/${pathWithoutLeadingSlash}`, config);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorPayload = data?.error;
    const message =
      typeof errorPayload === 'string'
        ? errorPayload
        : errorPayload?.message || data?.message || `API error: ${res.status}`;
    const code = errorPayload?.code || data?.code;
    throw new ApiError(message, res.status, code, data);
  }

  return data;
}

// ===================== AUTH =====================
export const authApi = {
  me: () => apiCall('GET', 'auth/me'),
};

// ===================== PRODUCTS =====================
export const productsApi = {
  list: () => apiCall('GET', 'products'),
  get: (id: string) => apiCall('GET', `products/${id}`),
  create: (data: any) => apiCall('POST', 'products', data),
  update: (id: string, data: any) => apiCall('PUT', `products/${id}`, data),
  delete: (id: string) => apiCall('DELETE', `products/${id}`),
  categories: () => apiCall('GET', 'products/categories'),
  versions: (id: string) => apiCall('GET', `products/${id}/versions`),
};

// ===================== RESELLERS =====================
export const resellersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiCall('GET', 'resellers', params),

  create: (data: any) => apiCall('POST', 'resellers', data),
  update: (id: string, data: any) => apiCall('PUT', `resellers/${id}`, data),
  sales: (id: string) => apiCall('GET', `resellers/${id}/sales`),
  clients: () => apiCall('GET', 'resellers/clients'),
  exportData: (type: 'resellers' | 'sales' | 'commissions') =>
    apiCall('GET', 'admin/reseller-export', { type }),
};

export const resellerOnboardingApi = {
  myApplications: () => apiCall('GET', 'reseller/applications'),
  apply: (data: any) => apiCall('POST', 'reseller/apply', data),
  adminListApplications: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    apiCall('GET', 'admin/reseller-applications', params),
  adminApprove: (
    applicationId: string,
    options?: {
      notes?: string;
      tier?: string;
      commission_percent?: number;
      credit_limit?: number;
      selected_features?: string[];
      terms_version?: string;
    }
  ) =>
    apiCall('POST', 'admin/reseller-approve', { application_id: applicationId, ...options }),
  adminReject: (applicationId: string, reason: string) =>
    apiCall('POST', 'admin/reseller-reject', { application_id: applicationId, reason }),
};

// ===================== MARKETPLACE =====================
export const marketplaceApi = {
  products: () => apiCall('GET', 'marketplace/products'),
  approve: (productId: string) => apiCall('PUT', 'marketplace/approve', { product_id: productId }),
  orders: () => apiCall('GET', 'marketplace/orders'),
  orderHistory: () => apiCall('GET', 'marketplace/order-history'),
  downloadHistory: () => apiCall('GET', 'marketplace/download-history'),
  pricing: (productId: string, price: number, discount?: number) =>
    apiCall('PUT', 'marketplace/pricing', { product_id: productId, price, discount_percent: discount }),
  paymentInit: (data: any) => apiCall('POST', 'marketplace/payment/init', data),
  paymentWebhook: (data: any) => apiCall('POST', 'marketplace/payment/webhook', data),
  verifySignature: (data: any) => apiCall('POST', 'marketplace/payment/verify-signature', data),
  markPaid: (paymentId: string) => apiCall('POST', 'marketplace/payment/mark-paid', { payment_id: paymentId }),
  retryPayment: (paymentId: string) => apiCall('POST', 'marketplace/payment/retry', { payment_id: paymentId }),
  refundPayment: (paymentId: string) => apiCall('POST', 'marketplace/payment/refund', { payment_id: paymentId }),
};

// ===================== KEYS =====================
export const keysApi = {
  list: () => apiCall('GET', 'keys'),
  generate: (data: any) => apiCall('POST', 'keys/generate', data),
  activate: (id: string) => apiCall('PUT', `keys/${id}/activate`),
  deactivate: (id: string) => apiCall('PUT', `keys/${id}/deactivate`),
  validate: (licenseKey: string) => apiCall('POST', 'keys/validate', { license_key: licenseKey }),
  delete: (id: string) => apiCall('DELETE', `keys/${id}`),
};

// ===================== SERVERS =====================
export const serversApi = {
  list: () => apiCall('GET', 'projects'),
  get: (id: string) => apiCall('GET', `servers/${id}`),
  status: (params?: { page?: number; limit?: number }) => apiCall('GET', 'servers/status', params),
  create: (data: any) => apiCall('POST', 'projects', data),
  start: (server_id: string) => apiCall('POST', 'servers/start', { server_id }),
  stop: (server_id: string) => apiCall('POST', 'servers/stop', { server_id }),
  restart: (server_id: string) => apiCall('POST', 'servers/restart', { server_id }),
  deployTargets: () => apiCall('GET', 'deploy-targets'),
  triggerDeploy: (serverId: string) => apiCall('POST', 'deploy/trigger', { server_id: serverId }),
  deployStart: (server_id: string) => apiCall('POST', 'deploy/start', { server_id }),
  redeploy: (server_id: string) => apiCall('POST', 'deploy/redeploy', { server_id }),
  rollback: (server_id: string) => apiCall('POST', 'deploy/rollback', { server_id }),
  deployStatus: (serverId: string) => apiCall('GET', `deploy/status/${serverId}`),
  deployStatusList: (server_id?: string) => apiCall('GET', 'deploy/status', server_id ? { server_id } : undefined),
  deployHistory: (server_id?: string) => apiCall('GET', 'deploy/history', server_id ? { server_id } : undefined),
  deployLogs: (deploymentId: string) => apiCall('GET', `deploy/logs/${deploymentId}`),
  deployLogsList: (server_id?: string, deployment_id?: string) =>
    apiCall('GET', 'deploy/logs', { server_id, deployment_id }),
  deployLogsStream: (server_id: string) => apiCall('GET', 'deploy/logs/stream', { server_id }),
  dnsCreate: (data: any) => apiCall('POST', 'dns/create', data),
  dnsVerify: (data: any) => apiCall('POST', 'dns/verify', data),
  dnsStatus: (server_id: string) => apiCall('GET', 'dns/status', { server_id }),
  addDomain: (data: any) => apiCall('POST', 'domain/add', data),
  verifyDomain: (domainId: string) => apiCall('POST', 'domain/verify', { domain_id: domainId }),
  sslEnable: (domain_id: string) => apiCall('POST', 'ssl/enable', { domain_id }),
  gitScan: (server_id: string) => apiCall('POST', 'git/scan', { server_id }),
  gitDeploy: (server_id: string) => apiCall('POST', 'git/deploy', { server_id }),
  serverSettings: (server_id: string) => apiCall('GET', 'server/settings', { server_id }),
  updateServerSettings: (data: any) => apiCall('POST', 'server/settings/update', data),
  health: () => apiCall('GET', 'server/health'),
};

// ===================== GITHUB =====================
export const githubApi = {
  installUrl: () => apiCall('GET', 'github/install-url'),
  callback: (code: string) => apiCall('POST', 'github/callback', { code }),
  connect: (payload?: Record<string, unknown>) => apiCall('POST', 'github/connect', payload || {}),
  repos: () => apiCall('GET', 'github/repos'),
};

// ===================== AI =====================
export const aiApi = {
  run: (data: any) => apiCall('POST', 'ai/run', data),
  gateway: (data: any) => apiCall('POST', 'ai/gateway', data),
  debug: (data: any) => apiCall('POST', 'ai/debug', data),
  voice: (data: any) => apiCall('POST', 'ai/voice', data),
  models: () => apiCall('GET', 'ai/models'),
  modelsList: () => apiCall('GET', 'models/list'),
  modelsUpdate: (data: any) => apiCall('POST', 'models/update', data),
  modelsCreate: (data: any) => apiCall('POST', 'models/create', data),
  modelsDelete: (data: any) => apiCall('POST', 'models/delete', data),
  modelsTest: (data: any) => apiCall('POST', 'models/test', data),
  usage: () => apiCall('GET', 'ai/usage'),
};

// ===================== CHAT =====================
export const chatApi = {
  send: (data: any) => apiCall('POST', 'chat/send', data),
  history: () => apiCall('GET', 'chat/history'),
};

// ===================== API KEYS =====================
export const apiKeysApi = {
  create: (data: any) => apiCall('POST', 'api-keys/create', data),
  list: () => apiCall('GET', 'api-keys'),
  usage: () => apiCall('GET', 'api-usage'),
  createManaged: (data: any) => apiCall('POST', 'keys/create', data),
  revokeManaged: (data: any) => apiCall('POST', 'keys/revoke', data),
  managedUsage: (params?: { key_id?: string }) => apiCall('GET', 'keys/usage', params),
};

// ===================== AUTO-PILOT =====================
export const autoApi = {
  run: (data?: any) => apiCall('POST', 'auto/run', data),
  generate: (data?: any) => apiCall('POST', 'auto-pilot/generate', data),
  tasks: () => apiCall('GET', 'auto/tasks'),
  queue: () => apiCall('GET', 'auto-pilot/queue'),
  update: (id: string, data: any) => apiCall('PUT', `auto/${id}`, data),
};

export const adsApi = {
  optimize: (data: any) => apiCall('POST', 'ads/optimize', data),
};

export const audienceApi = {
  discover: (data: any) => apiCall('POST', 'audience/discover', data),
};

export const videoApi = {
  create: (data: any) => apiCall('POST', 'video/create', data),
};

export const socialApi = {
  publish: (data: any) => apiCall('POST', 'social/publish', data),
};

// ===================== APK =====================
export const apkApi = {
  build: (data: any) => apiCall('POST', 'apk/build', data),
  history: () => apiCall('GET', 'apk/history'),
  status: (id: string) => apiCall('GET', `apk/status/${id}`),
  download: (id: string) => apiCall('GET', `apk/download/${id}`),
};

// ===================== ULTRA BUILDER =====================
export const ultraBuilderApi = {
  scanFull: (data?: any) => apiCall('POST', 'git/scan-full', data),
  codeGenerate: (data: any) => apiCall('POST', 'code/generate', data),
  dbGenerate: (data: any) => apiCall('POST', 'db/generate', data),
  debugFull: (data: any) => apiCall('POST', 'ai/debug-full', data),
  autoFix: (data: any) => apiCall('POST', 'ai/auto-fix', data),
  buildRun: (data: any) => apiCall('POST', 'build/run', data),
  deployFull: (data: any) => apiCall('POST', 'deploy/full', data),
  apkBuild: (data: any) => apiCall('POST', 'apk/build', data),
};

// ===================== WALLET =====================
export const walletApi = {
  get: () => apiCall('GET', 'wallet'),
  add: (amount: number, description?: string, paymentMethod?: string, walletId?: string) =>
    apiCall('POST', 'wallet/add', { amount, description, payment_method: paymentMethod, wallet_id: walletId }),
  createRequest: (data: { amount: number; method: string; txn_id: string; proof_url?: string | null; source?: string; signature?: string; payload?: Record<string, unknown> }) =>
    apiCall('POST', 'wallet/requests', data),
  myRequests: (params?: { page?: number; limit?: number; status?: string }) =>
    apiCall('GET', 'wallet/requests', params),
  adminRequests: (params?: { page?: number; limit?: number; status?: string; method?: string; search?: string }) =>
    apiCall('GET', 'wallet/requests/all', params),
  approveRequest: (requestId: string) =>
    apiCall('POST', 'wallet/requests/approve', { request_id: requestId }),
  rejectRequest: (requestId: string, reason: string) =>
    apiCall('POST', 'wallet/requests/reject', { request_id: requestId, reason }),
  withdraw: (amount: number, description?: string, referenceId?: string, referenceType?: string, walletId?: string) =>
    apiCall('POST', 'wallet/withdraw', { amount, description, reference_id: referenceId, reference_type: referenceType, wallet_id: walletId }),
  lock: (amount: number, referenceId?: string, referenceType?: string, meta?: Record<string, unknown>) =>
    apiCall('POST', 'wallet/lock', { amount, reference_id: referenceId, reference_type: referenceType, meta }),
  unlock: (amount: number, referenceId?: string, referenceType?: string, meta?: Record<string, unknown>) =>
    apiCall('POST', 'wallet/unlock', { amount, reference_id: referenceId, reference_type: referenceType, meta }),
  refund: (amount: number, description?: string, referenceId?: string, referenceType?: string, meta?: Record<string, unknown>) =>
    apiCall('POST', 'wallet/refund', { amount, description, reference_id: referenceId, reference_type: referenceType, meta }),
  ledger: () => apiCall('GET', 'wallet/ledger'),
  transactions: (params?: { page?: number; limit?: number }) =>
    apiCall('GET', 'wallet/transactions', params),
  all: () => apiCall('GET', 'wallet/all'),
};

// ===================== SUBSCRIPTIONS =====================
export const subscriptionsApi = {
  list: () => apiCall('GET', 'subscriptions'),
  renew: (subscriptionId: string) => apiCall('POST', 'subscriptions/renew', { subscription_id: subscriptionId }),
  cronRun: (cronSecret?: string) => apiCall('POST', 'subscriptions/cron-run', cronSecret ? { cron_secret: cronSecret } : {}),
};

// ===================== SEO & LEADS =====================
export const leadsApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiCall('GET', 'leads', params),
  seoLeads: (params?: { page?: number; limit?: number; search?: string }) =>
    apiCall('GET', 'seo/leads', params),
  create: (data: any) => apiCall('POST', 'leads', data),
  export: (params?: { format?: 'csv' | 'json' }) => apiCall('GET', 'leads/export', params),

};

export const seoApi = {
  scan: (data?: { urls?: string[]; product_id?: string; mode?: 'quick' | 'full' }) =>
    apiCall('POST', 'seo/scan', data),
  leads: (params?: { page?: number; limit?: number; search?: string }) =>
    apiCall('GET', 'seo/leads', params),
  googleSync: (data?: Record<string, unknown>) =>
    apiCall('POST', 'seo/google-sync', data),
  generateMeta: (data?: { product_id?: string; urls?: string[] }) =>
    apiCall('POST', 'seo/generate-meta', data),
  analytics: () => apiCall('GET', 'seo/analytics'),

};

export const dashboardApi = {
  get: () => apiCall('GET', 'dashboard'),
};

export const systemHealthApi = {
  runCheck: (data?: { module?: string }) => apiCall('POST', 'system-health/run-check', data),
};

export const contentApi = {
  generate: (data: {
    keyword: string
    country?: string
    language?: string
    type?: 'blog' | 'landing' | 'product'
    publish?: boolean
  }) => apiCall('POST', 'content/generate', data),
}

export const analyticsApi = {
  seo: () => apiCall('GET', 'analytics/seo'),
  leads: () => apiCall('GET', 'analytics/leads'),
}

export const marketingApi = {
  poster: (data: { campaign_name?: string; platform?: string; content?: string; country?: string }) =>
    apiCall('POST', 'marketing/poster', data),
}
