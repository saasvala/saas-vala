import { createClient } from '@supabase/supabase-js';
import { getEnv, logReport } from './common.mjs';

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const apiBase = getEnv('API_TEST_BASE_URL', supabaseUrl ? `${supabaseUrl}/functions/v1/api-gateway` : '');

function db() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function retryApi(endpoint, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${apiBase}/${endpoint}`);
      if (response.ok) {
        return { ok: true, attempt, status: response.status };
      }
      if (attempt === maxAttempts) return { ok: false, attempt, status: response.status };
    } catch (error) {
      if (attempt === maxAttempts) return { ok: false, attempt, status: 0, error: String(error) };
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  return { ok: false, attempt: maxAttempts, status: 0 };
}

async function run() {
  const client = db();
  if (!client || !apiBase) {
    logReport('self_heal', { skipped: true, reason: 'Missing env configuration' });
    return;
  }

  const { data: unresolved } = await client
    .from('error_logs')
    .select('id,error_message,error_type,context,severity')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(20);

  const recoveries = [];

  for (const entry of unresolved || []) {
    const endpoint = entry.error_type === 'api_probe_failure' && entry.context && typeof entry.context === 'object'
      ? String(entry.context.endpoint || 'products')
      : 'products';

    const retry = await retryApi(endpoint.replace(/^\//, ''), 3);

    if (retry.ok) {
      await client
        .from('error_logs')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', entry.id);

      recoveries.push({ id: entry.id, action: 'retry_api', endpoint, retry, resolved: true });
      continue;
    }

    await client.from('system_monitor_queue').insert({
      monitor_type: 'self_heal_fallback',
      title: `Fallback route applied for ${endpoint}`,
      reason: `Retry failed for endpoint ${endpoint}`,
      effect: 'Use fallback route and request admin intervention',
      risk_level: 'high',
      status: 'pending',
      source_module: 'self-heal',
      action_payload: { endpoint, retry },
      ai_confidence: 80,
    });

    recoveries.push({ id: entry.id, action: 'fallback_route', endpoint, retry, resolved: false });
  }

  await client.from('activity_logs').insert({
    entity_type: 'self_heal',
    entity_id: `self-heal-${Date.now()}`,
    action: 'self_heal_run',
    details: { recoveries },
  });

  logReport('self_heal', { processed: (unresolved || []).length, recoveries });

  const unresolvedCount = recoveries.filter((item) => !item.resolved).length;
  if (unresolvedCount > 0) process.exitCode = 1;
}

run();
