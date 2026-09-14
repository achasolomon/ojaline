import {
  Injectable, Inject, UnauthorizedException,
  BadRequestException, NotFoundException, ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import nodemailer from 'nodemailer';
import { loadConfig } from '@ojaline/config';
import { MarketFeedService } from '../realtime/market-feed.service.js';
import { oauthAuthorizeUrl, exchangeOAuthCode } from './oauth.providers.js';
import type { OAuthProvider, OAuthProfile } from './oauth.providers.js';

export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  status: string;
  seller_type: string | null;
  channel: 'RETAILER' | 'WHOLESALE' | 'DIRECT' | 'OPEN';
  roles: string[];
}

export type AuthUserPublic = AuthUser;

@Injectable()
export class AuthService {
  private readonly config = loadConfig();
  private readonly jwtSecret: Uint8Array;

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(MarketFeedService) private readonly feed: MarketFeedService,
  ) {
    this.jwtSecret = new TextEncoder().encode(this.config.AUTH_JWT_SECRET);
  }

  /* ── helpers ── */

  private async findByIdentity(identity: string) {
    const { rows } = await this.pool.query(
      `SELECT id, phone, email, full_name, password_hash, status, seller_type, channel
       FROM pii.users
       WHERE phone = $1 OR (email IS NOT NULL AND email = lower($1))
       LIMIT 1`,
      [identity.trim()],
    );
    return rows[0] as (Record<string, unknown> & { password_hash: string | null }) | undefined;
  }

  private async getRoles(userId: string): Promise<string[]> {
    const { rows } = await this.pool.query(
      `SELECT r.name FROM pii.user_roles ur
       JOIN pii.roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.name as string);
  }

  private async toAuthUser(row: Record<string, unknown> & { password_hash: string | null }): Promise<AuthUser> {
    const roles = await this.getRoles(String(row.id));
    return {
      id: String(row.id),
      phone: row.phone ? String(row.phone) : null,
      email: row.email ? String(row.email) : null,
      full_name: String(row.full_name),
      status: String(row.status),
      seller_type: row.seller_type ? String(row.seller_type) : null,
      channel: (row.channel as AuthUser['channel']) ?? 'RETAILER',
      roles,
    };
  }

  private async signToken(user: AuthUser): Promise<string> {
    return new SignJWT({ sub: user.id, roles: user.roles })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.config.AUTH_JWT_TTL)
      .sign(this.jwtSecret);
  }

  async verifyToken(token: string): Promise<AuthUser> {
    let payload: { sub?: string };
    try {
      const { payload: p } = await jwtVerify(token, this.jwtSecret);
      payload = p as { sub?: string };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload.sub) throw new UnauthorizedException('Invalid token');
    const { rows } = await this.pool.query(
      `SELECT id, phone, email, full_name, password_hash, status, seller_type, channel
       FROM pii.users WHERE id = $1`,
      [payload.sub],
    );
    if (!rows[0]) throw new UnauthorizedException('Account no longer exists');
    if (rows[0].status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
    return this.toAuthUser(rows[0]);
  }

  private async sendResetEmail(email: string, token: string, fullName: string): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      auth: this.config.SMTP_USER ? { user: this.config.SMTP_USER, pass: this.config.SMTP_PASS } : undefined,
    });
    const url = `${this.config.AUTH_APP_URL}/reset?token=${token}`;
    await transporter.sendMail({
      from: 'no-reply@ojaline.com',
      to: email,
      subject: 'Reset your Ojaline password',
      text: `Hi ${fullName},\n\nWe received a request to reset your password. Use the link below (valid for 30 minutes):\n\n${url}\n\nIf you did not request this, you can ignore this email.\n\n— Ojaline`,
      html: `<p>Hi ${fullName},</p><p>We received a request to reset your password. Use the link below — it is valid for 30 minutes:</p><p><a href="${url}" style="background:#008A3C;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;">Reset Password</a></p><p>If you did not request this, you can safely ignore this email.</p><p>— Ojaline</p>`,
    });
  }

  /* ── endpoints ── */

  async register(input: {
    full_name: string;
    phone: string;
    email?: string;
    password: string;
  }): Promise<{ token: string; user: AuthUser }> {
    if (!input.full_name?.trim() || !input.phone?.trim() || !input.password) {
      throw new BadRequestException('Name, phone and password are required');
    }
    if (input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const passwordHash = await bcrypt.hash(input.password, 10);

    let userId: string;
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO pii.users (phone, full_name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [input.phone.trim(), input.full_name.trim(), input.email?.toLowerCase()?.trim() || null, passwordHash],
      );
      userId = String(rows[0].id);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') throw new BadRequestException('Phone number or email already registered');
      throw err;
    }

    // assign BUYER by default
    await this.pool.query(
      `INSERT INTO pii.user_roles (user_id, role_id)
       SELECT $1, id FROM pii.roles WHERE name = 'BUYER'
       ON CONFLICT DO NOTHING`,
      [userId],
    );

    const { rows } = await this.pool.query(
      `SELECT id, phone, email, full_name, password_hash, status, seller_type, channel
       FROM pii.users WHERE id = $1`,
      [userId],
    );
    const user = await this.toAuthUser(rows[0]);
    const token = await this.signToken(user);
    return { token, user: user };
  }

  async login(identity: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const row = await this.findByIdentity(identity);
    if (!row || !row.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (row.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');

    const user = await this.toAuthUser(row);
    const token = await this.signToken(user);
    if (user.seller_type) {
      void this.feed.touchPresence(user);
    }
    return { token, user: user };
  }

  async me(token: string): Promise<AuthUser> {
    const user = await this.verifyToken(token);
    return user;
  }

  /* ── social login (OAuth) ── */

  private oauthConfig(provider: OAuthProvider): { clientId: string; clientSecret: string } {
    const isGoogle = provider === 'google';
    const clientId = isGoogle ? this.config.GOOGLE_OAUTH_CLIENT_ID : this.config.FACEBOOK_APP_ID;
    const clientSecret = isGoogle ? this.config.GOOGLE_OAUTH_CLIENT_SECRET : this.config.FACEBOOK_APP_SECRET;
    const app = isGoogle ? 'Google' : 'Facebook';
    if (!clientId || !clientSecret) {
      const credVars = isGoogle
        ? 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET'
        : 'FACEBOOK_APP_ID and FACEBOOK_APP_SECRET';
      throw new ServiceUnavailableException(
        `${app} sign-in is not configured. Set ${credVars} in your environment file, then try again.`,
      );
    }
    return { clientId, clientSecret };
  }

  private oauthRedirectUri(provider: OAuthProvider): string {
    return `${this.config.API_PUBLIC_URL}/auth/oauth/${provider}/callback`;
  }

  async oauthAuthorizeUrl(provider: OAuthProvider): Promise<string> {
    const { clientId } = this.oauthConfig(provider);
    const state = await new SignJWT({ provider })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(this.jwtSecret);
    return oauthAuthorizeUrl({
      provider,
      clientId,
      redirectUri: this.oauthRedirectUri(provider),
      state,
    });
  }

  async oauthCallback(
    provider: OAuthProvider,
    code: string,
    state: string,
  ): Promise<{ token: string; user: AuthUser }> {
    let stateProvider: string | undefined;
    try {
      const { payload } = await jwtVerify(state, this.jwtSecret);
      stateProvider = (payload as { provider?: string }).provider;
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }
    if (stateProvider !== provider) {
      throw new BadRequestException('OAuth state mismatch');
    }
    if (!code) throw new BadRequestException('Missing authorization code');

    const { clientId, clientSecret } = this.oauthConfig(provider);
    const profile = await exchangeOAuthCode({
      provider,
      clientId,
      clientSecret,
      redirectUri: this.oauthRedirectUri(provider),
      code,
    });

    if (!profile.email || (provider === 'google' && !profile.emailVerified)) {
      const name = provider === 'google' ? 'Google' : 'Facebook';
      throw new BadRequestException(`${name} needs a verified email to log you in.`);
    }

    const userId = await this.upsertOAuthUser(profile);
    const { rows } = await this.pool.query(
      `SELECT id, phone, email, full_name, password_hash, status, seller_type
       FROM pii.users WHERE id = $1`,
      [userId],
    );
    if (rows[0].status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
    const user = await this.toAuthUser(rows[0]);
    const token = await this.signToken(user);
    if (user.seller_type) {
      void this.feed.touchPresence(user);
    }
    return { token, user };
  }

  private async upsertOAuthUser(profile: OAuthProfile): Promise<string> {
    // 1. Existing link → reuse the account.
    const linkRes = await this.pool.query(
      `SELECT user_id FROM auth.oauth_accounts
       WHERE provider = $1 AND provider_account_id = $2`,
      [profile.provider, profile.providerAccountId],
    );
    if (linkRes.rows[0]) return String(linkRes.rows[0].user_id);

    const email = profile.email?.toLowerCase() ?? null;

    // 2. Existing user with this email → link the provider to them.
    if (email) {
      const byEmail = await this.pool.query(
        `SELECT id FROM pii.users WHERE email = $1 LIMIT 1`,
        [email],
      );
      if (byEmail.rows[0]) {
        const userId = String(byEmail.rows[0].id);
        await this.pool.query(
          `INSERT INTO auth.oauth_accounts (provider, provider_account_id, user_id, email)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [profile.provider, profile.providerAccountId, userId, email],
        );
        return userId;
      }
    }

    // 3. New user (no phone yet).
    let userId: string;
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO pii.users (phone, full_name, email) VALUES (NULL, $1, $2) RETURNING id`,
        [profile.fullName, email],
      );
      userId = String(rows[0].id);
    } catch (err) {
      const e = err as { code?: string };
      // Raced on the email unique index → link whichever account won.
      if (e.code === '23505' && email) {
        const byEmail = await this.pool.query(
          `SELECT id FROM pii.users WHERE email = $1 LIMIT 1`,
          [email],
        );
        if (byEmail.rows[0]) {
          const userId2 = String(byEmail.rows[0].id);
          await this.pool.query(
            `INSERT INTO auth.oauth_accounts (provider, provider_account_id, user_id, email)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [profile.provider, profile.providerAccountId, userId2, email],
          );
          return userId2;
        }
      }
      throw err;
    }

    await this.pool.query(
      `INSERT INTO pii.user_roles (user_id, role_id)
       SELECT $1, id FROM pii.roles WHERE name = 'BUYER'
       ON CONFLICT DO NOTHING`,
      [userId],
    );
    await this.pool.query(
      `INSERT INTO auth.oauth_accounts (provider, provider_account_id, user_id, email)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [profile.provider, profile.providerAccountId, userId, email],
    );
    return userId;
  }

  async forgotPassword(identity: string): Promise<{ ok: true; delivery: 'email' | 'sms' }> {
    const row = await this.findByIdentity(identity);
    if (!row) {
      // Do not reveal whether an account exists.
      throw new NotFoundException('No account found with that phone or email');
    }

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const tokenHash = await bcrypt.hash(token, 10);
    const expiredAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO auth.password_reset_tokens (user_id, token_hash, purpose, expired_at)
       VALUES ($1, $2, 'password_reset', $3)`,
      [row.id, tokenHash, expiredAt],
    );

    if (row.email) {
      await this.sendResetEmail(String(row.email), token, String(row.full_name));
      return { ok: true, delivery: 'email' };
    }
    return { ok: true, delivery: 'sms' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    if (!token || !newPassword) throw new BadRequestException('Token and new password are required');
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const { rows } = await this.pool.query(
      `SELECT id, user_id, token_hash, expired_at, consumed_at
       FROM auth.password_reset_tokens
       WHERE purpose = 'password_reset'
       ORDER BY created_at DESC
       LIMIT 50`,
      [],
    );

    for (const r of rows) {
      if (r.consumed_at) continue;
      if (new Date(r.expired_at).getTime() < Date.now()) continue;
      const matches = await bcrypt.compare(token, r.token_hash);
      if (!matches) continue;

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await this.pool.query(`UPDATE pii.users SET password_hash = $1 WHERE id = $2`, [passwordHash, r.user_id]);
      await this.pool.query(
        `UPDATE auth.password_reset_tokens SET consumed_at = now() WHERE id = $1`,
        [r.id],
      );
      return { ok: true };
    }
    throw new BadRequestException('Invalid or expired reset token');
  }

  async forceReset(targetUserId: string, newPassword: string, actor: AuthUser): Promise<{ ok: true }> {
    const isPrivileged = actor.roles.some((r) => r === 'OPS' || r === 'AGENT');
    if (!isPrivileged) throw new ForbiddenException('Only OPS/AGENT can force a password reset');
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { rowCount } = await this.pool.query(
      `UPDATE pii.users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, targetUserId],
    );
    if (rowCount === 0) throw new NotFoundException('User not found');

    // invalidate outstanding tokens
    await this.pool.query(
      `UPDATE auth.password_reset_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL`,
      [targetUserId],
    );
    return { ok: true };
  }
}
