import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  formatLocalizedPrice,
  getCurrencySymbol,
  getStoredLocale,
  storeLocale,
} from './locale';

describe('locale utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default locale when storage is empty', () => {
    expect(getStoredLocale()).toEqual(DEFAULT_LOCALE);
  });

  it('normalizes stored locale values and falls back for invalid language', () => {
    localStorage.setItem('global_country_code', ' in ');
    localStorage.setItem('global_language', 'invalid-lang');
    localStorage.setItem('global_currency', ' inr ');

    expect(getStoredLocale()).toEqual({
      country: 'IN',
      language: 'en',
      currency: 'INR',
    });
  });

  it('stores merged locale and dispatches locale changed event', () => {
    localStorage.setItem('global_country_code', 'US');
    localStorage.setItem('global_language', 'en');
    localStorage.setItem('global_currency', 'USD');

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const result = storeLocale({ country: 'ae', language: 'ar' });

    expect(result).toEqual({
      country: 'AE',
      language: 'ar',
      currency: 'USD',
    });
    expect(localStorage.getItem('global_country_code')).toBe('AE');
    expect(localStorage.getItem('global_language')).toBe('ar');
    expect(localStorage.getItem('global_currency')).toBe('USD');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockRestore();
  });

  it('resolves currency symbols with fallback for unknown values', () => {
    expect(getCurrencySymbol('usd')).toBe('$');
    expect(getCurrencySymbol('INR')).toBe('₹');
    expect(getCurrencySymbol('zzz')).toBe('$');
    expect(getCurrencySymbol()).toBe('$');
  });

  it('formats localized prices and falls back when Intl formatting throws', () => {
    expect(formatLocalizedPrice(1234.5, 'USD')).toMatch(/\$/);

    const numberFormatSpy = vi.spyOn(Intl, 'NumberFormat').mockImplementation(() => {
      throw new Error('intl unavailable');
    });

    expect(formatLocalizedPrice(10, 'USD', '$')).toBe('$10.00');
    numberFormatSpy.mockRestore();
  });
});
