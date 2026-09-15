import type { AuthUser, AuthSession } from './api';

const KEY = 'kika_session';

export const AUTH_EVENT = 'kika:auth-change';

function dispatchAuthChange() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/**
 * Decode the `exp` claim (seconds since epoch) from a JWT without verifying
 * the signature. Returns null when the token has no usable `exp`.
 */
export function tokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized)) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

let redirectingToLogin = false;

/**
 * Restore the app to a logged-out state and route the user to the login page
 * with a reason, used when a request returns 401 with an active session.
 */
export function handleUnauthorized(): void {
  clearSession();
  if (redirectingToLogin) return;
  const here = window.location.pathname + window.location.search;
  if (here === '/login') return;
  redirectingToLogin = true;
  window.location.assign(`/login?reason=session-expired&from=${encodeURIComponent(here)}`);
}

export interface SessionSnapshot {
  token: string;
  user: AuthUser;
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(KEY, JSON.stringify({ token: session.token, user: session.user }));
  dispatchAuthChange();
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
  dispatchAuthChange();
}

export function getSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (!parsed?.token || !parsed?.user?.id) return null;
    const exp = tokenExpiry(parsed.token);
    if (exp !== null && exp * 1000 <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getSession() !== null;
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function getUser(): AuthUser | null {
  return getSession()?.user ?? null;
}

export function getUserId(): string | null {
  return getUser()?.id ?? null;
}

/**
 * Identity used by unauthenticated-market features (crowd want, bargaining,
 * in-app feed). Logged-in buyers use their own id; visitors act as the
 * seeded demo buyer so the marketplace still works before sign-up.
 */
export const DEMO_BUYER_ID = '7c068a1a-fcca-4c91-a3e3-a0a96adfba12';

export function activeBuyerId(): string {
  return getUserId() ?? DEMO_BUYER_ID;
}