import { createClient } from '@supabase/supabase-js';
import { getEnv, logReport, nowIso, toNumber } from './common.mjs';

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

function client() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function buildApiBase() {
  const explicit = getEnv('API_TEST_BASE_URL');
  if (explicit) return explicit;
  if (!supabaseUrl) return '';
  return `${supabaseUrl}/functions/v1/api-gateway`;
}

async function probeEndpoint(baseUrl, endpoint, init = {}) {
  const start = performance.now();
  try {
    const response = await fetch(`${baseUrl}/${endpoint.replace(/^\//, '')}`, init);
    const durationMs = Math.round(performance.now() - start);
    return {
      endpoint,
      status: response.status,
      ok: response.ok,
      latency_ms: durationMs,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    return {
      endpoint,
      status: 0,
      ok: false,
      latency_ms: durationMs,
      error: String(error),
    };
  }
}

async function runOnce() {
  const db = client();
  const baseUrl = buildApiBase();
  if (!db || !baseUrl) {
    logReport('monitoring_engine', { skipped: true, reason: 'Missing env configuration' });
    return { skipped: true, ok: true };
  }

  const endpoints = ['products', 'cart', 'marketplace/orders', 'subscriptions', 'admin/metrics', 'resellers'];
  const startedAt = nowIso();
  const probes = await Promise.all(endpoints.map((ep) => probeEndpoint(baseUrl, ep)));
  const endedAt = nowIso();

  const total = probes.length;
  const failures = probes.filter((item) => !item.ok).length;
  const latencyTotal = probes.reduce((sum, item) => sum + item.latency_ms, 0);
  const avgLatency = total > 0 ? Math.round(latencyTotal / total) : 0;
  const errorRate = total > 0 ? failures / total : 0;

  await db.from('usage_metrics').insert([
    { metric_type: 'requests_per_run', metric_value: total, metadata: { startedAt, endedAt } },
    { metric_type: 'error_rate', metric_value: errorRate, metadata: { total, failures } },
    { metric_type: 'latency_ms_avg', metric_value: avgLatency, metadata: { probes } },
  ]);

  await db.from('activity_logs').insert({
    entity_type: 'monitoring',
    entity_id: `run-${Date.now()}`,
    action: 'monitoring_probe',
    details: { startedAt, endedAt, probes, requests_per_sec_proxy: total, error_rate: errorRate, latency_ms_avg: avgLatency },
  });

  const severeErrors = probes.filter((probe) => !probe.ok);
  for (const issue of severeErrors) {
    await db.from('error_logs').insert({
      error_type: 'api_probe_failure',
      error_message: `Endpoint ${issue.endpoint} failed with status ${issue.status}`,
      severity: issue.status >= 500 || issue.status === 0 ? 'high' : 'medium',
      context: issue,
      resolved: false,
    });
  }

  const ok = failures === 0;
  logReport('monitoring_engine', {
    ok,
    requests_per_sec_proxy: total,
    error_rate: errorRate,
    latency_ms_avg: avgLatency,
    probes,
  });

  return { ok, failures, total, probes };
}

async function run() {
  const intervalMs = toNumber(getEnv('MONITOR_INTERVAL_MS', '0'), 0);

  if (intervalMs > 0) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await runOnce();
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const result = await runOnce();
  if (!result.ok) process.exitCode = 1;
}

run();
