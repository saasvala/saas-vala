import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecureLicenseKey, validateLicenseKeyInDb } from './licenseUtils';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('licenseUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a secure license key in XXXX-XXXX-XXXX-XXXX format', () => {
    const key = generateSecureLicenseKey();
    expect(key).toMatch(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);
  });

  it('validates active license and normalizes input key before query', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: '1', status: 'active', expires_at: '2099-01-01T00:00:00.000Z' },
      error: null,
    });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqLicense = vi.fn(() => ({ eq: eqStatus }));
    const select = vi.fn(() => ({ eq: eqLicense }));
    vi.mocked((supabase as any).from).mockReturnValue({ select });

    const result = await validateLicenseKeyInDb('  abcd-efgh-ijkl-mnop  ');

    expect(result).toEqual({ valid: true, expiresAt: '2099-01-01T00:00:00.000Z' });
    expect((supabase as any).from).toHaveBeenCalledWith('license_keys');
    expect(select).toHaveBeenCalledWith('id, status, expires_at');
    expect(eqLicense).toHaveBeenCalledWith('license_key', 'ABCD-EFGH-IJKL-MNOP');
    expect(eqStatus).toHaveBeenCalledWith('status', 'active');
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('returns invalid when license is missing', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqLicense = vi.fn(() => ({ eq: eqStatus }));
    const select = vi.fn(() => ({ eq: eqLicense }));
    vi.mocked((supabase as any).from).mockReturnValue({ select });

    const result = await validateLicenseKeyInDb('MISSING-KEY');

    expect(result).toEqual({
      valid: false,
      error: 'Invalid license key. Please purchase a valid license.',
    });
  });

  it('returns expired when license date is in the past', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: '1', status: 'active', expires_at: '2000-01-01T00:00:00.000Z' },
      error: null,
    });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqLicense = vi.fn(() => ({ eq: eqStatus }));
    const select = vi.fn(() => ({ eq: eqLicense }));
    vi.mocked((supabase as any).from).mockReturnValue({ select });

    const result = await validateLicenseKeyInDb('EXPIRED-KEY');

    expect(result).toEqual({
      valid: false,
      error: 'This license key has expired.',
    });
  });

  it('returns connectivity error when db returns error', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'db down' },
    });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqLicense = vi.fn(() => ({ eq: eqStatus }));
    const select = vi.fn(() => ({ eq: eqLicense }));
    vi.mocked((supabase as any).from).mockReturnValue({ select });

    const result = await validateLicenseKeyInDb('ANY-KEY');

    expect(result).toEqual({
      valid: false,
      error: 'Unable to verify license key. Please check your connection and try again.',
    });
  });
});
