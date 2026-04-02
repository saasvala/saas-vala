import { createClient } from '@supabase/supabase-js';
import { getEnv, logReport, nowIso, toNumber } from './common.mjs';

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

function db() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function fetchMetric(client, type) {
  const { data } = await client
    .from('usage_metrics')
    .select('metric_value,metadata,recorded_at')
    .eq('metric_type', type)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function evaluateOnce() {
  const client = db();
  if (!client) {
    logReport('alert_engine', { skipped: true, reason: 'Missing SUPABASE envs' });
    return { ok: true, skipped: true };
  }

  const threshold = toNumber(getEnv('ALERT_ERROR_RATE_THRESHOLD', '0.2'), 0.2);
  const [errorRateRow, latencyRow] = await Promise.all([
    fetchMetric(client, 'error_rate'),
    fetchMetric(client, 'latency_ms_avg'),
  ]);

  const unresolvedApiFailures = await client
    .from('error_logs')
    .select('id,error_message,severity,created_at', { count: 'exact' })
    .eq('resolved', false)
    .eq('error_type', 'api_probe_failure')
    .order('created_at', { ascending: false })
    .limit(20);

  const rows = [];
  const now = nowIso();
  const latestErrorRate = Number(errorRateRow?.metric_value || 0);
  const latestLatency = Number(latencyRow?.metric_value || 0);

  if (latestErrorRate > threshold) {
    rows.push({
      alert_type: 'error_rate_threshold',
      severity: latestErrorRate > threshold * 2 ? 'critical' : 'high',
      status: 'open',
      message: `Error rate ${latestErrorRate.toFixed(3)} exceeds threshold ${threshold.toFixed(3)}`,
      context: { latestErrorRate, threshold, at: now },
      first_seen_at: now,
      last_seen_at: now,
    });
  }

  const failedApiCount = unresolvedApiFailures.count || 0;
  if (failedApiCount > 0) {
    rows.push({
      alert_type: 'api_failures_detected',
      severity: failedApiCount > 5 ? 'critical' : 'high',
      status: 'open',
      message: `${failedApiCount} unresolved API probe failures detected`,
      context: { failedApiCount, latest: unresolvedApiFailures.data || [] },
      first_seen_at: now,
      last_seen_at: now,
    });
  }

  if (latestLatency > toNumber(getEnv('ALERT_LATENCY_THRESHOLD_MS', '2500'), 2500)) {
    rows.push({
      alert_type: 'server_latency_high',
      severity: 'high',
      status: 'open',
      message: `Average latency ${latestLatency}ms indicates potential server degradation`,
      context: { latestLatency },
      first_seen_at: now,
      last_seen_at: now,
    });
  }

  if (rows.length > 0) {
    await client.from('system_alerts').insert(rows);

    await client.from('system_monitor_queue').insert(
      rows.map((row) => ({
        monitor_type: 'alert',
        title: row.alert_type,
        reason: row.message,
        effect: 'Escalate to admin for action',
        risk_level: row.severity,
        status: 'pending',
        source_module: 'alert-engine',
        action_payload: row.context,
        ai_confidence: 92,
      })),
    );
  }

  logReport('alert_engine', { generated_alerts: rows.length, errorRate: latestErrorRate, latestLatency, failedApiCount });

  return { ok: rows.length === 0, generated: rows.length };
}

async function run() {
  const intervalMs = toNumber(getEnv('ALERT_INTERVAL_MS', '0'), 0);
  if (intervalMs > 0) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await evaluateOnce();
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const result = await evaluateOnce();
  if (!result.ok) process.exitCode = 1;
}

run();
