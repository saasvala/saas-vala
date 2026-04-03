import process from 'node:process';

export function getEnv(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

export function nowIso() {
  return new Date().toISOString();
}

export function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function logReport(label, report) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ label, at: nowIso(), ...report }, null, 2));
}
