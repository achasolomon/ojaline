import type { AuthUser, AuthSession } from './api';

const KEY = 'kika_session';

export const AUTH_EVENT = 'kika:auth-change';

function dispatchAuthChange() {
  window.dispatchEvent(new Event(AUTH_EVENT));
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
 * Identity used by unauthenticated-market features (crowd want, haggling,
 * in-app feed). Logged-in buyers use their own id; visitors act as the
 * seeded demo buyer so the marketplace still works before sign-up.
 */
export const DEMO_BUYER_ID = '7c068a1a-fcca-4c91-a3e3-a0a96adfba12';

export function activeBuyerId(): string {
  return getUserId() ?? DEMO_BUYER_ID;
}