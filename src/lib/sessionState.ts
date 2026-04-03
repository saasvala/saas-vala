const PRE_LOGOUT_STATE_KEY = 'sv_pre_logout_state';
const POST_LOGIN_REDIRECT_KEY = 'sv_post_login_redirect';

export function savePreLogoutState(pathname: string, search: string, hash: string) {
  try {
    sessionStorage.setItem(
      PRE_LOGOUT_STATE_KEY,
      JSON.stringify({
        path: `${pathname}${search}${hash}`,
        ts: Date.now(),
      }),
    );
  } catch {
    // ignore
  }
}

export function savePostLoginRedirect(path: string) {
  try {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path || '/');
  } catch {
    // ignore
  }
}

export function consumePostLoginRedirect() {
  try {
    const path = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return path || null;
  } catch {
    return null;
  }
}

