import { createClient } from '@supabase/supabase-js';
import { getEnv, logReport, nowIso, toNumber } from './common.mjs';

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const periodMs = toNumber(getEnv('DB_CHECK_INTERVAL_MS', '0'), 0);

function buildClient() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function queryCount(client, queryBuilder) {
  const { count, error } = await queryBuilder;
  if (error) throw error;
  return count || 0;
}

async function checkOnce() {
  const client = buildClient();
  if (!client) {
    logReport('db_integrity_check', { skipped: true, reason: 'Missing SUPABASE envs' });
    return { ok: true, skipped: true };
  }

  const [
    orphanOrders,
    orphanKeys,
    orphanSubscriptions,
    unresolvedErrors,
    staleSnapshots,
  ] = await Promise.all([
    queryCount(client, client.from('orders').select('id', { count: 'exact', head: true }).is('product_id', null)),
    queryCount(client, client.from('license_keys').select('id', { count: 'exact', head: true }).is('product_id', null)),
    queryCount(client, client.from('subscriptions').select('id', { count: 'exact', head: true }).is('user_id', null)),
    queryCount(client, client.from('error_logs').select('id', { count: 'exact', head: true }).eq('resolved', false)),
    queryCount(client, client.from('system_health_snapshots').select('id', { count: 'exact', head: true }).lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())),
  ]);

  const report = {
    checked_at: nowIso(),
    foreign_key_proxy_checks: {
      orphan_orders_product_id: orphanOrders,
      orphan_license_keys_product_id: orphanKeys,
      orphan_subscriptions_user_id: orphanSubscriptions,
    },
    index_usage_proxy_checks: {
      unresolved_errors: unresolvedErrors,
      stale_snapshots: staleSnapshots,
    },
  };

  const totalIssues = orphanOrders + orphanKeys + orphanSubscriptions;
  const ok = totalIssues === 0;

  logReport('db_integrity_check', { ok, totalIssues, report });

  await client.from('system_health_snapshots').insert({
    snapshot_type: 'db_integrity',
    status: ok ? 'healthy' : 'degraded',
    metrics: {
      orphan_orders: orphanOrders,
      orphan_license_keys: orphanKeys,
      orphan_subscriptions: orphanSubscriptions,
      unresolved_errors: unresolvedErrors,
      stale_snapshots: staleSnapshots,
    },
    issues_detected: totalIssues,
    auto_actions_taken: 0,
    approvals_queued: 0,
    details: report,
  });

  return { ok, totalIssues, report };
}

async function run() {
  if (periodMs > 0) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await checkOnce();
      await new Promise((resolve) => setTimeout(resolve, periodMs));
    }
  }

  const result = await checkOnce();
  if (!result.ok) process.exitCode = 1;
}

run();
