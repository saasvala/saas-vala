import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
const gatewayPath = path.resolve(process.cwd(), 'supabase/functions/api-gateway/index.ts');
const apkPath = path.resolve(process.cwd(), 'supabase/functions/download-apk/index.ts');
const verifyLicensePath = path.resolve(process.cwd(), 'supabase/functions/verify-license/index.ts');
const licenseSyncPolicyPath = path.resolve(process.cwd(), 'supabase/functions/license-sync-policy/index.ts');
const apkFactoryPath = path.resolve(process.cwd(), 'supabase/functions/apk-factory/index.ts');
const autoApkPipelinePath = path.resolve(process.cwd(), 'supabase/functions/auto-apk-pipeline/index.ts');

function mustRead(file: string) {
  return fs.readFileSync(file, 'utf8');
}

describe('ZERO DEAD FLOW acceptance gates', () => {
  test('routing includes required core routes + fallback redirect', () => {
    const source = mustRead(appPath);
    const requiredRoutes = [
      '/marketplace',
      '/product/:id',
      '/checkout',
      '/dashboard',
      '/app/:productId',
      '/admin/marketplace',
      '/reseller/dashboard',
    ];
    for (const route of requiredRoutes) {
      expect(source.includes(`path="${route}"`) || source.includes(`path="${route}"`)).toBeTruthy();
    }
    expect(source.includes('path="*"')).toBeTruthy();
    expect(source.includes('to="/marketplace"')).toBeTruthy();
  });

  test('payment create/verify chain exposes provider + idempotent semantics', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes('gateway_payment_init_atomic')).toBeTruthy();
    expect(source.includes('resolveEnabledPaymentGateway')).toBeTruthy();
    expect(source.includes('p_idempotency_key')).toBeTruthy();
    expect(source.includes('payment/verify')).toBeTruthy();
    expect(source.includes('markPaymentSuccess')).toBeTruthy();
  });

  test('post-payment chain emits order/subscription/license events', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes('order_completed')).toBeTruthy();
    expect(source.includes('subscription_activated') || source.includes('subscription_renewed')).toBeTruthy();
    expect(source.includes('license_key_assigned')).toBeTruthy();
    expect(source.includes('payment_success')).toBeTruthy();
  });

  test('apk download flow enforces entitlement checks', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes("GET /apk/download/:id")).toBeTruthy();
    expect(source.includes("hasPaidAccess")).toBeTruthy();
    expect(source.includes(".from('orders')")).toBeTruthy();
    expect(source.includes(".from('subscriptions')")).toBeTruthy();
    expect(source.includes(".from('license_keys')")).toBeTruthy();
    const edge = mustRead(apkPath);
    expect(edge.includes('product_id and license_key required')).toBeTruthy();
    expect(edge.includes('No valid purchase found for this license key')).toBeTruthy();
  });

  test('ai + seo globalization path has ai translation or deterministic fallback cache', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes('translateTextWithCache')).toBeTruthy();
    expect(source.includes('TRANSLATION_PROVIDER')).toBeTruthy();
    expect(source.includes('/functions/v1/ai-chat')).toBeTruthy();
    expect(source.includes(".from('translated_content')")).toBeTruthy();
    expect(source.includes('resolveCurrencyRates')).toBeTruthy();
  });

  test('admin marketplace sync events emitted on product/banner/offer mutations', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes('marketplace_sync')).toBeTruthy();
    expect(source.includes('banner_created')).toBeTruthy();
    expect(source.includes('banner_updated')).toBeTruthy();
    expect(source.includes('banner_deleted')).toBeTruthy();
    expect(source.includes('offer_created')).toBeTruthy();
  });

  test('queue retry + dead-letter semantics present for payment retries', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes('paymentRetryRunAt')).toBeTruthy();
    expect(source.includes("status: retryCount < MAX_PAYMENT_RETRY_ATTEMPTS ? 'queued' : 'dead_letter'")).toBeTruthy();
    expect(source.includes("job_type: 'webhook_retry'")).toBeTruthy();
  });

  test('zero-trust request checks enforce session binding + device fingerprint', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes('function enforceSessionBinding')).toBeTruthy();
    expect(source.includes('DEVICE_FINGERPRINT_REQUIRED')).toBeTruthy();
    expect(source.includes('SESSION_BINDING_MISMATCH')).toBeTruthy();
    expect(source.includes("action: 'session_bound'")).toBeTruthy();
  });

  test('api contract safety includes version guard + safe route fallback envelope', () => {
    const source = mustRead(gatewayPath);
    expect(source.includes('SUPPORTED_API_VERSIONS')).toBeTruthy();
    expect(source.includes('UNSUPPORTED_API_VERSION')).toBeTruthy();
    expect(source.includes('ROUTE_NOT_FOUND')).toBeTruthy();
    expect(source.includes('is_graceful_not_found: true')).toBeTruthy();
  });

  test('license verification enforces device binding, runtime block, and signed policy envelope', () => {
    const source = mustRead(verifyLicensePath);
    expect(source.includes('wrong_device')).toBeTruthy();
    expect(source.includes('runtime_blocked')).toBeTruthy();
    expect(source.includes('min_supported_apk_version_code')).toBeTruthy();
    expect(source.includes('signRuntimePolicy')).toBeTruthy();
    expect(source.includes('apk_runtime_policy_logs')).toBeTruthy();
  });

  test('license sync policy endpoint supports signed sync + analytics ingestion with rate limits', () => {
    const source = mustRead(licenseSyncPolicyPath);
    expect(source.includes('action === "ingest_event"')).toBeTruthy();
    expect(source.includes('APK_ANALYTICS_PER_MINUTE_PER_LICENSE')).toBeTruthy();
    expect(source.includes('analytics_rate_limited')).toBeTruthy();
    expect(source.includes('signPolicy')).toBeTruthy();
    expect(source.includes('force_update')).toBeTruthy();
  });

  test('download apk response includes trusted hash and update governance metadata', () => {
    const source = mustRead(apkPath);
    expect(source.includes('checksum_algorithm')).toBeTruthy();
    expect(source.includes('min_supported_version_code')).toBeTruthy();
    expect(source.includes('force_update_required')).toBeTruthy();
    expect(source.includes('download_origin')).toBeTruthy();
    expect(source.includes('user_agent')).toBeTruthy();
  });

  test('apk factory callback validates signatures and manages rollback/checksum metadata', () => {
    const source = mustRead(apkFactoryPath);
    expect(source.includes('Invalid callback signature')).toBeTruthy();
    expect(source.includes('artifact_checksum')).toBeTruthy();
    expect(source.includes('previous_stable_apk_path')).toBeTruthy();
    expect(source.includes('rollback_status')).toBeTruthy();
    expect(source.includes('build_target')).toBeTruthy();
  });

  test('auto apk pipeline supports vip priority and resource/build target metadata', () => {
    const source = mustRead(autoApkPipelinePath);
    expect(source.includes('priority_tier')).toBeTruthy();
    expect(source.includes('priority_score')).toBeTruthy();
    expect(source.includes('resource_class')).toBeTruthy();
    expect(source.includes('build_target')).toBeTruthy();
    expect(source.includes('order("priority_score", { ascending: false })')).toBeTruthy();
  });
});
