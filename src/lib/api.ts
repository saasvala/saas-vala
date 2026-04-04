import { supabase } from '@/integrations/supabase/client';
import { savePostLoginRedirect, savePreLogoutState } from './sessionState';

export const API_BASE_V1 = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/api/v1`;
export const API_BASE_V2 = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/api/v2`;
const SUPPORTED_API_VERSIONS = new Set(['v1', 'v2']);
const DEFAULT_API_VERSION = 'v1';
const configuredVersion = String(import.meta.env.VITE_API_VERSION || DEFAULT_API_VERSION).toLowerCase();
const API_VERSION = SUPPORTED_API_VERSIONS.has(configuredVersion) ? configuredVersion : DEFAULT_API_VERSION;
const API_BASE = API_VERSION === 'v2' ? API_BASE_V2 : API_BASE_V1;

async function getAuthHeaders(): Promise<Record<string, string>> {
  let { data: { session } } = await supabase.auth.getSession();
  const refreshGraceSeconds = Number(import.meta.env.VITE_TOKEN_REFRESH_GRACE_SECONDS || 60);
  const expiresInSeconds = Number(session?.expires_at || 0) - Math.floor(Date.now() / 1000);
  if (session?.refresh_token && Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 && expiresInSeconds <= refreshGraceSeconds) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session) {
      session = data.session;
    }
  }
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
const API_MAX_RETRY_DELAY_MS = Number(import.meta.env.VITE_API_MAX_RETRY_DELAY_MS || 4000);
const API_RETRY_JITTER_MS = Number(import.meta.env.VITE_API_RETRY_JITTER_MS || 120);
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const API_CACHE_TTL_MS = 30_000;
const responseCache = new Map<string, { data: unknown; ts: number }>();
let consecutiveFailures = 0;
let degradedUntil = 0;
let escalationRaised = false;
const API_ESCALATION_THRESHOLD = 5;

async function notifyCriticalApiEscalation(details: { failures: number; path: string; status: number; code?: string }) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    const title = 'Critical API failure spike detected';
    const message = `Repeated API failures detected (${details.failures}). Endpoint: ${details.path}`;
    await supabase.from('notifications').insert({
      user_id: user?.id || null,
      title,
      message,
      type: 'error',
      action_url: '/system-health',
    });
    await supabase.from('activity_logs').insert({
      entity_type: 'api_health',
      entity_id: `api-escalation-${Date.now()}`,
      action: 'critical_error_escalated',
      performed_by: user?.id || null,
      details: {
        failures: details.failures,
        path: details.path,
        status: details.status,
        code: details.code || null,
        notify_admin: true,
      },
    });
  } catch {
    // ignore escalation logging failures
  }
}

async function fetchWithTimeoutAndRetry(url: string, config: RequestInit): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...config, signal: controller.signal });
      clearTimeout(timeout);
      if (RETRYABLE_STATUS_CODES.has(res.status) && attempt < API_MAX_RETRIES) {
        const retryDelayMs = Math.min(API_MAX_RETRY_DELAY_MS, 250 * (2 ** attempt)) + Math.floor(Math.random() * API_RETRY_JITTER_MS);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      return res;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < API_MAX_RETRIES) {
        const retryDelayMs = Math.min(API_MAX_RETRY_DELAY_MS, 250 * (2 ** attempt)) + Math.floor(Math.random() * API_RETRY_JITTER_MS);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
    }
  }
  throw new ApiError(lastError instanceof Error ? lastError.message : 'Network request failed', 0, 'NETWORK_ERROR', lastError);
}

async function apiCall<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers = await getAuthHeaders();
  const now = Date.now();

  const config: RequestInit = { method, headers };
  const cacheKey = method === 'GET' ? `${path}|${JSON.stringify(body || {})}` : '';

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
  if (degradedUntil > now && method === 'GET') {
    const cached = responseCache.get(cacheKey);
    if (cached && now - cached.ts < API_CACHE_TTL_MS) return cached.data as T;
  }
  const res = await fetchWithTimeoutAndRetry(`${API_BASE}/${pathWithoutLeadingSlash}`, config);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorPayload = data?.error;
    const message =
      typeof errorPayload === 'string'
        ? errorPayload
        : errorPayload?.message || data?.message || `API error: ${res.status}`;
    const code = errorPayload?.code || data?.code;
    if (res.status === 401 || code === 'TOKEN_EXPIRED') {
      savePreLogoutState(window.location.pathname, window.location.search, window.location.hash);
      savePostLoginRedirect(`${window.location.pathname}${window.location.search}${window.location.hash}`);
      if (window.location.pathname !== '/auth') {
        window.location.assign('/auth');
      }
    }
    consecutiveFailures += 1;
    if (consecutiveFailures >= API_ESCALATION_THRESHOLD) {
      degradedUntil = Date.now() + 30_000;
      if (!escalationRaised) {
        escalationRaised = true;
        void notifyCriticalApiEscalation({
          failures: consecutiveFailures,
          path: pathWithoutLeadingSlash,
          status: res.status,
          code,
        });
      }
    }
    throw new ApiError(message, res.status, code, data);
  }

  consecutiveFailures = 0;
  degradedUntil = 0;
  escalationRaised = false;
  if (method === 'GET') {
    responseCache.set(cacheKey, { data, ts: Date.now() });
  } else {
    for (const key of responseCache.keys()) {
      if (key.startsWith(`${path}`) || key.includes(path.split('?')[0])) responseCache.delete(key);
    }
  }

  return data;
}

export type CrudActionType = 'create' | 'read' | 'update' | 'delete';
export type CrudModule =
  | 'users'
  | 'products'
  | 'orders'
  | 'wallet'
  | 'apk'
  | 'builder'
  | 'server';

type CrudRouteMap = Record<CrudModule, Partial<Record<CrudActionType, string>>>;

export const CRUD_ROUTE_MAP: CrudRouteMap = {
  users: {
    create: 'admin/user/create',
    read: 'admin/user/list',
    update: 'admin/user/update',
    delete: 'admin/user/delete',
  },
  products: {
    create: 'admin/product/create',
    read: 'products',
    update: 'admin/product/update',
    delete: 'admin/product/delete',
  },
  orders: {
    read: 'admin/orders',
    update: 'admin/order/status',
  },
  wallet: {
    read: 'wallet',
    create: 'wallet/add',
    update: 'wallet/edit',
  },
  apk: {
    create: 'apk/upload',
    read: 'apk/list',
    update: 'apk/update',
    delete: 'apk/delete',
  },
  builder: {
    create: 'builder/create',
    read: 'builder/status',
    update: 'builder/retry',
  },
  server: {
    create: 'server/add',
    read: 'server/list',
    update: 'server/update',
    delete: 'server/remove',
  },
};

export type CrudConfig = {
  type: CrudActionType;
  api?: string;
  payload?: Record<string, unknown> | undefined;
  module?: CrudModule;
};

export async function CRUD<T = any>(config: CrudConfig): Promise<T> {
  const resolvedApi = config.api || (config.module ? CRUD_ROUTE_MAP[config.module]?.[config.type] : undefined);
  if (!resolvedApi) {
    throw new ApiError(`CRUD route not found for ${config.module || 'custom'}:${config.type}`, 400, 'CRUD_ROUTE_NOT_FOUND');
  }
  if (config.type === 'create') {
    return apiCall<T>('POST', resolvedApi, config.payload);
  }
  if (config.type === 'read') {
    return apiCall<T>('GET', resolvedApi, config.payload);
  }
  if (config.type === 'update') {
    return apiCall<T>('PUT', resolvedApi, config.payload);
  }
  return apiCall<T>('DELETE', resolvedApi, config.payload);
}

async function crudWithFallback<T = any>(
  module: CrudModule,
  type: CrudActionType,
  payload: Record<string, unknown> | undefined,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await CRUD<T>({ module, type, payload });
  } catch {
    return fallback();
  }
}

// ===================== AUTH =====================
export const authApi = {
  me: () => apiCall('GET', 'auth/me'),
};

export const usersApi = {
  create: (data: any) => CRUD({ type: 'create', module: 'users', payload: data }),
  list: (params?: Record<string, unknown>) => CRUD({ type: 'read', module: 'users', payload: params }),
  update: (data: any) => CRUD({ type: 'update', module: 'users', payload: data }),
  delete: (data: { id: string }) => CRUD({ type: 'delete', module: 'users', payload: data }),
};

// ===================== PRODUCTS =====================
export const productsApi = {
  list: (params?: Record<string, unknown>) =>
    crudWithFallback('products', 'read', params, () => apiCall('GET', 'products', params)),
  get: (id: string) => apiCall('GET', `products/${id}`),
  create: (data: any) =>
    crudWithFallback('products', 'create', data, () => apiCall('POST', 'products', data)),
  update: (id: string, data: any) =>
    crudWithFallback('products', 'update', { id, ...data }, () => apiCall('PUT', `products/${id}`, data)),
  delete: (id: string) =>
    crudWithFallback('products', 'delete', { id }, () => apiCall('DELETE', `products/${id}`)),
  categories: () => apiCall('GET', 'products/categories'),
  versions: (id: string) => apiCall('GET', `products/${id}/versions`),
};

// ===================== RESELLERS =====================
export const resellersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiCall('GET', 'resellers', params),

  create: (data: any) => apiCall('POST', 'resellers', data),
  get: (id: string) => apiCall('GET', `resellers/${id}`),
  update: (id: string, data: any) => apiCall('PUT', `resellers/${id}`, data),
  allow: (reseller_id: string) => apiCall('POST', 'reseller/allow', { reseller_id }),
  suspend: (reseller_id: string) => apiCall('POST', 'reseller/suspend', { reseller_id }),
  block: (reseller_id: string) => apiCall('POST', 'reseller/block', { reseller_id }),
  activity: (reseller_id?: string) => apiCall('GET', 'reseller/activity', reseller_id ? { reseller_id } : undefined),
  logResellerActivity: (data: {
    reseller_id: string;
    action: string;
    module?: string;
    details?: Record<string, unknown>;
    ip_address?: string;
  }) => apiCall('POST', 'reseller/activity', data),
  sales: (id: string) => apiCall('GET', `resellers/${id}/sales`),
  clients: () => apiCall('GET', 'resellers/clients'),
  exportData: (type: 'resellers' | 'sales' | 'commissions' | 'activity') =>
    apiCall('GET', 'reseller/export', { type }),
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

export const resellerFeaturesApi = {
  dashboard: () => apiCall('GET', 'dashboard'),
  wallet: () => apiCall('GET', 'wallet'),
  walletAdd: (amount: number, description?: string, paymentMethod?: string) =>
    apiCall('POST', 'wallet/add', { amount, description, payment_method: paymentMethod }),
  walletDeduct: (amount: number, description?: string, referenceId?: string, referenceType?: string) =>
    apiCall('POST', 'wallet/withdraw', { amount, description, reference_id: referenceId, reference_type: referenceType }),
  products: () => apiCall('GET', 'products'),
  leads: (params?: { page?: number; limit?: number; search?: string }) => apiCall('GET', 'seo/leads', params),
  apiKeys: () => apiCall('GET', 'keys'),
  createApiKey: (data: any) => apiCall('POST', 'keys/create', data),
  revokeApiKey: (data: any) => apiCall('POST', 'keys/revoke', data),
  subscriptions: () => apiCall('GET', 'subscriptions'),
  seoScan: (data?: { urls?: string[]; product_id?: string; mode?: 'quick' | 'full' }) => apiCall('POST', 'seo/scan', data),
  seoGenerateMeta: (data?: { product_id?: string; urls?: string[] }) => apiCall('POST', 'seo/generate-meta', data),
  seoGenerateLeads: (data?: { product_id?: string; country?: string; count?: number }) => apiCall('POST', 'leads', data),
  aiUsage: () => apiCall('GET', 'ai/usage'),
  aiGateway: (data: any) => apiCall('POST', 'ai/gateway', data),
  analyticsSeo: () => apiCall('GET', 'analytics/seo'),
  analyticsLeads: () => apiCall('GET', 'analytics/leads'),
};

// ===================== MARKETPLACE =====================
export const marketplaceApi = {
  products: () => apiCall('GET', 'marketplace/products'),
  productSearch: (q?: string, filter?: string | Record<string, unknown>) =>
    apiCall('GET', 'product/search', { q, filter: typeof filter === 'string' ? filter : filter ? JSON.stringify(filter) : undefined }),
  productList: (params?: { country?: string; lang?: string; currency?: string }) =>
    apiCall('GET', 'product/list', params),
  approve: (productId: string) => apiCall('PUT', 'marketplace/approve', { product_id: productId }),
  orders: () => apiCall('GET', 'marketplace/orders'),
  orderHistory: () => apiCall('GET', 'marketplace/order-history'),
  downloadHistory: () => apiCall('GET', 'marketplace/download-history'),
  pricing: (productId: string, price: number, discount?: number) =>
    apiCall('PUT', 'marketplace/pricing', { product_id: productId, price, discount_percent: discount }),
  analyticsSales: () => apiCall('GET', 'analytics/sales'),
  paymentCreate: (data: any) => apiCall('POST', 'payment/create', data),
  paymentVerify: (data: any) => apiCall('POST', 'payment/verify', data),
  paymentInit: (data: any) => apiCall('POST', 'marketplace/payment/init', data),
  paymentWebhook: (data: any) => apiCall('POST', 'marketplace/payment/webhook', data),
  verifySignature: (data: any) => apiCall('POST', 'marketplace/payment/verify-signature', data),
  markPaid: (paymentId: string) => apiCall('POST', 'marketplace/payment/mark-paid', { payment_id: paymentId }),
  retryPayment: (paymentId: string) => apiCall('POST', 'marketplace/payment/retry', { payment_id: paymentId }),
  refundPayment: (paymentId: string) => apiCall('POST', 'marketplace/payment/refund', { payment_id: paymentId }),
  favoriteToggle: (productId: string, productName?: string) =>
    apiCall('POST', 'marketplace/favorite/toggle', { product_id: productId, product_name: productName }),
  favoriteList: () => apiCall('GET', 'marketplace/favorite/list'),
  cartAdd: (productId: string, qty = 1) => apiCall('POST', 'marketplace/cart/add', { product_id: productId, qty }),
  cartList: () => apiCall('GET', 'marketplace/cart/list'),
  ratingAdd: (data: { product_id: string; rating: number; product_title?: string; review?: string }) =>
    apiCall('POST', 'marketplace/rating/add', data),
  ratingList: (productId: string) => apiCall('GET', 'marketplace/rating/list', { product_id: productId }),
  commentAdd: (data: { product_id: string; message: string }) => apiCall('POST', 'marketplace/comment/add', data),
  commentList: (productId: string) => apiCall('GET', 'marketplace/comment/list', { product_id: productId }),
  promoCreate: (productId: string) => apiCall('POST', 'marketplace/promo/create', { product_id: productId }),
  promoList: () => apiCall('GET', 'marketplace/promo/list'),
  promoTrackClick: (code: string) => apiCall('POST', 'marketplace/promo/track-click', { code }),
  promoTrackConversion: (code: string, amount: number) =>
    apiCall('POST', 'marketplace/promo/track-conversion', { code, amount }),
  promoResolve: (code: string) => apiCall('GET', 'marketplace/promo/resolve', { code }),
};

export const ordersApi = {
  read: (params?: Record<string, unknown>) =>
    crudWithFallback('orders', 'read', params, () => marketplaceApi.orders()),
  updateStatus: (data: Record<string, unknown>) =>
    crudWithFallback('orders', 'update', data, () => apiCall('PUT', 'admin/order/status', data)),
};

export const bannerApi = {
  create: (data: any) => apiCall('POST', 'banner/create', data),
  list: () => apiCall('GET', 'banner/list'),
  update: (data: any) => apiCall('PUT', 'banner/update', data),
  delete: (id: string) => apiCall('DELETE', 'banner/delete', { id }),
};

export const offerApi = {
  create: (data: any) => apiCall('POST', 'offer/create', data),
  list: () => apiCall('GET', 'offer/list'),
};

export const productAliasApi = {
  create: (data: any) => apiCall('POST', 'product/create', data),
  list: () => apiCall('GET', 'product/list'),
  update: (data: any) => apiCall('PUT', 'product/update', data),
  search: (q?: string, filter?: string | Record<string, unknown>) =>
    apiCall('GET', 'product/search', { q, filter: typeof filter === 'string' ? filter : filter ? JSON.stringify(filter) : undefined }),
};

export const categoryApi = {
  create: (data: any) => apiCall('POST', 'category/create', data),
  tree: () => apiCall('GET', 'category/tree'),
};

// ===================== KEYS =====================
export const keysApi = {
  list: () => apiCall('GET', 'keys'),
  search: (params?: { search?: string; user?: string; reseller?: string; status?: string; type?: string }) =>
    apiCall('GET', 'key/search', params),
  generate: (data: any) => apiCall('POST', 'keys/generate', data),
  generateCompat: (data: any) => apiCall('POST', 'key/generate', data),
  bulk: (data: any) => apiCall('POST', 'key/bulk', data),
  generateBulk: (data: any) => apiCall('POST', 'key/bulk', data),
  generateReseller: (data: any) => apiCall('POST', 'reseller/key/generate', data),
  activate: (id: string) => apiCall('PUT', `keys/${id}/activate`),
  deactivate: (id: string) => apiCall('PUT', `keys/${id}/deactivate`),
  revoke: (id: string) => apiCall('PUT', `keys/${id}/revoke`),
  validate: (licenseKey: string) => apiCall('POST', 'keys/validate', { license_key: licenseKey }),
  delete: (id: string) => apiCall('DELETE', `keys/${id}`),
};

// ===================== SERVERS =====================
export const serversApi = {
  list: () =>
    crudWithFallback('server', 'read', undefined, () => apiCall('GET', 'servers/list')),
  listCompat: () => apiCall('GET', 'server/list'),
  get: (id: string) => apiCall('GET', `servers/${id}`),
  status: (params?: { page?: number; limit?: number }) => apiCall('GET', 'servers/status', params),
  create: (data: any) =>
    crudWithFallback('server', 'create', data, () => apiCall('POST', 'server/add', data)),
  start: (server_id: string) => apiCall('POST', 'servers/start', { server_id }),
  stop: (server_id: string) => apiCall('POST', 'servers/stop', { server_id }),
  restart: (server_id: string) => apiCall('POST', 'servers/restart', { server_id }),
  suspend: (id: string) => apiCall('POST', `server/suspend/${id}`),
  activate: (id: string) => apiCall('POST', `server/activate/${id}`),
  update: (data: any) =>
    crudWithFallback('server', 'update', data, () => apiCall('PUT', 'server/update', data)),
  delete: (id: string) =>
    crudWithFallback('server', 'delete', { id }, () => apiCall('DELETE', `server/delete/${id}`)),
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
  dnsConfigure: (data: any) => apiCall('POST', 'domain/dns/configure', data),
  verifyDomain: (domainId: string) => apiCall('POST', 'domain/verify', { domain_id: domainId }),
  sslEnable: (domain_id: string) => apiCall('POST', 'ssl/enable', { domain_id }),
  gitScan: (server_id: string) => apiCall('POST', 'git/scan', { server_id }),
  gitDeploy: (server_id: string) => apiCall('POST', 'git/deploy', { server_id }),
  scan: (server_id: string) => apiCall('POST', 'server/scan', { server_id }),
  fix: (server_id: string) => apiCall('POST', 'server/fix', { server_id }),
  deployGit: (server_id: string) => apiCall('POST', 'server/deploy/git', { server_id }),
  deployApk: (data: any) => apiCall('POST', 'server/deploy/apk', data),
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
  forceSync: (data?: any) => apiCall('POST', 'ai/force-sync', data || {}),
  logs: (params?: { limit?: number; status?: string; model?: string; provider?: string }) => apiCall('GET', 'ai/logs', params),
  autoFix: (data?: any) => apiCall('POST', 'ai/auto-fix', data || {}),
  securityScan: (data?: any) => apiCall('POST', 'ai/security-scan', data || {}),
  performanceOptimize: (data?: any) => apiCall('POST', 'ai/performance-optimize', data || {}),
  deploy: (data?: any) => apiCall('POST', 'ai/deploy', data || {}),
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

export const autoPilotApi = {
  newRequest: (data: any) => apiCall('POST', 'auto-pilot/new-request', data),
  generate: (data?: any) => apiCall('POST', 'auto-pilot/generate', data),
  billingCheck: (data?: any) => apiCall('POST', 'auto-pilot/billing-check', data),
  addBilling: (data: any) => apiCall('POST', 'auto-pilot/add-billing', data),
};

export const billingApi = {
  generate: (data: {
    client_id: string;
    amount: number;
    currency?: string;
    due_date?: string;
    note?: string;
    auto_deduct?: boolean;
  }) => apiCall('POST', 'billing/generate', data),
  create: (data: {
    client_id: string;
    title: string;
    amount: number;
    type: 'one-time' | 'subscription';
    due_date: string;
    notes?: string;
  }) => apiCall('POST', 'billing/create', data),
  send: (data: { billing_id?: string; invoice_id?: string; client_id: string }) =>
    apiCall('POST', 'billing/send', data),
  alerts: () => apiCall('GET', 'billing/alerts'),
  otpSend: (data: { invoice_id: string; client_id: string; amount: number; email?: string; otp?: string }) =>
    apiCall('POST', 'billing/otp/send', data),
  otpVerify: (data: { invoice_id: string; otp: string }) =>
    apiCall('POST', 'billing/otp/verify', data),
};

export const paymentApi = {
  create: (data: {
    invoice_id: string;
    billing_id?: string;
    client_id: string;
    amount: number;
    method?: string;
    otp?: string;
  }) => apiCall('POST', 'payment/create', data),
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
export interface ApkDownloadResponse {
  allowed?: boolean;
  url?: string;
  download_url?: string;
  checksum?: string;
  checksum_verified?: boolean;
  message?: string;
}

export const apkApi = {
  create: (data: any) =>
    crudWithFallback('apk', 'create', data, () => apiCall('POST', 'apk/build', data)),
  list: (params?: Record<string, unknown>) =>
    crudWithFallback('apk', 'read', params, () => apiCall('GET', 'apk/history', params)),
  update: (data: any) =>
    crudWithFallback('apk', 'update', data, () => apiCall('PUT', 'apk/update', data)),
  delete: (data: { id: string }) =>
    crudWithFallback('apk', 'delete', data, () => apiCall('DELETE', 'apk/delete', data)),
  build: (data: any) =>
    crudWithFallback('apk', 'create', data, () => apiCall('POST', 'apk/build', data)),
  history: () =>
    crudWithFallback('apk', 'read', undefined, () => apiCall('GET', 'apk/history')),
  status: (id: string) => apiCall('GET', `apk/status/${id}`),
  download: (id: string) => apiCall<ApkDownloadResponse>('GET', `apk/download/${id}`),
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
  rollback: (serverId: string) => apiCall('POST', 'deploy/rollback', { server_id: serverId }),
  apkBuild: (data: any) => apiCall('POST', 'apk/build', data),
};

export const builderApi = {
  create: (data: {
    name: string;
    prompt: string;
    stack_preference?: string;
    target_platforms?: string[];
  }) => crudWithFallback('builder', 'create', data, () => apiCall('POST', 'builder/create', data)),
  run: (data: { project_id: string; version?: string }) => apiCall('POST', 'builder/run', data),
  status: (projectId: string) =>
    crudWithFallback('builder', 'read', { project_id: projectId }, () => apiCall('GET', `builder/status/${projectId}`)),
  logs: (projectId: string) => apiCall('GET', `builder/logs/${projectId}`),
  retry: (projectId: string) =>
    crudWithFallback('builder', 'update', { project_id: projectId }, () => apiCall('POST', 'builder/retry', { project_id: projectId })),
};

// ===================== WALLET =====================
export const walletApi = {
  get: () =>
    crudWithFallback('wallet', 'read', undefined, () => apiCall('GET', 'wallet')),
  add: (amount: number, description?: string, paymentMethod?: string, walletId?: string) =>
    crudWithFallback(
      'wallet',
      'create',
      { amount, description, payment_method: paymentMethod, wallet_id: walletId },
      () => apiCall('POST', 'wallet/add', { amount, description, payment_method: paymentMethod, wallet_id: walletId }),
    ),
  control: (data: { wallet_id?: string; action?: 'freeze' | 'unfreeze'; freeze?: boolean; limit?: number; note?: string }) =>
    apiCall('POST', 'wallet/control', data),
  export: (params?: { format?: 'csv' | 'pdf'; type?: string; source?: string; status?: string; from?: string; to?: string; search?: string }) =>
    apiCall('GET', 'wallet/export', params),
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
  adminAdd: (data: { wallet_id: string; amount: number; note?: string; source?: string }) =>
    apiCall('POST', 'wallet/admin/add', data),
  adminEdit: (data: { wallet_id: string; balance: number; note?: string }) =>
    crudWithFallback('wallet', 'update', data as Record<string, unknown>, () => apiCall('POST', 'wallet/admin/edit', data)),
  adminDelete: (data: { wallet_id: string; note?: string }) =>
    apiCall('POST', 'wallet/admin/delete', data),
  adminFreeze: (data: { wallet_id: string; freeze: boolean; note?: string }) =>
    apiCall('POST', 'wallet/admin/freeze', data),
  reverse: (data: { transaction_id: string; note?: string }) =>
    apiCall('POST', 'wallet/reverse', data),
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

export const resellerApi = {
  profile: () => apiCall('GET', 'reseller/profile'),
  stats: () => apiCall('GET', 'reseller/stats'),
};

export const clientApi = {
  add: (data: { client_name?: string; client_email: string; client_phone?: string; status?: string }) =>
    apiCall('POST', 'client/add', data),
  assignKey: (data: { client_id: string; key_id: string }) =>
    apiCall('POST', 'client/assign-key', data),
};

export const referralApi = {
  link: () => apiCall('GET', 'referral/link'),
  create: (data?: { code?: string; status?: string }) => apiCall('POST', 'referral/create', data || {}),
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

// ===================== FEEDBACK =====================
export const feedbackApi = {
  post: (data: { rating: number; message?: string; source?: string }) =>
    apiCall('POST', 'feedback', data),
};

export type SessionDevice = {
  id: string;
  name: string;
  lastSeen: string;
  current: boolean;
};

export const sessionApi = {
  listDevices: async (): Promise<SessionDevice[]> => {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('id, device_name, browser, os, device_type, last_active_at, created_at, is_current')
      .order('is_current', { ascending: false })
      .order('last_active_at', { ascending: false });

    if (error) {
      throw new ApiError(error.message, 500, 'DB_ERROR', error);
    }

    return (data ?? [])
      .filter((row) => Boolean(row.id))
      .map((row) => {
        const parts = [row.device_name, row.device_type, row.browser, row.os].filter(Boolean);
        return {
          id: row.id as string,
          name: parts.length > 0 ? parts.join(' • ') : row.device_type || 'Unknown device',
          lastSeen: row.last_active_at || row.created_at || new Date().toISOString(),
          current: Boolean(row.is_current),
        };
      });
  },
  revokeDevice: async (deviceId: string) => {
    const { data: deviceRow, error: readError } = await supabase
      .from('user_sessions')
      .select('is_current')
      .eq('id', deviceId)
      .maybeSingle();
    if (readError) {
      throw new ApiError(readError.message, 500, 'DB_ERROR', readError);
    }
    if (deviceRow?.is_current) {
      throw new ApiError('Cannot revoke current device session', 400, 'INVALID_SESSION_ACTION');
    }

    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('id', deviceId);
    if (error) {
      throw new ApiError(error.message, 500, 'DB_ERROR', error);
    }
    return { success: true };
  },
  revokeOtherDevices: async () => {
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('is_current', false);
    if (error) {
      throw new ApiError(error.message, 500, 'DB_ERROR', error);
    }
    return { success: true };
  },
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
  generate: (data?: { product_id?: string; country?: string; language?: string; product?: Record<string, unknown> }) =>
    apiCall('POST', 'seo/generate', data),
  analytics: () => apiCall('GET', 'seo/analytics'),

};

export interface GeoDetectResponse {
  country_code: string
  currency: string
  language: string
}

export interface CurrencyRatesResponse {
  base: string
  rates: Record<string, number>
  updated_at?: string
}

export const geoApi = {
  detect: () => apiCall<GeoDetectResponse>('GET', 'geo/detect'),
}

export const translationApi = {
  translate: (data: { text: string; target_lang: string; source_lang?: string }) =>
    apiCall<{ translated_text: string; target_lang: string; cached?: boolean }>('POST', 'translate', data),
}

export const currencyApi = {
  rates: () => apiCall<CurrencyRatesResponse>('GET', 'currency/rates'),
}

export const dashboardApi = {
  get: () => apiCall('GET', 'dashboard'),
};

export const auditApi = {
  list: (params?: { limit?: number; offset?: number; filters?: Record<string, unknown>; q?: string }) =>
    apiCall('GET', 'audit/list', params),
  search: (params?: { q?: string; limit?: number; offset?: number }) =>
    apiCall('GET', 'audit/search', params),
  stats: (params?: { q?: string }) =>
    apiCall('GET', 'audit/stats', params),
  create: (data: {
    role?: string
    action: string
    module?: string
    table_name?: string
    record_id?: string
    old_data?: Record<string, unknown> | null
    new_data?: Record<string, unknown> | null
    ip?: string | null
    device?: string | null
    status?: string
    message?: string
    event_category?: string
    event_type?: string
    metadata?: Record<string, unknown>
    created_at?: string
  }) => apiCall('POST', 'audit/create', data),
  export: (params?: { type?: 'csv' | 'pdf'; q?: string }) =>
    apiCall('GET', 'audit/export', params),
};

export const systemHealthApi = {
  get: () => apiCall('GET', 'system/health'),
  runCheck: () => apiCall('POST', 'system/health/run-check', {}),
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
