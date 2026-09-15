import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getSellerStatus, postJson } from './api';

function sessionStore(raw: string | null) {
  return {
    getItem: () => raw,
    setItem: () => {},
    removeItem: () => {},
  };
}

function mockFetch() {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
    new Response(JSON.stringify({ seller_type: null, kyc_tier: null, kyc: null }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function authHeaderOf(fn: ReturnType<typeof mockFetch>): string | null {
  const [, init] = fn.mock.calls[0];
  const headers = init?.headers as Record<string, string> | null;
  if (!headers) return null;
  return headers.Authorization ?? headers.authorization ?? null;
}

const SESSION_JSON = JSON.stringify({ token: 'session-token', user: { id: 'u1' } });

beforeEach(() => {
  vi.stubGlobal('localStorage', sessionStore(null));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('request authorization header', () => {
  it('sends the explicit bearer token exactly once (no doubled header)', async () => {
    const fetchFn = mockFetch();
    const token = 'header.payload.signature';
    await getSellerStatus(token);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(authHeaderOf(fetchFn)).toBe(`Bearer ${token}`);
    expect(authHeaderOf(fetchFn)).not.toContain(', Bearer');
  });

  it('the explicit token wins over the session auto-header', async () => {
    const fetchFn = mockFetch();
    vi.stubGlobal('localStorage', sessionStore(SESSION_JSON));
    const token = 'explicit-token';
    await getSellerStatus(token);
    expect(authHeaderOf(fetchFn)).toBe(`Bearer ${token}`);
    expect(authHeaderOf(fetchFn)).not.toContain(', Bearer');
  });

  it('auto-injects the session token when no explicit header is given', async () => {
    const fetchFn = mockFetch();
    vi.stubGlobal('localStorage', sessionStore(SESSION_JSON));
    await postJson('/some/endpoint', {});
    expect(authHeaderOf(fetchFn)).toBe('Bearer session-token');
    expect(authHeaderOf(fetchFn)).not.toContain(', Bearer');
  });
});