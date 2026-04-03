export interface GlobalLocale {
  country: string
  language: string
  currency: string
}

export const DEFAULT_LOCALE: GlobalLocale = {
  country: 'US',
  language: 'en',
  currency: 'USD',
}

export const COUNTRY_LOCALE_MAP: Record<string, { language: string; currency: string }> = {
  IN: { language: 'hi', currency: 'INR' },
  AE: { language: 'ar', currency: 'AED' },
  SA: { language: 'ar', currency: 'SAR' },
  US: { language: 'en', currency: 'USD' },
  GB: { language: 'en', currency: 'GBP' },
  EU: { language: 'en', currency: 'EUR' },
}

export const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  SAR: '﷼',
}

export const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
]
const AVAILABLE_LANGUAGE_CODE_SET = new Set(AVAILABLE_LANGUAGES.map((item) => item.code))

export const AVAILABLE_CURRENCIES = [
  { code: 'USD', symbol: '$', flag: '🇺🇸', name: 'US Dollar' },
  { code: 'INR', symbol: '₹', flag: '🇮🇳', name: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', flag: '🇪🇺', name: 'Euro' },
  { code: 'GBP', symbol: '£', flag: '🇬🇧', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', flag: '🇦🇪', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', flag: '🇸🇦', name: 'Saudi Riyal' },
]

function normalizeCountry(value: unknown) {
  return String(value || '').trim().toUpperCase().slice(0, 2) || DEFAULT_LOCALE.country
}

function normalizeLanguage(value: unknown) {
  const lang = String(value || '').trim().toLowerCase().slice(0, 3)
  return AVAILABLE_LANGUAGE_CODE_SET.has(lang) ? lang : DEFAULT_LOCALE.language
}

function normalizeCurrency(value: unknown) {
  return String(value || '').trim().toUpperCase().slice(0, 3) || DEFAULT_LOCALE.currency
}

export function getStoredLocale(): GlobalLocale {
  const country = normalizeCountry(localStorage.getItem('global_country_code'))
  const language = normalizeLanguage(localStorage.getItem('global_language'))
  const currency = normalizeCurrency(localStorage.getItem('global_currency'))
  return { country, language, currency }
}

export function storeLocale(next: Partial<GlobalLocale>): GlobalLocale {
  const current = getStoredLocale()
  const merged: GlobalLocale = {
    country: normalizeCountry(next.country || current.country),
    language: normalizeLanguage(next.language || current.language),
    currency: normalizeCurrency(next.currency || current.currency),
  }
  localStorage.setItem('global_country_code', merged.country)
  localStorage.setItem('global_language', merged.language)
  localStorage.setItem('global_currency', merged.currency)
  window.dispatchEvent(new CustomEvent('global-locale-changed', { detail: merged }))
  return merged
}

export function getCurrencySymbol(code?: string) {
  const normalized = normalizeCurrency(code || DEFAULT_LOCALE.currency)
  return CURRENCY_SYMBOL_MAP[normalized] || '$'
}

export function formatLocalizedPrice(value: number, currencyCode?: string, fallbackSymbol?: string) {
  const amount = Number(value || 0)
  const currency = normalizeCurrency(currencyCode || DEFAULT_LOCALE.currency)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${fallbackSymbol || getCurrencySymbol(currency)}${amount.toFixed(2)}`
  }
}
