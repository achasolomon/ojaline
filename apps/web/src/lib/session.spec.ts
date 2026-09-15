import { describe, it, expect } from 'vitest';
import { tokenExpiry } from './session';

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function header(): string {
  return b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
}

describe('tokenExpiry', () => {
  it('reads the exp claim from a JWT payload', () => {
    const exp = 1789420000;
    const token = `${header()}.${b64url(JSON.stringify({ sub: 'u1', exp }))}.sig`;
    expect(tokenExpiry(token)).toBe(exp);
  });

  it('returns null when the token has no exp claim', () => {
    const token = `${header()}.${b64url(JSON.stringify({ sub: 'u1' }))}.sig`;
    expect(tokenExpiry(token)).toBeNull();
  });

  it('returns null for malformed tokens', () => {
    expect(tokenExpiry('')).toBeNull();
    expect(tokenExpiry('not-a-jwt')).toBeNull();
    expect(tokenExpiry(`${header()}.!!not-base64!!.sig`)).toBeNull();
  });

  it('returns null when exp is not a number', () => {
    const token = `${header()}.${b64url(JSON.stringify({ sub: 'u1', exp: '9999999999' }))}.sig`;
    expect(tokenExpiry(token)).toBeNull();
  });
});