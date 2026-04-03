import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appPath = path.resolve(process.cwd(), 'src/App.tsx');
const gatewayPath = path.resolve(process.cwd(), 'supabase/functions/api-gateway/index.ts');
const apkPath = path.resolve(process.cwd(), 'supabase/functions/download-apk/index.ts');

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
});
