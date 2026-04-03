import { createClient } from '@supabase/supabase-js';
import { getEnv, logReport } from './common.mjs';

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const apiBase = getEnv('API_TEST_BASE_URL', supabaseUrl ? `${supabaseUrl}/functions/v1/api-gateway` : '');
const retryBudget = Number(getEnv('SELF_HEAL_RETRY_BUDGET', '3')) || 3;

// Deterministic health trigger mapping:
// - action: primary automated remediation
// - script: script expected to execute the action
// - fallback: queue/manual path when remediation fails
const HEALTH_TRIGGER_FIX_MAP = {
  api_probe_failure: { action: 'retry_api', script: 'self-heal.mjs', fallback: 'queue_manual_review' },
  queue_lag_high: { action: 'queue_drain_check', script: 'self-heal.mjs', fallback: 'queue_manual_review' },
  payment_success_latency_high: { action: 'payment_path_probe', script: 'self-heal.mjs', fallback: 'queue_manual_review' },
};

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
  const circuit = { open: false, reason: null, failures: 0 };

  for (const entry of unresolved || []) {
    if (circuit.open) break;
    const triggerType = String(entry.error_type || 'api_probe_failure');
    const mapped = HEALTH_TRIGGER_FIX_MAP[triggerType] || HEALTH_TRIGGER_FIX_MAP.api_probe_failure;
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
    circuit.failures += 1;
    if (circuit.failures >= retryBudget) {
      circuit.open = true;
      circuit.reason = 'retry_budget_exhausted';
    }

    await client.from('system_monitor_queue').insert({
      monitor_type: 'self_heal_fallback',
      title: `Fallback route applied for ${endpoint}`,
      reason: `Retry failed for endpoint ${endpoint}`,
      effect: 'Use fallback route and request admin intervention',
      risk_level: 'high',
      status: 'pending',
      source_module: 'self-heal',
      action_payload: {
        endpoint,
        retry,
        trigger_type: triggerType,
        fix_mapping: mapped,
        retry_budget,
        circuit_breaker: circuit,
      },
      ai_confidence: 80,
    });

    recoveries.push({
      id: entry.id,
      action: mapped.fallback,
      endpoint,
      retry,
      resolved: false,
      trigger_type: triggerType,
      fix_mapping: mapped,
      circuit_breaker: circuit,
    });
  }

  await client.from('activity_logs').insert({
    entity_type: 'self_heal',
    entity_id: `self-heal-${Date.now()}`,
    action: 'self_heal_run',
    details: { recoveries, health_trigger_fix_map: HEALTH_TRIGGER_FIX_MAP, retry_budget: retryBudget, circuit_breaker: circuit },
  });

  logReport('self_heal', {
    processed: (unresolved || []).length,
    recoveries,
    retry_budget: retryBudget,
    circuit_breaker: circuit,
  });

  const unresolvedCount = recoveries.filter((item) => !item.resolved).length;
  if (unresolvedCount > 0) process.exitCode = 1;
}

run();
