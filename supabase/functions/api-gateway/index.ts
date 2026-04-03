import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.25.76'
import { decodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

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

const serverAddSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  server_type: z.string().optional(),
  ip: z.string().optional(),
  ip_address: z.string().optional(),
  agent_url: z.string().optional(),
  agent_token: z.string().optional(),
  provider: z.string().optional(),
  region: z.string().optional(),
})

function generateAgentToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateSubdomainSuffix(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => chars[b % chars.length]).join('')
}

function isValidIpAddress(input: string) {
  const value = input.trim()
  if (!value) return true
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
  const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1)$/
  return ipv4.test(value) || ipv6.test(value)
}

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
const dashboardStatsCache: { data: unknown | null; expiresAt: number } = { data: null, expiresAt: 0 }
const seoAnalyticsCache: { data: unknown | null; expiresAt: number } = { data: null, expiresAt: 0 }
const PRODUCT_LIST_CACHE_TTL_MS = 60 * 1000
const SERVER_STATUS_CACHE_TTL_MS = 30 * 1000
const DASHBOARD_STATS_CACHE_TTL_MS = 30 * 1000
const SEO_ANALYTICS_CACHE_TTL_MS = 60 * 1000
const PRODUCT_LIST_TRANSLATION_LIMIT = 60
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

function invalidateSeoAnalyticsCache() {
  seoAnalyticsCache.data = null
  seoAnalyticsCache.expiresAt = 0
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

function maskLicenseKey(value: string) {
  const raw = String(value || '')
  if (!raw) return ''
  return raw.replace(/[^\s]/g, '•')
}

async function generateHashedLicenseKey(userId: string) {
  const seed = `${userId}|${Date.now()}|${crypto.randomUUID()}`
  const digest = await sha256Hex(seed)
  const source = digest.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const segments = [
    source.slice(0, 4),
    source.slice(4, 8),
    source.slice(8, 12),
    source.slice(12, 16),
  ]
  return segments.join('-')
}

async function expireKeysIfNeeded(sb: any) {
  const now = nowIso()
  await sb
    .from('license_keys')
    .update({ status: 'expired', updated_at: now })
    .neq('status', 'expired')
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
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

async function redisGetJson<T = unknown>(key: string): Promise<T | null> {
  const base = Deno.env.get('REDIS_REST_URL')
  const token = Deno.env.get('REDIS_REST_TOKEN')
  if (!base || !token || !key) return null
  try {
    const res = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const payload = await res.json()
    const raw = payload?.result
    if (raw === null || raw === undefined) return null
    return JSON.parse(String(raw)) as T
  } catch {
    return null
  }
}

async function redisSetJson(key: string, value: unknown, ttlSeconds: number) {
  const base = Deno.env.get('REDIS_REST_URL')
  const token = Deno.env.get('REDIS_REST_TOKEN')
  if (!base || !token || !key) return
  try {
    const body = JSON.stringify(value)
    const setRes = await fetch(`${base}/set/${encodeURIComponent(key)}/${encodeURIComponent(body)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!setRes.ok || ttlSeconds <= 0) return
    await fetch(`${base}/expire/${encodeURIComponent(key)}/${Math.max(1, Math.floor(ttlSeconds))}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // no-op
  }
}

async function emitDomainEvent(
  admin: any,
  eventType: 'product_created' | 'lead_generated' | 'build_completed' | 'payment_success',
  payload: Record<string, unknown>,
  tenantId?: string | null,
) {
  try {
    await admin.from('event_bus').insert({
      event_type: eventType,
      payload,
      status: 'queued',
      tenant_id: tenantId || null,
    })
  } catch {
    // no-op
  }
}

async function enqueueSearchIndex(
  admin: any,
  indexName: 'products' | 'leads' | 'chats',
  documentId: string,
  payload: Record<string, unknown>,
  tenantId?: string | null,
) {
  try {
    await admin.from('search_index_queue').insert({
      engine: 'meilisearch',
      index_name: indexName,
      document_id: documentId,
      operation: 'upsert',
      payload,
      status: 'queued',
      tenant_id: tenantId || null,
    })
  } catch {
    // no-op
  }
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

const GEO_FALLBACK_BY_COUNTRY: Record<string, { language: string; currency: string }> = {
  IN: { language: 'hi', currency: 'INR' },
  AE: { language: 'ar', currency: 'AED' },
  SA: { language: 'ar', currency: 'SAR' },
  US: { language: 'en', currency: 'USD' },
  GB: { language: 'en', currency: 'GBP' },
}

function parseAcceptLanguage(req?: Request) {
  if (!req) return 'en'
  const header = String(req.headers.get('accept-language') || '').trim()
  if (!header) return 'en'
  const first = header.split(',')[0] || 'en'
  return String(first.split('-')[0] || 'en').toLowerCase().slice(0, 8) || 'en'
}

function resolveCountryFromRequest(req?: Request) {
  if (!req) return 'US'
  const candidates = [
    req.headers.get('cf-ipcountry'),
    req.headers.get('x-vercel-ip-country'),
    req.headers.get('x-country-code'),
  ]
  for (const item of candidates) {
    const country = String(item || '').trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(country)) return country
  }
  return 'US'
}

async function getLocaleForUser(admin: any, userId?: string | null) {
  if (!userId) return null
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('country_code,country,language,currency')
      .eq('user_id', userId)
      .maybeSingle()
    if (!profile) return null
    const country = String(profile.country_code || profile.country || '').trim().toUpperCase().slice(0, 2)
    const language = String(profile.language || '').trim().toLowerCase().slice(0, 8)
    const currency = String(profile.currency || '').trim().toUpperCase().slice(0, 8)
    if (!country && !language && !currency) return null
    return { country, language, currency }
  } catch {
    return null
  }
}

async function ensureDefaultLanguages(admin: any) {
  try {
    await admin.from('languages').select('code').limit(1)
  } catch {
    // no-op
  }
}

function buildSeoPayloadFromProduct(input: any) {
  const name = sanitizeTextInput(input?.name || input?.title || 'Product', 180) || 'Product'
  const description = sanitizeTextInput(input?.description || input?.short_description || '', 500)
  const country = sanitizeTextInput(input?.country || input?.country_code || 'global', 12).toUpperCase() || 'GLOBAL'
  const language = sanitizeTextInput(input?.language || input?.lang || 'en', 12).toLowerCase() || 'en'
  const currency = sanitizeTextInput(input?.currency || 'USD', 8).toUpperCase() || 'USD'
  const localizedSuffix = country !== 'GLOBAL' ? `${country} ${language}` : language
  const title = `${name} | SaaS Vala ${localizedSuffix}`.slice(0, 120)
  const metaDescription = (description || `Buy ${name} on SaaS Vala with localized pricing and language support.`).slice(0, 240)
  const keywords = safeKeywordsFromText(`${name} ${description} ${country} ${language} ${currency} saas marketplace software`)
  const slugSource = sanitizeSlug(`${name}-${country}-${language}`) || sanitizeSlug(name) || crypto.randomUUID()
  return {
    seo_title: title,
    meta_description: metaDescription,
    keywords,
    slug: slugSource,
    country_code: country,
    language_code: language,
    currency_code: currency,
  }
}

async function upsertSeoMeta(admin: any, productId: string, payload: ReturnType<typeof buildSeoPayloadFromProduct>, actorUserId: string) {
  const row = {
    product_id: productId,
    seo_title: payload.seo_title,
    meta_description: payload.meta_description,
    keywords: payload.keywords,
    slug: payload.slug,
    country_code: payload.country_code,
    language_code: payload.language_code,
    currency_code: payload.currency_code,
    generated_by: actorUserId,
    updated_at: nowIso(),
  }
  const { error } = await admin.from('seo_meta').upsert(row, { onConflict: 'product_id,country_code,language_code' })
  if (error) throw error
  return row
}

async function resolveCurrencyRates(admin: any) {
  const redisKey = 'cache:currency:rates'
  const cached = await redisGetJson<{ base: string; rates: Record<string, number>; updated_at: string }>(redisKey)
  if (cached?.rates) return cached

  const defaults = { base: 'USD', rates: { USD: 1, INR: 83, AED: 3.67, EUR: 0.92, GBP: 0.79, SAR: 3.75 }, updated_at: nowIso() }
  const { data, error } = await admin
    .from('currency_rates')
    .select('base,rates,updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) {
    await redisSetJson(redisKey, defaults, 60 * 30)
    return defaults
  }
  const payload = {
    base: String(data.base || 'USD').toUpperCase(),
    rates: (data.rates && typeof data.rates === 'object' ? data.rates : defaults.rates) as Record<string, number>,
    updated_at: String(data.updated_at || nowIso()),
  }
  await redisSetJson(redisKey, payload, 60 * 30)
  return payload
}

async function translateTextWithCache(admin: any, text: string, targetLang: string, sourceLang = 'en', actorUserId?: string | null) {
  const normalizedText = sanitizeTextInput(text, 12000)
  const toLang = sanitizeTextInput(targetLang, 12).toLowerCase()
  const fromLang = sanitizeTextInput(sourceLang, 12).toLowerCase() || 'en'
  if (!normalizedText) return ''
  if (!toLang || toLang === fromLang || toLang === 'en') return normalizedText

  const cacheKey = await sha256Hex(`${fromLang}|${toLang}|${normalizedText}`)
  const { data: cached } = await admin
    .from('translated_content')
    .select('translated_text')
    .eq('cache_key', cacheKey)
    .maybeSingle()
  if (cached?.translated_text) return String(cached.translated_text)

  // TODO: replace stub translation with a production AI translation provider.
  const translated = `[${toLang}] ${normalizedText}`
  try {
    await admin.from('translated_content').upsert({
      cache_key: cacheKey,
      source_text: normalizedText,
      source_lang: fromLang,
      target_lang: toLang,
      translated_text: translated,
      created_by: actorUserId || null,
      updated_at: nowIso(),
    }, { onConflict: 'cache_key' })
  } catch {
    // no-op
  }
  return translated
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

async function enforceRateLimit(sb: any, userId: string, endpoint: string, req?: Request) {
  const windowSeconds = RATE_LIMIT_WINDOW_SECONDS
  const maxRequests = RATE_LIMIT_MAX_REQUESTS
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowSeconds * 1000).toISOString()

  const ip = readClientIp(req)
  const apiKeyHeader = String(req?.headers.get('x-api-key') || req?.headers.get('apikey') || '').trim()
  const apiKeyHash = apiKeyHeader ? await sha256Hex(apiKeyHeader) : null
  const capacity = maxRequests
  const refillRate = Math.max(0.1, maxRequests / Math.max(1, windowSeconds))

  const scopes = [
    { scope: 'user_endpoint', filterKey: 'user_id', filterValue: userId },
    ...(ip && ip !== 'unknown' ? [{ scope: 'ip_endpoint', filterKey: 'ip', filterValue: ip }] : []),
    ...(apiKeyHash ? [{ scope: 'api_key_endpoint', filterKey: 'api_key_hash', filterValue: apiKeyHash }] : []),
  ]

  for (const s of scopes) {
    let query = sb.from('rate_limits').select('*')
      .eq('scope', s.scope)
      .eq('endpoint', endpoint)
      .gte('window_start', windowStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    query = query.eq(s.filterKey, s.filterValue)
    const { data: existing } = await query

    if (!existing) {
      await sb.from('rate_limits').insert({
        user_id: s.filterKey === 'user_id' ? userId : null,
        endpoint,
        requests_count: 1,
        window_start: now.toISOString(),
        window_seconds: windowSeconds,
        max_requests: maxRequests,
        scope: s.scope,
        ip: s.filterKey === 'ip' ? ip : null,
        api_key_hash: s.filterKey === 'api_key_hash' ? apiKeyHash : null,
        bucket_tokens: capacity - 1,
        burst_capacity: capacity,
        refill_rate_per_sec: refillRate,
        last_refill_at: now.toISOString(),
      })
      continue
    }

    const lastRefillAt = existing.last_refill_at ? new Date(existing.last_refill_at).getTime() : now.getTime()
    const elapsedSeconds = Math.max(0, (now.getTime() - lastRefillAt) / 1000)
    const currentTokens = Number(existing.bucket_tokens ?? existing.max_requests ?? capacity)
    const refillPerSec = Number(existing.refill_rate_per_sec || refillRate)
    const burst = Number(existing.burst_capacity || existing.max_requests || capacity)
    const refilled = Math.min(burst, currentTokens + elapsedSeconds * refillPerSec)
    if (refilled < 1) {
      return err('Rate limit exceeded', 429, 'RATE_LIMITED')
    }
    await sb.from('rate_limits').update({
      requests_count: Number(existing.requests_count || 0) + 1,
      bucket_tokens: refilled - 1,
      last_refill_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', existing.id)
  }
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

const AI_GATEWAY_MAX_TOKENS_DEFAULT = 2048
const AI_GATEWAY_MAX_TOKENS_HARD = 8192
const AI_GATEWAY_CACHE_TTL_SECONDS = Number(Deno.env.get('AI_GATEWAY_CACHE_TTL_SECONDS') || '86400')
const AI_GATEWAY_MINUTE_MAX_REQUESTS = Number(Deno.env.get('AI_GATEWAY_MAX_REQUESTS_PER_MIN') || '30')
const AI_GATEWAY_MINUTE_MAX_TOKENS = Number(Deno.env.get('AI_GATEWAY_MAX_TOKENS_PER_MIN') || '120000')
const AI_GATEWAY_MAX_RETRIES = Number(Deno.env.get('AI_GATEWAY_MAX_RETRIES') || '2')
const AI_GATEWAY_DEFAULT_DAILY_LIMIT = Number(Deno.env.get('AI_GATEWAY_DEFAULT_DAILY_LIMIT') || '1000')
const AI_GATEWAY_MAX_SANITIZED_PROMPT_LENGTH = Number(Deno.env.get('AI_GATEWAY_MAX_SANITIZED_PROMPT_LENGTH') || '12000')
const AI_GATEWAY_LOCAL_FALLBACK_PROMPT_SLICE = Number(Deno.env.get('AI_GATEWAY_LOCAL_FALLBACK_PROMPT_SLICE') || '500')
const AI_GATEWAY_MAX_CIRCUIT_ERROR_LENGTH = Number(Deno.env.get('AI_GATEWAY_MAX_CIRCUIT_ERROR_LENGTH') || '1000')

function normalizeModelType(value: unknown): 'chat' | 'code' | 'image' | 'voice' | 'seo' {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'code' || raw === 'image' || raw === 'voice' || raw === 'seo') return raw
  return 'chat'
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function estimateTokensFromText(text: string) {
  const normalized = String(text || '').trim()
  if (!normalized) return 0
  return Math.max(1, Math.ceil(normalized.length / 4))
}

function pickAiQueueTable(modelType: 'chat' | 'code' | 'image' | 'voice' | 'seo') {
  if (modelType === 'code') return 'ai_code_queue'
  // image + seo both use ai_seo_queue as the shared content-generation queue.
  if (modelType === 'image' || modelType === 'seo') return 'ai_seo_queue'
  if (modelType === 'voice') return 'ai_chat_queue'
  return 'ai_chat_queue'
}

function extractAssistantText(payload: any) {
  const direct = payload?.response || payload?.output || payload?.data?.response || payload?.data?.output
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const maybeChoice = payload?.choices?.[0]?.message?.content
  if (typeof maybeChoice === 'string' && maybeChoice.trim()) return maybeChoice.trim()
  return ''
}

function detectPromptRisk(input: string) {
  const text = String(input || '')
  const lower = text.toLowerCase()
  const blockedPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /reveal\s+(your\s+)?system\s+prompt/i,
    /disable\s+safety/i,
    /jailbreak/i,
  ]
  const sensitivePatterns = [
    /sk-[A-Za-z0-9_]{20,}/i,
    /\b(?:\d[ -]*?){13,19}\b/,
    /password\s*[:=]/i,
    /bearer\s+[a-z0-9\-\._~\+\/]+=*/i,
  ]
  const abusePatterns = [
    /\b(?:ddos|malware|ransomware|phishing)\b/i,
  ]
  const blocked = blockedPatterns.some((p) => p.test(lower)) || abusePatterns.some((p) => p.test(lower))
  const sanitized = text
    .replace(/sk-[A-Za-z0-9_]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]')
    .replace(/(password\s*[:=]\s*)([^\s]+)/gi, '$1[REDACTED]')
    .slice(0, AI_GATEWAY_MAX_SANITIZED_PROMPT_LENGTH)
  return {
    blocked,
    flaggedSensitive: sensitivePatterns.some((p) => p.test(text)),
    sanitized,
  }
}

async function getAiModelByProvider(admin: any, provider: string) {
  const { data } = await admin
    .from('ai_models')
    .select('*')
    .eq('is_active', true)
    .ilike('provider', `%${provider}%`)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

function chooseProviderOrder(args: {
  requestedProvider: string
  requestedModel: string
  highQualityNeeded: boolean
  fastResponse: boolean
  cheapRequired: boolean
}) {
  const base = ['openai', 'gemini', 'claude', 'azure_openai', 'local_model', 'custom_api']
  const providerAliases: Record<string, string> = {
    google: 'gemini',
    anthropic: 'claude',
    azure: 'azure_openai',
    azure_openai: 'azure_openai',
    ollama: 'local_model',
    local: 'local_model',
    custom: 'custom_api',
    custom_api: 'custom_api',
  }
  let primary = 'openai'
  if (args.highQualityNeeded) primary = 'claude'
  else if (args.cheapRequired) primary = 'gemini'
  else if (args.fastResponse) primary = 'openai'
  const requestedProviderNormalizedRaw = String(args.requestedProvider || '').toLowerCase()
  const normalizedRequestedProvider = providerAliases[requestedProviderNormalizedRaw] || requestedProviderNormalizedRaw
  if (normalizedRequestedProvider && base.includes(normalizedRequestedProvider)) primary = normalizedRequestedProvider
  if (args.requestedModel.toLowerCase().includes('claude')) primary = 'claude'
  if (args.requestedModel.toLowerCase().includes('gemini')) primary = 'gemini'
  if (args.requestedModel.toLowerCase().includes('google')) primary = 'gemini'
  if (args.requestedModel.toLowerCase().includes('azure')) primary = 'azure_openai'
  if (args.requestedModel.toLowerCase().includes('ollama')) primary = 'local_model'
  if (args.requestedModel.toLowerCase().includes('custom')) primary = 'custom_api'
  if (args.requestedModel.toLowerCase().includes('local')) primary = 'local_model'
  if (args.requestedModel.toLowerCase().includes('openai') || args.requestedModel.toLowerCase().includes('gpt')) primary = 'openai'
  return [primary, ...base.filter((p) => p !== primary)]
}

async function isCircuitOpen(admin: any, provider: string) {
  try {
    const { data } = await admin
      .from('ai_circuit_breakers')
      .select('*')
      .eq('provider', provider)
      .maybeSingle()
    if (!data) return false
    const openUntil = data.open_until ? new Date(data.open_until).getTime() : 0
    return String(data.state || '').toLowerCase() === 'open' && openUntil > Date.now()
  } catch {
    return false
  }
}

async function markCircuitFailure(admin: any, provider: string, errorMessage: string) {
  try {
    const now = new Date()
    const { data } = await admin.from('ai_circuit_breakers').select('*').eq('provider', provider).maybeSingle()
    const failureCount = Number(data?.failure_count || 0) + 1
    const threshold = Number(data?.threshold || 3)
    const coolOffSeconds = Number(data?.cool_off_seconds || 60)
    const state = failureCount >= threshold ? 'open' : 'closed'
    const openUntil = state === 'open' ? new Date(now.getTime() + coolOffSeconds * 1000).toISOString() : null
    await admin.from('ai_circuit_breakers').upsert({
      provider,
      failure_count: failureCount,
      threshold,
      cool_off_seconds: coolOffSeconds,
      state,
      open_until: openUntil,
      last_failure_at: now.toISOString(),
      last_error: sanitizeTextInput(errorMessage, AI_GATEWAY_MAX_CIRCUIT_ERROR_LENGTH),
      updated_at: now.toISOString(),
    }, { onConflict: 'provider' })
  } catch {
    // no-op
  }
}

async function markCircuitSuccess(admin: any, provider: string) {
  try {
    await admin.from('ai_circuit_breakers').upsert({
      provider,
      failure_count: 0,
      state: 'closed',
      open_until: null,
      last_error: null,
      updated_at: nowIso(),
    }, { onConflict: 'provider' })
  } catch {
    // no-op
  }
}

async function checkAndConsumeAiMinuteLimit(admin: any, userId: string, tokenBudget: number) {
  try {
    const now = new Date()
    const windowStart = new Date(now.getTime() - 60 * 1000).toISOString()
    const endpoint = 'ai/gateway'
    const { data } = await admin.from('ai_gateway_limits').select('*')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('window_start', windowStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) {
      await admin.from('ai_gateway_limits').insert({
        user_id: userId,
        endpoint,
        requests_count: 1,
        tokens_count: tokenBudget,
        window_start: now.toISOString(),
        window_seconds: 60,
        max_requests: AI_GATEWAY_MINUTE_MAX_REQUESTS,
        max_tokens: AI_GATEWAY_MINUTE_MAX_TOKENS,
      })
      return null
    }

    const nextRequests = Number(data.requests_count || 0) + 1
    const nextTokens = Number(data.tokens_count || 0) + tokenBudget
    const reqLimit = Number(data.max_requests || AI_GATEWAY_MINUTE_MAX_REQUESTS)
    const tokenLimit = Number(data.max_tokens || AI_GATEWAY_MINUTE_MAX_TOKENS)
    if (nextRequests > reqLimit || nextTokens > tokenLimit) {
      return err('AI rate limit exceeded', 429, 'AI_RATE_LIMITED')
    }

    await admin.from('ai_gateway_limits').update({
      requests_count: nextRequests,
      tokens_count: nextTokens,
      updated_at: now.toISOString(),
    }).eq('id', data.id)
    return null
  } catch {
    return null
  }
}

async function readAiCache(admin: any, promptHash: string, modelKey: string) {
  try {
    const { data } = await admin
      .from('ai_gateway_cache')
      .select('*')
      .eq('prompt_hash', promptHash)
      .eq('model_key', modelKey)
      .gt('expires_at', nowIso())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data || null
  } catch {
    return null
  }
}

async function writeAiCache(admin: any, params: { promptHash: string; modelKey: string; responseText: string; payload: any; tokens: number; cost: number }) {
  try {
    const expiresAt = new Date(Date.now() + AI_GATEWAY_CACHE_TTL_SECONDS * 1000).toISOString()
    await admin.from('ai_gateway_cache').upsert({
      prompt_hash: params.promptHash,
      model_key: params.modelKey,
      response_text: params.responseText,
      response_payload: params.payload,
      tokens_used: params.tokens,
      cost: params.cost,
      expires_at: expiresAt,
      updated_at: nowIso(),
    }, { onConflict: 'prompt_hash,model_key' })
  } catch {
    // no-op
  }
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

async function handleGeo(method: string, pathParts: string[], _body: any, req: Request) {
  const action = pathParts[0]
  if (!(method === 'GET' && action === 'detect')) return err('Not found', 404)
  const admin = adminClient()
  const auth = await authenticate(req)
  const userLocale = await getLocaleForUser(admin, auth?.userId || null)
  const country = userLocale?.country || resolveCountryFromRequest(req)
  const geoFallback = GEO_FALLBACK_BY_COUNTRY[country] || { language: parseAcceptLanguage(req), currency: 'USD' }
  const language = String(userLocale?.language || geoFallback.language || 'en').toLowerCase()
  const currency = String(userLocale?.currency || geoFallback.currency || 'USD').toUpperCase()
  return json({ country_code: country, currency, language })
}

async function handleTranslate(method: string, _pathParts: string[], body: any, req?: Request) {
  if (method !== 'POST') return err('Not found', 404)
  const text = sanitizeTextInput(body?.text, 12000)
  const targetLang = sanitizeTextInput(body?.target_lang, 12).toLowerCase()
  const sourceLang = sanitizeTextInput(body?.source_lang || 'en', 12).toLowerCase() || 'en'
  if (!text) return err('Missing field: text', 422, 'VALIDATION_ERROR')
  if (!targetLang) return err('Missing field: target_lang', 422, 'VALIDATION_ERROR')

  const admin = adminClient()
  await ensureDefaultLanguages(admin)
  const { data: langRow } = await admin.from('languages').select('code,status').eq('code', targetLang).maybeSingle()
  if (langRow && String(langRow.status || '').toLowerCase() !== 'active') {
    return err('Target language is inactive', 422, 'VALIDATION_ERROR')
  }

  const auth = req ? await authenticate(req) : null
  const cacheKey = await sha256Hex(`${sourceLang}|${targetLang}|${text}`)
  const { data: cachedRow } = await admin
    .from('translated_content')
    .select('translated_text,target_lang')
    .eq('cache_key', cacheKey)
    .maybeSingle()
  if (cachedRow?.translated_text) {
    return json({ translated_text: cachedRow.translated_text, target_lang: cachedRow.target_lang || targetLang, cached: true })
  }
  const translatedText = await translateTextWithCache(admin, text, targetLang, sourceLang, auth?.userId || null)
  return json({ translated_text: translatedText, target_lang: targetLang, cached: false })
}

async function handleCurrency(method: string, pathParts: string[], _body: any) {
  const action = pathParts[0]
  if (!(method === 'GET' && action === 'rates')) return err('Not found', 404)
  const admin = adminClient()
  const data = await resolveCurrencyRates(admin)
  return json(data)
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
    const requestKey = String(body.request_id || body.idempotency_key || '').trim() || generateIdempotencyKey()
    const { data: rpcData, error: rpcError } = await sb.rpc('gateway_create_product_atomic', {
      p_user_id: userId,
      p_payload: {
        ...body,
        slug: body.slug || body.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || '',
      },
      p_request_key: requestKey,
      p_tenant_id: body.tenant_id || null,
    })
    if (rpcError) return err(rpcError.message)
    const data = rpcData?.product
    if (!data?.id) return err('Failed to create product')
    if (body.apk_url) {
      const synced = await syncProductFromApkBuild(sb, {
        product_id: data.id,
        apk_url: body.apk_url,
        version: body.version || '1.0.0',
        build_status: body.build_status || 'success',
        source: 'manual',
      })
      if (synced.error) return err(synced.error, synced.status || 400)
    }
    invalidateProductCache()
    await logActivity(admin, 'product', data.id, 'created', userId, { name: body.name })
    await emitDomainEvent(admin, 'product_created', { product_id: data.id, user_id: userId }, body.tenant_id || null)
    await enqueueSearchIndex(admin, 'products', data.id, {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      status: data.status,
    }, body.tenant_id || null)
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
    if (body.apk_url !== undefined) {
      const synced = await syncProductFromApkBuild(sb, {
        product_id: id,
        apk_url: body.apk_url || null,
        version: body.version || null,
        build_status: body.build_status || (body.apk_url ? 'success' : 'pending'),
        source: body.source || 'manual',
        build_id: body.build_id || null,
      })
      if (synced.error) return err(synced.error, synced.status || 400)
    }
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

async function countTableRows(sb: any, table: string) {
  try {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true })
    if (error) return 0
    return Number(count || 0)
  } catch {
    return 0
  }
}

function isTableMissingError(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null
  return String(maybeError?.code || '') === '42P01' || /does not exist/i.test(String(maybeError?.message || ''))
}

async function handleDashboard(method: string, userId: string, sb: any) {
  if (method !== 'GET') return err('Not found', 404)

  const [productsCount, leadsCount, subscriptionsCount, aiUsageCount] = await Promise.all([
    countTableRows(sb, 'products'),
    countTableRows(sb, 'leads'),
    countTableRows(sb, 'subscriptions'),
    countTableRows(sb, 'ai_usage_daily'),
  ])

  const { data: wallet } = await sb.from('wallets').select('balance, locked_balance').eq('user_id', userId).maybeSingle()

  return ok({
    products: productsCount,
    leads: leadsCount,
    subscriptions: subscriptionsCount,
    ai_usage_points: aiUsageCount,
    wallet: {
      balance: Number(wallet?.balance || 0),
      locked_balance: Number(wallet?.locked_balance || 0),
    },
  })
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

  // POST /marketplace/favorite/toggle
  if (method === 'POST' && action === 'favorite' && pathParts[1] === 'toggle') {
    const missing = validateRequired(body, ['product_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const productId = String(body.product_id || '').trim()
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')

    const { data: product } = await sb.from('products').select('id, name').eq('id', productId).maybeSingle()
    const productName = String(product?.name || body.product_name || productId).slice(0, 180)

    const { data: existing, error: findError } = await sb
      .from('product_wishlists')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle()
    if (findError) return err(findError.message)

    if (existing?.id) {
      const { error: delError } = await sb.from('product_wishlists').delete().eq('id', existing.id)
      if (delError) return err(delError.message)
      await logActivity(admin, 'product_wishlist', existing.id, 'removed', userId, { product_id: productId })
      return json({ success: true, active: false, action: 'removed' })
    }

    const { data: inserted, error: insError } = await sb
      .from('product_wishlists')
      .insert({ user_id: userId, product_id: productId, product_name: productName })
      .select('id')
      .single()
    if (insError) return err(insError.message)
    await logActivity(admin, 'product_wishlist', inserted.id, 'added', userId, { product_id: productId })
    return json({ success: true, active: true, action: 'added' })
  }

  // GET /marketplace/favorite/list
  if (method === 'GET' && action === 'favorite' && pathParts[1] === 'list') {
    const { data, error } = await sb
      .from('product_wishlists')
      .select('id, product_id, product_name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return err(error.message)
    return json({ data: data || [] })
  }

  // POST /marketplace/cart/add
  if (method === 'POST' && action === 'cart' && pathParts[1] === 'add') {
    const missing = validateRequired(body, ['product_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const productId = String(body.product_id || '').trim()
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    const qty = Math.max(1, Number(body.qty || 1))

    const { data: existing, error: findError } = await sb
      .from('cart_items')
      .select('id, qty')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle()
    if (findError) return err(findError.message)

    let itemId = existing?.id || ''
    let nextQty = qty

    if (existing?.id) {
      nextQty = Math.max(1, Number(existing.qty || 0) + qty)
      const { error: updError } = await sb
        .from('cart_items')
        .update({ qty: nextQty, updated_at: nowIso() })
        .eq('id', existing.id)
      if (updError) return err(updError.message)
      itemId = existing.id
    } else {
      const { data: inserted, error: insError } = await sb
        .from('cart_items')
        .insert({ user_id: userId, product_id: productId, qty: nextQty })
        .select('id')
        .single()
      if (insError) return err(insError.message)
      itemId = inserted.id
    }

    const { count } = await sb
      .from('cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    await logActivity(admin, 'cart_item', itemId, 'upserted', userId, { product_id: productId, qty: nextQty })
    return json({ success: true, item_id: itemId, qty: nextQty, cart_count: Number(count || 0) })
  }

  // GET /marketplace/cart/list
  if (method === 'GET' && action === 'cart' && pathParts[1] === 'list') {
    const { data, error } = await sb
      .from('cart_items')
      .select('id, product_id, qty, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(500)
    if (error) return err(error.message)
    return json({ data: data || [] })
  }

  // POST /marketplace/rating/add
  if (method === 'POST' && action === 'rating' && pathParts[1] === 'add') {
    const missing = validateRequired(body, ['product_id', 'rating'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const productId = String(body.product_id || '').trim()
    const rating = Number(body.rating)
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return err('rating must be integer between 1 and 5', 422, 'VALIDATION_ERROR')
    }

    const review = sanitizeTextInput(body.review || '', 1200)
    const productTitle = String(body.product_title || '').slice(0, 180) || null

    const { data: upserted, error: upsertError } = await sb
      .from('product_ratings')
      .upsert(
        { user_id: userId, product_id: productId, rating, review: review || null, product_title: productTitle, updated_at: nowIso() },
        { onConflict: 'user_id,product_id' }
      )
      .select('id')
      .single()
    if (upsertError) return err(upsertError.message)

    const { data: aggregateRows, error: aggregateError } = await sb
      .from('product_ratings')
      .select('rating')
      .eq('product_id', productId)
    if (aggregateError) return err(aggregateError.message)
    const ratings = (aggregateRows || []).map((r: any) => Number(r.rating || 0)).filter((v: number) => Number.isFinite(v))
    const avgRating = ratings.length ? Number((ratings.reduce((s: number, v: number) => s + v, 0) / ratings.length).toFixed(2)) : rating

    await sb.from('products').update({ rating: avgRating }).eq('id', productId)
    await logActivity(admin, 'product_rating', upserted.id, 'upserted', userId, { product_id: productId, rating, avg_rating: avgRating })

    return json({ success: true, rating, avg_rating: avgRating, total_ratings: ratings.length })
  }

  // GET /marketplace/rating/list
  if (method === 'GET' && action === 'rating' && pathParts[1] === 'list') {
    const productId = String(body.product_id || '').trim()
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb
      .from('product_ratings')
      .select('id, user_id, product_id, product_title, rating, review, created_at, updated_at')
      .eq('product_id', productId)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) return err(error.message)
    const ratings = (data || []).map((r: any) => Number(r.rating || 0)).filter((v: number) => Number.isFinite(v))
    const avgRating = ratings.length ? Number((ratings.reduce((s: number, v: number) => s + v, 0) / ratings.length).toFixed(2)) : 0
    return json({ data: data || [], avg_rating: avgRating, total_ratings: ratings.length })
  }

  // POST /marketplace/comment/add
  if (method === 'POST' && action === 'comment' && pathParts[1] === 'add') {
    const missing = validateRequired(body, ['product_id', 'message'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const productId = String(body.product_id || '').trim()
    const message = sanitizeTextInput(body.message || '', 1000)
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    if (!message) return err('message is required', 422, 'VALIDATION_ERROR')

    const spamErr = await enforceRateLimit(admin, userId, `comment/${productId}`, undefined)
    if (spamErr) return spamErr

    const { data: inserted, error: insError } = await sb
      .from('product_comments')
      .insert({ user_id: userId, product_id: productId, message })
      .select('id, user_id, product_id, message, created_at')
      .single()
    if (insError) return err(insError.message)
    await logActivity(admin, 'product_comment', inserted.id, 'added', userId, { product_id: productId })
    return json({ success: true, data: inserted }, 201)
  }

  // GET /marketplace/comment/list?product_id=
  if (method === 'GET' && action === 'comment' && pathParts[1] === 'list') {
    const productId = String(body.product_id || '').trim()
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb
      .from('product_comments')
      .select('id, user_id, product_id, message, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) return err(error.message)
    return json({ data: data || [] })
  }

  // POST /marketplace/promo/create
  if (method === 'POST' && action === 'promo' && pathParts[1] === 'create') {
    const missing = validateRequired(body, ['product_id'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const productId = String(body.product_id || '').trim()
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    const ownerId = String(body.reseller_id || body.user_id || userId)
    if (ownerId !== userId) return err('owner mismatch', 403, 'FORBIDDEN')

    const baseCode = Math.random().toString(36).slice(2, 8).toUpperCase()
    const code = `${baseCode}${Math.random().toString(36).slice(2, 4).toUpperCase()}`

    const { data: inserted, error: insError } = await sb
      .from('promo_links')
      .insert({ code, product_id: productId, owner_id: ownerId })
      .select('id, code, product_id, owner_id, clicks, conversions, revenue')
      .single()
    if (insError) return err(insError.message)

    const productUrl = `/product/${encodeURIComponent(productId)}?ref=${encodeURIComponent(code)}`
    await logActivity(admin, 'promo_link', inserted.id, 'created', userId, { product_id: productId, code })
    return json({ success: true, data: { ...inserted, url: productUrl } }, 201)
  }

  // GET /marketplace/promo/list
  if (method === 'GET' && action === 'promo' && pathParts[1] === 'list') {
    const { data, error } = await sb
      .from('promo_links')
      .select('id, code, product_id, owner_id, clicks, conversions, revenue, created_at, updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(500)
    if (error) return err(error.message)
    const mapped = (data || []).map((row: any) => ({
      ...row,
      url: `/product/${encodeURIComponent(String(row.product_id))}?ref=${encodeURIComponent(String(row.code))}`,
    }))
    return json({ data: mapped })
  }

  // POST /marketplace/promo/track-click
  if (method === 'POST' && action === 'promo' && pathParts[1] === 'track-click') {
    const missing = validateRequired(body, ['code'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const code = String(body.code || '').trim().toUpperCase()
    if (!code) return err('code is required', 422, 'VALIDATION_ERROR')

    const { data: row, error: findError } = await sb
      .from('promo_links')
      .select('id, code, product_id, owner_id, clicks')
      .eq('code', code)
      .maybeSingle()
    if (findError) return err(findError.message)
    if (!row?.id) return err('Promo code not found', 404, 'NOT_FOUND')

    const nextClicks = Number(row.clicks || 0) + 1
    const { error: updError } = await sb
      .from('promo_links')
      .update({ clicks: nextClicks, updated_at: nowIso() })
      .eq('id', row.id)
    if (updError) return err(updError.message)

    return json({
      success: true,
      data: {
        id: row.id,
        code: row.code,
        product_id: row.product_id,
        owner_id: row.owner_id,
        clicks: nextClicks,
        redirect: `/product/${encodeURIComponent(String(row.product_id))}?ref=${encodeURIComponent(code)}`,
      },
    })
  }

  // POST /marketplace/promo/track-conversion
  if (method === 'POST' && action === 'promo' && pathParts[1] === 'track-conversion') {
    const missing = validateRequired(body, ['code'])
    if (missing) return err(missing, 422, 'VALIDATION_ERROR')
    const code = String(body.code || '').trim().toUpperCase()
    const amount = Number(body.revenue || body.amount || 0)
    if (!code) return err('code is required', 422, 'VALIDATION_ERROR')

    const { data: row, error: findError } = await sb
      .from('promo_links')
      .select('id, conversions, revenue, owner_id, product_id')
      .eq('code', code)
      .maybeSingle()
    if (findError) return err(findError.message)
    if (!row?.id) return err('Promo code not found', 404, 'NOT_FOUND')

    const nextConversions = Number(row.conversions || 0) + 1
    const nextRevenue = Number(row.revenue || 0) + (Number.isFinite(amount) ? amount : 0)
    const { error: updError } = await sb
      .from('promo_links')
      .update({ conversions: nextConversions, revenue: nextRevenue, updated_at: nowIso() })
      .eq('id', row.id)
    if (updError) return err(updError.message)

    await logActivity(admin, 'promo_link', row.id, 'conversion', userId, { code, amount: Number.isFinite(amount) ? amount : 0 })
    return json({ success: true, data: { id: row.id, conversions: nextConversions, revenue: nextRevenue } })
  }

  // GET /marketplace/promo/resolve?code=
  if (method === 'GET' && action === 'promo' && pathParts[1] === 'resolve') {
    const code = String(body.code || '').trim().toUpperCase()
    if (!code) return err('code is required', 422, 'VALIDATION_ERROR')
    const { data: row, error } = await sb
      .from('promo_links')
      .select('id, code, product_id, owner_id, clicks, conversions, revenue')
      .eq('code', code)
      .maybeSingle()
    if (error) return err(error.message)
    if (!row?.id) return err('Promo code not found', 404, 'NOT_FOUND')
    return json({ data: row })
  }

  // GET /marketplace/products
  if (method === 'GET' && action === 'products') {
    const redisKey = 'cache:marketplace:products'
    const redisCached = await redisGetJson<any[]>(redisKey)
    if (redisCached) return json({ data: redisCached, cached: true, cache: 'redis' })
    const cacheValid = productListCache.data && Date.now() < productListCache.expiresAt
    if (cacheValid) return json({ data: productListCache.data, cached: true })

    const { data, error } = await sb.from('products')
      .select('id, name, slug, description, short_description, price, status, features, thumbnail_url, git_repo_url, marketplace_visible, apk_url, build_id, build_status, demo_url, demo_login, demo_password, demo_enabled, featured, trending, business_type, deploy_status, discount_percent, rating, tags, apk_enabled, license_enabled')
      .eq('marketplace_visible', true)
      .order('created_at', { ascending: false }).limit(500)
    if (error) return err(error.message)
    productListCache.data = data || []
    productListCache.expiresAt = Date.now() + PRODUCT_LIST_CACHE_TTL_MS
    await redisSetJson(redisKey, productListCache.data, Math.floor(PRODUCT_LIST_CACHE_TTL_MS / 1000))
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
    const { data: atomicData, error: atomicError } = await sb.rpc('gateway_payment_init_atomic', {
      p_user_id: userId,
      p_product_id: body.product_id,
      p_amount: amount,
      p_currency: body.currency || 'INR',
      p_payment_method: body.payment_method || 'gateway',
      p_gateway: body.gateway || 'manual',
      p_gateway_reference: body.gateway_reference || null,
      p_meta: body.meta || {},
      p_idempotency_key: requestedIdempotency,
      p_lock_wallet: body.lock_wallet === true || body.payment_method === 'wallet',
      p_tenant_id: body.tenant_id || null,
    })
    if (atomicError) return err(atomicError.message)
    const order = atomicData?.order
    const payment = atomicData?.payment
    if (!order?.id || !payment?.id) return err('Failed to initialize payment')

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

const DEFAULT_ALIAS_MAX_COUPON_USES = 999999
const MAX_ANALYTICS_RECORDS = 100000

function parseQueryFilters(raw: unknown): Record<string, string> {
  if (!raw) return {}
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v === undefined || v === null) return acc
      acc[String(k).toLowerCase()] = String(v)
      return acc
    }, {})
  }
  const text = String(raw || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return parseQueryFilters(parsed)
  } catch {
    // no-op
  }
  return text.split(',').reduce<Record<string, string>>((acc, pair) => {
    const [k, v] = pair.split(':').map((p) => p?.trim())
    if (k && v) acc[k.toLowerCase()] = v
    return acc
  }, {})
}

function mapBannerRowToResponse(row: any) {
  return {
    id: row.id,
    title: row.title,
    product_id: row.link_url?.includes('/marketplace/product/')
      ? String(row.link_url).split('/marketplace/product/')[1] || null
      : null,
    category: row.badge || null,
    description: row.subtitle || null,
    image: row.image_url || null,
    button_action: row.link_url || null,
    priority: Number(row.sort_order || 1),
    status: row.is_active ? 'active' : 'inactive',
    start_date: row.start_date || null,
    end_date: row.end_date || null,
  }
}

async function handleBannerAliases(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]

  // POST /banner/create
  if (method === 'POST' && action === 'create') {
    const title = String(body.title || '').trim()
    if (!title) return err('title is required', 422, 'VALIDATION_ERROR')
    const productId = String(body.product_id || '').trim()
    const payload = {
      title,
      subtitle: body.description || null,
      image_url: body.image || null,
      badge: body.category || null,
      link_url: body.button_action || (productId ? `/marketplace/product/${productId}` : null),
      sort_order: toPositiveNumber(body.priority, 1),
      is_active: String(body.status || 'active').toLowerCase() !== 'inactive',
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      updated_at: nowIso(),
    }
    const { data, error } = await sb.from('marketplace_banners').insert(payload).select('*').single()
    if (error) return err(error.message)
    await logActivity(admin, 'banner', data.id, 'created', userId, payload)
    return json({ data: mapBannerRowToResponse(data) }, 201)
  }

  // GET /banner/list
  if (method === 'GET' && action === 'list') {
    const { data, error } = await sb.from('marketplace_banners').select('*').order('sort_order', { ascending: true })
    if (error) return err(error.message)
    return json({ data: (data || []).map(mapBannerRowToResponse) })
  }

  // PUT /banner/update
  if (method === 'PUT' && action === 'update') {
    const id = String(body.id || '').trim()
    if (!id) return err('id is required', 422, 'VALIDATION_ERROR')
    const productId = String(body.product_id || '').trim()
    const updates: Record<string, unknown> = {
      updated_at: nowIso(),
    }
    if (body.title !== undefined) updates.title = String(body.title || '').trim()
    if (body.description !== undefined) updates.subtitle = body.description || null
    if (body.image !== undefined) updates.image_url = body.image || null
    if (body.category !== undefined) updates.badge = body.category || null
    if (body.button_action !== undefined || body.product_id !== undefined) {
      updates.link_url = body.button_action || (productId ? `/marketplace/product/${productId}` : null)
    }
    if (body.priority !== undefined) updates.sort_order = toPositiveNumber(body.priority, 1)
    if (body.status !== undefined) updates.is_active = String(body.status || '').toLowerCase() !== 'inactive'
    if (body.start_date !== undefined) updates.start_date = body.start_date || null
    if (body.end_date !== undefined) updates.end_date = body.end_date || null

    const { data, error } = await sb.from('marketplace_banners').update(updates).eq('id', id).select('*').single()
    if (error) return err(error.message)
    await logActivity(admin, 'banner', id, 'updated', userId, updates)
    return json({ data: mapBannerRowToResponse(data) })
  }

  // DELETE /banner/delete
  if (method === 'DELETE' && action === 'delete') {
    const id = String(body.id || body.banner_id || '').trim()
    if (!id) return err('id is required', 422, 'VALIDATION_ERROR')
    const { error } = await sb.from('marketplace_banners').delete().eq('id', id)
    if (error) return err(error.message)
    await logActivity(admin, 'banner', id, 'deleted', userId)
    return json({ success: true })
  }

  return err('Not found', 404)
}

async function handleOfferAliases(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]

  // POST /offer/create
  if (method === 'POST' && action === 'create') {
    const productId = String(body.product_id || '').trim()
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    const discount = toPositiveNumber(body.discount ?? body.discount_percent, 0)
    if (discount <= 0) return err('discount is required', 422, 'VALIDATION_ERROR')
    const code = String(body.code || `OFF-${crypto.randomUUID().slice(0, 8)}`).toUpperCase()
    const payload = {
      code,
      description: `product:${productId}`,
      discount_type: 'percent',
      discount_value: discount,
      min_order: 0,
      max_uses: toPositiveNumber(body.max_uses, DEFAULT_ALIAS_MAX_COUPON_USES),
      is_active: String(body.status || 'active').toLowerCase() !== 'inactive',
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      updated_at: nowIso(),
    }
    const { data, error } = await sb.from('marketplace_coupons').insert(payload).select('*').single()
    if (error) return err(error.message)
    const { error: productErr } = await sb.from('products').update({ discount_percent: discount, updated_at: nowIso() }).eq('id', productId)
    if (!productErr) invalidateProductCache()
    await logActivity(admin, 'offer', data.id, 'created', userId, { ...payload, product_id: productId })
    return json({
      data: {
        id: data.id,
        product_id: productId,
        discount: discount,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.is_active ? 'active' : 'inactive',
      },
    }, 201)
  }

  // GET /offer/list
  if (method === 'GET' && action === 'list') {
    const { data, error } = await sb.from('marketplace_coupons').select('*').order('created_at', { ascending: false })
    if (error) return err(error.message)
    return json({
      data: (data || []).map((row: any) => ({
        id: row.id,
        product_id: String(row.description || '').startsWith('product:') ? String(row.description).replace('product:', '') : null,
        discount: Number(row.discount_value || 0),
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        status: row.is_active ? 'active' : 'inactive',
      })),
    })
  }

  return err('Not found', 404)
}

async function handleProductAliases(method: string, pathParts: string[], body: any, userId: string, sb: any, req?: Request) {
  const admin = adminClient()
  const action = pathParts[0]

  // POST /product/create
  if (method === 'POST' && action === 'create') {
    const name = String(body.name || '').trim()
    if (!name) return err('name is required', 422, 'VALIDATION_ERROR')
    const payload: Record<string, unknown> = {
      name,
      slug: body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      price: Number(body.price || 0),
      status: body.status || 'draft',
      business_type: body.category || body.business_type || null,
      short_description: body.description || null,
      apk_url: body.apk_url || null,
      build_id: body.build_id || null,
      build_status: body.build_status || (body.apk_url ? 'success' : 'pending'),
      features: Array.isArray(body.features) ? body.features : [],
      marketplace_visible: true,
      updated_at: nowIso(),
    }
    const { data, error } = await sb.from('products').insert(payload).select('*').single()
    if (error) return err(error.message)
    if (body.apk_url) {
      const synced = await syncProductFromApkBuild(sb, {
        product_id: data.id,
        apk_url: body.apk_url,
        version: body.version || '1.0.0',
        build_status: body.build_status || 'success',
        source: body.source || 'manual',
        build_id: body.build_id || null,
      })
      if (synced.error) return err(synced.error, synced.status || 400)
    }
    invalidateProductCache()
    await logActivity(admin, 'product', data.id, 'created', userId, payload)
    try {
      const seoPayload = buildSeoPayloadFromProduct({
        ...data,
        country: body.country || body.country_code || 'GLOBAL',
        language: body.language || body.lang || 'en',
        currency: body.currency || 'USD',
      })
      await upsertSeoMeta(admin, data.id, seoPayload, userId)
    } catch (seoError: any) {
      console.warn('SEO meta upsert failed on product create:', seoError?.message || seoError)
    }
    return json({ data }, 201)
  }

  // GET /product/list
  if (method === 'GET' && action === 'list') {
    const queryCountry = sanitizeTextInput(req ? new URL(req.url).searchParams.get('country') : '', 8)
    const queryCountryCode = sanitizeTextInput(req ? new URL(req.url).searchParams.get('country_code') : '', 8)
    const queryLang = sanitizeTextInput(req ? new URL(req.url).searchParams.get('lang') : '', 8)
    const queryLanguage = sanitizeTextInput(req ? new URL(req.url).searchParams.get('language') : '', 8)
    const queryCurrency = sanitizeTextInput(req ? new URL(req.url).searchParams.get('currency') : '', 8)
    const countryCode = sanitizeTextInput(queryCountry || queryCountryCode || body.country || body.country_code || resolveCountryFromRequest(req), 8).toUpperCase() || 'US'
    const requestedLanguage = sanitizeTextInput(queryLang || queryLanguage || body.lang || body.language || parseAcceptLanguage(req), 8).toLowerCase() || 'en'
    const requestedCurrency = sanitizeTextInput(queryCurrency || body.currency, 8).toUpperCase()
    const geoDefaults = GEO_FALLBACK_BY_COUNTRY[countryCode] || { language: requestedLanguage || 'en', currency: 'USD' }
    const language = requestedLanguage || geoDefaults.language || 'en'
    const currency = requestedCurrency || geoDefaults.currency || 'USD'

    const { data, error } = await sb
      .from('products')
      .select('id, name, slug, description, short_description, price, status, business_type, features, apk_url, build_id, build_status, discount_percent, rating, created_at, marketplace_visible')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return err(error.message)
    const rows = data || []
    const ratesPayload = await resolveCurrencyRates(admin)
    const selectedRate = Number((ratesPayload.rates || {})[currency] || 1)
    const safeRate = Number.isFinite(selectedRate) && selectedRate > 0 ? selectedRate : 1

    const localized = await Promise.all(rows.map(async (row: any, index: number) => {
      const defaultName = String(row.name || '')
      const defaultDescription = String(row.short_description || row.description || '')
      let localizedTitle = defaultName
      let localizedDescription = defaultDescription

      if (index < PRODUCT_LIST_TRANSLATION_LIMIT) {
        try {
          localizedTitle = await translateTextWithCache(admin, defaultName, language, 'en', userId)
          localizedDescription = await translateTextWithCache(admin, defaultDescription, language, 'en', userId)
        } catch {
          localizedTitle = defaultName
          localizedDescription = defaultDescription
        }
      }

      const basePrice = Number(row.price || 0)
      const convertedPrice = toMoney(basePrice * safeRate)
      return {
        ...row,
        name: localizedTitle || defaultName,
        title: localizedTitle || defaultName,
        short_description: localizedDescription || defaultDescription,
        description: localizedDescription || row.description || '',
        price_base_usd: basePrice,
        price_converted: convertedPrice,
        price: convertedPrice,
        currency,
        language,
        country_code: countryCode,
      }
    }))

    return json({ data: localized, locale: { country_code: countryCode, language, currency }, rates: ratesPayload })
  }

  // PUT /product/update
  if (method === 'PUT' && action === 'update') {
    const id = String(body.id || body.product_id || '').trim()
    if (!id) return err('id is required', 422, 'VALIDATION_ERROR')
    const updates: Record<string, unknown> = { updated_at: nowIso() }
    if (body.name !== undefined) updates.name = body.name
    if (body.slug !== undefined) updates.slug = body.slug
    if (body.price !== undefined) updates.price = Number(body.price || 0)
    if (body.status !== undefined) updates.status = body.status
    if (body.category !== undefined || body.business_type !== undefined) updates.business_type = body.category || body.business_type || null
    if (body.description !== undefined) updates.short_description = body.description || null
    if (body.apk_url !== undefined) updates.apk_url = body.apk_url || null
    if (body.build_status !== undefined) updates.build_status = body.build_status || null
    if (body.build_id !== undefined) updates.build_id = body.build_id || null
    if (body.features !== undefined) updates.features = Array.isArray(body.features) ? body.features : []
    const { data, error } = await sb.from('products').update(updates).eq('id', id).select('*').single()
    if (error) return err(error.message)
    if (body.apk_url !== undefined || body.build_status !== undefined || body.build_id !== undefined) {
      const synced = await syncProductFromApkBuild(sb, {
        product_id: id,
        apk_url: body.apk_url || null,
        version: body.version || null,
        build_status: body.build_status || (body.apk_url ? 'success' : 'pending'),
        source: body.source || 'manual',
        build_id: body.build_id || null,
      })
      if (synced.error) return err(synced.error, synced.status || 400)
    }
    invalidateProductCache()
    await logActivity(admin, 'product', id, 'updated', userId, updates)
    try {
      const seoPayload = buildSeoPayloadFromProduct({
        ...data,
        country: body.country || body.country_code || 'GLOBAL',
        language: body.language || body.lang || 'en',
        currency: body.currency || 'USD',
      })
      await upsertSeoMeta(admin, id, seoPayload, userId)
    } catch (seoError: any) {
      console.warn('SEO meta upsert failed on product update:', seoError?.message || seoError)
    }
    return json({ data })
  }

  // GET /product/search?q=&filter=
  if (method === 'GET' && action === 'search') {
    const q = sanitizeSearchTerm(String(body.q || '').trim())
    const filters = parseQueryFilters(body.filter)
    let query = sb
      .from('products')
      .select('id, name, slug, description, short_description, price, status, business_type, features, apk_url, discount_percent, rating, tags, created_at, marketplace_visible')
      .eq('marketplace_visible', true)
      .order('created_at', { ascending: false })
      .limit(500)

    if (q) {
      query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,description.ilike.%${q}%,business_type.ilike.%${q}%`)
    }
    if (filters.category) {
      const safeCategory = sanitizeSearchTerm(filters.category)
      if (safeCategory) query = query.ilike('business_type', `%${safeCategory}%`)
    }

    const { data, error } = await query
    if (error) return err(error.message)
    let rows = data || []

    if (filters.rating) {
      const minRating = Number(filters.rating)
      if (Number.isFinite(minRating)) rows = rows.filter((row: any) => Number(row.rating || 0) >= minRating)
    }
    if (filters.price) {
      const maxPrice = Number(filters.price)
      if (Number.isFinite(maxPrice)) rows = rows.filter((row: any) => Number(row.price || 0) <= maxPrice)
    }
    if (filters.language) {
      const token = filters.language.toLowerCase()
      rows = rows.filter((row: any) => {
        const tags = Array.isArray(row.tags) ? row.tags.map((t: unknown) => String(t).toLowerCase()) : []
        return tags.some((t: string) => t.includes(token))
      })
    }
    return json({ data: rows })
  }

  return err('Not found', 404)
}

async function handleCategoryAliases(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]

  // POST /category/create
  if (method === 'POST' && action === 'create') {
    const name = String(body.name || body.category_name || '').trim()
    if (!name) return err('name is required', 422, 'VALIDATION_ERROR')
    const slug = String(body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    const levelRaw = String(body.level || body.type || 'macro').toLowerCase()
    const level = levelRaw === 'sub' || levelRaw === 'micro' ? levelRaw : 'macro'
    const payload = {
      name,
      slug,
      level,
      parent_id: body.parent_id || null,
      description: body.description || null,
      icon: body.icon || null,
      sort_order: toPositiveNumber(body.sort_order, 1),
      is_active: body.is_active !== false,
      created_by: userId,
      updated_at: nowIso(),
    }
    const { data, error } = await sb.from('categories').insert(payload).select('*').single()
    if (error) return err(error.message)
    await logActivity(admin, 'category', data.id, 'created', userId, payload)
    return json({ data }, 201)
  }

  // GET /category/tree
  if (method === 'GET' && action === 'tree') {
    const { data, error } = await sb.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true })
    if (error) return err(error.message)
    const rows = data || []
    const byParent = new Map<string, any[]>()
    rows.forEach((row: any) => {
      const key = row.parent_id || 'root'
      const list = byParent.get(key) || []
      list.push(row)
      byParent.set(key, list)
    })
    const toNode = (row: any): any => ({
      ...row,
      children: (byParent.get(row.id) || []).map(toNode),
    })
    const tree = (byParent.get('root') || []).map(toNode)
    return json({ data: tree })
  }

  return err('Not found', 404)
}

async function handleAnalyticsAliases(method: string, pathParts: string[], body: any, _userId: string, sb: any) {
  const action = pathParts[0]

  // GET /analytics/sales
  if (method === 'GET' && action === 'sales') {
    const { data, error } = await sb
      .from('marketplace_orders')
      .select('product_id, product_name, status, amount, final_amount, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_ANALYTICS_RECORDS)
    if (error) return err(error.message)

    const rows = data || []
    const completed = rows.filter((row: any) => row.status === 'completed')
    const totalSales = completed.length
    const revenue = completed.reduce((sum: number, row: any) => sum + Number(row.final_amount ?? row.amount ?? 0), 0)
    const orderCompletionRate = rows.length > 0 ? Number(((totalSales / rows.length) * 100).toFixed(2)) : 0

    const counts = new Map<string, { product_id: string | null; product_name: string | null; count: number }>()
    completed.forEach((row: any) => {
      const key = String(row.product_id || row.product_name || 'unknown')
      const prev = counts.get(key) || { product_id: row.product_id || null, product_name: row.product_name || null, count: 0 }
      prev.count += 1
      counts.set(key, prev)
    })

    const ranked = Array.from(counts.values()).sort((a, b) => b.count - a.count)
    return json({
      data: {
        total_sales: totalSales,
        revenue: Number(revenue.toFixed(2)),
        top_selling: ranked.slice(0, 10),
        low_selling: [...ranked].sort((a, b) => a.count - b.count).slice(0, 10),
        conversion_rate: orderCompletionRate,
        conversion_basis: 'completed_orders / total_marketplace_orders',
      },
    })
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
  await emitDomainEvent(admin, 'payment_success', {
    payment_id: payment.id,
    order_id: order.id,
    user_id: order.user_id,
    amount: order.amount,
    currency: order.currency || 'INR',
  }, order.tenant_id || null)
  await logActivity(admin, 'payment', payment.id, 'marked_paid', actorUserId, { order_id: order.id })

  return { order_id: order.id, subscription_id: subscriptionId, license_key: createdLicense?.license_key || null }
}

// ===================== 5. KEYS =====================
async function handleKeys(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0]
  const subAction = pathParts[1]
  const roles = await getUserRoles(userId)
  const isAdmin = roles.includes('admin') || roles.includes('super_admin')
  const { data: resellerState } = await admin
    .from('resellers')
    .select('id, status, is_active')
    .eq('user_id', userId)
    .maybeSingle()
  const isReseller = !!resellerState?.id && roles.includes('reseller')

  if (isReseller && (resellerState?.status !== 'active' || resellerState?.is_active === false)) {
    return err('Reseller account suspended', 403, 'RESELLER_SUSPENDED')
  }

  await expireKeysIfNeeded(admin)

  const applyKeyScope = (query: any) => {
    if (isAdmin) return query
    if (isReseller && resellerState?.id) return query.eq('reseller_id', resellerState.id)
    return query.eq('created_by', userId)
  }

  // GET /keys and GET /keys/search
  if (method === 'GET' && (!action || action === 'search')) {
    const search = sanitizeSearchTerm(sanitizeTextInput(body?.search || body?.q || '', 200))
    const status = sanitizeSearchTerm(sanitizeTextInput(body?.status || '', 40))
    const keyType = sanitizeSearchTerm(sanitizeTextInput(body?.type || body?.key_type || '', 40))
    const owner = sanitizeSearchTerm(sanitizeTextInput(body?.user || body?.owner || body?.owner_email || '', 120))
    const resellerId = sanitizeSearchTerm(sanitizeTextInput(body?.reseller || body?.reseller_id || '', 80))

    let query = applyKeyScope(
      admin.from('license_keys').select('*').order('created_at', { ascending: false }),
    )

    if (status) query = query.eq('status', status)
    if (keyType) query = query.eq('key_type', keyType)
    if (owner) query = query.or(`owner_email.ilike.%${owner}%,owner_name.ilike.%${owner}%`)
    if (isAdmin && resellerId) query = query.eq('reseller_id', resellerId)
    if (search) {
      query = query.or(
        `owner_name.ilike.%${search}%,owner_email.ilike.%${search}%,notes.ilike.%${search}%`,
      )
    }

    const { data, error } = await query
    if (error) return err(error.message)

    const normalized = (data || []).map((row: any) => {
      const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {}
      const usageLimit = Math.max(0, Number(meta?.usage_limit ?? row?.max_devices ?? 0) || 0)
      const usedCount = Math.max(0, Number(meta?.used_count ?? 0) || 0)
      const masked = maskLicenseKey(row.license_key)
      return {
        ...row,
        key_id: row.id,
        key_value: masked,
        type: row.key_type,
        user_id: row.created_by || null,
        usage_limit: usageLimit,
        used_count: usedCount,
        expiry_date: row.expires_at || null,
        license_key: masked,
      }
    })

    return json({ data: normalized })
  }

  // POST /keys/generate
  if (method === 'POST' && action === 'generate') {
    const quantity = Math.max(1, Number(body.quantity || 1))
    const usageLimit = Math.max(0, Number(body.usage_limit ?? body.max_devices ?? 0) || 0)
    const useAtomicFlow = isReseller
      || quantity > 1
      || !!body.client_name
      || !!body.idempotency_key
      || !!body.cost_per_key
      || !!body.min_balance

    if (isReseller && (body.use_credit || body.credit_used || body.credit_limit)) {
      return err('Credit system disabled. Wallet only.', 422, 'CREDIT_DISABLED')
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
        const isLowBalance = rpcData?.code === 'INSUFFICIENT_BALANCE' || rpcData?.code === 'MIN_BALANCE_REQUIRED'
        const lowBalanceMessage = rpcData?.code === 'MIN_BALANCE_REQUIRED'
          ? 'Low Balance: minimum wallet balance requirement not met'
          : 'Low Balance: insufficient available wallet balance'
        return json({
          error: isLowBalance ? lowBalanceMessage : (rpcData?.message || 'Atomic key generation failed'),
          code: isLowBalance ? 'LOW_BALANCE' : (rpcData?.code || 'ATOMIC_GENERATION_FAILED'),
          deficit: rpcData?.deficit ?? null,
          minimum_balance: rpcData?.minimum_balance ?? null,
          balance: rpcData?.balance ?? null,
          available: rpcData?.available ?? null,
          required_total: rpcData?.required_total ?? null,
        }, 422)
      }

      if (usageLimit > 0 && rpcData?.idempotency_key) {
        const { data: createdRows } = await admin
          .from('license_keys')
          .select('id, meta')
          .eq('created_by', userId)
          .eq('idempotency_key', rpcData.idempotency_key)
        await Promise.all((createdRows || []).map((row: any) => {
          const existingMeta = row?.meta && typeof row.meta === 'object' ? row.meta : {}
          const nextMeta = {
            ...existingMeta,
            usage_limit: usageLimit,
            used_count: Number(existingMeta?.used_count || 0),
          }
          return admin.from('license_keys').update({ meta: nextMeta }).eq('id', row.id)
        }))
      }

      const maskedKeys = Array.isArray(rpcData.keys)
        ? rpcData.keys.map((k: any) => ({
          ...k,
          key_value: maskLicenseKey(String(k?.license_key || '')),
          license_key: maskLicenseKey(String(k?.license_key || '')),
        }))
        : []

      await logActivity(admin, 'license_key', String(rpcData.order_id || 'bulk'), 'generated_atomic', userId, {
        idempotency_key: rpcData.idempotency_key,
        quantity: rpcData.quantity,
        total_cost: rpcData.total_cost,
      })

      return json({
        data: {
          idempotency_key: rpcData.idempotency_key,
          order_id: rpcData.order_id,
          client_id: rpcData.client_id,
          quantity: rpcData.quantity,
          total_cost: rpcData.total_cost,
          commission_amount: rpcData.commission_amount,
          commission_rate: rpcData.commission_rate,
          keys: maskedKeys,
        },
        duplicate: rpcData.duplicate === true,
      }, 201)
    }

    const licenseKey = body.license_key || await generateHashedLicenseKey(userId)
    const keyMeta = body?.meta && typeof body.meta === 'object' ? body.meta : {}
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
      reseller_id: isReseller ? resellerState?.id : (body.reseller_id || null),
      client_id: body.client_id || null,
      idempotency_key: body.idempotency_key || null,
      meta: {
        ...keyMeta,
        usage_limit: usageLimit,
        used_count: 0,
      },
    }).select().single()
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', data.id, 'generated', userId, { key: maskLicenseKey(licenseKey) })
    return json({
      data: {
        ...data,
        key_id: data.id,
        key_value: maskLicenseKey(licenseKey),
        type: data.key_type,
        user_id: data.created_by,
        usage_limit: usageLimit,
        used_count: 0,
        expiry_date: data.expires_at || null,
        license_key: maskLicenseKey(licenseKey),
      },
    }, 201)
  }

  // POST /keys/validate
  if (method === 'POST' && action === 'validate') {
    const incomingKey = String(body?.license_key || '').trim()
    if (!incomingKey) return err('License key is required', 422, 'VALIDATION_ERROR')

    const { data, error } = await admin.from('license_keys').select('*')
      .eq('license_key', incomingKey).maybeSingle()
    if (error || !data) return err('Invalid license key', 404)

    const now = new Date()
    const isExpiredNow = !!data.expires_at && new Date(data.expires_at) <= now
    if (isExpiredNow && data.status !== 'expired') {
      await admin.from('license_keys').update({ status: 'expired', updated_at: nowIso() }).eq('id', data.id)
      data.status = 'expired'
    }

    const meta = data?.meta && typeof data.meta === 'object' ? { ...data.meta } : {}
    const usageLimit = Math.max(0, Number(meta?.usage_limit ?? data?.max_devices ?? 0) || 0)
    const usedCount = Math.max(0, Number(meta?.used_count ?? 0) || 0)
    if (usageLimit > 0 && usedCount >= usageLimit) {
      return err('Usage limit reached', 429, 'USAGE_LIMIT_REACHED')
    }

    const valid = data.status === 'active' && !isExpiredNow
    if (!valid) return json({ valid: false, key: null, reason: data.status || 'invalid' })

    const nextUsedCount = usedCount + 1
    const nextMeta = { ...meta, usage_limit: usageLimit, used_count: nextUsedCount }
    await admin.from('license_keys').update({ meta: nextMeta, last_validated_at: nowIso() }).eq('id', data.id)

    return json({
      valid: true,
      key: {
        ...data,
        key_id: data.id,
        key_value: maskLicenseKey(data.license_key),
        type: data.key_type,
        user_id: data.created_by || null,
        usage_limit: usageLimit,
        used_count: nextUsedCount,
        expiry_date: data.expires_at || null,
        license_key: maskLicenseKey(data.license_key),
      },
      usage_limit: usageLimit,
      used_count: nextUsedCount,
      remaining: usageLimit > 0 ? Math.max(0, usageLimit - nextUsedCount) : null,
    })
  }

  // PUT /keys/:id/activate
  if (method === 'PUT' && action && subAction === 'activate') {
    let query = admin.from('license_keys').update({ status: 'active', updated_at: nowIso() }).eq('id', action)
    query = applyKeyScope(query)
    const { error } = await query
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', action, 'activated', userId)
    return json({ success: true })
  }

  // PUT /keys/:id/deactivate
  if (method === 'PUT' && action && subAction === 'deactivate') {
    let query = admin.from('license_keys').update({ status: 'suspended', updated_at: nowIso() }).eq('id', action)
    query = applyKeyScope(query)
    const { error } = await query
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', action, 'deactivated', userId)
    return json({ success: true })
  }

  // PUT /keys/:id/revoke
  if (method === 'PUT' && action && subAction === 'revoke') {
    let query = admin.from('license_keys').update({ status: 'revoked', updated_at: nowIso() }).eq('id', action)
    query = applyKeyScope(query)
    const { error } = await query
    if (error) return err(error.message)
    await logActivity(admin, 'license_key', action, 'revoked', userId)
    return json({ success: true })
  }

  // DELETE /keys/:id
  if (method === 'DELETE' && action) {
    let query = admin.from('license_keys').delete().eq('id', action)
    query = applyKeyScope(query)
    const { error } = await query
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

  // GET /servers/list
  if (method === 'GET' && segment === 'servers' && secondSegment === 'list') {
    const { data, error } = await sb.from('servers').select('*').order('created_at', { ascending: false })
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
  }

  // POST /server/add
  if (method === 'POST' && segment === 'server' && secondSegment === 'add') {
    const parsed = serverAddSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())

    const name = parsed.data.name.trim()
    const type = (parsed.data.type || parsed.data.server_type || 'vps').toLowerCase()
    const ipAddress = (parsed.data.ip_address || parsed.data.ip || '').trim()
    if (!isValidIpAddress(ipAddress)) {
      return fail('Invalid IP address', 422, 'VALIDATION_ERROR')
    }

    const plainAgentToken = (parsed.data.agent_token || '').trim() || generateAgentToken()
    const baseSubdomain = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'server'
    const subdomain = `${baseSubdomain}-${generateSubdomainSuffix(6)}`
    const provider = sanitizeTextInput(parsed.data.provider || '')
    const region = sanitizeTextInput(parsed.data.region || '')

    const insertPayload: Record<string, unknown> = {
      name,
      subdomain,
      server_type: type,
      ip_address: ipAddress || null,
      agent_url: parsed.data.agent_url || null,
      agent_token: plainAgentToken,
      status: 'stopped',
      health_status: 'pending',
      git_branch: 'main',
      runtime: 'nodejs18',
      auto_deploy: true,
      created_by: userId,
    }

    if (provider) insertPayload.provider = provider
    if (region) insertPayload.region = region

    const { data, error } = await sb.from('servers').insert(insertPayload).select('*').single()
    if (error) return fail(error.message, 400, 'DB_ERROR')

    await logActivity(admin, 'server', data.id, 'created', userId, { name, type })

    return ok({
      ...data,
      agent_token: plainAgentToken,
      token_generated: !(parsed.data.agent_token || '').trim(),
    }, 201)
  }

  // POST /agent/connect
  if (method === 'POST' && segment === 'agent' && secondSegment === 'connect') {
    const serverId = sanitizeTextInput(body?.server_id || body?.serverId || '', 120)
    const params = {
      name: sanitizeTextInput(body?.name || 'Server Agent', 120),
      ip_address: sanitizeTextInput(body?.ip_address || body?.ip || '', 120) || undefined,
      agent_url: sanitizeTextInput(body?.agent_url || '', 240),
      agent_token: sanitizeTextInput(body?.agent_token || '', 256),
    }
    if (!params.name || !params.agent_url || !params.agent_token) return fail('Missing required fields', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb.functions.invoke('server-agent', {
      body: {
        action: 'register',
        serverId: serverId || undefined,
        params,
      },
    })
    if (error || !data?.success) return fail(error?.message || data?.error || 'Agent connect failed', 400, 'AGENT_CONNECT_FAILED')
    return ok(data)
  }

  // POST /agent/status
  if (method === 'POST' && segment === 'agent' && secondSegment === 'status') {
    const serverId = sanitizeTextInput(body?.server_id || body?.serverId || '', 120)
    if (!serverId) return fail('server_id required', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb.functions.invoke('server-agent', {
      body: { action: 'status', serverId },
    })
    if (error || !data?.success) return fail(error?.message || data?.error || 'Agent status failed', 400, 'AGENT_STATUS_FAILED')
    return ok(data)
  }

  // POST /agent/execute
  if (method === 'POST' && segment === 'agent' && secondSegment === 'execute') {
    const serverId = sanitizeTextInput(body?.server_id || body?.serverId || '', 120)
    const command = sanitizeTextInput(body?.command || '', 120)
    if (!serverId || !command) return fail('server_id and command required', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb.functions.invoke('server-agent', {
      body: { action: 'execute', serverId, command, params: body?.params || {} },
    })
    if (error || !data?.success) return fail(error?.message || data?.error || 'Agent execute failed', 400, 'AGENT_EXECUTE_FAILED')
    return ok(data)
  }

  // POST /server/ai-action
  if (method === 'POST' && segment === 'server' && secondSegment === 'ai-action') {
    const parsed = serverActionSchema.extend({ action: z.string().min(1) }).safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())

    const action = sanitizeTextInput(parsed.data.action, 64).toLowerCase()
    const aliasMap: Record<string, string> = {
      ai_scan_server: 'ai_scan',
      auto_fix: 'fix_issues',
      deploy_project: 'deploy',
      restart_server: 'restart',
    }
    const canonicalAction = aliasMap[action] || action
    const actionMap: Record<string, { command: string; activity: string }> = {
      ai_scan: { command: 'status', activity: 'ai_scan' },
      fix_issues: { command: 'service_status', activity: 'ai_fix' },
      deploy: { command: 'deploy', activity: 'ai_deploy' },
      restart: { command: 'restart', activity: 'ai_restart' },
      security_scan: { command: 'firewall_status', activity: 'ai_security_scan' },
      optimize: { command: 'cpu_usage', activity: 'ai_optimize' },
    }
    const mapped = actionMap[canonicalAction]
    if (!mapped) return fail('Unsupported AI action', 422, 'VALIDATION_ERROR')

    const { data, error } = await sb.functions.invoke('server-agent', {
      body: {
        action: 'execute',
        serverId: parsed.data.server_id,
        command: mapped.command,
        params: body?.params || {},
      },
    })
    if (error || !data?.success) return fail(error?.message || data?.error || 'AI action failed', 400, 'AI_ACTION_FAILED')

    const { error: aiLogError } = await sb.from('ai_logs').insert({
      server_id: parsed.data.server_id,
      action: mapped.activity,
      result: JSON.stringify(data),
    })
    if (aiLogError) return fail(aiLogError.message, 400, 'DB_ERROR')
    await logActivity(admin, 'server', parsed.data.server_id, mapped.activity, userId, { action })

    return ok({
      server_id: parsed.data.server_id,
      action,
      executed: true,
      result: data,
    })
  }

  // POST /server/git-scan
  if (method === 'POST' && segment === 'server' && secondSegment === 'git-scan') {
    const parsed = serverActionSchema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { data: server, error } = await sb.from('servers').select('id,name,git_repo,git_branch').eq('id', parsed.data.server_id).maybeSingle()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    if (!server) return fail('Server not found', 404, 'NOT_FOUND')
    await logActivity(admin, 'git', parsed.data.server_id, 'scan', userId, { git_repo: server.git_repo || null })
    return ok({
      server_id: parsed.data.server_id,
      repo_connected: !!server.git_repo,
      checked: true,
      errors_detected: false,
      report: {
        repository: server.git_repo || null,
        branch: server.git_branch || 'main',
        issues: [],
      },
    })
  }

  // POST /deploy/webhook
  if (method === 'POST' && segment === 'deploy' && secondSegment === 'webhook') {
    const serverId = sanitizeTextInput(body?.server_id || body?.serverId || '', 120)
    if (!serverId) return fail('server_id required', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb.from('deployments').insert({
      server_id: serverId,
      status: 'building',
      triggered_by: userId,
      commit_sha: sanitizeTextInput(body?.commit_sha || body?.after || '', 120) || null,
      commit_message: sanitizeTextInput(body?.commit_message || 'Webhook deploy triggered', 400),
      branch: sanitizeTextInput(body?.branch || body?.ref || 'main', 120),
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await sb.from('servers').update({ status: 'deploying', last_deploy_at: nowIso() }).eq('id', serverId)
    await logActivity(admin, 'deployment', data.id, 'webhook_triggered', userId, { server_id: serverId })
    return ok(data, 201)
  }

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

  // GET /domain/list
  if (method === 'GET' && segment === 'domain' && id === 'list') {
    let query = sb.from('domains').select('*').order('created_at', { ascending: false }).limit(200)
    if (body.server_id) query = query.eq('server_id', body.server_id)
    const { data, error } = await query
    if (error) return fail(error.message, 400, 'DB_ERROR')
    return ok(data || [])
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

  // POST /dns/add
  if (method === 'POST' && segment === 'dns' && secondSegment === 'add') {
    const schema = z.object({
      domain_id: z.string().optional(),
      server_id: z.string().optional(),
      type: z.string().default('A').optional(),
      value: z.string().min(1),
      name: z.string().default('@').optional(),
      ttl: z.number().int().positive().optional(),
    })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { data, error } = await sb.from('dns_records').insert({
      domain_id: parsed.data.domain_id || null,
      server_id: parsed.data.server_id || null,
      record_type: parsed.data.type || 'A',
      value: parsed.data.value,
      name: parsed.data.name || '@',
      ttl: parsed.data.ttl || 300,
      status: 'pending',
    }).select().single()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'dns_record', data.id, 'created', userId, { domain_id: parsed.data.domain_id || null })
    return ok(data, 201)
  }

  // PUT /dns/update
  if (method === 'PUT' && segment === 'dns' && secondSegment === 'update') {
    const schema = z.object({
      id: z.string().min(1),
      type: z.string().optional(),
      value: z.string().optional(),
      name: z.string().optional(),
      ttl: z.number().int().positive().optional(),
    })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const updates: Record<string, unknown> = {}
    if (parsed.data.type) updates.record_type = parsed.data.type
    if (parsed.data.value) updates.value = parsed.data.value
    if (parsed.data.name) updates.name = parsed.data.name
    if (parsed.data.ttl) updates.ttl = parsed.data.ttl
    if (Object.keys(updates).length === 0) return fail('No update fields provided', 422, 'VALIDATION_ERROR')
    const { data, error } = await sb.from('dns_records').update(updates).eq('id', parsed.data.id).select().maybeSingle()
    if (error) return fail(error.message, 400, 'DB_ERROR')
    if (!data) return fail('DNS record not found', 404, 'NOT_FOUND')
    await logActivity(admin, 'dns_record', parsed.data.id, 'updated', userId, updates)
    return ok(data)
  }

  // DELETE /dns/delete
  if (method === 'DELETE' && segment === 'dns' && secondSegment === 'delete') {
    const recordId = sanitizeTextInput(body?.id || body?.record_id || '', 120)
    if (!recordId) return fail('id required', 422, 'VALIDATION_ERROR')
    const { error } = await sb.from('dns_records').delete().eq('id', recordId)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'dns_record', recordId, 'deleted', userId)
    return ok({ id: recordId, deleted: true })
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

  // POST /ssl/generate
  if (method === 'POST' && segment === 'ssl' && secondSegment === 'generate') {
    const schema = z.object({ domain_id: z.string().min(1) })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return fail('Invalid payload', 422, 'VALIDATION_ERROR', parsed.error.flatten())
    const { error } = await sb.from('domains').update({
      ssl_status: 'active',
      ssl_auto_renew: true,
      status: 'active',
    }).eq('id', parsed.data.domain_id)
    if (error) return fail(error.message, 400, 'DB_ERROR')
    await logActivity(admin, 'domain', parsed.data.domain_id, 'ssl_generated', userId)
    return ok({ domain_id: parsed.data.domain_id, ssl_status: 'active', generated: true })
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
    const redisKey = 'cache:dashboard:server-health'
    const redisCached = await redisGetJson<{ stats: any; servers: any[] }>(redisKey)
    if (redisCached) return ok(redisCached)
    const memValid = dashboardStatsCache.data && Date.now() < dashboardStatsCache.expiresAt
    if (memValid) return ok(dashboardStatsCache.data)

    const { data, error } = await sb.from('servers').select('id, name, status, subdomain, custom_domain, health_status, uptime_percent')
    if (error) return fail(error.message, 400, 'DB_ERROR')
    const stats = {
      total: data?.length || 0,
      live: data?.filter((s: any) => s.status === 'live').length || 0,
      failed: data?.filter((s: any) => s.status === 'failed').length || 0,
      deploying: data?.filter((s: any) => s.status === 'deploying').length || 0,
    }
    const payload = { stats, servers: data }
    dashboardStatsCache.data = payload
    dashboardStatsCache.expiresAt = Date.now() + DASHBOARD_STATS_CACHE_TTL_MS
    await redisSetJson(redisKey, payload, Math.floor(DASHBOARD_STATS_CACHE_TTL_MS / 1000))
    return ok(payload)
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

  // GET /ai/logs
  if (method === 'GET' && action === 'logs') {
    let query = sb.from('ai_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
    const status = sanitizeTextInput(body?.status || '')
    const model = sanitizeTextInput(body?.model || '')
    const safeModel = model.replace(/[%_\\]/g, '')
    if (status) query = query.eq('status', status)
    if (safeModel) query = query.ilike('model', `%${safeModel}%`)
    const { data, error } = await query
    if (error) return err(error.message)
    return json({ success: true, data })
  }

  // POST /ai/force-sync
  if (method === 'POST' && action === 'force-sync') {
    const { data: models, error: modelErr } = await admin
      .from('ai_models')
      .select('id, model_id, provider, is_active, updated_at')
      .order('priority', { ascending: true })
      .order('updated_at', { ascending: false })
    if (modelErr) return err(modelErr.message)

    const providers = [...new Set((models || []).map((m: any) => String(m.provider || '').toLowerCase()).filter(Boolean))]
    for (const provider of providers) {
      await admin.from('ai_circuit_breakers').upsert({
        provider,
        failure_count: 0,
        state: 'closed',
        open_until: null,
        last_error: null,
        updated_at: nowIso(),
      }, { onConflict: 'provider' })
    }

    await logActivity(admin, 'ai_system', 'routing', 'force_sync', userId, {
      active_models: (models || []).filter((m: any) => m.is_active).length,
      total_models: (models || []).length,
      providers,
    })
    return json({
      success: true,
      message: 'AI models and routing state synchronized',
      data: {
        models: models || [],
        provider_count: providers.length,
      },
    })
  }

  // POST /ai/auto-fix
  if (method === 'POST' && action === 'auto-fix') {
    const repoUrl = sanitizeTextInput(body?.repo_url || body?.repo || '')
    const scan = await sb.functions.invoke('source-code-manager', {
      body: { action: 'scan_and_register', data: { repo_url: repoUrl || undefined } },
    })
    if (scan.error) return err(scan.error.message, 500)

    await logActivity(admin, 'ai_system', 'autofix', 'auto_fix_triggered', userId, {
      source: sanitizeTextInput(body?.source || 'ai_quick_actions'),
      include_security: body?.include_security !== false,
      include_performance: body?.include_performance !== false,
    })
    return json({
      success: true,
      message: 'Auto bug fix pipeline executed',
      data: scan.data || null,
    })
  }

  // POST /ai/security-scan
  if (method === 'POST' && action === 'security-scan') {
    const { data: recentUsage } = await admin
      .from('ai_usage')
      .select('id, model, endpoint, created_at, cost')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    const { data: keys } = await admin
      .from('ai_api_keys')
      .select('id, provider, status, expires_at, used, total_limit, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)

    const inactiveKeys = (keys || []).filter((k: any) => String(k.status || '').toLowerCase() !== 'active').length
    const expiredKeys = (keys || []).filter((k: any) => k.expires_at && new Date(k.expires_at) <= new Date()).length
    const overusedKeys = (keys || []).filter((k: any) => Number(k.total_limit || 0) > 0 && Number(k.used || 0) >= Number(k.total_limit || 0)).length
    const suspiciousUsage = (recentUsage || []).filter((u: any) => Number(u.cost || 0) > 1).length

    await logActivity(admin, 'ai_system', 'security', 'security_scan', userId, {
      inactive_keys: inactiveKeys,
      expired_keys: expiredKeys,
      overused_keys: overusedKeys,
      suspicious_usage: suspiciousUsage,
    })
    return json({
      success: true,
      message: 'Security scan completed',
      data: {
        summary: {
          inactive_keys: inactiveKeys,
          expired_keys: expiredKeys,
          overused_keys: overusedKeys,
          suspicious_usage: suspiciousUsage,
        },
        keys_checked: (keys || []).length,
        usage_checked: (recentUsage || []).length,
      },
    })
  }

  // POST /ai/performance-optimize
  if (method === 'POST' && action === 'performance-optimize') {
    const { data: rows } = await admin
      .from('ai_usage_daily')
      .select('model, request_count, total_cost, input_tokens, output_tokens, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(60)
    const grouped = new Map<string, { requests: number; cost: number; tokens: number }>()
    for (const row of rows || []) {
      const model = String(row.model || 'unknown')
      const prev = grouped.get(model) || { requests: 0, cost: 0, tokens: 0 }
      prev.requests += Number(row.request_count || 0)
      prev.cost += Number(row.total_cost || 0)
      prev.tokens += Number(row.input_tokens || 0) + Number(row.output_tokens || 0)
      grouped.set(model, prev)
    }
    const recommendations = Array.from(grouped.entries()).map(([model, stats]) => {
      const avgCostPerRequest = stats.requests > 0 ? stats.cost / stats.requests : 0
      const avgTokensPerRequest = stats.requests > 0 ? stats.tokens / stats.requests : 0
      const profile = avgTokensPerRequest < 800 ? 'cheap-model' : avgTokensPerRequest > 2500 ? 'high-capacity-model' : 'balanced-model'
      return { model, avg_cost_per_request: Number(avgCostPerRequest.toFixed(6)), avg_tokens_per_request: Number(avgTokensPerRequest.toFixed(1)), profile }
    }).sort((a, b) => a.avg_cost_per_request - b.avg_cost_per_request)

    await logActivity(admin, 'ai_system', 'performance', 'performance_optimize', userId, {
      models_analyzed: recommendations.length,
    })
    return json({
      success: true,
      message: 'Performance optimization analysis completed',
      data: { recommendations },
    })
  }

  // POST /ai/deploy
  if (method === 'POST' && action === 'deploy') {
    const filePath = sanitizeTextInput(body?.filePath || body?.file_path || '/')
    const deploymentId = sanitizeTextInput(body?.deploymentId || body?.deployment_id || '', 120) || undefined
    const { data, error } = await sb.functions.invoke('auto-deploy-pipeline', {
      body: {
        filePath,
        deploymentId,
        hostingCredentials: body?.hostingCredentials || body?.hosting_credentials || undefined,
      },
    })
    if (error) return err(error.message, 500)
    await logActivity(admin, 'ai_system', 'deploy', 'auto_deploy', userId, {
      file_path: filePath,
      deployment_id: deploymentId || null,
      source: sanitizeTextInput(body?.source || 'ai_quick_actions'),
    })
    return json({
      success: true,
      message: 'Auto deploy triggered',
      data,
    })
  }

  // POST /ai/gateway
  if (method === 'POST' && action === 'gateway') {
    const autoPilot = body?.auto_pilot !== false
    const modelType = normalizeModelType(body?.model_type)
    const requestedModel = sanitizeTextInput(body?.model || '')
    const requestedProvider = sanitizeTextInput(body?.provider || '')
    const userPromptRaw = sanitizeTextInput(body?.prompt || body?.input || '')
    const promptRisk = detectPromptRisk(userPromptRaw)
    if (promptRisk.blocked) return err('Prompt blocked by security filter', 422, 'PROMPT_BLOCKED')
    const promptText = promptRisk.sanitized
    const messages = Array.isArray(body?.messages) && body.messages.length
      ? body.messages
      : (promptText ? [{ role: 'user', content: promptText }] : [])
    if (!messages.length) return err('Missing AI input', 422, 'VALIDATION_ERROR')

    const maxTokens = clampInt(body?.max_tokens, 1, AI_GATEWAY_MAX_TOKENS_HARD, AI_GATEWAY_MAX_TOKENS_DEFAULT)
    const estimatedInputTokens = Math.max(
      toPositiveNumber(body?.estimated_input_tokens, 0),
      estimateTokensFromText(promptText || messages.map((m: any) => String(m?.content || '')).join('\n'))
    )
    const minuteLimitResult = await checkAndConsumeAiMinuteLimit(admin, userId, estimatedInputTokens + maxTokens)
    if (minuteLimitResult) return minuteLimitResult

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

    const highQualityNeeded = !!body?.high_quality_needed || modelType === 'code'
    const fastResponse = body?.fast_response !== false
    const cheapRequired = !!body?.cheap_required
    const providerOrder = chooseProviderOrder({
      requestedProvider,
      requestedModel,
      highQualityNeeded,
      fastResponse,
      cheapRequired,
    })

    const selectedPrimaryProvider = providerOrder[0]
    const selectedPrimaryModel = (await getAiModelByProvider(admin, selectedPrimaryProvider))?.model_id
      || requestedModel
      || (selectedPrimaryProvider === 'claude'
        ? 'claude-3-5-sonnet'
        : selectedPrimaryProvider === 'gemini'
          ? 'google/gemini-2.5-flash'
          : selectedPrimaryProvider === 'azure_openai'
            ? 'azure/gpt-4o-mini'
          : selectedPrimaryProvider === 'local_model'
            ? 'local_model/default'
            : selectedPrimaryProvider === 'custom_api'
              ? 'custom/default'
            : 'openai/gpt-5-mini')

    const normalizedPrompt = promptText || messages.map((m: any) => String(m?.content || '')).join('\n')
    const promptHash = await sha256Hex(`${normalizedPrompt}|${modelType}|${selectedPrimaryModel}`)
    const cacheHit = await readAiCache(admin, promptHash, selectedPrimaryModel)
    if (cacheHit?.response_payload) {
      await admin.from('ai_logs').insert({
        user_id: userId,
        prompt: normalizedPrompt.slice(0, 4000),
        response: String(cacheHit.response_text || '').slice(0, 8000),
        model: selectedPrimaryModel,
        tokens: Number(cacheHit.tokens_used || 0),
        cost: Number(cacheHit.cost || 0),
        latency: 0,
        status: 'cached',
      })
      return json({
        success: true,
        data: cacheHit.response_payload,
        tokens_used: Number(cacheHit.tokens_used || 0),
        cost: Number(cacheHit.cost || 0),
        model_used: selectedPrimaryModel,
        routing: { auto_pilot: autoPilot, provider: 'cache', model: selectedPrimaryModel, fallback_used: false },
        billing: { deducted: 0, balance_after: null },
        usage: { input_tokens: 0, output_tokens: Number(cacheHit.tokens_used || 0), total_tokens: Number(cacheHit.tokens_used || 0) },
      })
    }

    const queueTable = pickAiQueueTable(modelType)
    const queueId = crypto.randomUUID()
    try {
      await admin.from(queueTable).insert({
        id: queueId,
        user_id: userId,
        model_type: modelType,
        status: 'queued',
        prompt: normalizedPrompt.slice(0, 4000),
        meta: { model: selectedPrimaryModel, requested_provider: requestedProvider || null },
      })
    } catch {
      // queue is additive best effort
    }

    let providerName = 'local_model'
    let providerResponse: any = null
    let lastError = ''
    const gatewayStartedAt = Date.now()

    for (const provider of providerOrder) {
      const open = await isCircuitOpen(admin, provider)
      if (open) continue

      let modelForProvider = requestedModel
        if (!modelForProvider) {
          modelForProvider = (await getAiModelByProvider(admin, provider))?.model_id
            || (provider === 'claude'
              ? 'claude-3-5-sonnet'
              : provider === 'gemini'
                ? 'google/gemini-2.5-flash'
                : provider === 'azure_openai'
                  ? 'azure/gpt-4o-mini'
                : provider === 'local_model'
                  ? 'local_model/default'
                  : provider === 'custom_api'
                    ? 'custom/default'
                  : 'openai/gpt-5-mini')
        }

      for (let attempt = 0; attempt < AI_GATEWAY_MAX_RETRIES; attempt++) {
        try {
          const correctedMessages = attempt === 0
            ? messages
            : [{ role: 'system', content: 'Return strict valid content only and avoid empty output.' }, ...messages]
          const result = await sb.functions.invoke('ai-chat', {
            body: { messages: correctedMessages, model: modelForProvider, stream: false, user_id: userId, max_tokens: maxTokens },
          })
          if (result?.error) {
            lastError = result.error.message || `${provider} failed`
            await markCircuitFailure(admin, provider, lastError)
            continue
          }
          const outputText = extractAssistantText(result?.data || {})
          if (!outputText) {
            lastError = `${provider} empty response`
            await markCircuitFailure(admin, provider, lastError)
            continue
          }
          providerName = provider
          providerResponse = result?.data || {}
          await markCircuitSuccess(admin, provider)
          break
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e)
          await markCircuitFailure(admin, provider, lastError)
        }
      }
      if (providerResponse) break
    }

    if (!providerResponse) {
      providerName = 'local_model'
      const localText = `Local fallback response: ${promptText.slice(0, AI_GATEWAY_LOCAL_FALLBACK_PROMPT_SLICE)}`
      providerResponse = {
        response: localText,
        model: 'local_model/default',
        usage: { prompt_tokens: estimatedInputTokens, completion_tokens: 64, total_tokens: estimatedInputTokens + 64 },
      }
    }

    const usage = providerResponse?.usage || {}
    const inputTokens = Math.max(estimatedInputTokens, toPositiveNumber(usage?.prompt_tokens ?? usage?.input_tokens ?? body?.estimated_input_tokens, 0))
    const outputTokens = toPositiveNumber(usage?.completion_tokens ?? usage?.output_tokens ?? body?.estimated_output_tokens, 0)
    const totalTokens = Math.max(1, inputTokens + outputTokens)

    let selectedModelId = requestedModel || body?.model || providerResponse?.model || providerName
    let modelCost = Number((totalTokens * 0.00001).toFixed(6))
    const { data: modelRow } = await admin.from('ai_models').select('*').eq('model_id', selectedModelId).maybeSingle()
    if (modelRow) {
      modelCost = ((Number(modelRow.input_cost_per_1k || 0) * inputTokens) + (Number(modelRow.output_cost_per_1k || 0) * outputTokens)) / 1000
      selectedModelId = modelRow.model_id
    }

    const dailyDate = new Date().toISOString().slice(0, 10)
    const { data: quotaRow } = await admin.from('ai_quotas').select('*').eq('user_id', userId).maybeSingle()
    if (quotaRow) {
      const dailyLimit = Number(quotaRow.daily_limit || 0)
      const dailyUsed = Number(quotaRow.daily_used || 0)
      if (dailyLimit > 0 && dailyUsed + 1 > dailyLimit) return err('Daily AI quota exceeded', 429, 'DAILY_USAGE_LIMIT')
    }

    const { data: dayRow } = await admin.from('ai_usage_daily').select('*')
      .eq('user_id', userId).eq('model', selectedModelId).eq('date', dailyDate).maybeSingle()
    const dailyRequests = Number(dayRow?.request_count || 0)
    if (dailyRequests >= Number(body?.daily_limit || AI_GATEWAY_DEFAULT_DAILY_LIMIT)) {
      return err('Daily request limit exceeded', 429, 'DAILY_LIMIT_EXCEEDED')
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
    if (quotaRow) {
      await admin.from('ai_quotas').update({
        daily_used: Number(quotaRow.daily_used || 0) + 1,
        monthly_used: Number(quotaRow.monthly_used || 0) + 1,
        updated_at: nowIso(),
      }).eq('id', quotaRow.id)
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

    const latencyMs = Date.now() - gatewayStartedAt
    const responseText = extractAssistantText(providerResponse)
    await admin.from('ai_logs').insert({
      user_id: userId,
      prompt: normalizedPrompt.slice(0, 4000),
      response: responseText.slice(0, 8000),
      model: selectedModelId,
      tokens: totalTokens,
      cost: modelCost,
      latency: latencyMs,
      status: 'success',
    })
    await admin.from('ai_memory').upsert({
      user_id: userId,
      context: normalizedPrompt.slice(0, 4000),
      updated_at: nowIso(),
    }, { onConflict: 'user_id' })
    await writeAiCache(admin, {
      promptHash,
      modelKey: selectedModelId,
      responseText,
      payload: providerResponse,
      tokens: totalTokens,
      cost: modelCost,
    })
    try {
      await admin.from(queueTable).update({
        status: 'completed',
        result: { provider: providerName, model: selectedModelId, tokens: totalTokens, cost: modelCost },
        updated_at: nowIso(),
      }).eq('id', queueId)
    } catch {
      // queue best effort
    }

    return json({
      success: true,
      data: providerResponse,
      tokens_used: totalTokens,
      cost: modelCost,
      model_used: selectedModelId,
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

async function handleAutoPilot(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  const action = pathParts[0] || ''
  console.log('API HIT:', `/auto-pilot/${action}`)

  if (method === 'POST' && action === 'new-request') {
    const missing = validateRequired(body, ['name', 'business_type', 'country', 'language', 'features_required'])
    if (missing) return fail(missing, 422, 'VALIDATION_ERROR')

    const requestData = {
      requestId: body.request_id || body.requestId || null,
      name: body.name,
      businessType: body.business_type || body.businessType,
      country: body.country,
      language: body.language,
      budget: body.budget ?? null,
      featuresRequired: body.features_required || body.featuresRequired,
      requestType: body.request_type || body.requestType,
      requestDetails: body.request_details || body.requestDetails,
      clientName: body.client_name || body.clientName,
    }

    const { data, error } = await sb.functions.invoke('ai-auto-pilot', {
      body: { action: 'handle_client_request', data: requestData },
    })
    if (error) return fail(error.message, 500, 'AUTO_PILOT_NEW_REQUEST_FAILED')
    if (data?.error) return fail(String(data.error), 400, 'AUTO_PILOT_NEW_REQUEST_FAILED', data)

    await logActivity(admin, 'auto_pilot', 'new-request', 'new_request', userId, {
      name: body.name,
      business_type: body.business_type,
    })
    return json({ success: true, data, error: null })
  }

  if (method === 'POST' && action === 'generate') {
    const { data, error } = await sb.functions.invoke('ai-auto-pilot', {
      body: { action: 'generate_daily_software', data: body || {} },
    })
    if (error) return fail(error.message, 500, 'AUTO_PILOT_GENERATE_FAILED')
    if (data?.error) return fail(String(data.error), 400, 'AUTO_PILOT_GENERATE_FAILED', data)

    await logActivity(admin, 'auto_pilot', 'generate', 'generate_daily_software', userId)
    return json({ success: true, data, error: null })
  }

  if (method === 'POST' && action === 'billing-check') {
    const { data, error } = await sb.functions.invoke('ai-auto-pilot', {
      body: { action: 'check_billing_alerts', data: body || {} },
    })
    if (error) return fail(error.message, 500, 'AUTO_PILOT_BILLING_CHECK_FAILED')
    if (data?.error) return fail(String(data.error), 400, 'AUTO_PILOT_BILLING_CHECK_FAILED', data)

    await logActivity(admin, 'auto_pilot', 'billing-check', 'billing_check', userId)
    return json({ success: true, data, error: null })
  }

  if (method === 'POST' && action === 'add-billing') {
    const missing = validateRequired(body, ['user_id', 'service_name', 'amount', 'billing_cycle'])
    if (missing) return fail(missing, 422, 'VALIDATION_ERROR')
    if (!Number.isFinite(Number(body.amount))) {
      return fail('amount must be a valid number', 422, 'VALIDATION_ERROR')
    }

    const { data, error } = await sb.functions.invoke('ai-auto-pilot', {
      body: {
        action: 'add_billing_item',
        data: {
          user_id: body.user_id,
          service_name: body.service_name,
          amount: Number(body.amount),
          billing_cycle: body.billing_cycle,
        },
      },
    })
    if (error) return fail(error.message, 500, 'AUTO_PILOT_ADD_BILLING_FAILED')
    if (data?.error) return fail(String(data.error), 400, 'AUTO_PILOT_ADD_BILLING_FAILED', data)

    await logActivity(admin, 'auto_pilot', 'add-billing', 'add_billing_item', userId, {
      user_id: body.user_id,
      service_name: body.service_name,
      amount: Number(body.amount),
    })
    return json({ success: true, data, error: null })
  }

  return err('Not found', 404)
}

function normalizeApkPipelineStatus(rawStatus: unknown): 'pending' | 'building' | 'converting' | 'ready' | 'failed' {
  const normalized = String(rawStatus || '').toLowerCase()
  if (normalized === 'pending' || normalized === 'queued') return 'pending'
  if (normalized === 'building') return 'building'
  if (normalized === 'converting' || normalized === 'signed' || normalized === 'stored' || normalized === 'distributed') return 'converting'
  if (normalized === 'completed' || normalized === 'published' || normalized === 'ready') return 'ready'
  if (normalized === 'failed' || normalized === 'error') return 'failed'
  return 'pending'
}

function normalizeApkStoragePath(value: unknown): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '')

  try {
    const parsed = new URL(raw)
    const pathname = parsed.pathname
    const directIndex = pathname.indexOf('/apks/')
    if (directIndex >= 0) return pathname.slice(directIndex + '/apks/'.length).replace(/^\/+/, '')
    return pathname.replace(/^\/+/, '')
  } catch {
    return null
  }
}

type SyncedBuildStatus = 'pending' | 'success' | 'failed'
type ApkBuildSource = 'manual' | 'pipeline'

/**
 * Canonical build status mapper for product/apk_builds sync.
 * finalized pipeline outputs (completed/published/ready/stored/signed/distributed) map to `success`.
 * Unknown or empty values intentionally degrade to `pending` for safe non-downloadable behavior.
 */
function normalizeSyncedBuildStatus(rawStatus: unknown): SyncedBuildStatus {
  const normalized = String(rawStatus || '').toLowerCase().trim()
  if (['success', 'completed', 'published', 'ready', 'stored', 'signed', 'distributed'].includes(normalized)) return 'success'
  if (['failed', 'error'].includes(normalized)) return 'failed'
  return 'pending'
}

async function findLatestSuccessfulApkBuild(sb: any, productId: string) {
  return sb
    .from('apk_builds')
    .select('id, build_id, product_id, apk_url, version, build_status, source, created_at')
    .eq('product_id', productId)
    .eq('build_status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

async function syncProductFromApkBuild(
  sb: any,
  payload: {
    product_id: string
    apk_url?: string | null
    version?: string | null
    build_status?: string | null
    source?: string | null
    build_id?: string | null
  },
) {
  const productId = String(payload.product_id || '').trim()
  if (!productId) return { error: 'product_id required', status: 422 as const }

  const source: ApkBuildSource = String(payload.source || 'pipeline').toLowerCase() === 'manual' ? 'manual' : 'pipeline'
  const buildStatus = normalizeSyncedBuildStatus(payload.build_status)
  const incomingBuildId = String(payload.build_id || '').trim()
  if (source === 'pipeline' && !incomingBuildId) return { error: 'build_id is required when source is pipeline', status: 422 as const }
  const buildId = incomingBuildId || crypto.randomUUID()
  const apkUrl = payload.apk_url ? String(payload.apk_url).trim() : null
  const version = String(payload.version || '').trim() || '1.0.0'

  const { data: product, error: productError } = await sb
    .from('products')
    .select('id, apk_url, build_id, build_status')
    .eq('id', productId)
    .maybeSingle()
  if (productError) return { error: productError.message, status: 400 as const }
  if (!product?.id) return { error: 'Product not found', status: 404 as const }

  const buildRow: Record<string, unknown> = {
    build_id: buildId,
    product_id: productId,
    apk_url: apkUrl,
    version,
    build_status: buildStatus,
    source,
    // Legacy status field remains for backward compatibility with historical readers.
    // build_status is the canonical normalized status for product/download gating.
    status: buildStatus === 'success' ? 'distributed' : buildStatus === 'failed' ? 'failed' : 'pending',
    created_at: nowIso(),
  }

  const { data: upsertedBuild, error: buildError } = await sb
    .from('apk_builds')
    .upsert(buildRow, { onConflict: 'build_id' })
    .select('id, build_id, product_id, apk_url, version, build_status, source, created_at')
    .maybeSingle()
  if (buildError) return { error: buildError.message, status: 400 as const }

  const { data: latestSuccessBuild } = await findLatestSuccessfulApkBuild(sb, productId)
  const latestResolved = latestSuccessBuild || (buildStatus === 'success' ? upsertedBuild : null)

  const nextProductPatch: Record<string, unknown> = {
    updated_at: nowIso(),
  }

  if (buildStatus === 'success' && apkUrl) {
    nextProductPatch.apk_url = apkUrl
    nextProductPatch.build_status = 'success'
    nextProductPatch.build_id = buildId
  } else if (source === 'manual' && apkUrl) {
    nextProductPatch.apk_url = apkUrl
    nextProductPatch.build_status = buildStatus
    nextProductPatch.build_id = buildId
  } else if (latestResolved?.apk_url) {
    nextProductPatch.apk_url = latestResolved.apk_url
    nextProductPatch.build_status = 'success'
    nextProductPatch.build_id = latestResolved.build_id || null
  } else {
    nextProductPatch.build_status = buildStatus
    nextProductPatch.build_id = buildId
  }

  const { error: updateError } = await sb.from('products').update(nextProductPatch).eq('id', productId)
  if (updateError) return { error: updateError.message, status: 400 as const }

  invalidateProductCache()

  return {
    data: {
      build: upsertedBuild || buildRow,
      product: {
        id: productId,
        apk_url: nextProductPatch.apk_url ?? product.apk_url ?? null,
        build_id: nextProductPatch.build_id ?? null,
        build_status: nextProductPatch.build_status ?? null,
      },
      latest_success_build: latestResolved || null,
    },
    status: 200 as const,
  }
}

function parseGithubRepo(repoUrl: string): { owner: string; repo: string; ref?: string } | null {
  try {
    const parsed = new URL(repoUrl)
    if (parsed.hostname !== 'github.com') return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/, '')
    const ref = parsed.searchParams.get('ref') || undefined
    return { owner, repo, ref }
  } catch {
    return null
  }
}

async function fetchGithubRepoFile(repoUrl: string, filePath: string, token?: string) {
  const parsed = parseGithubRepo(repoUrl)
  if (!parsed) return null
  const refQuery = parsed.ref ? `?ref=${encodeURIComponent(parsed.ref)}` : ''
  const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${filePath}${refQuery}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (response.status === 404) return null
  if (!response.ok) {
    const errorBody = await response.text()
    console.error('GitHub scan request failed', { filePath, status: response.status, body: errorBody.slice(0, 500) })
    throw new Error(`GitHub scan failed for ${filePath} (${response.status})`)
  }
  return await response.json()
}

async function scanGitRepository(repoUrl: string, githubToken?: string) {
  const packageFile = await fetchGithubRepoFile(repoUrl, 'package.json', githubToken)
  const viteConfig =
    (await fetchGithubRepoFile(repoUrl, 'vite.config.ts', githubToken))
    || (await fetchGithubRepoFile(repoUrl, 'vite.config.js', githubToken))
    || (await fetchGithubRepoFile(repoUrl, 'vite.config.mjs', githubToken))
    || (await fetchGithubRepoFile(repoUrl, 'vite.config.cjs', githubToken))

  let packageJson: any = null
  if (packageFile?.content) {
    const encoded = String(packageFile.content).replace(/\n/g, '')
    const decoded = new TextDecoder().decode(decodeBase64(encoded))
    try { packageJson = JSON.parse(decoded) } catch { packageJson = null }
  }

  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  }

  const hasReact = !!deps.react
  const hasVite = !!deps.vite || !!viteConfig
  const hasBuildScript = !!packageJson?.scripts?.build

  const issues: string[] = []
  const autoFixActions: string[] = []

  if (!packageFile) {
    issues.push('missing_package_json')
    autoFixActions.push('fallback_build_with_vite_if_detected')
  }
  if (packageFile && !hasBuildScript) {
    issues.push('missing_build_script')
    autoFixActions.push('fallback_to_npx_vite_build')
  }
  if (packageFile && !hasVite && !hasReact) {
    issues.push('framework_not_detected')
    autoFixActions.push('use_generic_static_build_fallback')
  }

  return {
    package_json: !!packageFile,
    vite_or_react: hasVite || hasReact,
    build_config: hasBuildScript || !!viteConfig,
    detected: { hasReact, hasVite, hasBuildScript },
    issues,
    auto_fix_actions: autoFixActions,
    status: issues.length > 0 ? 'fixed' : 'scanned',
  }
}

// ===================== 16. APK PIPELINE =====================
async function handleApk(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  const admin = adminClient()
  console.log('API HIT:', `/apk/${pathParts[0] || ''}`)

  // POST /apk/git-scan
  if (method === 'POST' && pathParts[0] === 'git-scan') {
    const repoUrl = String(body?.repo_url || '').trim()
    if (!repoUrl) return err('repo_url is required', 422, 'VALIDATION_ERROR')

    const { data: startedScan, error: scanInsertError } = await admin.from('git_scans').insert({
      user_id: userId,
      repo_url: repoUrl,
      status: 'pending',
      issues_found: [],
    }).select('*').single()
    if (scanInsertError) return err(scanInsertError.message)

    try {
      const githubToken = Deno.env.get('SAASVALA_GITHUB_TOKEN') || undefined
      const scan = await scanGitRepository(repoUrl, githubToken)
      await admin
        .from('git_scans')
        .update({
          status: scan.status,
          issues_found: scan.issues,
          detected_stack: {
            package_json: scan.package_json,
            vite_or_react: scan.vite_or_react,
            build_config: scan.build_config,
            detected: scan.detected,
            auto_fix_actions: scan.auto_fix_actions,
          },
          updated_at: nowIso(),
        })
        .eq('id', startedScan.id)

      return ok({
        id: startedScan.id,
        repo_url: repoUrl,
        status: scan.status,
        issues_found: scan.issues,
        detected: {
          package_json: scan.package_json,
          vite_or_react: scan.vite_or_react,
          build_config: scan.build_config,
        },
        auto_fix_actions: scan.auto_fix_actions,
      })
    } catch (scanError: any) {
      await admin
        .from('git_scans')
        .update({
          status: 'failed',
          issues_found: [String(scanError?.message || 'scan_failed')],
          updated_at: nowIso(),
        })
        .eq('id', startedScan.id)
      return fail(scanError?.message || 'Git scan failed', 500, 'GIT_SCAN_FAILED')
    }
  }

  // POST /apk/build
  if (method === 'POST' && pathParts[0] === 'build' && !pathParts[1]) {
    const { data, error } = await sb.from('apk_build_queue').insert({
      repo_name: body.repo_name, repo_url: body.repo_url,
      slug: body.slug || body.repo_name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'unnamed',
      build_status: 'pending',
      target_industry: body.target_industry, product_id: body.product_id,
    }).select().single()
    if (error) return err(error.message)
    await emitDomainEvent(admin, 'build_completed', {
      build_id: data.id,
      product_id: body.product_id || null,
      repo_name: body.repo_name || null,
      status: 'queued',
    }, body.tenant_id || null)
    await logActivity(admin, 'apk', data.id, 'build_queued', userId, { repo: body.repo_name })

    let triggerResult: any = null
    let triggerError = ''
    let attempts = 0
    const maxAttempts = 3

    for (let i = 1; i <= maxAttempts; i++) {
      attempts = i
      await sb.from('apk_build_queue').update({
        build_status: 'building',
        build_started_at: nowIso(),
        build_error: null,
        build_attempts: i,
      }).eq('id', data.id)

      const { data: factoryData, error: factoryError } = await sb.functions.invoke('apk-factory', {
        body: {
          action: 'trigger_build',
          data: {
            slug: data.slug,
            repo_url: body.repo_url,
            product_id: body.product_id || null,
          },
        },
      })

      if (!factoryError && !factoryData?.error) {
        triggerResult = factoryData
        triggerError = ''
        break
      }

      triggerError = factoryError?.message || String(factoryData?.error || 'APK build trigger failed')
    }

    if (!triggerResult) {
      await sb.from('apk_build_queue').update({
        build_status: 'failed',
        build_error: triggerError,
        build_completed_at: nowIso(),
        build_attempts: attempts,
      }).eq('id', data.id)
      return fail(triggerError, 500, 'APK_BUILD_TRIGGER_FAILED')
    }

    return json({ success: true, data: { ...data, build_attempts: attempts, factory: triggerResult }, error: null }, 201)
  }

  // POST /apk/build/complete
  if (method === 'POST' && pathParts[0] === 'build' && pathParts[1] === 'complete') {
    const productId = String(body?.product_id || '').trim()
    if (!productId) return err('product_id is required', 422, 'VALIDATION_ERROR')
    const synced = await syncProductFromApkBuild(sb, {
      product_id: productId,
      apk_url: body?.apk_url || null,
      version: body?.version || null,
      build_status: body?.build_status || 'pending',
      source: body?.source || 'pipeline',
      build_id: body?.build_id || null,
    })
    if (synced.error) return err(synced.error, synced.status || 400)
    await logActivity(admin, 'apk', productId, 'build_completed', userId, {
      build_id: body?.build_id || synced.data?.build?.build_id || null,
      source: body?.source || 'pipeline',
      build_status: body?.build_status || 'pending',
      apk_url: body?.apk_url || null,
      version: body?.version || null,
    })
    return ok({
      ...synced.data,
      message: 'APK build completion synced',
    })
  }

  // POST /apk/convert
  if (method === 'POST' && pathParts[0] === 'convert') {
    const buildId = String(body?.build_id || '').trim()
    const slugInput = String(body?.slug || '').trim()
    let queueRow: any = null

    if (buildId) {
      const { data: byId } = await sb.from('apk_build_queue').select('*').eq('id', buildId).maybeSingle()
      queueRow = byId || null
    }

    if (!queueRow && slugInput) {
      const { data: bySlug } = await sb.from('apk_build_queue').select('*').eq('slug', slugInput).order('created_at', { ascending: false }).limit(1).maybeSingle()
      queueRow = bySlug || null
    }

    if (!queueRow) {
      const repoName = String(body?.repo_name || slugInput || '').trim()
      const repoUrl = String(body?.repo_url || '').trim()
      const slug = slugInput || repoName.toLowerCase().replace(/[^a-z0-9]/g, '-')
      if (!slug || !repoUrl) return err('build_id or (slug + repo_url) required', 422, 'VALIDATION_ERROR')

      const { data: inserted, error: insertError } = await sb.from('apk_build_queue').insert({
        repo_name: repoName || slug,
        repo_url: repoUrl,
        slug,
        build_status: 'pending',
        product_id: body?.product_id || null,
      }).select('*').single()
      if (insertError || !inserted) return err(insertError?.message || 'Failed to create build queue entry')
      queueRow = inserted
    }

    await sb.from('apk_build_queue').update({
      build_status: 'converting',
      build_error: null,
      updated_at: nowIso(),
    }).eq('id', queueRow.id)

    let converted = false
    let convertError = ''
    let attempts = Number(queueRow.build_attempts || 0)
    const maxAttempts = 3

    for (let i = 1; i <= maxAttempts; i++) {
      attempts = Number(queueRow.build_attempts || 0) + i
      const { data: factoryData, error: factoryError } = await sb.functions.invoke('apk-factory', {
        body: {
          action: 'trigger_build',
          data: {
            slug: queueRow.slug,
            repo_url: queueRow.repo_url,
            product_id: queueRow.product_id || body?.product_id || null,
          },
        },
      })
      if (!factoryError && !factoryData?.error) {
        converted = true
        convertError = ''
        break
      }
      convertError = factoryError?.message || String(factoryData?.error || 'APK conversion trigger failed')
    }

    if (!converted) {
      await sb.from('apk_build_queue').update({
        build_status: 'failed',
        build_error: convertError,
        build_completed_at: nowIso(),
        build_attempts: attempts,
      }).eq('id', queueRow.id)
      return fail(convertError, 500, 'APK_CONVERT_FAILED')
    }

    await sb.from('apk_build_queue').update({
      build_status: 'converting',
      build_attempts: attempts,
      updated_at: nowIso(),
    }).eq('id', queueRow.id)

    return ok({
      id: queueRow.id,
      slug: queueRow.slug,
      status: 'converting',
      attempts,
    })
  }

  // GET /apk/history
  if (method === 'GET' && pathParts[0] === 'history') {
    const { data, error } = await sb.from('apk_build_queue').select('*')
      .order('created_at', { ascending: false }).limit(50)
    if (error) return err(error.message)
    return json({ data })
  }

  // GET /apk/status/:id
  if (method === 'GET' && pathParts[0] === 'status' && pathParts[1]) {
    const buildId = pathParts[1]
    const { data, error } = await sb.from('apk_build_queue').select('*').eq('id', buildId).maybeSingle()
    if (!error && data) {
      return ok({
        ...data,
        status: normalizeApkPipelineStatus(data.build_status),
        raw_status: data.build_status,
      })
    }

    // Backward-compat fallback for environments still persisting finalized statuses in apk_builds.
    // Remove this fallback after all environments fully migrate to apk_build_queue-only status storage.
    const { data: fallbackData, error: fallbackError } = await sb.from('apk_builds').select('*').eq('id', buildId).maybeSingle()
    if (fallbackError || !fallbackData) return err('APK build not found', 404, 'NOT_FOUND')
    return ok({
      ...fallbackData,
      status: normalizeApkPipelineStatus(fallbackData.status),
      raw_status: fallbackData.status,
    })
  }

  // GET /apk/download/:id
  if (method === 'GET' && pathParts[0] === 'download' && pathParts[1]) {
    const SIGNED_URL_EXPIRY_SECONDS = 300
    const SIGNED_URL_EXPIRY_MS = SIGNED_URL_EXPIRY_SECONDS * 1000
    const identifier = String(pathParts[1] || '').trim()
    const now = new Date()

    const { data: productDirect } = await admin
      .from('products')
      .select('id, name, apk_url, price, build_id, build_status')
      .eq('id', identifier)
      .maybeSingle()

    let product = productDirect || null
    let apkPath = normalizeApkStoragePath(productDirect?.apk_url)
    let resolvedBuildStatus = normalizeSyncedBuildStatus(productDirect?.build_status)

    if (product?.id && (!apkPath || resolvedBuildStatus !== 'success')) {
      const { data: latestSuccessBuild } = await findLatestSuccessfulApkBuild(admin, product.id)
      const latestPath = normalizeApkStoragePath(latestSuccessBuild?.apk_url)
      const hasSyncedBuildId = Boolean(latestSuccessBuild?.build_id)
      const buildIdMismatch = product.build_id !== latestSuccessBuild?.build_id
      const statusNotSuccess = resolvedBuildStatus !== 'success'
      const urlMismatch = product.apk_url !== (latestSuccessBuild?.apk_url || null)
      const needsProductSync = hasSyncedBuildId && (buildIdMismatch || statusNotSuccess || urlMismatch)
      if (latestSuccessBuild?.build_id || latestPath) {
        apkPath = latestPath || apkPath
        resolvedBuildStatus = 'success'
        if (needsProductSync) {
          await admin.from('products').update({
            apk_url: latestSuccessBuild?.apk_url || product.apk_url || null,
            build_id: latestSuccessBuild?.build_id || null,
            build_status: 'success',
            updated_at: nowIso(),
          }).eq('id', product.id)
        }
      }
    }

    if (!product || !apkPath) {
      const { data: apkById } = await admin
        .from('apks')
        .select('id, product_id, file_url')
        .eq('id', identifier)
        .maybeSingle()

      if (apkById?.product_id) {
        const { data: linkedProduct } = await admin
          .from('products')
          .select('id, name, apk_url, price, build_id, build_status')
          .eq('id', apkById.product_id)
          .maybeSingle()
        if (linkedProduct) {
          product = linkedProduct
          apkPath = normalizeApkStoragePath(apkById.file_url) || normalizeApkStoragePath(linkedProduct.apk_url)
          resolvedBuildStatus = normalizeSyncedBuildStatus(linkedProduct.build_status)
        }
      }
    }

    if (!product || !apkPath || resolvedBuildStatus !== 'success') return json({ allowed: false, error: 'APK not found' }, 404)

    let hasPaidAccess = false

    const { data: orderPaid } = await admin
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', product.id)
      .eq('status', 'success')
      .limit(1)
      .maybeSingle()
    if (orderPaid?.id) hasPaidAccess = true

    if (!hasPaidAccess) {
      const { data: priorDownload } = await admin
        .from('apk_downloads')
        .select('id')
        .eq('user_id', userId)
        .eq('product_id', product.id)
        .eq('is_blocked', false)
        .limit(1)
        .maybeSingle()
      if (priorDownload?.id) hasPaidAccess = true
    }

    if (!hasPaidAccess) {
      const { data: activeSubscription } = await admin
        .from('subscriptions')
        .select('id, current_period_end')
        .eq('user_id', userId)
        .eq('product_id', product.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const periodEnd = activeSubscription?.current_period_end ? new Date(activeSubscription.current_period_end) : null
      if (activeSubscription?.id && (!periodEnd || periodEnd > now)) hasPaidAccess = true
    }

    if (!hasPaidAccess) {
      const { data: activeLicense } = await admin
        .from('license_keys')
        .select('id, expires_at')
        .eq('created_by', userId)
        .eq('status', 'active')
        .or(`product_id.eq.${product.id},meta->>product_id.eq.${product.id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const expiresAt = activeLicense?.expires_at ? new Date(activeLicense.expires_at) : null
      if (activeLicense?.id && (!expiresAt || expiresAt > now)) hasPaidAccess = true
    }

    let walletAutoDeducted = false
    if (!hasPaidAccess) {
      const amount = Number(product.price || 0)
      if (amount > 0) {
        const { data: wallet } = await admin
          .from('wallets')
          .select('id, balance')
          .eq('user_id', userId)
          .maybeSingle()

        const balance = Number(wallet?.balance || 0)
        if (wallet?.id && balance >= amount) {
          const balanceCents = Math.round(balance * 100)
          const amountCents = Math.round(amount * 100)
          const newBalanceCents = balanceCents - amountCents
          const newBalance = newBalanceCents / 100
          await admin.from('wallets').update({ balance: newBalance, updated_at: nowIso() }).eq('id', wallet.id)
          await admin.from('transactions').insert({
            wallet_id: wallet.id,
            type: 'debit',
            amount,
            balance_after: newBalance,
            status: 'completed',
            description: `Auto deduct for APK download: ${product.name || product.id}`,
            reference_type: 'apk_download_access',
            reference_id: product.id,
            created_by: userId,
            meta: { product_id: product.id, source: 'apk_download_gate' },
          })

          const generatedLicense = generateLicenseKey()
          await admin.from('apk_downloads').insert({
            user_id: userId,
            product_id: product.id,
            license_key: generatedLicense,
            is_verified: true,
            verification_attempts: 0,
            is_blocked: false,
            download_ip: readClientIp(),
          })

          hasPaidAccess = true
          walletAutoDeducted = true
        }
      }
    }

    if (!hasPaidAccess) {
      return json({ allowed: false, message: 'Payment required' }, 403)
    }

    const { data: signedUrl, error: signedUrlError } = await admin.storage.from('apks')
      .createSignedUrl(apkPath, SIGNED_URL_EXPIRY_SECONDS)
    if (signedUrlError || !signedUrl?.signedUrl) return err('Failed to generate download URL', 500)

    await admin.from('apk_download_logs').insert({
      product_id: product.id,
      user_id: userId,
      license_key: body?.license_key || (walletAutoDeducted ? 'wallet-auto-deduct' : 'paid-access'),
      download_ip: readClientIp(),
      signed_url_expires_at: new Date(Date.now() + SIGNED_URL_EXPIRY_MS).toISOString(),
    })

    return json({ allowed: true, url: signedUrl.signedUrl, download_url: signedUrl.signedUrl })
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

    const requestKey = String(body.request_id || body.idempotency_key || '').trim() || generateIdempotencyKey()
    const { data: atomicData, error: atomicError } = await admin.rpc('gateway_wallet_mutation_atomic', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_entry_type: 'credit',
      p_amount: amount,
      p_reference_type: body.reference_type || 'wallet_add',
      p_reference_id: body.reference_id || null,
      p_description: body.description || 'Credit added',
      p_source: body.source || 'admin_adjustment',
      p_meta: body.payment_method ? { payment_method: body.payment_method } : {},
      p_tenant_id: body.tenant_id || null,
      p_request_key: requestKey,
    })
    if (atomicError) return err(atomicError.message)
    const newBalance = Number(atomicData?.balance ?? wallet.balance ?? 0)
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

    const amount = Number(body.amount || 0)
    if (amount <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')
    const requestKey = String(body.request_id || body.idempotency_key || '').trim() || generateIdempotencyKey()
    const { data: atomicData, error: atomicError } = await admin.rpc('gateway_wallet_mutation_atomic', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_entry_type: 'debit',
      p_amount: amount,
      p_reference_type: body.reference_type || 'wallet_withdraw',
      p_reference_id: body.reference_id || null,
      p_description: body.description || 'Withdrawal',
      p_source: body.source || 'wallet_withdraw',
      p_meta: {},
      p_tenant_id: body.tenant_id || null,
      p_request_key: requestKey,
    })
    if (atomicError) return err(atomicError.message)
    const newBalance = Number(atomicData?.balance ?? wallet.balance ?? 0)
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
    const requestKey = String(body.request_id || body.idempotency_key || '').trim() || generateIdempotencyKey()
    const { data: atomicData, error: atomicError } = await admin.rpc('gateway_wallet_mutation_atomic', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_entry_type: 'lock',
      p_amount: Number(body.amount),
      p_reference_type: body.reference_type || 'manual_lock',
      p_reference_id: body.reference_id || null,
      p_description: 'Lock balance',
      p_source: 'wallet_lock',
      p_meta: body.meta || {},
      p_tenant_id: body.tenant_id || null,
      p_request_key: requestKey,
    })
    if (atomicError) return err(atomicError.message)
    const newLocked = Number(atomicData?.locked_balance ?? wallet.locked_balance ?? 0)
    return json({ success: true, locked_balance: newLocked })
  }

  // POST /wallet/unlock
  if (method === 'POST' && action === 'unlock') {

    if (Number(body.amount || 0) <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')
    const { data: wallet } = await sb.from('wallets').select('id, balance, locked_balance').eq('user_id', userId).single()
    if (!wallet) return err('Wallet not found', 404)
    const requestKey = String(body.request_id || body.idempotency_key || '').trim() || generateIdempotencyKey()
    const { data: atomicData, error: atomicError } = await admin.rpc('gateway_wallet_mutation_atomic', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_entry_type: 'unlock',
      p_amount: Number(body.amount),
      p_reference_type: body.reference_type || 'manual_unlock',
      p_reference_id: body.reference_id || null,
      p_description: 'Unlock balance',
      p_source: 'wallet_unlock',
      p_meta: body.meta || {},
      p_tenant_id: body.tenant_id || null,
      p_request_key: requestKey,
    })
    if (atomicError) return err(atomicError.message)
    const newLocked = Number(atomicData?.locked_balance ?? wallet.locked_balance ?? 0)
    return json({ success: true, locked_balance: newLocked })
  }

  // POST /wallet/refund
  if (method === 'POST' && action === 'refund') {

    if (Number(body.amount || 0) <= 0) return err('Invalid amount', 422, 'VALIDATION_ERROR')
    const { data: wallet } = await sb.from('wallets').select('id, balance').eq('user_id', userId).single()
    if (!wallet) return err('Wallet not found', 404)
    const requestKey = String(body.request_id || body.idempotency_key || '').trim() || generateIdempotencyKey()
    const { data: atomicData, error: atomicError } = await admin.rpc('gateway_wallet_mutation_atomic', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
      p_entry_type: 'refund',
      p_amount: Number(body.amount),
      p_reference_type: body.reference_type || 'wallet_refund',
      p_reference_id: body.reference_id || null,
      p_description: body.description || 'Wallet refund',
      p_source: body.source || 'wallet_refund',
      p_meta: body.meta || {},
      p_tenant_id: body.tenant_id || null,
      p_request_key: requestKey,
    })
    if (atomicError) return err(atomicError.message)
    const newBalance = Number(atomicData?.balance ?? wallet.balance ?? 0)
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

  // GET /seo/leads
  if (method === 'GET' && segment === 'seo' && pathParts[1] === 'leads') {
    return await handleSeoLeads('GET', ['leads', ...pathParts.slice(2)], body, userId, sb, req)
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
    await emitDomainEvent(admin, 'lead_generated', {
      lead_id: data.id,
      source: data.source,
      status: data.status,
    }, data.tenant_id || resellerId || null)
    await enqueueSearchIndex(admin, 'leads', data.id, {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      status: data.status,
    }, data.tenant_id || resellerId || null)
    await logActivity(admin, 'lead', data.id, 'created', userId)
    return json({ data }, 201)
  }

  // GET /seo/analytics
  if (method === 'GET' && segment === 'seo' && pathParts[1] === 'analytics') {
    const redisKey = 'cache:seo:analytics'
    const redisCached = await redisGetJson<any[]>(redisKey)
    if (redisCached) return json({ data: redisCached, cached: true, cache: 'redis' })
    const memValid = seoAnalyticsCache.data && Date.now() < seoAnalyticsCache.expiresAt
    if (memValid) return json({ data: seoAnalyticsCache.data, cached: true })

    const { data, error } = await sb.from('seo_data').select('*').order('created_at', { ascending: false })
    if (error) return err(error.message)
    seoAnalyticsCache.data = data || []
    seoAnalyticsCache.expiresAt = Date.now() + SEO_ANALYTICS_CACHE_TTL_MS
    await redisSetJson(redisKey, seoAnalyticsCache.data, Math.floor(SEO_ANALYTICS_CACHE_TTL_MS / 1000))
    return json({ data })
  }

  // POST /seo/scan
  if (method === 'POST' && segment === 'seo' && pathParts[1] === 'scan') {
    const { data, error } = await sb.functions.invoke('seo-optimize', {
      body: { ...body, action: 'scan', user_id: userId },
    })
    if (error) return err(error.message, 500)
    return ok(data || { message: 'SEO scan queued' })
  }

  // POST /seo/google-sync
  if (method === 'POST' && segment === 'seo' && pathParts[1] === 'google-sync') {
    await admin.from('async_jobs').insert({
      job_type: 'seo_google_sync',
      status: 'queued',
      payload: { user_id: userId, ...body },
    })
    return ok({ message: 'Google sync queued' })
  }

  // POST /seo/generate-meta
  if (method === 'POST' && segment === 'seo' && pathParts[1] === 'generate-meta') {
    const { data, error } = await sb.functions.invoke('seo-optimize', {
      body: { ...body, action: 'generate_meta', user_id: userId },
    })
    if (error) return err(error.message, 500)
    return ok(data || { message: 'Meta generation queued' })
  }

  // POST /seo/generate
  if (method === 'POST' && segment === 'seo' && pathParts[1] === 'generate') {
    const productId = sanitizeTextInput(body?.product_id, 128)
    if (!productId && !body?.product) return err('product_id or product payload is required', 422, 'VALIDATION_ERROR')

    let productPayload: any = body?.product || null
    if (!productPayload && productId) {
      const { data: productRow, error: productErr } = await sb
        .from('products')
        .select('id,name,slug,description,short_description,price')
        .eq('id', productId)
        .maybeSingle()
      if (productErr) return err(productErr.message)
      if (!productRow) return err('Product not found', 404)
      productPayload = productRow
    }

    const payload = buildSeoPayloadFromProduct({
      ...(productPayload || {}),
      country: body?.country || body?.country_code || 'GLOBAL',
      language: body?.language || body?.lang || 'en',
      currency: body?.currency || 'USD',
    })
    const effectiveProductId = String(productPayload?.id || productId || '').trim()

    if (effectiveProductId) {
      try {
        await upsertSeoMeta(admin, effectiveProductId, payload, userId)
      } catch (e: any) {
        return err(e?.message || 'Failed to save seo meta')
      }
    }

    return ok({
      product_id: effectiveProductId || null,
      title: payload.seo_title,
      meta_description: payload.meta_description,
      keywords: payload.keywords,
      slug: payload.slug,
      country_code: payload.country_code,
      language_code: payload.language_code,
      currency_code: payload.currency_code,
    })
  }


  }

  return err('Not found', 404)
}

async function handleSystemHealth(method: string, pathParts: string[], body: any, userId: string, sb: any) {
  if (!(method === 'POST' && pathParts[0] === 'run-check')) return err('Not found', 404)

  const isAdmin = await isSuperAdminUser(userId)
  if (!isAdmin) return err('Forbidden', 403, 'FORBIDDEN')

  const moduleName = sanitizeTextInput(body?.module, 128) || 'api-gateway'
  const now = nowIso()
  const admin = adminClient()

  const { data, error } = await admin
    .from('system_health')
    .insert({
      module: moduleName,
      status: 'healthy',
      last_check: now,
      details: { triggered_by: userId },
    })
    .select()
    .maybeSingle()

  if (error) {
    if (isTableMissingError(error)) {
      return ok({ module: moduleName, status: 'healthy', last_check: now, stored: false })
    }
    return err(error.message)
  }

  return ok(data || { module: moduleName, status: 'healthy', last_check: now })
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

function readIdempotencyKey(req: Request, body: any) {
  const fromBody = String(body?.request_id || body?.idempotency_key || '').trim()
  if (fromBody) return fromBody
  const fromHeader = String(req.headers.get('x-request-id') || req.headers.get('idempotency-key') || '').trim()
  return fromHeader || null
}

async function readIdempotentResponse(admin: any, userId: string, endpoint: string, key: string) {
  const { data } = await admin
    .from('idempotency_keys')
    .select('response, status_code')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .eq('key', key)
    .gt('expires_at', nowIso())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.response) return null
  return new Response(JSON.stringify(data.response), { status: Number(data.status_code || 200), headers: corsHeaders })
}

async function writeIdempotentResponse(admin: any, userId: string, endpoint: string, key: string, response: Response) {
  try {
    const bodyText = await response.clone().text()
    let parsed: unknown = null
    try { parsed = JSON.parse(bodyText) } catch { parsed = { raw: bodyText } }
    await admin.from('idempotency_keys').upsert({
      user_id: userId,
      endpoint,
      key,
      response: parsed,
      status_code: response.status,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'user_id,endpoint,key' })
  } catch {
    // no-op
  }
}

async function handleScheduler(method: string, pathParts: string[], body: any, sb: any) {
  const action = pathParts[0]
  const expected = Deno.env.get('SCHEDULER_CRON_SECRET')
  const provided = String(body?.cron_secret || '')
  if (!expected || !timingSafeEqualText(expected, provided)) return err('Forbidden', 403, 'FORBIDDEN')

  if (method === 'POST' && action === 'run') {
    const minute = new Date().getUTCMinutes()
    const dueJobs = [
      { job_name: 'health_check', run: true, schedule_hint: '*/1 * * * *' },
      { job_name: 'billing_check', run: minute % 5 === 0, schedule_hint: '*/5 * * * *' },
      { job_name: 'ai_tasks', run: minute % 10 === 0, schedule_hint: '*/10 * * * *' },
      { job_name: 'seo_scan', run: minute === 0, schedule_hint: '0 * * * *' },
      { job_name: 'key_expiry', run: minute === 0, schedule_hint: '0 * * * *' },
    ].filter((j) => j.run)

    const inserted: any[] = []
    for (const job of dueJobs) {
      const { data: runRow } = await sb.from('scheduled_job_runs').insert({
        job_name: job.job_name,
        schedule_hint: job.schedule_hint,
        status: 'running',
        started_at: nowIso(),
        details: { source: 'api-gateway-scheduler' },
      }).select().single()
      inserted.push(runRow)
    }

    if (dueJobs.some((j) => j.job_name === 'billing_check')) {
      await sb.from('async_jobs').insert({
        job_type: 'subscription_cron',
        status: 'queued',
        payload: { trigger: 'scheduler', kind: 'billing_check' },
      })
    }
    if (dueJobs.some((j) => j.job_name === 'ai_tasks')) {
      await sb.from('async_jobs').insert({
        job_type: 'ai_tasks',
        status: 'queued',
        payload: { trigger: 'scheduler', kind: 'ai_tasks' },
      })
    }
    if (dueJobs.some((j) => j.job_name === 'seo_scan')) {
      await sb.from('async_jobs').insert({
        job_type: 'seo_scan',
        status: 'queued',
        payload: { trigger: 'scheduler', kind: 'seo_scan' },
      })
    }
    if (dueJobs.some((j) => j.job_name === 'key_expiry')) {
      await expireKeysIfNeeded(sb)
    }

    for (const row of inserted.filter(Boolean)) {
      await sb.from('scheduled_job_runs').update({
        status: 'success',
        finished_at: nowIso(),
      }).eq('id', row.id)
    }
    return json({ success: true, triggered: dueJobs.map((j) => j.job_name) })
  }

  return err('Not found', 404)
}

// ===================== MAIN ROUTER =====================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const fullPath = url.pathname.replace(/^\/api-gateway\/?/, '').replace(/\/$/, '')
    const normalizedPath = fullPath.replace(/^api\/v1\/?/, '')
    const parts = normalizedPath.split('/').filter(Boolean)
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

    // Public global locale + translation endpoints
    if (module === 'geo') {
      return await handleGeo(req.method, subParts, body, req)
    }
    if (module === 'translate') {
      return await handleTranslate(req.method, subParts, body, req)
    }
    if (module === 'currency') {
      return await handleCurrency(req.method, subParts, body)
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
    if (module === 'scheduler' && req.method === 'POST' && subParts[0] === 'run') {
      const admin = adminClient()
      return await handleScheduler(req.method, subParts, body, admin)
    }

    // All other endpoints require JWT
    const auth = await authenticate(req)
    if (!auth) return err('Unauthorized', 401)

    const { userId, supabase: sb } = auth
    const endpointKey = `${module}/${subParts[0] || ''}`
    const rateLimitRes = await enforceRateLimit(adminClient(), userId, endpointKey, req)
    if (rateLimitRes) return rateLimitRes

    const isMutation = ['POST', 'PUT', 'DELETE'].includes(req.method)
    const idempotencyKey = isMutation ? readIdempotencyKey(req, body) : null
    const admin = adminClient()
    if (isMutation && idempotencyKey) {
      const replay = await readIdempotentResponse(admin, userId, endpointKey, idempotencyKey)
      if (replay) return replay
    }

    let routeResponse: Response
    if (module === 'reseller' && subParts[0] === 'key' && subParts[1] === 'generate' && req.method === 'POST') {
      routeResponse = await handleKeys(req.method, ['generate'], { ...body, force_reseller_flow: true }, userId, sb)
      if (isMutation && idempotencyKey && routeResponse.status >= 200 && routeResponse.status < 300) {
        await writeIdempotentResponse(admin, userId, endpointKey, idempotencyKey, routeResponse)
      }
      return routeResponse
    }

    switch (module) {

      case 'products':
        routeResponse = await handleProducts(req.method, subParts, body, userId, sb)
        break
      case 'marketplace':
        routeResponse = await handleMarketplace(req.method, subParts, body, userId, sb)
        break
      case 'dashboard':
        routeResponse = await handleDashboard(req.method, userId, sb)
        break
      case 'banner':
        routeResponse = await handleBannerAliases(req.method, subParts, body, userId, sb)
        break
      case 'offer':
        routeResponse = await handleOfferAliases(req.method, subParts, body, userId, sb)
        break
      case 'product':
        routeResponse = await handleProductAliases(req.method, subParts, body, userId, sb, req)
        break
      case 'category':
        routeResponse = await handleCategoryAliases(req.method, subParts, body, userId, sb)
        break
      case 'analytics':
        routeResponse = await handleAnalyticsAliases(req.method, subParts, body, userId, sb)
        break

      case 'keys':
        if (subParts[0] === 'create' || subParts[0] === 'revoke' || subParts[0] === 'usage') {
          routeResponse = await handleManagedApiKeys(req.method, subParts, body, userId, sb)
          break
        }
        routeResponse = await handleKeys(req.method, subParts, body, userId, sb)
        break
      case 'key':
        routeResponse = await handleKeys(req.method, subParts, body, userId, sb)
        break
      case 'models': routeResponse = await handleModels(req.method, subParts, body, userId, sb); break
      case 'projects':
      case 'servers':
      case 'deploy':
      case 'deploy-targets':
      case 'dns':
      case 'domain':
      case 'ssl':
      case 'git':
      case 'server':
        routeResponse = await handleServers(req.method, [module, ...subParts], body, userId, sb)
        break
      case 'github': routeResponse = await handleGithub(req.method, subParts, body, userId, sb); break
      case 'git': routeResponse = await handleGit(req.method, subParts, body, userId, sb); break
      case 'ai': routeResponse = await handleAi(req.method, subParts, body, userId, sb); break
      case 'code': routeResponse = await handleCode(req.method, subParts, body, userId, sb); break
      case 'db': routeResponse = await handleDb(req.method, subParts, body, userId); break
      case 'build': routeResponse = await handleBuild(req.method, subParts, body, userId, sb); break
      case 'chat': routeResponse = await handleChat(req.method, subParts, body, userId, sb); break
      case 'api-keys': routeResponse = await handleApiKeys(req.method, subParts, body, userId, sb); break
      case 'auto': routeResponse = await handleAuto(req.method, subParts, body, userId, sb); break
      case 'auto-pilot': routeResponse = await handleAutoPilot(req.method, subParts, body, userId, sb); break
      case 'apk': routeResponse = await handleApk(req.method, subParts, body, userId, sb); break
      case 'geo': routeResponse = await handleGeo(req.method, subParts, body, req); break
      case 'translate': routeResponse = await handleTranslate(req.method, subParts, body, req); break
      case 'currency': routeResponse = await handleCurrency(req.method, subParts, body); break
      case 'api-usage':

      case 'reseller':
        routeResponse = await handleResellerOnboarding(req.method, subParts, body, userId, sb)
        break
      case 'resellers':
        routeResponse = await handleResellers(req.method, subParts, body, userId, sb)
        break
      case 'admin':
        routeResponse = await handleAdminResellerApplications(req.method, subParts, body, userId, sb)
        break
      case 'wallet':
        routeResponse = await handleWallet(req.method, subParts, body, userId, sb)
        break
      case 'subscriptions':
      case 'subscription':
        routeResponse = await handleSubscriptions(req.method, subParts, body, userId, sb)
        break
      case 'leads':
      case 'lead':
      case 'seo':
        routeResponse = await handleSeoLeads(req.method, [module, ...subParts], body, userId, sb, req)
        break
      default:
        routeResponse = err(`Unknown module: ${module}`, 404)
        break
    }

    if (isMutation && idempotencyKey && routeResponse.status >= 200 && routeResponse.status < 300) {
      await writeIdempotentResponse(admin, userId, endpointKey, idempotencyKey, routeResponse)
    }
    return routeResponse
  } catch (e) {
    console.error('API Gateway Error:', e)
    return err('Internal server error', 500)
  }
})
