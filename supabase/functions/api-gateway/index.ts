import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const productListCache: { data: any[] | null; expiresAt: number } = { data: null, expiresAt: 0 }
const PRODUCT_LIST_CACHE_TTL_MS = 60 * 1000
const RATE_LIMIT_WINDOW_SECONDS = Number(Deno.env.get('API_RATE_LIMIT_WINDOW_SECONDS') || '60')
const RATE_LIMIT_MAX_REQUESTS = Number(Deno.env.get('API_RATE_LIMIT_MAX_REQUESTS') || '120')
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

function normalizeResellerStatus(input: unknown): 'active' | 'suspended' | null {
  if (input === undefined || input === null) return null
  const normalized = String(input).trim().toLowerCase()
  if (!normalized) return null
  if (['active'].includes(normalized)) return 'active'
  if (['suspended', 'inactive'].includes(normalized)) return 'suspended'
  return null
}

function normalizeKycStatus(input: unknown): 'pending' | 'verified' | 'rejected' | null {
  if (input === undefined || input === null) return null
  const normalized = String(input).trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'verified') return 'verified'
  if (normalized === 'rejected') return 'rejected'
  if (normalized === 'pending') return 'pending'
  return null
}

type ResellerAccessState = {
  id: string
  status: string | null
  is_active: boolean | null
  kyc_status?: string | null
  is_verified?: boolean | null
} | null

async function getResellerAccessState(admin: any, userId: string): Promise<ResellerAccessState> {
  const { data } = await admin
    .from('resellers')
    .select('id, status, is_active, kyc_status, is_verified')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as ResellerAccessState) || null
}

function getResellerStatusFromState(state: ResellerAccessState): 'active' | 'suspended' {
  if (!state) return 'suspended'
  return normalizeResellerStatus(state.status) || (state.is_active === false ? 'suspended' : 'active')
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

    let query = sb.from('resellers').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) query = query.ilike('company_name', `%${search}%`)
    const { data, error, count } = await query
    if (error) return err(error.message)

    // Enrich with profiles
    const userIds = (data || []).map((r: any) => r.user_id).filter(Boolean)
    let profileMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await sb
        .from('profiles')
        .select('user_id, full_name, company_name, phone')
        .in('user_id', userIds)
      ;(profiles || []).forEach((p: any) => {
        profileMap[p.user_id] = {
          full_name: p.full_name,
          company_name: p.company_name,
          phone: p.phone,
        }
      })
    }

    const enriched = (data || []).map((r: any) => ({
      ...r,
      profile: profileMap[r.user_id] || null,
      company_name: r.company_name || profileMap[r.user_id]?.company_name || profileMap[r.user_id]?.full_name || 'Unnamed Reseller',
      status: normalizeResellerStatus(r.status) || (r.is_active === false ? 'suspended' : 'active'),
      kyc_status: normalizeKycStatus(r.kyc_status) || (r.is_verified ? 'verified' : 'pending'),
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
      credit_limit: creditLimit,

    return json({ data }, 201)
  }

  // PUT /resellers/:id
  if (method === 'PUT' && id) {
    if (!isAdmin) return err('Forbidden', 403)

    const updates: any = {}
    if (body.company_name !== undefined) updates.company_name = body.company_name
    if (body.commission_percent !== undefined) {
      const commissionPercent = Number(body.commission_percent)

      updates.commission_percent = commissionPercent
    }
    if (body.credit_limit !== undefined) {
      const creditLimit = Number(body.credit_limit)

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
    const { data, error } = await sb.from('referral_codes').select('*')
      .eq('reseller_id', reseller.id).order('created_at', { ascending: false }).limit(500)
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /resellers/referrals
  if (method === 'POST' && id === 'referrals') {
    const { data: reseller } = await sb.from('resellers').select('id').eq('user_id', userId).maybeSingle()
    if (!reseller?.id) return err('Reseller profile not found', 404)

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
        terms_accepted_at: nowIso(),
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
    const termsAcceptedAt = application.terms_accepted_at || nowIso()

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

    const { error: appFeatureUpdateErr } = await admin
      .from('reseller_applications')
      .update({
        features_checklist: selectedFeatures,
        terms_version: termsVersion,
        terms_accepted_at: termsAcceptedAt,
      })
      .eq('id', application.id)
    if (appFeatureUpdateErr) return err(appFeatureUpdateErr.message)

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

  // GET /projects
  if (method === 'GET' && segment === 'projects' && !id) {
    const { data, error } = await sb.from('servers').select('*').order('created_at', { ascending: false })
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /projects
  if (method === 'POST' && segment === 'projects') {
    const subdomain = body.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 6)
    const { data, error } = await sb.from('servers').insert({
      name: body.name || '', subdomain,
      git_repo: body.git_repo, git_branch: body.git_branch || 'main',
      runtime: body.runtime || 'nodejs18', status: 'stopped',
      auto_deploy: body.auto_deploy ?? true, created_by: userId,
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'server', data.id, 'created', userId, { name: body.name })
    return json({ data }, 201)
  }

  // GET /deploy-targets
  if (method === 'GET' && segment === 'deploy-targets') {
    const { data, error } = await sb.from('servers').select('id, name, subdomain, status').eq('status', 'live')
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /deploy-targets
  if (method === 'POST' && segment === 'deploy-targets') {
    const { data, error } = await sb.from('servers').insert({
      name: body.name || '', subdomain: body.subdomain,
      status: 'stopped', created_by: userId,
      ip_address: body.ip_address, agent_url: body.agent_url,
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'deploy_target', data.id, 'created', userId)
    return json({ data }, 201)
  }

  // POST /deploy/trigger
  if (method === 'POST' && segment === 'deploy' && id === 'trigger') {
    const serverId = body.server_id
    const { data, error } = await sb.from('deployments').insert({
      server_id: serverId, status: 'building', triggered_by: userId,
    }).select().single()
    if (error) return err(error.message)
    await sb.from('servers').update({ status: 'deploying', last_deploy_at: new Date().toISOString() }).eq('id', serverId)
    await logActivity(admin, 'deployment', data.id, 'triggered', userId, { server_id: serverId })
    return json({ data, success: true })
  }

  // GET /deploy/status/:id
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'status' && pathParts[2]) {
    const { data, error } = await sb.from('deployments').select('*').eq('server_id', pathParts[2])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /deploy/logs/:id
  if (method === 'GET' && segment === 'deploy' && pathParts[1] === 'logs' && pathParts[2]) {
    const { data, error } = await sb.from('deployment_logs').select('*').eq('deployment_id', pathParts[2])
      .order('timestamp', { ascending: true })
    if (error) return err(error.message)
    return json({ data })
  }

  // POST /domain/add
  if (method === 'POST' && segment === 'domain' && id === 'add') {
    const { data, error } = await sb.from('domains').insert({
      domain_name: body.domain_name, server_id: body.server_id,
      domain_type: body.domain_type || 'custom', created_by: userId,
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'domain', data.id, 'added', userId, { domain: body.domain_name })
    return json({ data }, 201)
  }

  // POST /domain/verify
  if (method === 'POST' && segment === 'domain' && id === 'verify') {
    const { error } = await sb.from('domains').update({ dns_verified: true, dns_verified_at: new Date().toISOString() })
      .eq('id', body.domain_id)
    if (error) return err(error.message)
    await logActivity(admin, 'domain', body.domain_id, 'verified', userId)
    return json({ success: true })
  }

  // GET /server/health
  if (method === 'GET' && segment === 'server' && id === 'health') {
    const { data, error } = await sb.from('servers').select('id, name, status, subdomain, custom_domain, health_status, uptime_percent')
    if (error) return err(error.message)
    const stats = {
      total: data?.length || 0,
      live: data?.filter((s: any) => s.status === 'live').length || 0,
      failed: data?.filter((s: any) => s.status === 'failed').length || 0,
      deploying: data?.filter((s: any) => s.status === 'deploying').length || 0,
    }
    return json({ stats, servers: data })
  }

  return err('Not found', 404)
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

  return err('Not found', 404)
}

// ===================== 8. SAAS AI =====================
async function handleAi(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const action = pathParts[0]

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

  return err('Not found', 404)
}

// ===================== 9. AI CHAT =====================
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

// ===================== 10. AI API KEYS =====================
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

// ===================== 11. AUTO-PILOT =====================
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

// ===================== 12. APK PIPELINE =====================
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

    const amount = Number(body.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')
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
async function handleSeoLeads(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const segment = pathParts[0]

  // GET /leads
  if (method === 'GET' && segment === 'leads') {
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
    const { data, error } = await sb.from('leads').insert({
      name: body.name || '', email: body.email, phone: body.phone,
      company: body.company, source: body.source || 'website',
      status: body.status || 'new', product_id: body.product_id,
      notes: body.notes, tags: body.tags, assigned_to: body.assigned_to,
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
      case 'keys': return await handleKeys(req.method, subParts, body, userId, sb)
      case 'projects':
      case 'deploy':
      case 'deploy-targets':
      case 'domain':
      case 'server':
        return await handleServers(req.method, [module, ...subParts], body, userId, sb)
      case 'github': return await handleGithub(req.method, subParts, body, userId, sb)
      case 'ai': return await handleAi(req.method, subParts, body, userId, sb)
      case 'chat': return await handleChat(req.method, subParts, body, userId, sb)
      case 'api-keys': return await handleApiKeys(req.method, subParts, body, userId, sb)
      case 'api-usage':
        return await handleApiKeys(req.method, ['usage'], body, userId, sb)
      case 'auto': return await handleAuto(req.method, subParts, body, userId, sb)
      case 'apk': return await handleApk(req.method, subParts, body, userId, sb)
      case 'wallet': return await handleWallet(req.method, subParts, body, userId, sb)
      case 'subscriptions': return await handleSubscriptions(req.method, subParts, body, userId, sb)
      case 'leads':
      case 'seo':
        return await handleSeoLeads(req.method, [module, ...subParts], body, userId, sb)
      default:
        return err(`Unknown module: ${module}`, 404)
    }
  } catch (e) {
    console.error('API Gateway Error:', e)
    return err('Internal server error', 500)
  }
})
