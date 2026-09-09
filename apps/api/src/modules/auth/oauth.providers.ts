import { BadRequestException } from '@nestjs/common';

export type OAuthProvider = 'google' | 'facebook';

export interface OAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const FACEBOOK_AUTH_URL = 'https://www.facebook.com/v22.0/dialog/oauth';
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v22.0/oauth/access_token';
const FACEBOOK_ME_URL = 'https://graph.facebook.com/v22.0/me';

/** Build the provider's authorization URL (web redirect flow). */
export function oauthAuthorizeUrl(p: {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    state: p.state,
  });
  if (p.provider === 'google') {
    params.set('scope', 'openid email profile');
    params.set('access_type', 'online');
    params.set('prompt', 'select_account');
    return `${GOOGLE_AUTH_URL}?${params}`;
  }
  params.set('scope', 'public_profile email');
  return `${FACEBOOK_AUTH_URL}?${params}`;
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = body.error_description ?? body.error ?? body.message ?? `HTTP ${res.status}`;
    throw new BadRequestException(`Provider authorization failed: ${String(detail)}`);
  }
  return body;
}

/** Exchange an authorization code for a verified profile. */
export async function exchangeOAuthCode(p: {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<OAuthProfile> {
  if (p.provider === 'google') {
    const token = await fetchJson(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: p.code,
        client_id: p.clientId,
        client_secret: p.clientSecret,
        redirect_uri: p.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!token.access_token) throw new BadRequestException('Google authorization failed');
    const profile = await fetchJson(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${String(token.access_token)}` },
    });
    if (!profile.sub) throw new BadRequestException('Google authorization failed');
    return {
      provider: 'google',
      providerAccountId: String(profile.sub),
      email: profile.email ? String(profile.email) : null,
      emailVerified: !!profile.email_verified,
      fullName: String(profile.name || profile.given_name || 'Ojaline member'),
    };
  }

  const token = await fetchJson(
    `${FACEBOOK_TOKEN_URL}?${new URLSearchParams({
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
      code: p.code,
    })}`,
  );
  if (!token.access_token) throw new BadRequestException('Facebook authorization failed');
  const profile = await fetchJson(
    `${FACEBOOK_ME_URL}?fields=id,name,email&access_token=${encodeURIComponent(String(token.access_token))}`,
  );
  if (!profile.id) throw new BadRequestException('Facebook authorization failed');
  return {
    provider: 'facebook',
    providerAccountId: String(profile.id),
    email: profile.email ? String(profile.email) : null,
    emailVerified: true,
    fullName: String(profile.name || 'Ojaline member'),
  };
}