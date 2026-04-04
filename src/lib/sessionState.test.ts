import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumePostLoginRedirect,
  savePostLoginRedirect,
  savePreLogoutState,
} from './sessionState';

describe('sessionState', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('saves pre-logout state path and timestamp', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123456);

    savePreLogoutState('/dashboard', '?tab=usage', '#section');
    const raw = sessionStorage.getItem('sv_pre_logout_state');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      path: '/dashboard?tab=usage#section',
      ts: 123456,
    });

    nowSpy.mockRestore();
  });

  it('saves post-login redirect with default fallback', () => {
    savePostLoginRedirect('/checkout');
    expect(sessionStorage.getItem('sv_post_login_redirect')).toBe('/checkout');

    savePostLoginRedirect('');
    expect(sessionStorage.getItem('sv_post_login_redirect')).toBe('/');
  });

  it('consumes redirect once and clears stored key', () => {
    savePostLoginRedirect('/favorites');
    expect(consumePostLoginRedirect()).toBe('/favorites');
    expect(consumePostLoginRedirect()).toBeNull();
  });

  it('returns null from consume when storage throws', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(consumePostLoginRedirect()).toBeNull();
    getItemSpy.mockRestore();
  });

  it('does not throw when save operations fail', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(() => savePreLogoutState('/dashboard', '', '')).not.toThrow();
    expect(() => savePostLoginRedirect('/dashboard')).not.toThrow();

    setItemSpy.mockRestore();
  });
});
