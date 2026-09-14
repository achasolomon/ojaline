import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthUser } from '../auth/auth.service.js';

export type SellerType = 'FARMER' | 'MARKET_WOMAN' | 'STORE' | 'PROCESSOR';
export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type KycTier = 'BASIC' | 'FULL';

export const SELLER_TYPES: SellerType[] = ['FARMER', 'MARKET_WOMAN', 'STORE', 'PROCESSOR'];
const ID_TYPES = ['NIN', 'BVN', 'DRIVERS_LICENCE', 'PASSPORT', 'VOTERS_CARD'];

export interface SellerKyc {
  id_type: string;
  status: KycStatus;
  review_note: string | null;
  submitted_at: string;
}

export interface SellerStatus {
  seller_type: SellerType | null;
  kyc_tier: KycTier | null;
  kyc: SellerKyc | null;
}

@Injectable()
export class SellersService {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
  ) {}

  async status(user: AuthUser): Promise<SellerStatus> {
    let tier: KycTier | null = null;
    if (user.seller_type) {
      const { rows } = await this.pool.query(
        `SELECT kyc_tier FROM catalog.seller_profiles WHERE user_id = $1`,
        [user.id],
      );
      tier = rows[0] ? (rows[0].kyc_tier as KycTier) : 'BASIC';
    }
    const { rows } = await this.pool.query(
      `SELECT id_type, status, review_note, submitted_at FROM pii.seller_kyc WHERE user_id = $1`,
      [user.id],
    );
    const kycRow = rows[0] as Record<string, unknown> | undefined;
    return {
      seller_type: (user.seller_type as SellerType) ?? null,
      kyc_tier: tier,
      kyc: kycRow
        ? {
            id_type: String(kycRow.id_type),
            status: kycRow.status as KycStatus,
            review_note: kycRow.review_note ? String(kycRow.review_note) : null,
            submitted_at: new Date(kycRow.submitted_at as string).toISOString(),
          }
        : null,
    };
  }

  /**
   * BASIC registration — everything the marketplace needs to start selling:
   * who you are (already on the account) plus a short business profile.
   * No identity documents here; that is the separate FULL-tier step.
   */
  async register(
    user: AuthUser,
    input: {
      seller_type?: string;
      business_name?: string;
      market_name?: string;
      city?: string;
      state?: string;
      lga?: string;
      bio?: string;
    },
  ): Promise<SellerStatus> {
    const sellerType = input.seller_type as SellerType | undefined;
    if (!sellerType || !SELLER_TYPES.includes(sellerType)) {
      throw new BadRequestException('Choose a seller type to register as');
    }
    const businessName = String(input.business_name ?? '').trim();
    const marketName = String(input.market_name ?? '').trim();
    const city = String(input.city ?? '').trim();
    const state = String(input.state ?? '').trim();
    const lga = String(input.lga ?? '').trim();
    const bio = String(input.bio ?? '').trim();
    if (!state || !city) {
      throw new BadRequestException('Tell us your city and state so buyers know where you operate');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE pii.users SET seller_type = $1, updated_at = now() WHERE id = $2`,
        [sellerType, user.id],
      );

      await client.query(
        `INSERT INTO pii.user_roles (user_id, role_id)
         SELECT $1, id FROM pii.roles WHERE name = 'SELLER'
         ON CONFLICT DO NOTHING`,
        [user.id],
      );

      // Upsert keeps an existing kyc_tier (FULL) intact on later profile edits.
      await client.query(
        `INSERT INTO catalog.seller_profiles
           (user_id, seller_type, business_name, market_name, city, state, lga, bio)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id)
         DO UPDATE SET
           seller_type = EXCLUDED.seller_type,
           business_name = EXCLUDED.business_name,
           market_name = EXCLUDED.market_name,
           city = EXCLUDED.city,
           state = EXCLUDED.state,
           lga = EXCLUDED.lga,
           bio = EXCLUDED.bio`,
        [user.id, sellerType, businessName || null, marketName || null, city, state, lga || null, bio || null],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.status({
      ...user,
      seller_type: sellerType,
    });
  }

  /**
   * FULL-tier identity submission. The seller first exists at BASIC tier;
   * this collects a government-issued ID and address for the review step.
   * Approved identity unlocks payouts, the verified badge and Ad Studio.
   */
  async submitKyc(
    user: AuthUser,
    input: {
      id_type?: string;
      id_number?: string;
      date_of_birth?: string;
      address_line1?: string;
      city?: string;
      state?: string;
    },
  ): Promise<SellerStatus> {
    if (!user.seller_type) {
      throw new ForbiddenException('Register as a seller before submitting verification');
    }
    const idType = String(input.id_type ?? '').toUpperCase();
    if (!ID_TYPES.includes(idType)) {
      throw new BadRequestException('Select a valid ID type (NIN, BVN, driver\u2019s licence, passport or voter\u2019s card)');
    }
    const idNumber = String(input.id_number ?? '').trim();
    if (!/^[A-Za-z0-9-]{6,32}$/.test(idNumber)) {
      throw new BadRequestException('Enter a valid ID number (6 or more characters)');
    }
    const dob = String(input.date_of_birth ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      throw new BadRequestException('Enter your date of birth (YYYY-MM-DD)');
    }
    const addressLine1 = String(input.address_line1 ?? '').trim();
    const city = String(input.city ?? '').trim();
    const state = String(input.state ?? '').trim();
    if (!addressLine1 || !city || !state) {
      throw new BadRequestException('Enter your registered address');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO pii.seller_kyc
           (user_id, id_type, id_number, date_of_birth, address_line1, city, state, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
         ON CONFLICT (user_id)
         DO UPDATE SET
           id_type = EXCLUDED.id_type,
           id_number = EXCLUDED.id_number,
           date_of_birth = EXCLUDED.date_of_birth,
           address_line1 = EXCLUDED.address_line1,
           city = EXCLUDED.city,
           state = EXCLUDED.state,
           status = 'PENDING',
           review_note = NULL,
           reviewed_at = NULL,
           reviewed_by = NULL,
           updated_at = now()`,
        [user.id, idType, idNumber, dob, addressLine1, city, state],
      );

      await client.query(
        `UPDATE catalog.seller_profiles SET kyc_tier = 'FULL', updated_at = now() WHERE user_id = $1`,
        [user.id],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      const e = err as { code?: string };
      if (e.code === '23505') throw new BadRequestException('This ID number is already registered to another seller');
      throw err;
    } finally {
      client.release();
    }

    return this.status(user);
  }

  async decide(
    actor: AuthUser,
    userId: string,
    action: Exclude<KycStatus, 'PENDING'>,
    note?: string,
  ): Promise<{ ok: true; status: KycStatus }> {
    const isPrivileged = actor.roles.some((r) => r === 'OPS' || r === 'AGENT');
    if (!isPrivileged) throw new ForbiddenException('Only OPS/AGENT reviewers can verify sellers');
    if (action === 'REJECTED' && !note?.trim()) {
      throw new BadRequestException('A review note is required when rejecting a seller');
    }
    const { rowCount } = await this.pool.query(
      `UPDATE pii.seller_kyc
         SET status = $1, review_note = $3, reviewed_at = now(), reviewed_by = $2, updated_at = now()
       WHERE user_id = $4`,
      [action, actor.id, note?.trim() || null, userId],
    );
    if (rowCount === 0) throw new NotFoundException('No KYC submission for that seller');
    return { ok: true, status: action };
  }
}