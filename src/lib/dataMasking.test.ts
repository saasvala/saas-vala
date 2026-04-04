import { describe, expect, it } from 'vitest';
import {
  maskEmail,
  maskName,
  maskPhone,
  maskSensitiveData,
  useMaskedValue,
} from './dataMasking';

describe('dataMasking', () => {
  it('masks phone numbers in partial and full-hidden modes', () => {
    expect(maskPhone('5551234567')).toBe('+555*****67');
    expect(maskPhone('+1 (555) 123-4567')).toBe('+155******67');
    expect(maskPhone('555123', true)).toBe('+555*23');
    expect(maskPhone('555123', false)).toBe('📞 ••••••••••');
  });

  it('masks email addresses and keeps invalid input unchanged', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j•••••e@e••••e.com');
    expect(maskEmail('ab@cd.com')).toBe('••@••.com');
    expect(maskEmail('john.doe@example.com', false)).toBe('📧 ••••@••••.•••');
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });

  it('masks names with multi-word support', () => {
    expect(maskName('John Doe')).toBe('J••• D••');
    expect(maskName('A')).toBe('A');
    expect(maskName('  Alice   Bob  ')).toBe('A•••• B••');
    expect(maskName('John Doe', false)).toBe('👤 ••••••');
  });

  it('masks sensitive data across text and honors config toggles', () => {
    const mixed = 'Email john.doe@example.com, call +1 555-123-4567.';
    expect(maskSensitiveData(mixed)).toContain('j•••••e@e••••e.com');
    expect(maskSensitiveData(mixed)).toContain('+155******67');

    const emailOnly = maskSensitiveData(mixed, { maskPhones: false });
    expect(emailOnly).toContain('j•••••e@e••••e.com');
    expect(emailOnly).toContain('+1 555-123-4567');

    const phoneOnly = maskSensitiveData(mixed, { maskEmails: false });
    expect(phoneOnly).toContain('john.doe@example.com');
    expect(phoneOnly).toContain('+155******67');
  });

  it('uses type-specific masking and returns hover behavior metadata', () => {
    expect(useMaskedValue('john.doe@example.com', 'email').masked).toBe('j•••••e@e••••e.com');
    expect(useMaskedValue('5551234567', 'phone').masked).toBe('+555*****67');
    expect(useMaskedValue('John Doe', 'name').masked).toBe('J••• D••');

    const auto = useMaskedValue('Reach me at john.doe@example.com', 'auto', { showOnHover: false });
    expect(auto.masked).toContain('j•••••e@e••••e.com');
    expect(auto.original).toBe('Reach me at john.doe@example.com');
    expect(auto.showOnHover).toBe(false);
  });
});
