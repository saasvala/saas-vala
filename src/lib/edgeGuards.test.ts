import { describe, expect, it, vi } from 'vitest';
import {
  formatUserTime,
  getTypoSuggestions,
  isExpiredSignedUrl,
  levenshteinDistance,
} from './edgeGuards';

describe('edgeGuards', () => {
  it('computes levenshtein distance case-insensitively', () => {
    expect(levenshteinDistance('Kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('SaaS', 'saas')).toBe(0);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('returns typo suggestions within threshold and respects limit', () => {
    const options = ['dashboard', 'checkout', 'support', 'marketplace', 'recent'];
    expect(getTypoSuggestions(' ', options)).toEqual([]);
    expect(getTypoSuggestions('dashbord', options)).toEqual(['dashboard']);
    expect(getTypoSuggestions('recent', options)).toEqual([]);
    expect(getTypoSuggestions('suport', options, 1)).toEqual(['support']);
  });

  it('formats user time for valid input and handles invalid input', () => {
    expect(formatUserTime(undefined)).toBe('');
    expect(formatUserTime('invalid-date')).toBe('');
    expect(formatUserTime('2026-01-01T12:30:00.000Z')).not.toBe('');
  });

  it('falls back to Date#toLocaleString when Intl formatter throws', () => {
    const expected = new Date('2026-01-01T12:30:00.000Z').toLocaleString();
    const original = Intl.DateTimeFormat;
    // @ts-expect-error test override
    Intl.DateTimeFormat = vi.fn(() => {
      throw new Error('formatter failed');
    });

    try {
      expect(formatUserTime('2026-01-01T12:30:00.000Z')).toBe(expected);
    } finally {
      Intl.DateTimeFormat = original;
    }
  });

  it('detects signed URL expiration safely', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const nowSeconds = Math.floor(Date.now() / 1000);

    expect(isExpiredSignedUrl('https://example.com/file')).toBe(false);
    expect(isExpiredSignedUrl('not-a-valid-url')).toBe(false);
    expect(isExpiredSignedUrl('https://example.com/file?expires=abc')).toBe(false);
    expect(isExpiredSignedUrl(`https://example.com/file?expires=${nowSeconds + 5}`)).toBe(false);
    expect(isExpiredSignedUrl(`https://example.com/file?expires=${nowSeconds}`)).toBe(true);
    expect(isExpiredSignedUrl(`https://example.com/file?expires=${nowSeconds - 1}`)).toBe(true);

    nowSpy.mockRestore();
  });
});
