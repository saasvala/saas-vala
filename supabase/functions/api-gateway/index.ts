import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.25.76'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Content-Type': 'application/json',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders })
}

function err(message: string, status = 400, code = 'BAD_REQUEST') {
  return json({ error: message, code }, status)
}

function ok(data: unknown, status = 200) {
  return json({ success: true, data, error: null }, status)
}

function fail(message: string, status = 400, code = 'BAD_REQUEST', details?: unknown) {
  return json({ success: false, data: null, error: { message, code, details: details || null } }, status)
}

const serverActionSchema = z.object({
  server_id: z.string().min(1),
})

const settingsUpdateSchema = z.object({
  server_id: z.string().min(1),
  auto_deploy: z.boolean().optional(),
  maintenance: z.boolean().optional(),
  paused: z.boolean().optional(),
  ddos: z.boolean().optional(),
})

async function logRequestSafe(
  admin: any,
  params: {
    user_id: string
    endpoint: string
    method: string
    status_code: number
    duration_ms: number
    error_code?: string | null
  },
) {
  try {
    await admin.from('request_logs').insert({
      user_id: params.user_id,
      endpoint: params.endpoint,
      method: params.method,
      status_code: params.status_code,
      duration_ms: params.duration_ms,
      error_code: params.error_code || null,
      created_at: nowIso(),
    })
  } catch {
    // no-op: logging must never break API responses
  }
}

const productListCache: { data: any[] | null; expiresAt: number } = { data: null, expiresAt: 0 }
const serverStatusCache: { data: unknown | null; expiresAt: number } = { data: null, expiresAt: 0 }
const PRODUCT_LIST_CACHE_TTL_MS = 60 * 1000
const SERVER_STATUS_CACHE_TTL_MS = 30 * 1000
const RATE_LIMIT_WINDOW_SECONDS = Number(Deno.env.get('API_RATE_LIMIT_WINDOW_SECONDS') || '60')
const RATE_LIMIT_MAX_REQUESTS = Number(Deno.env.get('API_RATE_LIMIT_MAX_REQUESTS') || '120')
const DEFAULT_GITHUB_ORG = Deno.env.get('GITHUB_DEFAULT_ORG') || 'saasvala'
const STANDARD_APP_ROLES = ['admin', 'user'] as const
const DB_INDEX_HINT_PATTERNS = (Deno.env.get('DB_INDEX_HINT_PATTERNS') || 'email,status').split(',').map((v) => v.trim()).filter(Boolean)
const DEFAULT_COMMISSION_RATE = 10
const FINAL_RESELLER_GAP_FEATURE_KEYS = [
  'tier_based_dynamic_commission_engine',
  'per_product_commission_override',
  'credit_risk_scoring_auto_block',
  'reseller_sla_uptime_tracking',
  'auto_payout_scheduling',
  'commission_dispute_system',
  'multi_level_reseller_hierarchy',
  'geo_country_restriction',
  'tax_split_per_reseller',
  'reseller_performance_scoring',
  'limits_per_day_month_keys_sales',
  'auto_suspend_on_fraud_triggers',
  'contract_terms_acceptance_log',
] as const
const FINAL_ULTRA_LAYER_FEATURE_KEYS = [
  'real_time_event_bus_pub_sub',
  'distributed_job_queue_priority_retries',
  'event_sourcing_for_critical_flows',
  'read_write_db_separation',
  'horizontal_scaling_stateless_apis',
  'feature_toggle_per_reseller',
  'ai_anomaly_detection_sales_fraud',
  'smart_retry_with_backoff',
  'dead_letter_queue_handling',
  'versioned_apis_v1_v2',
  'blue_green_deployment',
  'canary_release_control',
  'auto_schema_migration_rollback',
  'data_partitioning_large_tables',
  'cold_storage_archive_strategy',
  'edge_caching_with_invalidation_rules',
] as const
const RESELLER_FEATURE_KEY_SET = new Set<string>([
  ...FINAL_RESELLER_GAP_FEATURE_KEYS,
  ...FINAL_ULTRA_LAYER_FEATURE_KEYS,
])

function invalidateProductCache() {
  productListCache.data = null
  productListCache.expiresAt = 0
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeFeatureKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of input) {
    const key = String(item || '').trim()
    if (!key || seen.has(key) || !RESELLER_FEATURE_KEY_SET.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

function parseSelectedFeatures(input: unknown): { provided: boolean; valid: boolean; features: string[] } {
  if (input === undefined || input === null) {
    return { provided: false, valid: true, features: [] }
  }
  if (!Array.isArray(input)) {
    return { provided: true, valid: false, features: [] }
  }
  const normalizedRaw = Array.from(
    new Set(
      input
        .map((item) => String(item || '').trim())
        .filter((key) => key.length > 0)
    )
  )
  const hasInvalid = normalizedRaw.some((key) => !RESELLER_FEATURE_KEY_SET.has(key))
  if (hasInvalid) {
    return { provided: true, valid: false, features: [] }
  }
  return { provided: true, valid: true, features: normalizedRaw }
}

function generateIdempotencyKey() {
  return crypto.randomUUID()
}

function reqIdempotencyFromMeta(meta: any) {
  if (!meta || typeof meta !== 'object') return null
  return meta.idempotency_key || meta.idempotencyKey || null
}

function timingSafeEqualText(a: string, b: string) {
  const enc = new TextEncoder()
  const ab = enc.encode(String(a || ''))
  const bb = enc.encode(String(b || ''))
  const maxLen = Math.max(ab.length, bb.length)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < maxLen; i++) {
    const av = i < ab.length ? ab[i] : 0
    const bv = i < bb.length ? bb[i] : 0
    diff |= av ^ bv
  }
  return diff === 0
}

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let key = ''
  for (let j = 0; j < 4; j++) {
    if (j > 0) key += '-'
    for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return key
}

function toMoney(value: number) {
  return Number((value || 0).toFixed(2))
}

function validateRequired(body: any, fields: string[]) {
  for (const f of fields) {
    if (body?.[f] === undefined || body?.[f] === null || body?.[f] === '') {
      return `Missing field: ${f}`
    }
  }
  return null
}

function toPositiveNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizePhone(value: unknown) {
  return String(value || '').replace(/[^\d+]/g, '')
}

function isLikelyFakeEmail(email: string) {
  if (!email) return false
  const lower = email.toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lower)) return true
  const badTokens = ['test@', 'fake@', 'noreply@', 'example.com', 'mailinator', 'tempmail', '10minutemail']
  return badTokens.some((token) => lower.includes(token))
}

function isLikelyFakePhone(phone: string) {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return true
  if (/^(\d)\1+$/.test(digits)) return true
  if (digits === '12345678' || digits === '1234567890' || digits === '0000000000') return true
  return false
}

function readClientIp(req?: Request) {
  if (!req) return 'unknown'
  const forwarded = req.headers.get('x-forwarded-for') || ''
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(String(value || ''))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function maskApiToken(value: string) {
  const raw = String(value || '')
  if (!raw) return ''
  if (raw.length <= 10) return `${raw.slice(0, 2)}...${raw.slice(-2)}`
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`
}

function toCsvValue(value: unknown) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function toCsv(headers: string[], rows: Record<string, unknown>[]) {
  const headerLine = headers.map(toCsvValue).join(',')
  const lines = rows.map((row) => headers.map((h) => toCsvValue(row[h])).join(','))
  return [headerLine, ...lines].join('\n')
}

function safeKeywordsFromText(input: unknown) {
  const text = String(input || '')
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
  return Array.from(new Set(tokens)).slice(0, 12)
}

function getPageTitleFromUrl(url: string) {
  const segment = String(url || '')
    .split('/')
    .filter(Boolean)
    .pop() || 'home'
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildSeoMetaForPage(url: string, fallbackName?: string) {
  const pageName = (fallbackName || getPageTitleFromUrl(url) || 'Page').trim()
  const metaTitle = `${pageName} | SaaS Vala`
  const metaDescription = `Explore ${pageName} solutions with SaaS Vala. Get product details, pricing, support, and conversion-focused resources.`
  const keywords = safeKeywordsFromText(`${pageName} saas software automation reseller lead`)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pageName,
    url,
    description: metaDescription,
  }
  return { metaTitle, metaDescription, keywords, schema }
}

function relationMissing(message?: string) {
  return !!message && /relation\s+"?.+"?\s+does not exist/i.test(message)
}

async function getResellerProfileForUser(sb: any, userId: string) {
  const { data } = await sb
    .from('resellers')
    .select('id, user_id, is_active, status, credit_limit, credit_used')
    .eq('user_id', userId)
    .maybeSingle()
  return data || null
}

function isResellerSuspended(reseller: any) {
  if (!reseller) return false
  const status = String(reseller.status || '').toLowerCase()
  return reseller.is_active === false || status === 'suspended' || status === 'inactive'
}

async function syncResellerCreditUsed(admin: any, userId: string, balance: number) {
  const creditUsed = Math.max(0, Number(-balance || 0))
  await admin
    .from('resellers')
    .update({ credit_used: creditUsed })
    .eq('user_id', userId)
}

async function enforceRateLimit(sb: any, userId: string, endpoint: string) {
  const windowSeconds = RATE_LIMIT_WINDOW_SECONDS
  const maxRequests = RATE_LIMIT_MAX_REQUESTS
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowSeconds * 1000).toISOString()

  const { data: existing } = await sb.from('rate_limits').select('*')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('window_start', windowStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existing) {
    await sb.from('rate_limits').insert({
      user_id: userId,
      endpoint,
      requests_count: 1,
      window_start: now.toISOString(),
      window_seconds: windowSeconds,
      max_requests: maxRequests,
    })
    return null
  }

  const currentCount = Number(existing.requests_count || 0)
  if (currentCount >= Number(existing.max_requests || maxRequests)) {
    return err('Rate limit exceeded', 429, 'RATE_LIMITED')
  }

  await sb.from('rate_limits').update({ requests_count: currentCount + 1, updated_at: now.toISOString() }).eq('id', existing.id)
  return null
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await sb.auth.getClaims(token)
  if (error || !data?.claims) return null

  return { userId: data.claims.sub as string, supabase: sb }
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

async function getUserRoles(userId: string) {
  const admin = adminClient()
  const { data, error } = await admin.from('user_roles').select('role').eq('user_id', userId)
  if (error) return []
  return (data || []).map((r: any) => r.role)
}

async function isSuperAdminUser(userId: string) {
  const roles = await getUserRoles(userId)
  return roles.includes('super_admin')
}

function normalizeResellerStatus(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['active', 'suspended', 'pending', 'inactive'].includes(normalized)) return normalized
  return null
}

function normalizeKycStatus(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['pending', 'verified', 'rejected'].includes(normalized)) return normalized
  return null
}

function sanitizeSearchTerm(term: unknown) {
  return String(term || '').replace(/[%_,()[\]\\]/g, '').trim()
}

function sanitizeTextInput(value: unknown, max = 8000) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max)
}

function sanitizeSlug(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildGithubRepoUrl(slug: string, org = DEFAULT_GITHUB_ORG) {
  if (!slug) return ''
  return `https://github.com/${org}/${slug}`
}

async function emitPipelineEvent(
  admin: any,
  userId: string,
  eventType: 'builder_event' | 'debug_event' | 'fix_event' | 'deploy_event',
  stage: string,
  status: 'started' | 'success' | 'failed',
  details: Record<string, unknown> = {}
) {
  await logActivity(admin, 'pipeline_event', stage, eventType, userId, {
    stage,
    status,
    timestamp: nowIso(),
    ...details,
  })
}

function parseCommissionPercent(value: unknown, fallback: number | null = null) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (parsed === null) return { ok: false as const, error: 'commission_percent is required' }
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { ok: false as const, error: 'commission_percent must be between 0 and 100' }
  }
  return { ok: true as const, value: parsed }
}

function parseCreditLimit(value: unknown, fallback: number | null = null) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (parsed === null) return { ok: false as const, error: 'credit_limit is required' }
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false as const, error: 'credit_limit must be >= 0' }
  }
  return { ok: true as const, value: parsed }
}

async function logActivity(admin: any, entityType: string, entityId: string, action: string, userId: string, details: any = {}) {
  try {
    await admin.from('activity_logs').insert({
      entity_type: entityType,
      entity_id: entityId,
      action,
      performed_by: userId,
      details,
    })
  } catch (e) {
    console.error('Activity log failed:', e)
  }
}


}

function isApkVersionsTableMissing(message?: string) {
  return !!message && /relation\s+"?apk_versions"?\s+does not exist/i.test(message)
}

// ===================== 1. AUTH =====================
async function handleAuth(method: string, pathParts: string[], body: any, req: Request) {
  const action = pathParts[0]
  const admin = adminClient()

  // GET /auth/me
  if (method === 'GET' && action === 'me') {
    const auth = await authenticate(req)
    if (!auth) return err('Unauthorized', 401)

    const { data: profile } = await auth.supabase.from('profiles').select('*')
      .eq('user_id', auth.userId).maybeSingle()
    const { data: roles } = await admin.from('user_roles').select('role')
      .eq('user_id', auth.userId)

    return json({
      user_id: auth.userId,
      profile,
      roles: (roles || []).map((r: any) => r.role),
    })
  }

  // POST /auth/login — handled by Supabase SDK
  if (method === 'POST' && action === 'login') {
    return json({ message: 'Use Supabase SDK auth.signInWithPassword() directly' })
  }

  // POST /auth/register — handled by Supabase SDK
  if (method === 'POST' && action === 'register') {
    return json({ message: 'Use Supabase SDK auth.signUp() directly' })
  }

  // POST /auth/logout — handled by Supabase SDK
  if (method === 'POST' && action === 'logout') {
    return json({ message: 'Use Supabase SDK auth.signOut() directly' })
  }

  return err('Not found', 404)
}

// ===================== 2. PRODUCTS =====================
async function handleProducts(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const id = pathParts[0]

  // GET /products
  if (method === 'GET' && !id) {
    const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false })
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /products/categories
  if (method === 'GET' && id === 'categories') {
    const { data, error } = await sb.from('categories').select('*').eq('is_active', true).order('sort_order')
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /products/:id/versions
  if (method === 'GET' && id && pathParts[1] === 'versions') {
    const { data, error } = await sb.from('apk_versions').select('*').eq('apk_id', id).order('created_at', { ascending: false })
    if (error) {
      if (isApkVersionsTableMissing(error.message)) {
        console.warn(`apk_versions relation missing on /products/${id}/versions; returning empty versions list`)
        return json({ data: [] })
      }
      return err(error.message)
    }
    return json({ data })
  }

  // GET /products/:id
  if (method === 'GET' && id) {
    const { data, error } = await sb.from('products').select('*').eq('id', id).single()
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /products (create) or POST /products/upload
  if (method === 'POST') {
    if (id === 'upload') {
      // Upload handled — for now return placeholder
      return json({ message: 'Upload endpoint ready — use storage bucket directly' })
    }
    const slug = body.slug || body.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || ''
    const { data, error } = await sb.from('products').insert({
      name: body.name || '', slug,
      description: body.description || null,
      category_id: body.category_id?.trim() || null,
      status: body.status || 'draft',
      price: body.price || 0,
      currency: body.currency || 'INR',
      version: body.version || '1.0.0',
      features: body.features || [],
      created_by: userId,
      git_repo_url: body.git_repo_url || null,
      git_repo_name: body.git_repo_name || null,
      git_default_branch: body.git_default_branch || 'main',
      deploy_status: body.deploy_status || 'idle',
      marketplace_visible: body.marketplace_visible || false,
      demo_url: body.demo_url || null,
      live_url: body.live_url || null,
    }).select().single()
    if (error) return err(error.message)
    invalidateProductCache()
    await logActivity(admin, 'product', data.id, 'created', userId, { name: body.name })
    return json({ data }, 201)
  }

  // PUT /products/:id
  if (method === 'PUT' && id) {
    const updates = { ...body }
    if (updates.category_id !== undefined) {
      updates.category_id = updates.category_id?.trim() || null
    }
    const { error } = await sb.from('products').update(updates).eq('id', id)
    if (error) return err(error.message)
    invalidateProductCache()
    await logActivity(admin, 'product', id, 'updated', userId, updates)
    return json({ success: true })
  }

  // DELETE /products/:id
  if (method === 'DELETE' && id) {
    const { error } = await sb.from('products').delete().eq('id', id)
    if (error) return err(error.message)
    invalidateProductCache()
    await logActivity(admin, 'product', id, 'deleted', userId)
    return json({ success: true })
  }

  return err('Not found', 404)
}

// ===================== 3. RESELLERS =====================
async function handleResellers(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const id = pathParts[0]
  const isAdmin = await isSuperAdminUser(userId)

  // GET /resellers
  if (method === 'GET' && !id) {
    if (!isAdmin) return err('Forbidden', 403)
    const page = Number(body?.page || 1)
    const limit = Number(body?.limit || 25)
    const search = body?.search || ''

    let query = admin.from('resellers').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) {
      const safeSearch = sanitizeSearchTerm(search)
      if (safeSearch) {
        query = query.or(`company_name.ilike.%${safeSearch}%,status.ilike.%${safeSearch}%,kyc_status.ilike.%${safeSearch}%`)
      }
    }
    const { data, error, count } = await query
    if (error) return err(error.message)

    // Enrich with profiles
    const userIds = (data || []).map((r: any) => r.user_id).filter(Boolean)
    let profileMap: Record<string, any> = {}
    if (userIds.length > 0) {

    }

    const enriched = (data || []).map((r: any) => ({
      ...r,
      profile: profileMap[r.user_id] || null,
      company_name: r.company_name || profileMap[r.user_id]?.company_name || profileMap[r.user_id]?.full_name || 'Unnamed Reseller',

    }))

    return json({ data: enriched, total: count })
  }

  // GET /resellers/:id
  if (method === 'GET' && id && !pathParts[1]) {
    const { data: reseller, error } = await sb.from('resellers').select('*').eq('id', id).maybeSingle()
    if (error) return err(error.message)
    if (!reseller) return err('Reseller not found', 404)

    const { data: profile } = await sb
      .from('profiles')
      .select('user_id, full_name, company_name, phone')
      .eq('user_id', reseller.user_id)
      .maybeSingle()

    const [{ data: orders }, { data: keyRows }, { data: commissionRows }, { data: activityRows }] = await Promise.all([
      sb.from('orders')
        .select('id, amount, status, created_at')
        .eq('reseller_id', reseller.id)
        .order('created_at', { ascending: false })
        .limit(500),
      sb.from('license_keys')
        .select('id')
        .eq('reseller_id', reseller.id),
      sb.from('reseller_commission_logs')
        .select('amount')
        .eq('reseller_id', reseller.id),
      sb.from('activity_logs')
        .select('id, action, entity_type, entity_id, details, created_at, performed_by')
        .eq('entity_type', 'reseller')
        .eq('entity_id', reseller.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const totalSales = Number((orders || [])
      .filter((o: any) => o.status === 'success')
      .reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0))
    const totalCommission = Number((commissionRows || [])
      .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0))

    return json({
      data: {
        ...reseller,
        profile: profile || null,
        company_name: reseller.company_name || profile?.company_name || profile?.full_name || 'Unnamed Reseller',
        status: normalizeResellerStatus(reseller.status) || (reseller.is_active === false ? 'suspended' : 'active'),
        kyc_status: normalizeKycStatus(reseller.kyc_status) || (reseller.is_verified ? 'verified' : 'pending'),
      },
      stats: {
        total_sales: totalSales,
        total_commission: totalCommission,
        total_orders: (orders || []).length,
        total_keys: (keyRows || []).length,
      },
      logs: activityRows || [],
    })
  }

  // GET /resellers/:id/sales
  if (method === 'GET' && id && pathParts[1] === 'sales') {
    if (!isAdmin) return err('Forbidden', 403)
    const { data: reseller } = await sb.from('resellers').select('user_id').eq('id', id).single()
    if (!reseller) return err('Reseller not found', 404)
    const { data, error } = await sb.from('transactions').select('*')
      .eq('created_by', reseller.user_id).order('created_at', { ascending: false }).limit(50)
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /resellers/:id/detail
  if (method === 'GET' && id && pathParts[1] === 'detail') {
    if (!isAdmin) return err('Forbidden', 403)
    const { data: reseller, error: resellerError } = await admin
      .from('resellers')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (resellerError) return err(resellerError.message)
    if (!reseller) return err('Reseller not found', 404)

    const [profileRes, logsRes, clientsRes, ordersRes, commissionRes, keysRes] = await Promise.all([
      admin.from('profiles').select('user_id, full_name, phone, company_name').eq('user_id', reseller.user_id).maybeSingle(),
      admin
        .from('activity_logs')
        .select('id, action, entity_type, entity_id, details, performed_by, created_at')
        .eq('entity_type', 'reseller')
        .eq('entity_id', reseller.id)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('reseller_clients')
        .select('id, client_name, client_email, status, purchase_count, total_spent, last_purchase_at')
        .eq('reseller_id', reseller.id)
        .order('updated_at', { ascending: false })
        .limit(200),
      admin
        .from('orders')
        .select('id, amount, status, created_at, product_id, client_id')
        .eq('reseller_id', reseller.id)
        .order('created_at', { ascending: false })
        .limit(200),
      admin
        .from('reseller_commission_logs')
        .select('id, amount, commission_rate, status, order_id, created_at')
        .eq('reseller_id', reseller.id)
        .order('created_at', { ascending: false })
        .limit(200),
      admin
        .from('license_keys')
        .select('id, status, created_at, client_id')
        .eq('reseller_id', reseller.id)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    const totalSales = (ordersRes.data || [])
      .filter((o: any) => o.status === 'success')
      .reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0)
    const totalCommission = (commissionRes.data || [])
      .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0)

    return json({
      data: {
        ...reseller,
        company_name: reseller.company_name || profileRes.data?.company_name || profileRes.data?.full_name || 'Unnamed Reseller',
        profile: profileRes.data || null,
        stats: {
          total_sales: toMoney(totalSales),
          total_commission: toMoney(totalCommission),
          keys_generated: (keysRes.data || []).length,
          clients_total: (clientsRes.data || []).length,
          clients_active: (clientsRes.data || []).filter((c: any) => c.status === 'active').length,
          orders_total: (ordersRes.data || []).length,
        },
        logs: logsRes.data || [],
        clients: clientsRes.data || [],
        orders: ordersRes.data || [],
        commissions: commissionRes.data || [],
        keys: keysRes.data || [],
      },
    })
  }

  // GET /resellers/clients
  if (method === 'GET' && id === 'clients') {
    const { data: reseller } = await sb.from('resellers').select('id').eq('user_id', userId).maybeSingle()
    if (!reseller?.id) return json({ data: [], stats: { total_clients: 0, active_clients: 0, total_keys: 0 } })

    const { data: clients, error: clientsError } = await sb.from('clients')
      .select('*')
      .eq('reseller_id', reseller.id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (clientsError) return err(clientsError.message)

    const clientIds = (clients || []).map((c: any) => c.id)
    let keyRows: any[] = []
    if (clientIds.length > 0) {
      const { data: keyData } = await sb.from('license_keys')
        .select('id, client_id, created_at, status')
        .eq('reseller_id', reseller.id)
        .in('client_id', clientIds)
      keyRows = keyData || []
    }

    const keysByClient: Record<string, number> = {}
    const latestByClient: Record<string, string | null> = {}
    const latestByClientEpoch: Record<string, number> = {}
    for (const k of keyRows) {
      const cid = k.client_id
      if (!cid) continue
      keysByClient[cid] = (keysByClient[cid] || 0) + 1
      const createdAtEpoch = Date.parse(k.created_at)
      const prevEpoch = latestByClientEpoch[cid] || 0
      if (createdAtEpoch > prevEpoch) {
        latestByClientEpoch[cid] = createdAtEpoch
        latestByClient[cid] = k.created_at
      }
    }

    const data = (clients || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      keys: keysByClient[c.id] || 0,
      last_purchase: latestByClient[c.id] || null,
      status: 'active',
      created_at: c.created_at,
      updated_at: c.updated_at,
    }))

    const totalClients = data.length
    const totalKeys = keyRows.length
    return json({
      data,
      stats: {
        total_clients: totalClients,
        active_clients: totalClients,
        total_keys: totalKeys,
      },
    })
  }

  // POST /resellers
  if (method === 'POST') {
    if (!isAdmin) return err('Forbidden', 403)

    const { data, error } = await sb.from('resellers').insert({
      user_id: body.user_id,
      company_name: body.company_name,
      commission_percent: commissionPercent,

    return json({ data }, 201)
  }

  // PUT /resellers/:id
  if (method === 'PUT' && id) {
    if (!isAdmin) return err('Forbidden', 403)


    const updates: any = {}
    if (body.company_name !== undefined) updates.company_name = body.company_name
    if (body.commission_percent !== undefined) {

    return json({ success: true })
  }

  // GET /resellers/commission-logs
  if (method === 'GET' && id === 'commission-logs') {
    const { data: reseller } = await sb.from('resellers').select('id').eq('user_id', userId).maybeSingle()
    const resellerId = reseller?.id
    if (!resellerId) return json({ data: [] })
    const { data, error } = await sb.from('reseller_commission_logs').select('*')
      .eq('reseller_id', resellerId).order('created_at', { ascending: false }).limit(200)
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /resellers/clients
  if (method === 'GET' && id === 'clients') {
    const { data: reseller } = await sb.from('resellers').select('id').eq('user_id', userId).maybeSingle()
    if (!reseller?.id) return json({ data: [] })
    const { data: resellerState } = await admin
      .from('resellers')
      .select('status, is_active')
      .eq('id', reseller.id)
      .maybeSingle()
    if (resellerState && (resellerState.status !== 'active' || resellerState.is_active === false)) {
      return err('Reseller account suspended', 403, 'RESELLER_SUSPENDED')
    }
    const { data, error } = await sb.from('reseller_clients').select('*')
      .eq('reseller_id', reseller.id).order('updated_at', { ascending: false }).limit(500)
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /resellers/clients
  if (method === 'POST' && id === 'clients') {
    const missing = validateRequired(body, ['client_email'])
    if (missing) return err(missing)
    const { data: reseller } = await sb.from('resellers').select('id').eq('user_id', userId).maybeSingle()
    if (!reseller?.id) return err('Reseller profile not found', 404)
    const { data: resellerState } = await admin
      .from('resellers')
      .select('status, is_active')
      .eq('id', reseller.id)
      .maybeSingle()
    if (resellerState && (resellerState.status !== 'active' || resellerState.is_active === false)) {
      return err('Reseller account suspended', 403, 'RESELLER_SUSPENDED')
    }

    const payload = {
      reseller_id: reseller.id,
      client_email: String(body.client_email || '').trim().toLowerCase(),
      client_name: body.client_name || null,
      client_phone: body.client_phone || null,
      product_id: body.product_id || null,
      purchase_count: Number(body.purchase_count || 0),
      total_spent: Number(body.total_spent || 0),
      last_purchase_at: body.last_purchase_at || null,
      status: body.status || 'active',
      metadata: body.metadata || {},
    }

    const { data, error } = await sb
      .from('reseller_clients')
      .upsert(payload, { onConflict: 'reseller_id,client_email' })
      .select()
      .single()
    if (error) return err(error.message)
    await logActivity(admin, 'reseller_client', data.id, 'upserted', userId, { reseller_id: reseller.id })
    return json({ data }, 201)
  }

  // GET /resellers/referrals
  if (method === 'GET' && id === 'referrals') {
    const { data: reseller } = await sb.from('resellers').select('id').eq('user_id', userId).maybeSingle()
    if (!reseller?.id) return json({ data: [] })
    const { data: resellerState } = await admin
      .from('resellers')
      .select('status, is_active')
      .eq('id', reseller.id)
      .maybeSingle()
    if (resellerState && (resellerState.status !== 'active' || resellerState.is_active === false)) {
      return err('Reseller account suspended', 403, 'RESELLER_SUSPENDED')
    }
    const { data, error } = await sb.from('referral_codes').select('*')
      .eq('reseller_id', reseller.id).order('created_at', { ascending: false }).limit(500)
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /resellers/referrals
  if (method === 'POST' && id === 'referrals') {
    const { data: reseller } = await sb.from('resellers').select('id').eq('user_id', userId).maybeSingle()
    if (!reseller?.id) return err('Reseller profile not found', 404)
    const { data: resellerState } = await admin
      .from('resellers')
      .select('status, is_active')
      .eq('id', reseller.id)
      .maybeSingle()
    if (resellerState && (resellerState.status !== 'active' || resellerState.is_active === false)) {
      return err('Reseller account suspended', 403, 'RESELLER_SUSPENDED')
    }

    const code = (body?.code || crypto.randomUUID().slice(0, 8)).toString().toUpperCase()
    const payload = {
      reseller_id: reseller.id,
      code,
      primary_code: body?.primary_code ?? false,
      referred_user_id: body?.referred_user_id || null,
      status: body?.status || 'pending',
      commission_earned: Number(body?.commission_earned || 0),
      signup_at: body?.signup_at || null,
      purchase_at: body?.purchase_at || null,
      metadata: body?.metadata || {},
    }

    const { data, error } = await sb.from('referral_codes').insert(payload).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'referral_code', data.id, 'created', userId, { reseller_id: reseller.id, code })
    return json({ data }, 201)
  }

  return err('Not found', 404)
}

// ===================== 3B. RESELLER ONBOARDING =====================
async function handleResellerOnboarding(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]

  // POST /reseller/apply
  if (method === 'POST' && action === 'apply') {
    const businessName = String(body.business_name || '').trim()
    const contact = String(body.contact || '').trim()
    const notes = body.notes ? String(body.notes) : null

    if (!businessName || !contact) {
      return err('business_name and contact are required')
    }

    const roles = await getUserRoles(userId)
    if (roles.includes('reseller')) {
      return err('User is already a reseller', 409)
    }

    const { data: existing } = await admin
      .from('reseller_applications')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1)

    if ((existing || []).length > 0) {
      return err('A pending/approved reseller application already exists', 409)
    }

    const { data, error } = await admin
      .from('reseller_applications')
      .insert({
        user_id: userId,
        business_name: businessName,
        contact,
        notes,
        status: 'pending',
      })
      .select('*')
      .single()

    if (error) return err(error.message)
    await logActivity(admin, 'reseller_application', data.id, 'created', userId, { business_name: businessName })
    return json({ data }, 201)
  }

  // GET /reseller/applications
  if (method === 'GET' && action === 'applications') {
    const { data, error } = await sb
      .from('reseller_applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) return err(error.message)
    const normalized = (data || []).map((a: any) => ({
      ...a,
      features_checklist: normalizeFeatureKeys(a?.features_checklist),
    }))
    return json({ data: normalized })
  }

  return err('Not found', 404)
}

// ===================== 3C. ADMIN RESELLER APPLICATIONS =====================
async function handleAdminResellerApplications(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]

  const isAdmin = await isSuperAdminUser(userId)
  if (!isAdmin) return err('Forbidden', 403)

  // GET /admin/reseller-export
  if (method === 'GET' && action === 'reseller-export') {
    const type = String(body?.type || 'resellers')
    if (!['resellers', 'sales', 'commissions'].includes(type)) {
      return err('Invalid export type', 422, 'VALIDATION_ERROR')
    }

    if (type === 'resellers') {
      const { data, error } = await admin
        .from('resellers')
        .select('id,user_id,company_name,commission_percent,credit_limit,credit_used,is_active,is_verified,status,created_at')
        .order('created_at', { ascending: false })
      if (error) return err(error.message)
      const csv = toCsv(
        ['id', 'user_id', 'company_name', 'commission_percent', 'credit_limit', 'credit_used', 'is_active', 'is_verified', 'status', 'created_at'],
        (data || []) as Record<string, unknown>[],
      )
      return json({ filename: 'resellers.csv', csv })
    }

    if (type === 'sales') {
      const { data: resellerRows } = await admin.from('resellers').select('id,user_id,company_name')
      const resellerUserIds = (resellerRows || []).map((r: any) => r.user_id).filter(Boolean)
      const salesHeaders = ['id', 'created_by', 'amount', 'status', 'created_at', 'company_name']
      if (resellerUserIds.length === 0) return json({ filename: 'reseller-sales.csv', csv: toCsv(salesHeaders, []) })
      const { data: txRows, error } = await admin
        .from('transactions')
        .select('id,created_by,amount,status,created_at')
        .in('created_by', resellerUserIds)
        .order('created_at', { ascending: false })
      if (error) return err(error.message)
      const companyByUser: Record<string, string> = {}
      (resellerRows || []).forEach((r: any) => { companyByUser[r.user_id] = r.company_name || '' })
      const rows = (txRows || []).map((r: any) => ({
        ...r,
        company_name: companyByUser[r.created_by] || '',
      }))
      const csv = toCsv(salesHeaders, rows)
      return json({ filename: 'reseller-sales.csv', csv })
    }

    const { data, error } = await admin
      .from('reseller_commission_logs')
      .select('id,reseller_id,order_id,payment_id,commission_rate,amount,status,created_at')
      .order('created_at', { ascending: false })
    if (error) return err(error.message)
    const csv = toCsv(
      ['id', 'reseller_id', 'order_id', 'payment_id', 'commission_rate', 'amount', 'status', 'created_at'],
      (data || []) as Record<string, unknown>[],
    )
    return json({ filename: 'reseller-commissions.csv', csv })
  }

  // GET /admin/reseller-applications
  if (method === 'GET' && action === 'reseller-applications') {
    const page = Number(body?.page || 1)
    const limit = Number(body?.limit || 25)
    const status = body?.status ? String(body.status) : ''
    const search = body?.search ? String(body.search) : ''

    let query = admin
      .from('reseller_applications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status) query = query.eq('status', status)
    if (search) query = query.or(`business_name.ilike.%${search}%,contact.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) return err(error.message)

    const userIds = (data || []).map((r: any) => r.user_id).filter(Boolean)
    let profileMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, full_name, phone, company_name')
        .in('user_id', userIds)
      ;(profiles || []).forEach((p: any) => { profileMap[p.user_id] = p })
    }

    const enriched = (data || []).map((a: any) => ({
      ...a,
      features_checklist: normalizeFeatureKeys(a?.features_checklist),
      profile: profileMap[a.user_id] || null,
    }))

    return json({ data: enriched, total: count || 0 })
  }

  // POST /admin/reseller-approve
  if (method === 'POST' && action === 'reseller-approve') {
    const applicationId = String(body.application_id || '').trim()
    if (!applicationId) return err('application_id is required')

    const { data: application, error: appErr } = await admin
      .from('reseller_applications')
      .select('*')
      .eq('id', applicationId)
      .single()
    if (appErr || !application) return err('Application not found', 404)
    if (application.status !== 'pending') return err('Only pending applications can be approved', 409)

    const commissionPercent = Number(body.commission_percent ?? 10)
    const creditLimit = Number(body.credit_limit ?? 0)
    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      return err('commission_percent must be between 0 and 100', 422, 'VALIDATION_ERROR')
    }
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      return err('credit_limit must be >= 0', 422, 'VALIDATION_ERROR')
    }
    const tier = body.tier ? String(body.tier) : 'standard'
    const adminNotes = body.notes ? String(body.notes) : application.notes
    const selectedFeaturesPayload = parseSelectedFeatures(body.selected_features)
    if (!selectedFeaturesPayload.valid) {
      return err('selected_features must be an array of supported feature keys', 422, 'VALIDATION_ERROR')
    }
    const selectedFeatures = selectedFeaturesPayload.provided
      ? selectedFeaturesPayload.features
      : normalizeFeatureKeys(application.features_checklist)
    const termsVersion = String(body.terms_version || application.terms_version || 'v1').trim() || 'v1'
    const termsAcceptedAt = nowIso()

    const { error: roleError } = await admin
      .from('user_roles')
      .insert({ user_id: application.user_id, role: 'reseller' })
      .select('id')
    if (roleError && roleError.code !== '23505') {
      return err(roleError.message)
    }

    const { data: existingReseller } = await admin
      .from('resellers')
      .select('id')
      .eq('user_id', application.user_id)
      .maybeSingle()

    let resellerId = existingReseller?.id || null

    if (existingReseller?.id) {
      const { error: updateResellerError } = await admin
        .from('resellers')
        .update({
          company_name: application.business_name,
          commission_percent: commissionPercent,
          credit_limit: creditLimit,
          is_active: true,
          is_verified: true,
          tier,
          status: 'active',
        })
        .eq('id', existingReseller.id)
      if (updateResellerError) return err(updateResellerError.message)
    } else {
      const { data: createdReseller, error: createResellerError } = await admin
        .from('resellers')
        .insert({
          user_id: application.user_id,
          company_name: application.business_name,
          commission_percent: commissionPercent,
          credit_limit: creditLimit,
          is_active: true,
          is_verified: true,
          tier,
          status: 'active',
        })
        .select('id')
        .single()
      if (createResellerError) return err(createResellerError.message)
      resellerId = createdReseller?.id || null
    }

    if (!resellerId) {
      const { data: resellerRow, error: resellerFetchErr } = await admin
        .from('resellers')
        .select('id')
        .eq('user_id', application.user_id)
        .maybeSingle()
      if (resellerFetchErr || !resellerRow?.id) return err(resellerFetchErr?.message || 'Reseller profile not found', 404)
      resellerId = resellerRow.id
    }

    const featureRows = Array.from(RESELLER_FEATURE_KEY_SET).map((featureKey) => ({
      reseller_id: resellerId,
      feature_key: featureKey,
      enabled: selectedFeatures.includes(featureKey),
      source: 'application_review',
    }))
    const { error: featureUpsertErr } = await admin
      .from('reseller_feature_flags')
      .upsert(featureRows, { onConflict: 'reseller_id,feature_key' })
    if (featureUpsertErr) return err(featureUpsertErr.message)

    const { error: termsLogErr } = await admin
      .from('reseller_terms_acceptance_logs')
      .insert({
        application_id: application.id,
        reseller_id: resellerId,
        reseller_user_id: application.user_id,
        accepted_by: userId,
        terms_version: termsVersion,
        accepted_at: termsAcceptedAt,
        metadata: {
          selected_features: selectedFeatures,
        },
      })
    if (termsLogErr) return err(termsLogErr.message)

    const { error: appUpdateErr } = await admin
      .from('reseller_applications')
      .update({
        status: 'approved',
        notes: adminNotes,
        features_checklist: selectedFeatures,
        terms_version: termsVersion,
        terms_accepted_at: termsAcceptedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', application.id)
    if (appUpdateErr) return err(appUpdateErr.message)

    await logActivity(admin, 'reseller_application', application.id, 'approved', userId, {
      applicant_user_id: application.user_id,
      tier,
      commission_percent: commissionPercent,
      selected_features: selectedFeatures,
      terms_version: termsVersion,
    })

    return json({ success: true })
  }

  // POST /admin/reseller-reject
  if (method === 'POST' && action === 'reseller-reject') {
    const applicationId = String(body.application_id || '').trim()
    const reason = String(body.reason || '').trim()
    if (!applicationId || !reason) return err('application_id and reason are required')

    const { data: application, error: appErr } = await admin
      .from('reseller_applications')
      .select('*')
      .eq('id', applicationId)
      .single()
    if (appErr || !application) return err('Application not found', 404)
    if (application.status !== 'pending') return err('Only pending applications can be rejected', 409)

    const { error: appUpdateErr } = await admin
      .from('reseller_applications')
      .update({
        status: 'rejected',
        notes: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', application.id)
    if (appUpdateErr) return err(appUpdateErr.message)

    await logActivity(admin, 'reseller_application', application.id, 'rejected', userId, {
      applicant_user_id: application.user_id,
      reason,
    })

    return json({ success: true })
  }

  return err('Not found', 404)
}

// ===================== 4. MARKETPLACE ADMIN =====================
async function handleMarketplace(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]

  // GET /marketplace/products
  if (method === 'GET' && action === 'products') {
    const cacheValid = productListCache.data && Date.now() < productListCache.expiresAt
    if (cacheValid) return json({ data: productListCache.data, cached: true })

    const { data, error } = await sb.from('products')
      .select('id, name, slug, description, short_description, price, status, features, thumbnail_url, git_repo_url, marketplace_visible, apk_url, demo_url, demo_login, demo_password, demo_enabled, featured, trending, business_type, deploy_status, discount_percent, rating, tags, apk_enabled, license_enabled')
      .eq('marketplace_visible', true)
      .order('created_at', { ascending: false }).limit(500)
    if (error) return err(error.message)
    productListCache.data = data || []
    productListCache.expiresAt = Date.now() + PRODUCT_LIST_CACHE_TTL_MS
    return json({ data })
  }

  // PUT /marketplace/approve
  if (method === 'PUT' && action === 'approve') {
    const { error } = await sb.from('products').update({ status: 'active', marketplace_visible: true }).eq('id', body.product_id)
    if (error) return err(error.message)
    invalidateProductCache()
    await logActivity(admin, 'marketplace', body.product_id, 'approved', userId)
    return json({ success: true })
  }

  // GET /marketplace/orders
  if (method === 'GET' && action === 'orders') {
    const { data, error } = await sb.from('transactions').select('*').eq('reference_type', 'purchase')
      .order('created_at', { ascending: false }).limit(100)
    if (error) return err(error.message)
    return json({ data })
  }

  // PUT /marketplace/pricing
  if (method === 'PUT' && action === 'pricing') {
    const { error } = await sb.from('products').update({
      price: body.price,
      discount_percent: body.discount_percent,
    }).eq('id', body.product_id)
    if (error) return err(error.message)
    invalidateProductCache()
    await logActivity(admin, 'marketplace', body.product_id, 'pricing_updated', userId, body)
    return json({ success: true })
  }

  // GET /marketplace/order-history
  if (method === 'GET' && action === 'order-history') {
    const { data, error } = await sb.from('orders').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(200)
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /marketplace/download-history
  if (method === 'GET' && action === 'download-history') {
    const { data, error } = await sb.from('apk_downloads').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(200)
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /marketplace/payment/init
  if (method === 'POST' && action === 'payment' && pathParts[1] === 'init') {
    const missing = validateRequired(body, ['product_id', 'amount'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')

    const requestedIdempotency = body.idempotency_key || reqIdempotencyFromMeta(body.meta) || generateIdempotencyKey()
    const amount = Number(body.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')

    const { data: existingOrder } = await sb.from('orders').select('*').eq('idempotency_key', requestedIdempotency).maybeSingle()
    if (existingOrder) return json({ data: existingOrder, duplicate: true })

    const { data: productOwner } = await sb.from('products').select('created_by').eq('id', body.product_id).maybeSingle()
    if (!productOwner?.created_by) return err('Product not found or missing seller', 404, 'NOT_FOUND')
    const sellerId = productOwner.created_by

    const { data: marketplaceOrder, error: marketplaceOrderError } = await sb.from('marketplace_orders').insert({
      buyer_id: userId,
      seller_id: sellerId,
      amount,
      final_amount: amount,
      subtotal: amount,
      product_id: body.product_id,
      product_name: body.product_name || null,
      status: 'pending',
      payment_status: 'pending',
      payment_method: body.payment_method || 'gateway',
      idempotency_key: requestedIdempotency,
      retry_count: 0,
    }).select().single()
    if (marketplaceOrderError) {
      const { data: duplicateOrder } = await sb.from('orders').select('*').eq('idempotency_key', requestedIdempotency).maybeSingle()
      if (duplicateOrder) return json({ data: duplicateOrder, duplicate: true })
      return err(marketplaceOrderError.message)
    }

    const { data: order, error: orderError } = await sb.from('orders').insert({
      marketplace_order_id: marketplaceOrder.id,
      user_id: userId,
      product_id: body.product_id,
      amount,
      currency: body.currency || 'INR',
      status: 'pending',
      payment_method: body.payment_method || 'gateway',
      idempotency_key: requestedIdempotency,
      metadata: body.meta || {},
    }).select().single()
    if (orderError) {
      const { data: duplicateOrder } = await sb.from('orders').select('*').eq('idempotency_key', requestedIdempotency).maybeSingle()
      if (duplicateOrder) return json({ data: duplicateOrder, duplicate: true })
      return err(orderError.message)
    }

    const { data: payment, error: paymentError } = await sb.from('payments').insert({
      order_id: order.id,
      user_id: userId,
      amount,
      currency: body.currency || 'INR',
      gateway: body.gateway || 'manual',
      gateway_reference: body.gateway_reference || null,
      status: 'pending',
      idempotency_key: requestedIdempotency,
      metadata: body.meta || {},
    }).select().single()
    if (paymentError) return err(paymentError.message)

    if (body.lock_wallet === true || body.payment_method === 'wallet') {
      const { data: wallet } = await sb.from('wallets').select('id, balance, locked_balance').eq('user_id', userId).maybeSingle()
      if (wallet) {
        const available = Number(wallet.balance || 0) - Number(wallet.locked_balance || 0)
        if (available < amount) return err('Insufficient balance', 400, 'INSUFFICIENT_BALANCE')
        const lockedBefore = Number(wallet.locked_balance || 0)
        const lockedAfter = lockedBefore + amount
        await sb.from('wallets').update({ locked_balance: lockedAfter, updated_at: nowIso() }).eq('id', wallet.id)
        await sb.from('wallet_ledger').insert({
          wallet_id: wallet.id,
          user_id: userId,
          entry_type: 'lock',
          amount,
          balance_before: wallet.balance || 0,
          balance_after: wallet.balance || 0,
          reference_type: 'order',
          reference_id: order.id,
          metadata: { reason: 'payment_init_lock' },
        })
      }
    }

    await sb.from('async_jobs').insert({
      job_type: 'email',
      status: 'queued',
      payload: { kind: 'payment_init', user_id: userId, order_id: order.id, payment_id: payment.id },
    })

    await logActivity(admin, 'order', order.id, 'payment_init', userId, { idempotency_key: requestedIdempotency })
    return json({
      data: {
        order,
        payment,
        payment_status: 'pending',
        gateway_redirect_url: body.gateway_redirect_url || null,
      },
    }, 201)
  }

  // POST /marketplace/payment/webhook
  if (method === 'POST' && action === 'payment' && pathParts[1] === 'webhook') {
    const missing = validateRequired(body, ['provider', 'event_type'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')

    const eventId = body.event_id || null
    if (eventId) {
      const { data: existing } = await sb.from('webhooks').select('id').eq('provider', body.provider).eq('event_id', eventId).maybeSingle()
      if (existing) return json({ success: true, duplicate: true, webhook_id: existing.id })
    }

    const { data: payment } = body.payment_id
      ? await sb.from('payments').select('*').eq('id', body.payment_id).maybeSingle()
      : { data: null as any }

    const providedSignature = String(body.signature || '')
    const expectedSignature = Deno.env.get('PAYMENT_WEBHOOK_SECRET')
    if (!expectedSignature) return err('Webhook secret not configured', 503, 'CONFIG_ERROR')
    const signatureValid = timingSafeEqualText(providedSignature, expectedSignature)

    const { data: webhook, error: webhookError } = await sb.from('webhooks').insert({
      provider: body.provider,
      event_id: eventId,
      event_type: body.event_type,
      payment_id: payment?.id || null,
      order_id: payment?.order_id || body.order_id || null,
      status: signatureValid ? 'processed' : 'failed',
      signature_valid: signatureValid,
      attempts: 1,
      payload: body.payload || body,
      error_message: signatureValid ? null : 'Invalid signature',
      processed_at: signatureValid ? nowIso() : null,
    }).select().single()
    if (webhookError) return err(webhookError.message)

    if (!signatureValid) {
      await sb.from('async_jobs').insert({
        job_type: 'webhook_retry',
        status: 'queued',
        payload: { webhook_id: webhook.id, reason: 'invalid_signature' },
        run_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      })
      return err('Invalid webhook signature', 400, 'INVALID_SIGNATURE')
    }

    if (payment && (body.event_type === 'payment.success' || body.event_type === 'charge.succeeded')) {
      const result = await markPaymentSuccess(admin, sb, userId, payment)
      return json({ success: true, webhook: webhook.id, result })
    }

    if (payment && (body.event_type === 'payment.failed' || body.event_type === 'charge.failed')) {
      const retryCount = Number(payment.retry_count || 0) + 1
      await sb.from('payments').update({ status: 'failed', retry_count: retryCount, error_message: body.error_message || 'Payment failed', updated_at: nowIso() }).eq('id', payment.id)
      await sb.from('orders').update({ status: 'failed', retry_count: retryCount, updated_at: nowIso() }).eq('id', payment.order_id)
      if (payment.order_id) {
        const { data: ord } = await sb.from('orders').select('marketplace_order_id').eq('id', payment.order_id).maybeSingle()
        if (ord?.marketplace_order_id) {
          await sb.from('marketplace_orders').update({ payment_status: 'failed', retry_count: retryCount, payment_error: body.error_message || 'Payment failed' }).eq('id', ord.marketplace_order_id)
        }
      }
      await sb.from('async_jobs').insert({
        job_type: 'webhook_retry',
        status: retryCount < 3 ? 'queued' : 'failed',
        attempts: retryCount,
        payload: { payment_id: payment.id, event_type: body.event_type },
        run_at: new Date(Date.now() + retryCount * 60 * 1000).toISOString(),
      })
    }

    return json({ success: true, webhook: webhook.id })
  }

  // POST /marketplace/payment/verify-signature
  if (method === 'POST' && action === 'payment' && pathParts[1] === 'verify-signature') {
    const missing = validateRequired(body, ['provider', 'signature'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const expected = Deno.env.get('PAYMENT_WEBHOOK_SECRET')
    if (!expected) return err('Webhook secret not configured', 503, 'CONFIG_ERROR')
    const valid = String(body.signature) === expected
    return json({ valid })
  }

  // POST /marketplace/payment/mark-paid
  if (method === 'POST' && action === 'payment' && pathParts[1] === 'mark-paid') {
    const missing = validateRequired(body, ['payment_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const { data: payment, error } = await sb.from('payments').select('*').eq('id', body.payment_id).maybeSingle()
    if (error) return err(error.message)
    if (!payment) return err('Payment not found', 404, 'NOT_FOUND')
    const result = await markPaymentSuccess(admin, sb, userId, payment)
    return json({ success: true, result })
  }

  // POST /marketplace/payment/retry
  if (method === 'POST' && action === 'payment' && pathParts[1] === 'retry') {
    const missing = validateRequired(body, ['payment_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const { data: payment } = await sb.from('payments').select('*').eq('id', body.payment_id).maybeSingle()
    if (!payment) return err('Payment not found', 404, 'NOT_FOUND')
    const retryCount = Number(payment.retry_count || 0) + 1
    await sb.from('payments').update({ status: 'pending', retry_count: retryCount, updated_at: nowIso() }).eq('id', payment.id)
    await sb.from('orders').update({ retry_count: retryCount, updated_at: nowIso() }).eq('id', payment.order_id)
    await sb.from('async_jobs').insert({
      job_type: 'webhook_retry',
      status: 'queued',
      attempts: retryCount,
      payload: { payment_id: payment.id, source: 'manual_retry' },
      run_at: nowIso(),
    })
    return json({ success: true, retry_count: retryCount })
  }

  // POST /marketplace/payment/refund
  if (method === 'POST' && action === 'payment' && pathParts[1] === 'refund') {
    const missing = validateRequired(body, ['payment_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const { data: payment } = await sb.from('payments').select('*').eq('id', body.payment_id).maybeSingle()
    if (!payment) return err('Payment not found', 404, 'NOT_FOUND')
    const { data: order } = await sb.from('orders').select('*').eq('id', payment.order_id).maybeSingle()
    if (!order) return err('Order not found', 404, 'NOT_FOUND')

    await sb.from('payments').update({ status: 'refunded', updated_at: nowIso() }).eq('id', payment.id)
    await sb.from('orders').update({ status: 'refunded', updated_at: nowIso() }).eq('id', order.id)
    if (order.marketplace_order_id) {
      await sb.from('marketplace_orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('id', order.marketplace_order_id)
    }

    const { data: wallet } = await sb.from('wallets').select('id, balance').eq('user_id', order.user_id).maybeSingle()
    if (wallet) {
      const oldBalance = Number(wallet.balance || 0)
      const newBalance = oldBalance + Number(order.amount || 0)
      await sb.from('wallets').update({ balance: newBalance, updated_at: nowIso() }).eq('id', wallet.id)
      await sb.from('transactions').insert({
        wallet_id: wallet.id,
        type: 'refund',
        amount: Number(order.amount || 0),
        balance_after: newBalance,
        status: 'completed',
        description: 'Payment refund',
        reference_type: 'order_refund',
        reference_id: order.id,
        created_by: userId,
      })
      await sb.from('wallet_ledger').insert({
        wallet_id: wallet.id,
        user_id: order.user_id,
        entry_type: 'refund',
        amount: Number(order.amount || 0),
        balance_before: oldBalance,
        balance_after: newBalance,
        reference_type: 'order_refund',
        reference_id: order.id,
        metadata: { payment_id: payment.id },
      })
    }

    return json({ success: true })
  }

  // POST /marketplace/referrals/link
  if (method === 'POST' && action === 'referrals' && pathParts[1] === 'link') {
    const missing = validateRequired(body, ['ref_code'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')

    const refCode = String(body.ref_code || '').trim().toUpperCase()
    if (!refCode) return err('Invalid referral code', 422, 'VALIDATION_ERROR')

    const { data: existingMapping } = await admin
      .from('referrals')
      .select('id')
      .eq('referred_user_id', userId)
      .maybeSingle()
    if (existingMapping?.id) return err('User already has a referrer', 409, 'ALREADY_LINKED')

    const { data: referralCode, error: referralCodeError } = await admin
      .from('referral_codes')
      .select('id, code, reseller_id, referred_user_id, status')
      .eq('code', refCode)
      .maybeSingle()
    if (referralCodeError) return err(referralCodeError.message)
    if (!referralCode?.id || !referralCode.reseller_id) return err('Referral code not found', 404, 'NOT_FOUND')
    if (referralCode.referred_user_id && referralCode.referred_user_id !== userId) {
      return err('Referral code already used', 409, 'DUPLICATE_REFERRAL')
    }

    const { data: referrerReseller } = await admin
      .from('resellers')
      .select('id, user_id')
      .eq('id', referralCode.reseller_id)
      .maybeSingle()
    if (!referrerReseller?.user_id) return err('Referrer not found', 404, 'NOT_FOUND')
    if (referrerReseller.user_id === userId) return err('Self-referral is not allowed', 422, 'SELF_REFERRAL')

    const { data: insertedReferral, error: insertReferralError } = await admin
      .from('referrals')
      .insert({
        referrer_id: referrerReseller.user_id,
        referred_user_id: userId,
        code: refCode,
        status: 'pending',
      })
      .select()
      .single()
    if (insertReferralError) {
      if ((insertReferralError as any)?.code === '23505') {
        return err('User already has a referrer', 409, 'ALREADY_LINKED')
      }
      return err(insertReferralError.message)
    }

    await admin
      .from('referral_codes')
      .update({
        referred_user_id: userId,
        signup_at: nowIso(),
        status: 'active',
        updated_at: nowIso(),
      })
      .eq('id', referralCode.id)

    await logActivity(admin, 'referral', insertedReferral.id, 'linked', userId, {
      ref_code: refCode,
      referrer_id: referrerReseller.user_id,
    })

    return json({ data: insertedReferral }, 201)
  }

  return err('Not found', 404)
}

async function markPaymentSuccess(admin: any, sb: any, userId: string, payment: any) {
  if (!payment?.order_id) return null

  const { data: order } = await sb.from('orders').select('*').eq('id', payment.order_id).maybeSingle()
  if (!order) return null

  if (order.status === 'success') return { order, alreadyProcessed: true }

  const paidAt = nowIso()
  const actorUserId = order.user_id || userId

  await sb.from('payments').update({
    status: 'success',
    signature_verified: true,
    updated_at: paidAt,
  }).eq('id', payment.id)

  await sb.from('orders').update({
    status: 'success',
    updated_at: paidAt,
  }).eq('id', order.id)

  if (order.marketplace_order_id) {
    await sb.from('marketplace_orders').update({
      status: 'completed',
      payment_status: 'success',
      completed_at: paidAt,
    }).eq('id', order.marketplace_order_id)
  }

  const { data: existingSubscription } = await sb.from('subscriptions')
    .select('*')
    .eq('user_id', order.user_id)
    .eq('product_id', order.product_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let periodEnd = new Date()
  periodEnd.setDate(periodEnd.getDate() + 30)

  let subscriptionId = existingSubscription?.id || null
  if (existingSubscription) {
    const currentEnd = existingSubscription.current_period_end ? new Date(existingSubscription.current_period_end) : new Date()
    if (currentEnd > new Date()) {
      periodEnd = new Date(currentEnd.getTime())
      periodEnd.setDate(periodEnd.getDate() + 30)
    }
    await sb.from('subscriptions').update({
      status: 'active',
      auto_renew: true,
      failed_retry_count: 0,
      next_retry_at: null,
      last_payment_id: payment.id,
      last_renewal_attempt_at: paidAt,
      current_period_end: periodEnd.toISOString(),
      updated_at: paidAt,
    }).eq('id', existingSubscription.id)
  } else {
    const { data: newSubscription } = await sb.from('subscriptions').insert({
      user_id: order.user_id,
      product_id: order.product_id,
      plan_name: 'marketplace-default',
      status: 'active',
      billing_cycle: 'monthly',
      amount: order.amount,
      currency: order.currency || 'INR',
      current_period_start: paidAt,
      current_period_end: periodEnd.toISOString(),
      auto_renew: true,
      grace_period_days: 3,
      failed_retry_count: 0,
      max_failed_retries: 3,
      last_payment_id: payment.id,
      last_renewal_attempt_at: paidAt,
    }).select().single()
    subscriptionId = newSubscription?.id || null
  }

  const { data: wallet } = await sb.from('wallets').select('id, balance, locked_balance').eq('user_id', order.user_id).maybeSingle()
  if (wallet) {
    const locked = Number(wallet.locked_balance || 0)
    if (locked > 0) {
      const unlockAmount = Math.min(locked, Number(order.amount || 0))
      const nextLocked = Math.max(0, locked - unlockAmount)
      await sb.from('wallets').update({ locked_balance: nextLocked, updated_at: paidAt }).eq('id', wallet.id)
      await sb.from('wallet_ledger').insert({
        wallet_id: wallet.id,
        user_id: order.user_id,
        entry_type: 'unlock',
        amount: unlockAmount,
        balance_before: wallet.balance || 0,
        balance_after: wallet.balance || 0,
        reference_type: 'order',
        reference_id: order.id,
        metadata: { reason: 'payment_success_unlock' },
      })
    }
  }

  // Referral flow: user_signup(ref_code) -> map_referrer -> user_purchase -> commission_create -> credit_wallet
  const { data: referral } = await admin
    .from('referrals')
    .select('*')
    .eq('referred_user_id', order.user_id)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (referral?.id && referral.referrer_id && referral.referrer_id !== order.user_id) {
    const orderAmount = Number(order.amount || 0)
    const { data: existingCommission } = await admin
      .from('referral_commissions')
      .select('id, order_id')
      .eq('order_id', order.id)
      .maybeSingle()

    // anti-abuse: only reward once per order; order_id is unique in referral_commissions
    if (!existingCommission) {
      const { data: referrerReseller } = await admin
        .from('resellers')
        .select('id, commission_percent, commission_rate')
        .eq('user_id', referral.referrer_id)
        .maybeSingle()

      // Keep backward compatibility: legacy rows may still use commission_rate.
      const commissionRate = Number(
        referrerReseller?.commission_percent ?? referrerReseller?.commission_rate ?? DEFAULT_COMMISSION_RATE
      )
      const commissionAmount = toMoney((orderAmount * commissionRate) / 100)

      if (commissionAmount > 0) {
        const { data: createdCommission, error: createCommissionError } = await admin
          .from('referral_commissions')
          .insert({
            referral_id: referral.id,
            order_id: order.id,
            amount: commissionAmount,
            status: 'pending',
          })
          .select()
          .single()

        if (!createCommissionError && createdCommission?.id) {
          await admin
            .from('referrals')
            .update({ status: 'active', updated_at: paidAt })
            .eq('id', referral.id)

          await admin
            .from('referral_commissions')
            .update({ status: 'active', updated_at: paidAt })
            .eq('id', createdCommission.id)

          let walletId: string | null = null
          let oldBalance = 0
          const { data: referrerWallet } = await admin
            .from('wallets')
            .select('id, balance')
            .eq('user_id', referral.referrer_id)
            .maybeSingle()

          if (referrerWallet?.id) {
            walletId = referrerWallet.id
            oldBalance = Number(referrerWallet.balance || 0)
          } else {
            const { data: createdWallet } = await admin
              .from('wallets')
              .insert({ user_id: referral.referrer_id, balance: 0, currency: order.currency || 'INR' })
              .select('id, balance')
              .single()
            walletId = createdWallet?.id || null
            oldBalance = Number(createdWallet?.balance || 0)
          }

          if (walletId) {
            const newBalance = toMoney(oldBalance + commissionAmount)
            await admin.from('wallets').update({ balance: newBalance, updated_at: paidAt }).eq('id', walletId)

            await admin.from('transactions').insert({
              wallet_id: walletId,
              type: 'credit',
              amount: commissionAmount,
              balance_after: newBalance,
              status: 'completed',
              description: 'Referral commission credited',
              reference_type: 'referral_commission',
              reference_id: createdCommission.id,
              created_by: actorUserId,
            })

            await admin.from('wallet_ledger').insert({
              wallet_id: walletId,
              user_id: referral.referrer_id,
              entry_type: 'credit',
              amount: commissionAmount,
              balance_before: oldBalance,
              balance_after: newBalance,
              reference_type: 'referral_commission',
              reference_id: createdCommission.id,
              metadata: { referral_id: referral.id, order_id: order.id },
            })
          }

          await admin
            .from('referral_commissions')
            .update({ status: 'paid', updated_at: paidAt })
            .eq('id', createdCommission.id)

          await admin
            .from('referrals')
            .update({ status: 'paid', updated_at: paidAt })
            .eq('id', referral.id)

          await admin
            .from('referral_codes')
            .update({
              status: 'converted',
              commission_earned: commissionAmount,
              purchase_at: paidAt,
              updated_at: paidAt,
            })
            .eq('code', referral.code)

          await logActivity(admin, 'referral', referral.id, 'commission_paid', actorUserId, {
            order_id: order.id,
            referral_commission_id: createdCommission.id,
            amount: commissionAmount,
            rate: commissionRate,
          })
        }
      }
    }
  }

  let createdLicense: any = null
  if (order.product_id) {
    const { data: existingLicense } = await sb.from('license_keys').select('*')
      .filter('meta->>order_id', 'eq', order.id)
      .maybeSingle()
    if (existingLicense) {
      createdLicense = existingLicense
    } else {
      const { data: newLicense } = await sb.from('license_keys').insert({
        product_id: order.product_id,
        license_key: generateLicenseKey(),
        key_type: 'monthly',
        status: 'active',
        owner_email: null,
        owner_name: null,
        max_devices: 1,
        activated_devices: 0,
        activated_at: paidAt,
        expires_at: periodEnd.toISOString(),
        created_by: actorUserId,
        notes: 'Auto-generated after payment success',
        meta: { order_id: order.id, payment_id: payment.id, subscription_id: subscriptionId },
      }).select().single()
      createdLicense = newLicense
    }
    if (createdLicense?.id && order.marketplace_order_id) {
      await sb.from('marketplace_orders').update({ license_key_id: createdLicense.id }).eq('id', order.marketplace_order_id)
    }
  }

  await sb.from('async_jobs').insert([
    { job_type: 'email', status: 'queued', payload: { kind: 'payment_success', user_id: order.user_id, order_id: order.id } },
  ])
  await logActivity(admin, 'payment', payment.id, 'marked_paid', actorUserId, { order_id: order.id })

  return { order_id: order.id, subscription_id: subscriptionId, license_key: createdLicense?.license_key || null }
}

// ===================== 5. KEYS =====================
async function handleKeys(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]
  const subAction = pathParts[1]

  // GET /keys
  if (method === 'GET' && !action) {
    const { data, error } = await sb.from('license_keys').select('*').order('created_at', { ascending: false })
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /keys/generate
  if (method === 'POST' && action === 'generate') {

    const quantity = Number(body.quantity || 1)
    const useAtomicFlow = quantity > 1 || !!body.client_name || !!body.idempotency_key || !!body.cost_per_key || !!body.min_balance
    const { data: resellerState } = await admin
      .from('resellers')
      .select('id, status, is_active')
      .eq('user_id', userId)
      .maybeSingle()
    if (resellerState && (resellerState.status !== 'active' || resellerState.is_active === false)) {
      return err('Reseller account suspended', 403, 'RESELLER_SUSPENDED')
    }

    if (useAtomicFlow) {
      const rpcPayload = {
        p_product_id: body.product_id,
        p_client_name: body.client_name || body.owner_name || '',
        p_client_email: body.client_email || body.owner_email || null,
        p_client_phone: body.client_phone || null,
        p_quantity: quantity,
        p_cost_per_key: Number(body.cost_per_key || 5),
        p_min_balance: Number(body.min_balance || 50),
        p_idempotency_key: body.idempotency_key || null,
        p_key_type: body.key_type || 'yearly',
        p_expires_at: body.expires_at || null,
      }

      const { data: rpcData, error: rpcError } = await sb.rpc('generate_reseller_keys_atomic', rpcPayload)
      if (rpcError) return err(rpcError.message)
      if (!rpcData?.success) {
        return json({
          error: rpcData?.message || 'Atomic key generation failed',
          code: rpcData?.code || 'ATOMIC_GENERATION_FAILED',
          deficit: rpcData?.deficit ?? null,
          minimum_balance: rpcData?.minimum_balance ?? null,
          balance: rpcData?.balance ?? null,
          available: rpcData?.available ?? null,
          required_total: rpcData?.required_total ?? null,
        }, 422)
      }

      return json({
        data: {
          idempotency_key: rpcData.idempotency_key,
          order_id: rpcData.order_id,
          client_id: rpcData.client_id,
          quantity: rpcData.quantity,
          total_cost: rpcData.total_cost,
          commission_amount: rpcData.commission_amount,
          commission_rate: rpcData.commission_rate,
          keys: rpcData.keys || [],
        },
        duplicate: rpcData.duplicate === true,
      }, 201)
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let key = ''
    for (let j = 0; j < 4; j++) {
      if (j > 0) key += '-'
      for (let i = 0; i < 4; i++) key += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const licenseKey = body.license_key || key
    const { data, error } = await sb.from('license_keys').insert({
      product_id: body.product_id || '',
      license_key: licenseKey,
      key_type: body.key_type || 'yearly',
      status: body.status || 'active',
      owner_email: body.owner_email,
      owner_name: body.owner_name,
      max_devices: body.max_devices || 1,
      expires_at: body.expires_at,
      notes: body.notes,
      created_by: userId,
      reseller_id: body.reseller_id || null,
      client_id: body.client_id || null,
      idempotency_key: body.idempotency_key || null,
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', data.id, 'generated', userId, { key: licenseKey })
    return json({ data }, 201)
  }

  // POST /keys/validate
  if (method === 'POST' && action === 'validate') {
    const { data, error } = await admin.from('license_keys').select('*')
      .eq('license_key', body.license_key).single()
    if (error || !data) return err('Invalid license key', 404)
    const valid = data.status === 'active' && (!data.expires_at || new Date(data.expires_at) > new Date())
    return json({ valid, key: data })
  }

  // PUT /keys/:id/activate
  if (method === 'PUT' && action && subAction === 'activate') {
    const { error } = await sb.from('license_keys').update({ status: 'active' }).eq('id', action)
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', action, 'activated', userId)
    return json({ success: true })
  }

  // PUT /keys/:id/deactivate
  if (method === 'PUT' && action && subAction === 'deactivate') {
    const { error } = await sb.from('license_keys').update({ status: 'suspended' }).eq('id', action)
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', action, 'deactivated', userId)
    return json({ success: true })
  }

  // DELETE /keys/:id
  if (method === 'DELETE' && action) {
    const { error } = await sb.from('license_keys').delete().eq('id', action)
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', action, 'deleted', userId)
    return json({ success: true })
  }

  return err('Not found', 404)
}

// ===================== 6. SERVERS =====================
async function handleServers(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const segment = pathParts[0]
  const id = pathParts[1]
  const secondSegment = pathParts[1]
  const thirdSegment = pathParts[2]

  // GET /projects
  if (method === 'GET' && segment === 'projects' && !id) {
    const { data, error } = await sb.from('servers').select('*').order('created_at', { ascending: false })
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // POST /projects
  if (method === 'POST' && segment === 'projects') {
    const parsed = z.object({ name: z.string().min(1), git_repo: z.string().optional(), git_branch: z.string().optional() }).safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const subdomain = body.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 6)
    const { data, error } = await sb.from('servers').insert({
      name: body.name || '', subdomain,
      git_repo: body.git_repo, git_branch: body.git_branch || 'main',
      runtime: body.runtime || 'nodejs18', status: 'stopped',
      auto_deploy: body.auto_deploy ?? true, created_by: userId,
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'server', data.id, 'created', userId, { name: body.name })
    return ok(data, 201)
  }

  // GET /servers/:id
  if (method === 'GET' && segment === 'servers' && secondSegment && secondSegment !== 'status') {
    const { data, error } = await sb.from('servers').select('*').eq('id', secondSegment).maybeSingle()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    if (!data) return fail('Server not found', 404, 'NOT_FOUND')
    return ok(data)
  }

  // GET /servers/status
  if (method === 'GET' && segment === 'servers' && secondSegment === 'status') {
    const now = Date.now()
    if (serverStatusCache.data && serverStatusCache.expiresAt > now) {
      return ok(serverStatusCache.data)
    }
    const { data, error } = await sb.from('servers').select('id,name,status,subdomain,custom_domain,last_deploy_at,health_status').order('created_at', { ascending: false })
    if (error) return fail(error.message, 400, 'DB_ERROR')
    const payload = data || []
    serverStatusCache.data = payload
    serverStatusCache.expiresAt = now + SERVER_STATUS_CACHE_TTL_MS
    return ok(payload)
  }

  // POST /servers/start
  if (method === 'POST' && segment === 'servers' && secondSegment === 'start') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { error } = await sb.from('servers').update({ status: 'live' }).eq('id', parsed.data.server_id)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'server', parsed.data.server_id, 'started', userId)
    return ok({ server_id: parsed.data.server_id, status: 'live' })
  }

  // POST /servers/stop
  if (method === 'POST' && segment === 'servers' && secondSegment === 'stop') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { error } = await sb.from('servers').update({ status: 'stopped' }).eq('id', parsed.data.server_id)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'server', parsed.data.server_id, 'stopped', userId)
    return ok({ server_id: parsed.data.server_id, status: 'stopped' })
  }

  // POST /servers/restart
  if (method === 'POST' && segment === 'servers' && secondSegment === 'restart') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { error } = await sb.from('servers').update({ status: 'live', last_deploy_at: nowIso() }).eq('id', parsed.data.server_id)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'server', parsed.data.server_id, 'restarted', userId)
    return ok({ server_id: parsed.data.server_id, status: 'live' })
  }

  // GET /deploy-targets
  if (method === 'GET' && segment === 'deploy-targets') {
    const { data, error } = await sb.from('servers').select('id, name, subdomain, status').eq('status', 'live')
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // POST /deploy-targets
  if (method === 'POST' && segment === 'deploy-targets') {
    const { data, error } = await sb.from('servers').insert({
      name: body.name || '', subdomain: body.subdomain,
      status: 'stopped', created_by: userId,
      ip_address: body.ip_address, agent_url: body.agent_url,
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'deploy_target', data.id, 'created', userId)
    return ok(data, 201)
  }

  // POST /deploy/trigger
  if (method === 'POST' && segment === 'deploy' && id === 'trigger') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const serverId = parsed.data.server_id
    const { data, error } = await sb.from('deployments').insert({
      server_id: serverId, status: 'building', triggered_by: userId,
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await sb.from('servers').update({ status: 'deploying', last_deploy_at: new Date().toISOString() }).eq('id', serverId)
    await logActivity(admin, 'deployment', data.id, 'triggered', userId, { server_id: serverId })
    return ok(data)
  }

  // POST /deploy/start | /deploy/redeploy
  if (method === 'POST' && segment === 'deploy' && (id === 'start' || id === 'redeploy')) {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { data, error } = await sb.from('deployments').insert({
      server_id: parsed.data.server_id, status: 'building', triggered_by: userId,
      commit_message: id === 'redeploy' ? 'Redeploy requested' : 'Deploy requested',
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await sb.from('servers').update({ status: 'deploying', last_deploy_at: nowIso() }).eq('id', parsed.data.server_id)
    await logActivity(admin, 'deployment', data.id, id === 'redeploy' ? 'redeployed' : 'started', userId, { server_id: parsed.data.server_id })
    return ok(data)
  }

  // POST /deploy/rollback
  if (method === 'POST' && segment === 'deploy' && id === 'rollback') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { data: latestSuccess, error: latestError } = await sb.from('deployments')
      .select('id, server_id').eq('server_id', parsed.data.server_id).eq('status', 'success')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (latestError) return fail(latestError.message, 400, 'DB_ERROR')
    if (!latestSuccess) return fail('No successful deployment found', 404, 'NOT_FOUND')
    const { error } = await sb.from('deployments').update({ status: 'rolled_back', completed_at: nowIso() }).eq('id', latestSuccess.id)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'deployment', latestSuccess.id, 'rollback', userId, { server_id: parsed.data.server_id })
    return ok({ deployment_id: latestSuccess.id, server_id: parsed.data.server_id, status: 'rolled_back' })
  }

  // POST /deploy/full
  if (method === 'POST' && segment === 'deploy' && id === 'full') {
    const pipelinePayload = {
      filePath: sanitizeTextInput(body?.filePath || body?.file_path || ''),
      hostingCredentials: body?.hostingCredentials || body?.hosting_credentials || undefined,
      deploymentId: sanitizeTextInput(body?.deploymentId || body?.deployment_id || '', 120) || undefined,
    }
    if (!pipelinePayload.filePath) return err('Missing field: filePath')

    await emitPipelineEvent(admin, userId, 'deploy_event', 'deploy_full', 'started', {
      file_path: pipelinePayload.filePath,
    })

    const { data, error } = await sb.functions.invoke('auto-deploy-pipeline', {
      body: pipelinePayload,
    })
    if (error) {
      await emitPipelineEvent(admin, userId, 'deploy_event', 'deploy_full', 'failed', { error: error.message })
      return err(error.message, 500)
    }

    await emitPipelineEvent(admin, userId, 'deploy_event', 'deploy_full', 'success', {
      deployment_id: data?.deploymentId || null,
      success: data?.success === true,
    })
    return json({ success: true, data })
  }

  // GET /deploy/status/:id
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'status' && pathParts[2]) {
    const { data, error } = await sb.from('deployments').select('*').eq('server_id', pathParts[2])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data)
  }

  // GET /deploy/status
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'status' && !pathParts[2]) {
    let query = sb.from('deployments').select('*').order('created_at', { ascending: false }).limit(50)
    if (body.server_id) query = query.eq('server_id', body.server_id)
    const { data, error } = await query
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // GET /deploy/logs/:id
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'logs' && pathParts[2]) {
    const { data, error } = await sb.from('deployment_logs').select('*').eq('deployment_id', pathParts[2])
      .order('timestamp', { ascending: true })
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // GET /deploy/history
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'history') {
    let query = sb.from('deployments').select('*').order('created_at', { ascending: false }).limit(100)
    if (body.server_id) query = query.eq('server_id', body.server_id)
    const { data, error } = await query
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // GET /deploy/logs
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'logs' && !pathParts[2]) {
    let query = sb.from('deployment_logs').select('*').order('timestamp', { ascending: true }).limit(500)
    if (body.deployment_id) query = query.eq('deployment_id', body.deployment_id)
    const serverId = body.server_id || pathParts[3]
    if (serverId) {
      const { data: deps } = await sb.from('deployments').select('id').eq('server_id', serverId).order('created_at', { ascending: false }).limit(20)
      const ids = (deps || []).map((d: any) => d.id)
      if (ids.length > 0) query = query.in('deployment_id', ids)
    }
    const { data, error } = await query
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // GET /deploy/logs/stream
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'logs' && pathParts[2] === 'stream') {
    let query = sb.from('deployment_logs').select('*').order('timestamp', { ascending: true }).limit(200)
    const serverId = body.server_id || pathParts[3]
    if (serverId) {
      const { data: deps } = await sb.from('deployments').select('id').eq('server_id', serverId).order('created_at', { ascending: false }).limit(5)
      const ids = (deps || []).map((d: any) => d.id)
      if (ids.length > 0) query = query.in('deployment_id', ids)
    }
    const { data, error } = await query
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // POST /domain/add
  if (method === 'POST' && segment === 'domain' && id === 'add') {
    const { data, error } = await sb.from('domains').insert({
      domain_name: body.domain_name, server_id: body.server_id,
      domain_type: body.domain_type || 'custom', created_by: userId,
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'domain', data.id, 'added', userId, { domain: body.domain_name })
    return ok(data, 201)
  }

  // POST /domain/verify
  if (method === 'POST' && segment === 'domain' && id === 'verify') {
    const { error } = await sb.from('domains').update({ dns_verified: true, dns_verified_at: new Date().toISOString() })
      .eq('id', body.domain_id)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'domain', body.domain_id, 'verified', userId)
    return ok({ domain_id: body.domain_id, verified: true })
  }

  // POST /dns/create
  if (method === 'POST' && segment === 'dns' && secondSegment === 'create') {
    const schema = z.object({
      server_id: z.string().min(1),
      type: z.string().default('A').optional(),
      value: z.string().min(1),
      name: z.string().default('@').optional(),
      status: z.string().default('pending').optional(),
    })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { data, error } = await sb.from('dns_records').insert({
      server_id: parsed.data.server_id,
      record_type: parsed.data.type || 'A',
      value: parsed.data.value,
      name: parsed.data.name || '@',
      status: parsed.data.status || 'pending',
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'dns_record', data.id, 'created', userId, { server_id: parsed.data.server_id })
    return ok(data, 201)
  }

  // POST /dns/verify
  if (method === 'POST' && segment === 'dns' && secondSegment === 'verify') {
    const schema = z.object({ id: z.string().optional(), domain_id: z.string().optional(), server_id: z.string().optional() })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    if (parsed.data.id) {
      const { error } = await sb.from('dns_records').update({ verified: true, verified_at: nowIso(), status: 'active' }).eq('id', parsed.data.id)
      if (error) return fail(error.message, 400, 'DB_ERROR')
      return ok({ id: parsed.data.id, verified: true })
    }
    if (parsed.data.domain_id) {
      const { error } = await sb.from('domains').update({ dns_verified: true, dns_verified_at: nowIso(), status: 'active' }).eq('id', parsed.data.domain_id)
      if (error) return fail(error.message, 400, 'DB_ERROR')
      return ok({ domain_id: parsed.data.domain_id, verified: true })
    }
    return fail('id or domain_id required', 422, 'VALIDATION_ERROR')
  }

  // GET /dns/status
  if (method === 'GET' && segment === 'dns' && secondSegment === 'status') {
    let query = sb.from('dns_records').select('*').order('created_at', { ascending: false }).limit(100)
    if (body.server_id) query = query.eq('server_id', body.server_id)
    const { data, error } = await query
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // POST /ssl/enable
  if (method === 'POST' && segment === 'ssl' && secondSegment === 'enable') {
    const schema = z.object({ domain_id: z.string().min(1) })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { error } = await sb.from('domains').update({ ssl_status: 'active', status: 'active' }).eq('id', parsed.data.domain_id)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'domain', parsed.data.domain_id, 'ssl_enabled', userId)
    return ok({ domain_id: parsed.data.domain_id, ssl_status: 'active' })
  }

  // POST /git/scan
  if (method === 'POST' && segment === 'git' && secondSegment === 'scan') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { data: server, error } = await sb.from('servers').select('id,name,git_repo,git_branch,auto_deploy').eq('id', parsed.data.server_id).maybeSingle()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    if (!server) return fail('Server not found', 404, 'NOT_FOUND')
    await logActivity(admin, 'git', parsed.data.server_id, 'scan', userId, { git_repo: server.git_repo || null })
    return ok({ server_id: parsed.data.server_id, scanned: true, repo: server.git_repo || null, branch: server.git_branch || 'main' })
  }

  // POST /git/deploy
  if (method === 'POST' && segment === 'git' && secondSegment === 'deploy') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { data, error } = await sb.from('deployments').insert({
      server_id: parsed.data.server_id,
      status: 'building',
      triggered_by: userId,
      commit_message: 'Git deploy triggered',
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await sb.from('servers').update({ status: 'deploying', last_deploy_at: nowIso() }).eq('id', parsed.data.server_id)
    await logActivity(admin, 'deployment', data.id, 'git_deploy', userId, { server_id: parsed.data.server_id })
    return ok(data, 201)
  }

  // GET /server/settings
  if (method === 'GET' && segment === 'server' && secondSegment === 'settings') {
    if (!body.server_id) return fail('server_id required', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb.from('server_settings').select('*').eq('server_id', body.server_id).maybeSingle()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || { server_id: body.server_id, auto_deploy: true, maintenance: false, paused: false, ddos: true })
  }

  // POST /server/settings/update
  if (method === 'POST' && segment === 'server' && secondSegment === 'settings' && thirdSegment === 'update') {
    const parsed = settingsUpdateSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const payload = {
      server_id: parsed.data.server_id,
      auto_deploy: parsed.data.auto_deploy ?? true,
      maintenance: parsed.data.maintenance ?? false,
      paused: parsed.data.paused ?? false,
      ddos: parsed.data.ddos ?? true,
    }
    const { data, error } = await sb.from('server_settings').upsert(payload, { onConflict: 'server_id' }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await sb.from('servers').update({ auto_deploy: payload.auto_deploy, status: payload.paused ? 'stopped' : 'live' }).eq('id', payload.server_id)
    await logActivity(admin, 'server_settings', payload.server_id, 'updated', userId, payload)
    return ok(data)
  }

  // GET /server/health
  if (method === 'GET' && segment === 'server' && id === 'health') {
    const { data, error } = await sb.from('servers').select('id, name, status, subdomain, custom_domain, health_status, uptime_percent')
    if (error) return fail(error.message, 400, 'DB_ERROR')
    const stats = {
      total: data?.length || 0,
      live: data?.filter((s: any) => s.status === 'live').length || 0,
      failed: data?.filter((s: any) => s.status === 'failed').length || 0,
      deploying: data?.filter((s: any) => s.status === 'deploying').length || 0,
    }
    return ok({ stats, servers: data })
  }

  return fail('Not found', 404, 'NOT_FOUND')
}

// ===================== 7. GITHUB =====================
async function handleGithub(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const action = pathParts[0]

  // GET /github/install-url
  if (method === 'GET' && action === 'install-url') {
    const clientId = Deno.env.get('GITHUB_CLIENT_ID')
    return json({ url: `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo` })
  }

  // POST /github/callback
  if (method === 'POST' && action === 'callback') {
    const clientId = Deno.env.get('GITHUB_CLIENT_ID')
    const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET')
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: body.code }),
    })
    const tokenData = await res.json()
    return json({ data: tokenData })
  }

  // GET /github/repos
  if (method === 'GET' && action === 'repos') {
    const token = Deno.env.get('SAASVALA_GITHUB_TOKEN')
    if (!token) return err('GitHub token not configured', 500)
    
    // Paginate to get all repos
    let allRepos: any[] = []
    let page = 1
    while (true) {
      const res = await fetch(`https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      })
      const repos = await res.json()
      if (!Array.isArray(repos) || repos.length === 0) break
      allRepos = allRepos.concat(repos)
      if (repos.length < 100) break
      page++
    }
    return json({ data: allRepos })
  }

  // POST /github/connect
  if (method === 'POST' && action === 'connect') {
    await logActivity(adminClient(), 'github', userId, 'connect', userId, { via: 'api' })
    return ok({ connected: true })
  }

  return fail('Not found', 404, 'NOT_FOUND')
}

// ===================== 8. GIT SCAN =====================
async function handleGit(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const action = pathParts[0]
  const admin = adminClient()

  // POST /git/scan-full
  if (method === 'POST' && action === 'scan-full') {
    const repoUrl = sanitizeTextInput(body?.repo_url || body?.repo || '')
    const scanData = {
      repo_url: repoUrl || null,
      include_security: body?.include_security !== false,
      include_performance: body?.include_performance !== false,
      include_unused: body?.include_unused !== false,
    }

    await emitPipelineEvent(admin, userId, 'builder_event', 'git_scan', 'started', {
      repo_url: repoUrl || null,
      mode: repoUrl ? 'single_repo' : 'org_scan',
      org: DEFAULT_GITHUB_ORG,
    })

    const sourceScan = await sb.functions.invoke('source-code-manager', {
      body: { action: 'scan_and_register', data: { repo_url: repoUrl || undefined } },
    })
    if (sourceScan.error) {
      await emitPipelineEvent(admin, userId, 'builder_event', 'git_scan', 'failed', { error: sourceScan.error.message })
      return err(sourceScan.error.message, 500)
    }

    const scanResult = sourceScan.data || {}
    const report = {
      missing_files: Array.isArray(scanResult?.missing_files) ? scanResult.missing_files : [],
      broken_imports: Array.isArray(scanResult?.broken_imports) ? scanResult.broken_imports : [],
      unused_code: Array.isArray(scanResult?.unused_code) ? scanResult.unused_code : [],
      security_issues: Array.isArray(scanResult?.security_issues) ? scanResult.security_issues : [],
      performance_issues: Array.isArray(scanResult?.performance_issues) ? scanResult.performance_issues : [],
    }

    await emitPipelineEvent(admin, userId, 'builder_event', 'git_scan', 'success', {
      scan: sourceScan.data,
      report_summary: {
        missing_files: report.missing_files.length,
        broken_imports: report.broken_imports.length,
        unused_code: report.unused_code.length,
        security_issues: report.security_issues.length,
        performance_issues: report.performance_issues.length,
      },
    })

    return json({
      success: true,
      data: {
        scan: sourceScan.data,
        report,
        input: scanData,
      },
    })
  }

  return err('Not found', 404)
}

// ===================== 9. SAAS AI =====================
async function handleAi(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const action = pathParts[0]
  const admin = adminClient()

  // POST /ai/run
  if (method === 'POST' && action === 'run') {
    const { data, error } = await sb.functions.invoke('ai-chat', { body: { ...body, user_id: userId } })
    if (error) return err(error.message, 500)
    return json({ data })
  }

  // GET /ai/models
  if (method === 'GET' && action === 'models') {
    const { data, error } = await sb.from('ai_models').select('*').eq('is_active', true).order('name')
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /ai/usage
  if (method === 'GET' && action === 'usage') {
    const { data, error } = await sb.from('ai_usage_daily').select('*')
      .eq('user_id', userId).order('date', { ascending: false }).limit(30)
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /ai/gateway
  if (method === 'POST' && action === 'gateway') {
    const autoPilot = body?.auto_pilot !== false
    const requestedModel = sanitizeTextInput(body?.model || '')
    const inputText = sanitizeTextInput(body?.input || body?.prompt || '')
    const messages = Array.isArray(body?.messages) ? body.messages : (inputText ? [{ role: 'user', content: inputText }] : [])
    if (!messages.length) return err('Missing AI input', 422, 'VALIDATION_ERROR')

    const incomingApiKey = String(reqIdempotencyFromMeta(body?.meta) || body?.api_key || '').trim()
    let apiKeyRow: any = null
    if (incomingApiKey) {
      const hashed = await sha256Hex(incomingApiKey)
      const { data: keyData } = await admin.from('ai_api_keys').select('*').eq('key_hash', hashed).maybeSingle()
      if (!keyData) return err('Invalid API key', 401, 'INVALID_API_KEY')
      if (keyData.status !== 'active') return err('API key inactive', 403, 'API_KEY_INACTIVE')
      if (keyData.expires_at && new Date(keyData.expires_at) <= new Date()) return err('API key expired', 403, 'API_KEY_EXPIRED')
      if (Number(keyData.total_limit || 0) > 0 && Number(keyData.used || 0) >= Number(keyData.total_limit || 0)) {
        return err('API key quota exceeded', 429, 'API_KEY_QUOTA_EXCEEDED')
      }
      const keyRateLimitRes = await enforceRateLimit(admin, userId, `ai-key/${keyData.id}`)
      if (keyRateLimitRes) return keyRateLimitRes
      apiKeyRow = keyData
    }

    const providers = [
      { name: 'openai', enabled: true, invoke: () => sb.functions.invoke('ai-chat', { body: { messages, model: requestedModel || 'openai/gpt-5-mini', stream: false, user_id: userId } }) },
      { name: 'elevenlabs_tts', enabled: !!body?.tts_text, invoke: () => sb.functions.invoke('elevenlabs-tts', { body: { text: sanitizeTextInput(body?.tts_text || ''), voiceId: body?.voice_id, returnBase64: true } }) },
    ]

    const preferredOrder = autoPilot
      ? providers
      : [
        ...providers.filter((p) => p.name === requestedModel || p.name === body?.provider),
        ...providers.filter((p) => p.name !== requestedModel && p.name !== body?.provider),
      ]
    const requestedProvider = sanitizeTextInput(body?.provider || requestedModel || '')

    let providerName = ''
    let providerResponse: any = null
    let lastError = ''
    for (const provider of preferredOrder) {
      if (!provider.enabled) continue
      try {
        const result = await provider.invoke()
        if (result?.error) {
          lastError = result.error.message || `${provider.name} failed`
          await admin.from('activity_logs').insert({
            entity_type: 'api_error_event',
            entity_id: provider.name,
            action: 'provider_failed',
            performed_by: userId,
            details: { provider: provider.name, error: lastError, source: 'ai_gateway_failover' },
          })
          continue
        }
        providerName = provider.name
        providerResponse = result?.data || null
        break
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
        await admin.from('activity_logs').insert({
          entity_type: 'api_error_event',
          entity_id: provider.name,
          action: 'provider_failed',
          performed_by: userId,
          details: { provider: provider.name, error: lastError, source: 'ai_gateway_exception' },
        })
      }
    }

    if (!providerResponse) return err(lastError || 'No provider available', 503, 'AI_PROVIDER_UNAVAILABLE')

    const usage = providerResponse?.usage || {}
    const inputTokens = toPositiveNumber(usage?.prompt_tokens ?? usage?.input_tokens ?? body?.estimated_input_tokens, 0)
    const outputTokens = toPositiveNumber(usage?.completion_tokens ?? usage?.output_tokens ?? body?.estimated_output_tokens, 0)
    const totalTokens = inputTokens + outputTokens

    let selectedModelId = requestedModel || body?.model || providerResponse?.model || providerName
    let modelCost = Number((totalTokens * 0.00001).toFixed(6))
    const { data: modelRow } = await admin.from('ai_models').select('*').eq('model_id', selectedModelId).maybeSingle()
    if (modelRow) {
      modelCost = ((Number(modelRow.input_cost_per_1k || 0) * inputTokens) + (Number(modelRow.output_cost_per_1k || 0) * outputTokens)) / 1000
      selectedModelId = modelRow.model_id
    }

    const { data: wallet } = await admin.from('wallets').select('id, balance').eq('user_id', userId).maybeSingle()
    if (!wallet) return err('Wallet not found', 404)
    const available = Number(wallet.balance || 0)
    if (available < modelCost) return err('Insufficient balance', 402, 'LOW_BALANCE')

    const newBalance = Number(wallet.balance || 0) - modelCost
    const txInsert = await admin.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'debit',
      amount: modelCost,
      balance_after: newBalance,
      status: 'completed',
      description: `AI gateway usage (${selectedModelId})`,
      created_by: userId,
      reference_type: 'ai_gateway',
      reference_id: crypto.randomUUID(),
      meta: { provider: providerName, model: selectedModelId, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens },
    }).select('id').single()
    if (txInsert.error) return err(txInsert.error.message)

    await admin.from('wallets').update({ balance: newBalance, updated_at: nowIso() }).eq('id', wallet.id)
    await admin.from('wallet_ledger').insert({
      wallet_id: wallet.id,
      user_id: userId,
      entry_type: 'debit',
      amount: modelCost,
      balance_before: wallet.balance || 0,
      balance_after: newBalance,
      reference_type: 'ai_gateway',
      reference_id: txInsert.data?.id || null,
      metadata: { provider: providerName, model: selectedModelId, input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens },
    })

    await admin.from('ai_usage').insert({
      user_id: userId,
      model: selectedModelId,
      endpoint: body?.module || 'ai_gateway',
      tokens_input: inputTokens,
      tokens_output: outputTokens,
      cost: modelCost,
      session_id: body?.session_id || null,
    })

    const dailyDate = new Date().toISOString().slice(0, 10)
    const { data: dayRow } = await admin.from('ai_usage_daily').select('*')
      .eq('user_id', userId).eq('model', selectedModelId).eq('date', dailyDate).maybeSingle()
    if (!dayRow) {
      await admin.from('ai_usage_daily').insert({
        user_id: userId,
        model: selectedModelId,
        date: dailyDate,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        request_count: 1,
        total_cost: modelCost,
      })
    } else {
      await admin.from('ai_usage_daily').update({
        input_tokens: Number(dayRow.input_tokens || 0) + inputTokens,
        output_tokens: Number(dayRow.output_tokens || 0) + outputTokens,
        request_count: Number(dayRow.request_count || 0) + 1,
        total_cost: Number(dayRow.total_cost || 0) + modelCost,
        updated_at: nowIso(),
      }).eq('id', dayRow.id)
    }

    if (apiKeyRow?.id) {
      await admin.from('ai_api_keys').update({
        used: Number(apiKeyRow.used || 0) + 1,
        last_used_at: nowIso(),
      }).eq('id', apiKeyRow.id)
    }

    await admin.from('activity_logs').insert({
      entity_type: 'ai_usage_event',
      entity_id: selectedModelId,
      action: 'usage_logged',
      performed_by: userId,
      details: { provider: providerName, tokens: totalTokens, cost: modelCost },
    })
    await admin.from('activity_logs').insert({
      entity_type: 'billing_event',
      entity_id: wallet.id,
      action: 'wallet_deducted',
      performed_by: userId,
      details: { amount: modelCost, balance_after: newBalance, model: selectedModelId },
    })

    return json({
      success: true,
      data: providerResponse,
      routing: { auto_pilot: autoPilot, provider: providerName, model: selectedModelId, fallback_used: !!requestedProvider && providerName !== requestedProvider },
      billing: { deducted: modelCost, balance_after: newBalance },
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens },
    })
  }

  return err('Not found', 404)
}

// ===================== 13. AI CHAT =====================
async function handleChat(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  // POST /chat/send
  if (method === 'POST' && pathParts[0] === 'send') {
    const { data, error } = await sb.functions.invoke('ai-chat', {
      body: { ...body, user_id: userId },
    })
    if (error) return err(error.message, 500)
    return json({ data })
  }

  // GET /chat/history
  if (method === 'GET' && pathParts[0] === 'history') {
    const { data, error } = await sb.from('ai_requests').select('*, ai_responses(*)')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
    if (error) return err(error.message)
    return json({ data })
  }

  return err('Not found', 404)
}

// ===================== 14. AI API KEYS =====================
async function handleApiKeys(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()

  // POST /api-keys/create
  if (method === 'POST' && pathParts[0] === 'create') {
    const apiKey = `sk-vala-${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
    const { data, error } = await sb.from('ai_usage').insert({
      user_id: userId, model: body.model || 'default',
      endpoint: body.name || 'API Key', tokens_input: 0, tokens_output: 0,
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'api_key', data.id, 'created', userId)
    return json({ data: { ...data, api_key: apiKey } }, 201)
  }

  // GET /api-keys
  if (method === 'GET' && !pathParts[0]) {
    const { data, error } = await sb.from('ai_usage').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false })
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /api-keys/usage (or /api-usage mapped here)
  if (method === 'GET' && (pathParts[0] === 'usage')) {
    const { data, error } = await sb.from('ai_usage_daily').select('*')
      .eq('user_id', userId).order('date', { ascending: false }).limit(30)
    if (error) return err(error.message)
    return json({ data })
  }

  return err('Not found', 404)
}

async function handleManagedApiKeys(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]

  // POST /keys/create
  if (method === 'POST' && action === 'create') {
    const limitPerMin = Math.max(1, Number(body?.limit_per_min || 60))
    const totalLimit = Math.max(0, Number(body?.total_limit || 0))
    const expiresAt = body?.expires_at ? new Date(String(body.expires_at)).toISOString() : null
    const tokenPlain = `sk-vala-${crypto.randomUUID().replace(/-/g, '')}`
    const keyHash = await sha256Hex(tokenPlain)
    const actorRoles = await getUserRoles(userId)
    const isReseller = actorRoles.includes('reseller')
    const targetUserId = isReseller && body?.user_id ? String(body.user_id) : userId
    const ownerType = isReseller ? 'reseller' : 'user'

    const { data, error } = await admin.from('ai_api_keys').insert({
      user_id: targetUserId,
      owner_user_id: userId,
      owner_type: ownerType,
      key_hash: keyHash,
      key_prefix: tokenPlain.slice(0, 12),
      key_masked: maskApiToken(tokenPlain),
      limit_per_min: limitPerMin,
      total_limit: totalLimit,
      used: 0,
      expires_at: expiresAt,
      status: 'active',
      metadata: {
        label: sanitizeTextInput(body?.label || ''),
        module_access: Array.isArray(body?.module_access) ? body.module_access : [],
      },
    }).select('*').single()
    if (error) return err(error.message)

    await logActivity(admin, 'managed_api_key', data.id, 'created', userId, { target_user_id: targetUserId })
    return json({ data: { ...data, key: tokenPlain } }, 201)
  }

  // POST /keys/revoke
  if (method === 'POST' && action === 'revoke') {
    const keyId = String(body?.key_id || '').trim()
    if (!keyId) return err('key_id is required', 422, 'VALIDATION_ERROR')
    const actorRoles = await getUserRoles(userId)
    const isAdmin = actorRoles.includes('admin') || actorRoles.includes('super_admin')
    const isReseller = actorRoles.includes('reseller')
    const q = admin.from('ai_api_keys').select('*').eq('id', keyId)
    const { data: keyRow } = await (isAdmin ? q.maybeSingle() : isReseller ? q.eq('owner_user_id', userId).maybeSingle() : q.eq('user_id', userId).maybeSingle())
    if (!keyRow) return err('API key not found', 404)

    const { error } = await admin.from('ai_api_keys').update({ status: 'revoked', revoked_at: nowIso() }).eq('id', keyId)
    if (error) return err(error.message)
    await logActivity(admin, 'managed_api_key', keyId, 'revoked', userId)
    return json({ success: true })
  }

  // GET /keys/usage
  if (method === 'GET' && action === 'usage') {
    const keyId = String(body?.key_id || '').trim()
    const actorRoles = await getUserRoles(userId)
    const isAdmin = actorRoles.includes('admin') || actorRoles.includes('super_admin')
    const isReseller = actorRoles.includes('reseller')
    let query = admin.from('ai_api_keys').select('*').order('created_at', { ascending: false })
    if (!isAdmin && isReseller) query = query.eq('owner_user_id', userId)
    if (!isAdmin && !isReseller) query = query.eq('user_id', userId)
    if (keyId) query = query.eq('id', keyId)
    const { data, error } = await query
    if (error) return err(error.message)
    return json({ data })
  }

  return err('Not found', 404)
}

async function handleModels(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]
  const isSuperAdmin = await isSuperAdminUser(userId)

  // GET /models/list
  if (method === 'GET' && action === 'list') {
    const { data, error } = await sb.from('ai_models').select('*').order('provider').order('name')
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /models/update
  if (method === 'POST' && action === 'update') {
    if (!isSuperAdmin) return err('Forbidden', 403)
    const id = String(body?.id || '').trim()
    if (!id) return err('id is required', 422, 'VALIDATION_ERROR')

    const payload: Record<string, unknown> = {}
    if (body?.name !== undefined) payload.name = sanitizeTextInput(body.name, 120)
    if (body?.provider !== undefined) payload.provider = sanitizeTextInput(body.provider, 60)
    if (body?.model_id !== undefined) payload.model_id = sanitizeTextInput(body.model_id, 120)
    if (body?.description !== undefined) payload.description = sanitizeTextInput(body.description, 400)
    if (body?.is_active !== undefined) payload.is_active = !!body.is_active
    if (body?.input_cost_per_1k !== undefined) payload.input_cost_per_1k = toPositiveNumber(body.input_cost_per_1k, 0)
    if (body?.output_cost_per_1k !== undefined) payload.output_cost_per_1k = toPositiveNumber(body.output_cost_per_1k, 0)
    if (body?.max_tokens !== undefined) payload.max_tokens = Math.floor(toPositiveNumber(body.max_tokens, 0))
    if (body?.capabilities !== undefined) payload.capabilities = body.capabilities
    payload.updated_at = nowIso()

    const { data, error } = await admin.from('ai_models').update(payload).eq('id', id).select('*').single()
    if (error) return err(error.message)
    await logActivity(admin, 'ai_model', id, 'updated', userId, payload)
    return json({ data })
  }

  // POST /models/create
  if (method === 'POST' && action === 'create') {
    if (!isSuperAdmin) return err('Forbidden', 403)
    const modelId = sanitizeTextInput(body?.model_id || body?.name || '').toLowerCase().replace(/\s+/g, '-')
    const name = sanitizeTextInput(body?.name || '')
    const provider = sanitizeTextInput(body?.provider || '')
    if (!name || !provider || !modelId) return err('name, provider, model_id are required', 422, 'VALIDATION_ERROR')
    const { data, error } = await admin.from('ai_models').insert({
      name,
      provider,
      model_id: modelId,
      description: sanitizeTextInput(body?.description || ''),
      is_active: body?.is_active !== false,
      input_cost_per_1k: toPositiveNumber(body?.input_cost_per_1k, 0),
      output_cost_per_1k: toPositiveNumber(body?.output_cost_per_1k, 0),
      max_tokens: Math.floor(toPositiveNumber(body?.max_tokens, 0)),
      capabilities: body?.capabilities || null,
      is_default: false,
    }).select('*').single()
    if (error) return err(error.message)
    await logActivity(admin, 'ai_model', data.id, 'created', userId, { model_id: modelId })
    return json({ data }, 201)
  }

  // POST /models/delete
  if (method === 'POST' && action === 'delete') {
    if (!isSuperAdmin) return err('Forbidden', 403)
    const id = String(body?.id || '').trim()
    if (!id) return err('id is required', 422, 'VALIDATION_ERROR')
    const { error } = await admin.from('ai_models').delete().eq('id', id)
    if (error) return err(error.message)
    await logActivity(admin, 'ai_model', id, 'deleted', userId)
    return json({ success: true })
  }

  // POST /models/test
  if (method === 'POST' && action === 'test') {
    const model = sanitizeTextInput(body?.model || '')
    if (!model) return err('model is required', 422, 'VALIDATION_ERROR')
    const res = await sb.functions.invoke('ai-chat', {
      body: { user_id: userId, model, messages: [{ role: 'user', content: 'Health check: respond with OK' }] },
    })
    if (res.error) return err(res.error.message, 500)
    return json({ success: true, data: res.data })
  }

  return err('Not found', 404)
}

async function handleAiModule(method: string, pathParts: string[], body: any, userId: string, sb: any, moduleName: 'ads' | 'audience' | 'video' | 'social') {
  const action = pathParts[0] || 'run'

  if (method === 'GET' && action === 'usage') {
    const { data, error } = await sb.from('ai_usage_daily').select('*')
      .eq('user_id', userId)
      .ilike('model', `${moduleName}%`)
      .order('date', { ascending: false })
      .limit(30)
    if (error) return err(error.message)
    return json({ data })
  }

  if (method === 'POST') {
    let prompt = ''
    if (moduleName === 'ads') {
      prompt = sanitizeTextInput(body?.prompt || `Optimize Google Ads campaign. Goal: ${body?.goal || 'conversions'}. Audience: ${body?.audience || 'general'}. Budget: ${body?.budget || 'flexible'}.`)
    }
    if (moduleName === 'audience') {
      prompt = sanitizeTextInput(body?.prompt || `Discover target audience segments and interest mapping for: ${body?.business || 'SaaS business'}. Market: ${body?.market || 'global'}.`)
    }
    if (moduleName === 'video') {
      prompt = sanitizeTextInput(body?.prompt || `Create a video script and production steps for: ${body?.product || 'product'}. Tone: ${body?.tone || 'professional'}.`)
    }
    if (moduleName === 'social') {
      prompt = sanitizeTextInput(body?.prompt || `Create social posts for platforms ${Array.isArray(body?.platforms) ? body.platforms.join(', ') : 'linkedin, x, facebook'} with hashtags and CTA.`)
    }
    if (!prompt) return err('prompt is required', 422, 'VALIDATION_ERROR')

    return await handleAi('POST', ['gateway'], {
      auto_pilot: true,
      module: moduleName,
      model: body?.model || `${moduleName}-auto`,
      input: prompt,
      messages: [{ role: 'user', content: prompt }],
      api_key: body?.api_key,
      session_id: body?.session_id,
    }, userId, sb)
  }

  return err('Not found', 404)
}

// ===================== 15. AUTO-PILOT =====================
async function handleAuto(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()

  // POST /auto/run
  if (method === 'POST' && pathParts[0] === 'run') {
    const { data, error } = await sb.functions.invoke('ai-auto-pilot', { body })
    if (error) return err(error.message, 500)
    await logActivity(admin, 'auto_pilot', 'system', 'run_triggered', userId)
    return json({ data })
  }

  // GET /auto/tasks
  if (method === 'GET' && pathParts[0] === 'tasks') {
    const { data, error } = await sb.from('auto_software_queue').select('*')
      .order('created_at', { ascending: false }).limit(50)
    if (error) return err(error.message)
    return json({ data })
  }

  // PUT /auto/:id
  if (method === 'PUT' && pathParts[0]) {
    const { error } = await sb.from('auto_software_queue').update(body).eq('id', pathParts[0])
    if (error) return err(error.message)
    await logActivity(admin, 'auto_task', pathParts[0], 'updated', userId)
    return json({ success: true })
  }

  return err('Not found', 404)
}

// ===================== 16. APK PIPELINE =====================
async function handleApk(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()

  // POST /apk/build
  if (method === 'POST' && pathParts[0] === 'build') {
    const { data, error } = await sb.from('apk_build_queue').insert({
      repo_name: body.repo_name, repo_url: body.repo_url,
      slug: body.slug || body.repo_name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'unnamed',
      build_status: 'pending',
      target_industry: body.target_industry, product_id: body.product_id,
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'apk', data.id, 'build_queued', userId, { repo: body.repo_name })
    return json({ data }, 201)
  }

  // GET /apk/history
  if (method === 'GET' && pathParts[0] === 'history') {
    const { data, error } = await sb.from('apk_build_queue').select('*')
      .order('created_at', { ascending: false }).limit(50)
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /apk/download/:id
  if (method === 'GET' && pathParts[0] === 'download' && pathParts[1]) {
    const { data: apk, error } = await admin.from('apks').select('file_url, product_id')
      .eq('id', pathParts[1]).single()
    if (error || !apk?.file_url) return err('APK not found', 404)

    const { data: signedUrl } = await admin.storage.from('apks')
      .createSignedUrl(apk.file_url, 300)
    if (!signedUrl?.signedUrl) return err('Failed to generate download URL', 500)

    await admin.from('apk_download_logs').insert({
      product_id: apk.product_id, user_id: userId, license_key: body?.license_key || 'direct',
    })

    return json({ url: signedUrl.signedUrl })
  }

  return err('Not found', 404)
}

async function creditWalletRequestIdempotent(admin: any, reqRow: any, actorUserId: string, creditSource: string) {
  const creditedAt = nowIso()
  const { data: wallet } = await admin.from('wallets').select('id, balance, locked_balance').eq('user_id', reqRow.user_id).maybeSingle()
  if (!wallet) return { error: 'Wallet not found', status: 404 }

  const { data: existingTx } = await admin
    .from('transactions')
    .select('id, balance_after')
    .eq('reference_type', 'wallet_request_credit')
    .eq('reference_id', reqRow.id)
    .maybeSingle()

  let txId = existingTx?.id || reqRow.credited_tx_id || null
  const currentBalance = Number(wallet.balance || 0)
  let newBalance = currentBalance

  if (!existingTx) {
    newBalance = currentBalance + Number(reqRow.amount || 0)
    const { data: tx, error: txErr } = await admin.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'credit',
      amount: Number(reqRow.amount),
      balance_after: newBalance,
      status: 'completed',
      description: `Wallet funding approved via ${reqRow.method}`,
      reference_type: 'wallet_request_credit',
      reference_id: reqRow.id,
      created_by: actorUserId,
      source: creditSource,
      meta: {
        method: reqRow.method,
        txn_id: reqRow.txn_id,
        request_id: reqRow.id,
      },
    }).select('id').single()
    if (txErr) {
      const { data: recheckTx } = await admin
        .from('transactions')
        .select('id, balance_after')
        .eq('reference_type', 'wallet_request_credit')
        .eq('reference_id', reqRow.id)
        .maybeSingle()
      if (recheckTx?.id) {
        txId = recheckTx.id
        newBalance = Number(recheckTx.balance_after || currentBalance)
      } else {
        return { error: txErr.message, status: 400 }
      }
    } else {
      txId = tx?.id || null
      await admin.from('wallets').update({ balance: newBalance, updated_at: creditedAt }).eq('id', wallet.id)
      await admin.from('wallet_ledger').insert({
        wallet_id: wallet.id,
        user_id: reqRow.user_id,
        entry_type: 'credit',
        amount: Number(reqRow.amount),
        balance_before: currentBalance,
        balance_after: newBalance,
        reference_type: 'wallet_request_credit',
        reference_id: reqRow.id,
        metadata: {
          request_id: reqRow.id,
          method: reqRow.method,
          txn_id: reqRow.txn_id,
          source: creditSource,
        },
      })
    }
  }

  await admin.from('wallet_requests').update({
    status: 'approved',
    approved_by: actorUserId,
    approved_at: creditedAt,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    credited_tx_id: txId,
    metadata: { ...(reqRow.metadata || {}), credit_source: creditSource },
  }).eq('id', reqRow.id)

  return { txId, balance: newBalance, alreadyCredited: !!existingTx }
}

// ===================== 13. WALLET =====================
async function handleWallet(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]
  const isServiceWebhook = userId === 'system-webhook'
  const isAdmin = isServiceWebhook ? true : await isSuperAdminUser(userId)
  const resellerProfile = isServiceWebhook || isAdmin ? null : await getResellerProfileForUser(sb, userId)
  const resellerSuspended = isResellerSuspended(resellerProfile)

  // POST /wallet/webhook (external, no JWT)
  if (method === 'POST' && action === 'webhook') {
    const missing = validateRequired(body, ['method', 'txn_id', 'signature'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')

    const methodName = String(body.method || '').trim()
    if (!['upi', 'crypto'].includes(methodName)) return err('Unsupported webhook method', 422, 'VALIDATION_ERROR')

    const expected = Deno.env.get('WALLET_WEBHOOK_SECRET') || Deno.env.get('PAYMENT_WEBHOOK_SECRET')
    if (!expected) return err('Webhook secret not configured', 503, 'CONFIG_ERROR')
    const signatureValid = timingSafeEqualText(String(body.signature || ''), expected)
    if (!signatureValid) return err('Invalid webhook signature', 400, 'INVALID_SIGNATURE')

    const txnId = String(body.txn_id || '').trim()
    const { data: requestRow } = await admin.from('wallet_requests').select('*').eq('txn_id', txnId).maybeSingle()
    if (!requestRow) return err('Wallet request not found', 404, 'NOT_FOUND')
    if (requestRow.status === 'rejected') return err('Wallet request rejected', 409, 'INVALID_STATE')
    if (requestRow.method !== methodName) return err('Payment method mismatch', 409, 'INVALID_STATE')

    const incomingAmount = Number(body.amount || 0)
    if (incomingAmount > 0 && Number(requestRow.amount || 0) !== incomingAmount) {
      return err('Amount mismatch', 409, 'INVALID_STATE')
    }

    const creditRes = await creditWalletRequestIdempotent(admin, requestRow, userId, `webhook:${methodName}`)
    if ((creditRes as any).error) return err((creditRes as any).error, (creditRes as any).status || 400)

    await logActivity(admin, 'wallet_request', requestRow.id, 'approved_webhook', userId, {
      txn_id: requestRow.txn_id,
      method: requestRow.method,
      signature_valid: true,
      already_credited: (creditRes as any).alreadyCredited,
    })
    return json({ success: true, request_id: requestRow.id, credited: true, ...(creditRes as any) })
  }

  // GET /wallet
  if (method === 'GET' && !action) {
    const { data, error } = await sb.from('wallets').select('*').eq('user_id', userId).maybeSingle()
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /wallet/all (admin)
  if (method === 'GET' && action === 'all') {
    if (!isAdmin) return err('Forbidden', 403)
    const { data, error } = await admin.from('wallets').select('*').order('balance', { ascending: false })
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /wallet/transactions
  if (method === 'GET' && action === 'transactions') {
    const { data: wallet } = await sb.from('wallets').select('id').eq('user_id', userId).maybeSingle()
    if (!wallet) return json({ data: [], total: 0 })

    const page = Number(body?.page || 1)
    const limit = Number(body?.limit || 25)
    const { data, error, count } = await sb.from('transactions').select('*', { count: 'exact' })
      .eq('wallet_id', wallet.id).order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (error) return err(error.message)
    return json({ data, total: count })
  }

  // GET /wallet/requests
  if (method === 'GET' && action === 'requests' && !pathParts[1]) {
    const page = Number(body?.page || 1)
    const limit = Number(body?.limit || 25)
    const status = body?.status ? String(body.status) : ''

    let query = sb.from('wallet_requests')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (status) query = query.eq('status', status)
    const { data, error, count } = await query
    if (error) return err(error.message)
    return json({ data, total: count || 0 })
  }

  // GET /wallet/requests/all (admin)
  if (method === 'GET' && action === 'requests' && pathParts[1] === 'all') {
    if (!isAdmin) return err('Forbidden', 403)
    const page = Number(body?.page || 1)
    const limit = Number(body?.limit || 25)
    const status = body?.status ? String(body.status) : ''
    const methodFilter = body?.method ? String(body.method) : ''
    const search = body?.search ? String(body.search) : ''

    let query = admin.from('wallet_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (status) query = query.eq('status', status)
    if (methodFilter) query = query.eq('method', methodFilter)
    if (search) {
      const safeSearch = search.replace(/[%_,()[\]\\]/g, '').trim()
      if (safeSearch) query = query.ilike('txn_id', `%${safeSearch}%`)
    }

    const { data, error, count } = await query
    if (error) return err(error.message)
    return json({ data, total: count || 0 })
  }

  // POST /wallet/requests
  if (method === 'POST' && action === 'requests' && !pathParts[1]) {
    const missing = validateRequired(body, ['amount', 'method', 'txn_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount < 50) return err('Minimum amount is 50', 422, 'VALIDATION_ERROR')

    const methodName = String(body.method || '').trim()
    if (!['bank_transfer', 'upi', 'crypto'].includes(methodName)) return err('Invalid method', 422, 'VALIDATION_ERROR')

    const txnId = String(body.txn_id || '').trim()
    if (!txnId) return err('Invalid txn_id', 422, 'VALIDATION_ERROR')

    const requestSignatureSecret = Deno.env.get('WALLET_WEBHOOK_SECRET') || Deno.env.get('PAYMENT_WEBHOOK_SECRET')

    const insertPayload = {
      user_id: userId,
      amount,
      method: methodName,
      txn_id: txnId,
      status: 'pending',
      proof_url: body.proof_url || null,
      source: body.source ? String(body.source) : 'user_submit',
      signature_valid: body.signature
        && requestSignatureSecret
        ? timingSafeEqualText(
          String(body.signature),
          requestSignatureSecret,
        )
        : null,
      metadata: {
        payload: body.payload || null,
      },
    }

    const { data, error } = await sb.from('wallet_requests').insert(insertPayload).select('*').single()
    if (error) {
      const { data: existing } = await admin.from('wallet_requests').select('*').eq('txn_id', txnId).maybeSingle()
      if (existing) {
        if (existing.user_id === userId) return json({ data: existing, duplicate: true })
        return err('Transaction id already used', 409, 'DUPLICATE_TXN')
      }
      return err(error.message)
    }

    await logActivity(admin, 'wallet_request', data.id, 'created', userId, {
      method: methodName,
      amount,
      txn_id: txnId,
    })
    return json({ data }, 201)
  }

  // POST /wallet/requests/approve (admin)
  if (method === 'POST' && action === 'requests' && pathParts[1] === 'approve') {
    if (!isAdmin) return err('Forbidden', 403)
    const requestId = String(body.request_id || '').trim()
    if (!requestId) return err('request_id is required', 422, 'VALIDATION_ERROR')

    const { data: requestRow, error: reqErr } = await admin.from('wallet_requests').select('*').eq('id', requestId).maybeSingle()
    if (reqErr) return err(reqErr.message)
    if (!requestRow) return err('Wallet request not found', 404, 'NOT_FOUND')
    if (requestRow.status === 'rejected') return err('Rejected request cannot be approved', 409, 'INVALID_STATE')

    const creditRes = await creditWalletRequestIdempotent(admin, requestRow, userId, 'admin_approval')
    if ((creditRes as any).error) return err((creditRes as any).error, (creditRes as any).status || 400)

    await logActivity(admin, 'wallet_request', requestRow.id, 'approved', userId, {
      txn_id: requestRow.txn_id,
      method: requestRow.method,
      already_credited: (creditRes as any).alreadyCredited,
    })
    return json({ success: true, request_id: requestRow.id, ...(creditRes as any) })
  }

  // POST /wallet/requests/reject (admin)
  if (method === 'POST' && action === 'requests' && pathParts[1] === 'reject') {
    if (!isAdmin) return err('Forbidden', 403)
    const requestId = String(body.request_id || '').trim()
    const reason = String(body.reason || '').trim()
    if (!requestId || !reason) return err('request_id and reason are required', 422, 'VALIDATION_ERROR')

    const { data: requestRow, error: reqErr } = await admin.from('wallet_requests').select('*').eq('id', requestId).maybeSingle()
    if (reqErr) return err(reqErr.message)
    if (!requestRow) return err('Wallet request not found', 404, 'NOT_FOUND')
    if (requestRow.status === 'approved') return err('Approved request cannot be rejected', 409, 'INVALID_STATE')

    const { error: upErr } = await admin.from('wallet_requests').update({
      status: 'rejected',
      rejected_by: userId,
      rejected_at: nowIso(),
      rejection_reason: reason,
    }).eq('id', requestRow.id)
    if (upErr) return err(upErr.message)

    await logActivity(admin, 'wallet_request', requestRow.id, 'rejected', userId, { reason })
    return json({ success: true, request_id: requestRow.id })
  }

  // POST /wallet/add
  if (method === 'POST' && action === 'add') {

    const amount = Number(body.amount || 0)
    if (amount <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')

    const requestedWalletId = body.wallet_id ? String(body.wallet_id) : null
    if (requestedWalletId && !isAdmin) return err('Forbidden', 403)

    const walletQuery = requestedWalletId
      ? admin.from('wallets').select('id, user_id, balance').eq('id', requestedWalletId).maybeSingle()
      : sb.from('wallets').select('id, user_id, balance').eq('user_id', userId).maybeSingle()
    const { data: wallet } = await walletQuery
    if (!wallet) return err('Wallet not found', 404)

    const newBalance = Number(wallet.balance || 0) + amount
    const { error: txErr } = await admin.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'credit',
      amount,
      balance_after: newBalance,
      status: 'completed',
      description: body.description || 'Credit added',
      created_by: userId,
      source: body.source || 'admin_adjustment',
      reference_id: body.reference_id || null,
      reference_type: body.reference_type || 'wallet_add',
      meta: body.payment_method ? { payment_method: body.payment_method } : null,
    })
    if (txErr) return err(txErr.message)

    await admin.from('wallets').update({ balance: newBalance, updated_at: nowIso() }).eq('id', wallet.id)
    await admin.from('wallet_ledger').insert({
      wallet_id: wallet.id,
      user_id: wallet.user_id,
      entry_type: 'credit',
      amount,
      balance_before: wallet.balance || 0,
      balance_after: newBalance,
      reference_type: body.reference_type || 'wallet_add',
      reference_id: body.reference_id || null,
      metadata: body.payment_method ? { payment_method: body.payment_method } : {},
    })
    await syncResellerCreditUsed(admin, wallet.user_id, newBalance)
    await logActivity(admin, 'wallet', wallet.id, 'credit_added', userId, { amount, target_user_id: wallet.user_id })
    return json({ success: true, balance: newBalance })
  }

  // POST /wallet/withdraw
  if (method === 'POST' && action === 'withdraw') {

    const requestedWalletId = body.wallet_id ? String(body.wallet_id) : null
    if (requestedWalletId && !isAdmin) return err('Forbidden', 403)

    const walletQuery = requestedWalletId
      ? admin.from('wallets').select('id, user_id, balance, locked_balance').eq('id', requestedWalletId).maybeSingle()
      : sb.from('wallets').select('id, user_id, balance, locked_balance').eq('user_id', userId).maybeSingle()
    const { data: wallet } = await walletQuery
    if (!wallet) return err('Wallet not found', 404)

    const available = Number(wallet.balance || 0) - Number(wallet.locked_balance || 0)

    }

    const newBalance = Number(wallet.balance || 0) - amount
    const { error: txErr } = await admin.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'debit',
      amount,
      balance_after: newBalance,
      status: 'completed',
      description: body.description || 'Withdrawal',
      created_by: userId,
      source: body.source || 'wallet_withdraw',
      reference_id: body.reference_id || null,
      reference_type: body.reference_type || 'wallet_withdraw',
      meta: reseller ? { credit_limit: Number(reseller.credit_limit || 0), available_before: available } : null,
    })
    if (txErr) return err(txErr.message)

    await admin.from('wallets').update({ balance: newBalance, updated_at: nowIso() }).eq('id', wallet.id)
    await admin.from('wallet_ledger').insert({
      wallet_id: wallet.id,
      user_id: wallet.user_id,
      entry_type: 'debit',
      amount,
      balance_before: wallet.balance || 0,
      balance_after: newBalance,
      reference_type: body.reference_type || 'wallet_withdraw',
      reference_id: body.reference_id || null,
      metadata: {},
    })
    await syncResellerCreditUsed(admin, wallet.user_id, newBalance)
    await logActivity(admin, 'wallet', wallet.id, 'debit', userId, { amount, target_user_id: wallet.user_id })
    return json({ success: true, balance: newBalance })
  }

  // GET /wallet/ledger
  if (method === 'GET' && action === 'ledger') {
    const { data: wallet } = await sb.from('wallets').select('id').eq('user_id', userId).maybeSingle()
    if (!wallet) return json({ data: [] })
    const { data, error } = await sb.from('wallet_ledger').select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /wallet/lock
  if (method === 'POST' && action === 'lock') {

    if (Number(body.amount || 0) <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')
    const { data: wallet } = await sb.from('wallets').select('id, balance, locked_balance').eq('user_id', userId).single()
    if (!wallet) return err('Wallet not found', 404)
    const available = Number(wallet.balance || 0) - Number(wallet.locked_balance || 0)
    if (available < Number(body.amount || 0)) return err('Insufficient balance')
    const oldLocked = Number(wallet.locked_balance || 0)
    const newLocked = oldLocked + Number(body.amount)
    await sb.from('wallets').update({ locked_balance: newLocked, updated_at: nowIso() }).eq('id', wallet.id)
    await sb.from('wallet_ledger').insert({
      wallet_id: wallet.id,
      user_id: userId,
      entry_type: 'lock',
      amount: Number(body.amount),
      balance_before: wallet.balance || 0,
      balance_after: wallet.balance || 0,
      reference_type: body.reference_type || 'manual_lock',
      reference_id: body.reference_id || null,
      metadata: body.meta || {},
    })
    return json({ success: true, locked_balance: newLocked })
  }

  // POST /wallet/unlock
  if (method === 'POST' && action === 'unlock') {

    if (Number(body.amount || 0) <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')
    const { data: wallet } = await sb.from('wallets').select('id, balance, locked_balance').eq('user_id', userId).single()
    if (!wallet) return err('Wallet not found', 404)
    const oldLocked = Number(wallet.locked_balance || 0)
    const unlock = Math.min(oldLocked, Number(body.amount))
    const newLocked = Math.max(0, oldLocked - unlock)
    await sb.from('wallets').update({ locked_balance: newLocked, updated_at: nowIso() }).eq('id', wallet.id)
    await sb.from('wallet_ledger').insert({
      wallet_id: wallet.id,
      user_id: userId,
      entry_type: 'unlock',
      amount: unlock,
      balance_before: wallet.balance || 0,
      balance_after: wallet.balance || 0,
      reference_type: body.reference_type || 'manual_unlock',
      reference_id: body.reference_id || null,
      metadata: body.meta || {},
    })
    return json({ success: true, locked_balance: newLocked })
  }

  // POST /wallet/refund
  if (method === 'POST' && action === 'refund') {

    if (Number(body.amount || 0) <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')
    const { data: wallet } = await sb.from('wallets').select('id, balance').eq('user_id', userId).single()
    if (!wallet) return err('Wallet not found', 404)
    const oldBalance = Number(wallet.balance || 0)
    const newBalance = oldBalance + Number(body.amount)
    await sb.from('wallets').update({ balance: newBalance, updated_at: nowIso() }).eq('id', wallet.id)
    await sb.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'refund',
      amount: Number(body.amount),
      balance_after: newBalance,
      status: 'completed',
      description: body.description || 'Wallet refund',
      reference_type: body.reference_type || 'wallet_refund',
      reference_id: body.reference_id || null,
      created_by: userId,
      source: body.source || 'wallet_refund',
    })
    await sb.from('wallet_ledger').insert({
      wallet_id: wallet.id,
      user_id: userId,
      entry_type: 'refund',
      amount: Number(body.amount),
      balance_before: oldBalance,
      balance_after: newBalance,
      reference_type: body.reference_type || 'wallet_refund',
      reference_id: body.reference_id || null,
      metadata: body.meta || {},
    })
    return json({ success: true, balance: newBalance })
  }

  return err('Not found', 404)
}

// ===================== 14. SEO & LEADS =====================
async function handleSeoLeads(method: string, pathParts: string[], body: any, userId: string, sb: any, req?: Request) {
  const admin = adminClient()
  const segment = pathParts[0]
  const resellerProfile = await getResellerProfileForUser(sb, userId)
  const resellerId = resellerProfile?.id || null

  // POST /lead/call-track
  if (method === 'POST' && segment === 'lead' && pathParts[1] === 'call-track') {
    const missing = validateRequired(body, ['lead_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const { data, error } = await admin.from('lead_call_tracks').insert({
      lead_id: body.lead_id,
      phone: body.phone || null,
      dynamic_number: body.dynamic_number || null,
      call_status: body.call_status || 'initiated',
      call_duration_seconds: Number(body.call_duration_seconds || 0),
      recording_url: body.recording_url || null,
      source: body.source || 'phone',
      reseller_id: resellerId,
      created_by: userId,
      meta: body.meta || {},
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'lead_call_track', data.id, 'created', userId)
    return json({ data }, 201)
  }

  // POST /lead/whatsapp-track
  if (method === 'POST' && segment === 'lead' && pathParts[1] === 'whatsapp-track') {
    const missing = validateRequired(body, ['lead_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const { data, error } = await admin.from('lead_whatsapp_tracks').insert({
      lead_id: body.lead_id,
      phone: body.phone || null,
      click_source: body.click_source || 'button',
      message_template: body.message_template || null,
      status: body.status || 'clicked',
      reseller_id: resellerId,
      created_by: userId,
      meta: body.meta || {},
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'lead_whatsapp_track', data.id, 'created', userId)
    return json({ data }, 201)
  }

  // POST /leads/qualify
  if (method === 'POST' && segment === 'leads' && pathParts[1] === 'qualify') {
    const text = `${body?.name || ''} ${body?.email || ''} ${body?.phone || ''} ${body?.notes || ''}`.toLowerCase()
    let score = 50
    if (String(body?.email || '').includes('@')) score += 20
    if ((String(body?.phone || '').replace(/\D/g, '').length) >= 8) score += 15
    if (String(body?.name || '').trim().length >= 2) score += 10
    if (/test|fake|dummy|spam|asdf/.test(text)) score -= 40
    const finalScore = Math.max(0, Math.min(100, score))
    const isSpam = finalScore < 35
    const quality = finalScore >= 75 ? 'high' : finalScore >= 50 ? 'medium' : 'low'
    return json({
      data: {
        score: finalScore,
        is_spam: isSpam,
        quality,
        recommended_status: isSpam ? 'lost' : 'qualified',
      },
    })
  }

  // GET /leads
  if (method === 'GET' && segment === 'leads') {
    if (pathParts[1] === 'export') {
      const countryFilter = sanitizeTextInput(body?.country, 128)
      const resellerFilter = sanitizeTextInput(body?.reseller_id, 128)

      let query = sb
        .from('leads')
        .select('id,name,email,phone,company,source,status,assigned_to,created_at,meta')
        .order('created_at', { ascending: false })

      if (resellerFilter) {
        query = query.eq('assigned_to', resellerFilter)
      }

      const { data, error } = await query.limit(5000)
      if (error) return err(error.message)

      const rows = (data || [])
        .map((lead: any) => {
          const meta = lead?.meta && typeof lead.meta === 'object' ? lead.meta : {}
          return {
            id: lead.id || '',
            name: lead.name || '',
            email: lead.email || '',
            phone: lead.phone || '',
            company: lead.company || '',
            country: String((meta as Record<string, unknown>)?.country || ''),
            source: lead.source || '',
            status: lead.status || '',
            assigned_to: lead.assigned_to || '',
            created_at: lead.created_at || '',
          }
        })
        .filter((row) => !countryFilter || row.country.toLowerCase() === countryFilter.toLowerCase())

      const headers = ['id', 'name', 'email', 'phone', 'company', 'country', 'source', 'status', 'assigned_to', 'created_at']
      const csv = toCsv(headers, rows)
      return json({
        filename: `leads-export-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
        count: rows.length,
      })
    }

    const page = Number(body?.page || 1)
    const limit = Number(body?.limit || 25)
    const search = body?.search || ''

    let query = sb.from('leads').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)
    const { data, error, count } = await query
    if (error) return err(error.message)
    return json({ data, total: count })
  }

  // POST /leads
  if (method === 'POST' && segment === 'leads') {
    const normalizedEmail = normalizeEmail(body.email)
    const normalizedPhone = normalizePhone(body.phone)
    if (!normalizedEmail && !normalizedPhone) return err('Missing field: email or phone', 422, 'VALIDATION_ERROR')

    const ip = readClientIp(req)
    const deviceId = String(body.device_id || body.deviceId || '').trim() || 'unknown'
    const fingerprintHash = await sha256Hex([ip, deviceId, normalizedEmail, normalizedPhone].join('|'))

    let attempts = 1
    const { data: fpExisting } = await admin.from('lead_fingerprint').select('id, attempts').eq('hash', fingerprintHash).maybeSingle()
    if (fpExisting?.id) {
      attempts = Number(fpExisting.attempts || 0) + 1
      await admin.from('lead_fingerprint').update({
        ip,
        device_id: deviceId,
        attempts,
        last_seen_at: nowIso(),
        updated_at: nowIso(),
      }).eq('id', fpExisting.id)
    } else {
      await admin.from('lead_fingerprint').insert({
        ip,
        device_id: deviceId,
        hash: fingerprintHash,
        attempts,
        last_seen_at: nowIso(),
      })
    }

    let duplicateLead: any = null
    if (normalizedEmail && normalizedPhone) {
      const { data: existingDuplicate } = await admin
        .from('leads')
        .select('id')
        .or(`email.eq.${normalizedEmail},phone.eq.${normalizedPhone}`)
        .limit(1)
        .maybeSingle()
      duplicateLead = existingDuplicate || null
    } else if (normalizedEmail) {
      const { data: existingDuplicate } = await admin
        .from('leads')
        .select('id')
        .eq('email', normalizedEmail)
        .limit(1)
        .maybeSingle()
      duplicateLead = existingDuplicate || null
    } else if (normalizedPhone) {
      const { data: existingDuplicate } = await admin
        .from('leads')
        .select('id')
        .eq('phone', normalizedPhone)
        .limit(1)
        .maybeSingle()
      duplicateLead = existingDuplicate || null
    }

    const fakeEmail = isLikelyFakeEmail(normalizedEmail)
    const fakePhone = isLikelyFakePhone(normalizedPhone)
    const tooManyAttempts = attempts >= 5
    const isSpam = fakeEmail || fakePhone || tooManyAttempts
    const isDuplicate = !!duplicateLead

    if (isDuplicate || isSpam) {
      let blockedReason = 'fingerprint_rate_limit'
      if (isDuplicate) blockedReason = 'duplicate_lead'
      else if (fakeEmail || fakePhone) blockedReason = 'spam_contact'
      const { data: blockedLead, error: blockedError } = await admin.from('leads').insert({
        name: body.name || '',
        email: normalizedEmail || null,
        phone: normalizedPhone || null,
        company: body.company,
        source: body.source || 'website',
        status: 'lost',
        product_id: body.product_id,
        notes: body.notes,
        tags: body.tags,
        assigned_to: body.assigned_to,
        reseller_id: resellerId,
        fingerprint_hash: fingerprintHash,
        is_blocked: true,
        blocked_reason: blockedReason,
      }).select().single()
      if (blockedError) return err(blockedError.message)
      await admin.from('lead_fingerprint').update({
        is_spam: isSpam,
        attempts,
        updated_at: nowIso(),
      }).eq('hash', fingerprintHash)
      await logActivity(admin, 'lead', blockedLead.id, 'blocked', userId, { blocked_reason: blockedReason })
      return json({
        blocked: true,
        do_not_charge_reseller: true,
        reason: blockedReason,
        data: blockedLead,
      }, 201)
    }

    const { data, error } = await admin.from('leads').insert({
      name: body.name || '', email: normalizedEmail || null, phone: normalizedPhone || null,
      company: body.company, source: body.source || 'website',
      status: body.status || 'new', product_id: body.product_id,
      notes: body.notes, tags: body.tags, assigned_to: body.assigned_to,
      reseller_id: resellerId,
      fingerprint_hash: fingerprintHash,
      is_blocked: false,
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'lead', data.id, 'created', userId)
    return json({ data }, 201)
  }

  // GET /seo/analytics
  if (method === 'GET' && segment === 'seo' && pathParts[1] === 'analytics') {
    const { data, error } = await sb.from('seo_data').select('*').order('created_at', { ascending: false })
    if (error) return err(error.message)
    return json({ data })
  }


  }

  return err('Not found', 404)
}

// ===================== 15. SUBSCRIPTIONS =====================
async function handleSubscriptions(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const action = pathParts[0]

  // GET /subscriptions
  if (method === 'GET' && !action) {
    const { data, error } = await sb.from('subscriptions').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false })
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /subscriptions/renew
  if (method === 'POST' && action === 'renew') {
    const missing = validateRequired(body, ['subscription_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const { data: sub } = await sb.from('subscriptions').select('*').eq('id', body.subscription_id).eq('user_id', userId).maybeSingle()
    if (!sub) return err('Subscription not found', 404, 'NOT_FOUND')
    const end = sub.current_period_end ? new Date(sub.current_period_end) : new Date()
    const base = end > new Date() ? end : new Date()
    base.setDate(base.getDate() + 30)
    await sb.from('subscriptions').update({
      status: 'active',
      failed_retry_count: 0,
      next_retry_at: null,
      current_period_end: base.toISOString(),
      updated_at: nowIso(),
    }).eq('id', sub.id)
    await sb.from('async_jobs').insert({
      job_type: 'email',
      status: 'queued',
      payload: { kind: 'manual_renew', subscription_id: sub.id, user_id: userId },
    })
    return json({ success: true, subscription_id: sub.id, current_period_end: base.toISOString() })
  }

  // POST /subscriptions/cron-run
  if (method === 'POST' && action === 'cron-run') {
    const isServiceMode = reqHasCronSecret(body)
    if (!isServiceMode) return err('Forbidden', 403, 'FORBIDDEN')

    const now = new Date()
    const { data: subs, error } = await sb.from('subscriptions').select('*')
      .eq('auto_renew', true)
      .in('status', ['active', 'expired'])
      .order('current_period_end', { ascending: true })
      .limit(500)
    if (error) return err(error.message)

    let processed = 0
    let charged = 0
    let failed = 0
    for (const sub of (subs || [])) {
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
      if (!periodEnd) continue

      if (periodEnd > now) continue
      processed++

      const graceDays = Number(sub.grace_period_days || 0)
      const graceEnd = new Date(periodEnd.getTime())
      graceEnd.setDate(graceEnd.getDate() + graceDays)

      const { data: wallet } = await sb.from('wallets').select('id, balance, locked_balance').eq('user_id', sub.user_id).maybeSingle()
      const amount = Number(sub.amount || 0)
      const available = Number(wallet?.balance || 0) - Number(wallet?.locked_balance || 0)
      if (!wallet || available < amount) {
        const retries = Number(sub.failed_retry_count || 0) + 1
        const shouldExpire = retries >= Number(sub.max_failed_retries || 3) && now > graceEnd
        await sb.from('subscriptions').update({
          failed_retry_count: retries,
          status: shouldExpire ? 'expired' : 'active',
          next_retry_at: new Date(Date.now() + retries * 24 * 60 * 60 * 1000).toISOString(),
          last_renewal_attempt_at: nowIso(),
          updated_at: nowIso(),
        }).eq('id', sub.id)
        await sb.from('async_jobs').insert({
          job_type: 'subscription_cron',
          status: 'queued',
          attempts: retries,
          payload: { subscription_id: sub.id, action: 'retry_charge' },
          run_at: new Date(Date.now() + retries * 60 * 1000).toISOString(),
        })
        failed++
        continue
      }

      const oldBalance = Number(wallet.balance || 0)
      const newBalance = oldBalance - amount
      await sb.from('wallets').update({ balance: newBalance, updated_at: nowIso() }).eq('id', wallet.id)
      const { data: tx } = await sb.from('transactions').insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount,
        balance_after: newBalance,
        status: 'completed',
        description: 'Subscription auto renew charge',
        reference_type: 'subscription_renewal',
        reference_id: sub.id,
        created_by: sub.user_id,
      }).select().single()
      await sb.from('wallet_ledger').insert({
        wallet_id: wallet.id,
        user_id: sub.user_id,
        entry_type: 'debit',
        amount,
        balance_before: oldBalance,
        balance_after: newBalance,
        reference_type: 'subscription_renewal',
        reference_id: sub.id,
        metadata: {},
      })

      const nextEnd = new Date(periodEnd.getTime())
      nextEnd.setDate(nextEnd.getDate() + 30)
      await sb.from('subscriptions').update({
        status: 'active',
        failed_retry_count: 0,
        next_retry_at: null,
        last_payment_id: tx?.id || null,
        last_renewal_attempt_at: nowIso(),
        current_period_start: nowIso(),
        current_period_end: nextEnd.toISOString(),
        updated_at: nowIso(),
      }).eq('id', sub.id)

      await sb.from('async_jobs').insert({
        job_type: 'email',
        status: 'queued',
        payload: { kind: 'subscription_renewed', subscription_id: sub.id, transaction_id: tx?.id || null },
      })
      charged++
    }

    return json({ success: true, processed, charged, failed })
  }

  return err('Not found', 404)
}

function reqHasCronSecret(body: any) {
  const expected = Deno.env.get('SUBSCRIPTION_CRON_SECRET')
  if (!expected) {
    console.error('SUBSCRIPTION_CRON_SECRET is not configured')
    return false
  }
  const provided = String(body?.cron_secret || '')
  return expected === provided
}

// ===================== MAIN ROUTER =====================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const fullPath = url.pathname.replace(/^\/api-gateway\/?/, '').replace(/\/$/, '')
    const parts = fullPath.split('/').filter(Boolean)
    const module = parts[0]
    const subParts = parts.slice(1)

    // Parse body for POST/PUT/DELETE, query params for GET
    let body: any = {}
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      try { body = await req.json() } catch { body = {} }
    } else {
      url.searchParams.forEach((v, k) => { body[k] = v })
    }

    // Auth endpoints don't require JWT
    if (module === 'auth') {
      return await handleAuth(req.method, subParts, body, req)
    }

    // External payment webhook endpoint without JWT
    if (module === 'marketplace' && req.method === 'POST' && subParts[0] === 'payment' && subParts[1] === 'webhook') {
      const admin = adminClient()
      return await handleMarketplace(req.method, subParts, body, 'system-webhook', admin)
    }

    // External wallet webhook endpoint without JWT
    if (module === 'wallet' && req.method === 'POST' && subParts[0] === 'webhook') {
      const admin = adminClient()
      return await handleWallet(req.method, subParts, body, 'system-webhook', admin)
    }

    // Scheduler subscription endpoint without JWT (secret-gated in handler)
    if (module === 'subscriptions' && req.method === 'POST' && subParts[0] === 'cron-run') {
      const admin = adminClient()
      return await handleSubscriptions(req.method, subParts, body, 'system-cron', admin)
    }

    // All other endpoints require JWT
    const auth = await authenticate(req)
    if (!auth) return err('Unauthorized', 401)

    const { userId, supabase: sb } = auth
    const endpointKey = `${module}/${subParts[0] || ''}`
    const rateLimitRes = await enforceRateLimit(adminClient(), userId, endpointKey)
    if (rateLimitRes) return rateLimitRes

    switch (module) {
      case 'products': return await handleProducts(req.method, subParts, body, userId, sb)
      case 'resellers': return await handleResellers(req.method, subParts, body, userId, sb)
      case 'reseller': return await handleResellerOnboarding(req.method, subParts, body, userId, sb)
      case 'admin': return await handleAdminResellerApplications(req.method, subParts, body, userId, sb)
      case 'marketplace': return await handleMarketplace(req.method, subParts, body, userId, sb)
      case 'keys':
        if (subParts[0] === 'create' || subParts[0] === 'revoke' || subParts[0] === 'usage') {
          return await handleManagedApiKeys(req.method, subParts, body, userId, sb)
        }
        return await handleKeys(req.method, subParts, body, userId, sb)
      case 'models': return await handleModels(req.method, subParts, body, userId, sb)
      case 'projects':
      case 'servers':
      case 'deploy':
      case 'deploy-targets':
      case 'dns':
      case 'domain':
      case 'ssl':
      case 'git':
      case 'server':
        return await handleServers(req.method, [module, ...subParts], body, userId, sb)
      case 'github': return await handleGithub(req.method, subParts, body, userId, sb)
      case 'git': return await handleGit(req.method, subParts, body, userId, sb)
      case 'ai': return await handleAi(req.method, subParts, body, userId, sb)
      case 'code': return await handleCode(req.method, subParts, body, userId, sb)
      case 'db': return await handleDb(req.method, subParts, body, userId)
      case 'build': return await handleBuild(req.method, subParts, body, userId, sb)
      case 'chat': return await handleChat(req.method, subParts, body, userId, sb)
      case 'api-keys': return await handleApiKeys(req.method, subParts, body, userId, sb)
      case 'api-usage':
        return await handleApiKeys(req.method, ['usage'], body, userId, sb)
      case 'auto': return await handleAuto(req.method, subParts, body, userId, sb)
      case 'apk': return await handleApk(req.method, subParts, body, userId, sb)
      case 'wallet': return await handleWallet(req.method, subParts, body, userId, sb)
      case 'subscriptions': return await handleSubscriptions(req.method, subParts, body, userId, sb)
      case 'leads':
      case 'lead':
      case 'seo':

      default:
        return err(`Unknown module: ${module}`, 404)
    }
  } catch (e) {
    console.error('API Gateway Error:', e)
    return err('Internal server error', 500)
  }
})
