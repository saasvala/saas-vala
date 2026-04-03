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
    debitLedgerCount,
    completedDebitTransactions,
  ] = await Promise.all([
    queryCount(client, client.from('orders').select('id', { count: 'exact', head: true }).is('product_id', null)),
    queryCount(client, client.from('license_keys').select('id', { count: 'exact', head: true }).is('product_id', null)),
    queryCount(client, client.from('subscriptions').select('id', { count: 'exact', head: true }).is('user_id', null)),
    queryCount(client, client.from('error_logs').select('id', { count: 'exact', head: true }).eq('resolved', false)),
    queryCount(client, client.from('system_health_snapshots').select('id', { count: 'exact', head: true }).lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())),
    queryCount(client, client.from('wallet_ledger').select('wallet_id', { count: 'exact', head: true }).in('entry_type', ['debit', 'lock'])),
    queryCount(client, client.from('transactions').select('wallet_id', { count: 'exact', head: true }).eq('status', 'completed').eq('type', 'debit')),
  ]);

  const ledgerDebitMismatch = Math.max(0, Math.abs(debitLedgerCount - completedDebitTransactions));
  const autoCorrections = [];
  if (ledgerDebitMismatch > 0) {
    await client.from('system_monitor_queue').insert({
      monitor_type: 'ledger_mismatch',
      title: 'Ledger mismatch detected',
      reason: `wallet_ledger debit/lock entries (${debitLedgerCount}) differ from completed debit transactions (${completedDebitTransactions})`,
      effect: 'Queue reconciliation and manual review',
      risk_level: ledgerDebitMismatch > 10 ? 'high' : 'medium',
      status: 'pending',
      source_module: 'db-integrity-check',
      action_payload: {
        mismatch_type: 'wallet_ledger_vs_transactions',
        ledger_debit_count: debitLedgerCount,
        completed_debit_transactions: completedDebitTransactions,
        mismatch: ledgerDebitMismatch,
      },
      ai_confidence: 86,
    });
    autoCorrections.push({
      type: 'queue_reconciliation',
      mismatch: ledgerDebitMismatch,
      action: 'system_monitor_queue.insert',
    });
  }

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
    financial_reconciliation_checks: {
      wallet_ledger_debit_entries: debitLedgerCount,
      completed_debit_transactions: completedDebitTransactions,
      mismatch_detector: ledgerDebitMismatch,
      auto_corrections: autoCorrections,
    },
  };

  const totalIssues = orphanOrders + orphanKeys + orphanSubscriptions + ledgerDebitMismatch;
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
      wallet_ledger_debit_entries: debitLedgerCount,
      completed_debit_transactions: completedDebitTransactions,
      ledger_mismatch: ledgerDebitMismatch,
    },
    issues_detected: totalIssues,
    auto_actions_taken: autoCorrections.length,
    approvals_queued: autoCorrections.length,
    details: report,
  });

  await client.from('usage_metrics').insert({
    metric_type: 'reconciliation_drift',
    metric_value: ledgerDebitMismatch,
    metadata: {
      debitLedgerCount,
      completedDebitTransactions,
      autoCorrections: autoCorrections.length,
      checked_at: report.checked_at,
    },
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
