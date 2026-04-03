export function levenshteinDistance(a: string, b: string) {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  const dp = Array.from({ length: aa.length + 1 }, () => Array(bb.length + 1).fill(0));
  for (let i = 0; i <= aa.length; i++) dp[i][0] = i;
  for (let j = 0; j <= bb.length; j++) dp[0][j] = j;
  for (let i = 1; i <= aa.length; i++) {
    for (let j = 1; j <= bb.length; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[aa.length][bb.length];
}

export function getTypoSuggestions(query: string, options: string[], limit = 3) {
  if (!query.trim()) return [];
  return options
    .map((item) => ({ item, d: levenshteinDistance(query, item) }))
    .filter((row) => row.d > 0 && row.d <= 2)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((row) => row.item);
}

export function normalizeLanguage(lang?: string | null) {
  const value = String(lang || '').trim().toLowerCase();
  return value || 'en';
}

export function formatUserTime(iso?: string | null, locale?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

