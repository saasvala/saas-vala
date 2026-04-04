import { getEnv, logReport, safeJson, toNumber } from './common.mjs';

const baseUrl = getEnv('API_TEST_BASE_URL', getEnv('VITE_SUPABASE_URL') ? `${getEnv('VITE_SUPABASE_URL')}/functions/v1/api-gateway` : '');
const concurrency = toNumber(getEnv('PERF_CONCURRENCY', '10'), 10);
const requestsPerWorker = toNumber(getEnv('PERF_REQUESTS_PER_WORKER', '5'), 5);
const endpoint = getEnv('PERF_ENDPOINT', 'products');
const perfSlaMs = toNumber(getEnv('PERF_SLA_MS', '300'), 300);

async function hitOnce() {
  const start = performance.now();
  try {
    const response = await fetch(`${baseUrl}/${endpoint}`);
    const latency = Math.round(performance.now() - start);
    const body = await safeJson(response);
    return { ok: response.ok, status: response.status, latency, bodyType: typeof body };
  } catch (error) {
    const latency = Math.round(performance.now() - start);
    return { ok: false, status: 0, latency, error: String(error) };
  }
}

async function runWorker() {
  const workerResults = [];
  for (let i = 0; i < requestsPerWorker; i++) {
    workerResults.push(await hitOnce());
  }
  return workerResults;
}

async function run() {
  if (!baseUrl) {
    logReport('performance_test', { skipped: true, reason: 'Missing API base URL' });
    return;
  }

  const startedAt = Date.now();
  const chunks = await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  const results = chunks.flat();

  const total = results.length;
  const failures = results.filter((item) => !item.ok).length;
  const successRate = total > 0 ? (total - failures) / total : 0;
  const latencies = results.map((item) => item.latency).sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const avg = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0;
  const underSla = results.filter((item) => item.latency <= perfSlaMs).length;
  const slaBreaches = results.filter((item) => item.latency > perfSlaMs).length;
  const elapsedMs = Date.now() - startedAt;

  logReport('performance_test', {
    total,
    failures,
    successRate,
    avg,
    p95,
    max,
    perfSlaMs,
    underSla,
    underSlaRate: total > 0 ? underSla / total : 0,
    slaBreaches,
    elapsedMs,
    crashFree: true,
    stableResponse: slaBreaches === 0,
  });

  if (failures > 0 || slaBreaches > 0) process.exitCode = 1;
}

run();
