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

/* ── Payouts (Phase 3) ── */

export type PayoutRequestStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'SENT' | 'FAILED';
const ACTIVE_WITHDRAWAL_STATUSES: PayoutRequestStatus[] = ['APPROVED', 'PROCESSING', 'SENT'];

export interface SellerBankAccount {
  id: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary: boolean;
}

export interface PayoutBalance {
  /** Released net minus withdrawn (approved/processing/sent), never negative. */
  available_cents: number;
  /** Money still held in escrow (delivery confirmed, 24h window not passed). */
  on_hold_cents: number;
  /** Requests awaiting OPS review — reserved, not yet counted as withdrawn. */
  pending_cents: number;
  withdrawn_cents: number;
  released_total_cents: number;
}

export interface PayoutLedgerEntry {
  id: string;
  entry_type: string;
  amount_cents: number;
  order_id: string;
  reference: string | null;
  created_at: string;
}

export interface PayoutRequestRecord {
  id: string;
  amount_cents: number;
  status: PayoutRequestStatus;
  bank_account: SellerBankAccount | null;
  transfer_reference: string | null;
  review_note: string | null;
  requested_at: string;
  processed_at: string | null;
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

  /* ── Phase 3: Payouts end-to-end ── */

  private isPrivileged(actor: AuthUser): boolean {
    return actor.roles.some((r) => r === 'OPS' || r === 'AGENT');
  }

  /**
   * FULL-tier gate: escrow payouts and bank detail capture require verified
   * identity. Mirrors the existing convention (`kyc_tier = FULL` is set when
   * KYC is submitted; the same flag drives the verified badge and Ad Studio).
   */
  private async requireFullTier(userId: string): Promise<void> {
    const { rows } = await this.pool.query(
      `SELECT kyc_tier FROM catalog.seller_profiles WHERE user_id = $1`,
      [userId],
    );
    if (!rows[0] || rows[0].kyc_tier !== 'FULL') {
      throw new ForbiddenException('Verify your identity (FULL KYC) before using payouts');
    }
  }

  /** Available = Σ(SELLER_PAYOUT released) − Σ(approved withdrawals). */
  async getPayoutBalance(user: AuthUser): Promise<PayoutBalance> {
    const released = await this.pool.query<{ released: string }>(
      `SELECT COALESCE(SUM(-amount_cents), 0)::int AS released
       FROM escrow.ledger_entries
       WHERE entry_type = 'SELLER_PAYOUT' AND counterparty_type = 'SELLER' AND counterparty_id = $1`,
      [user.id],
    );
    const withdrawn = await this.pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS n
       FROM finance.payout_requests
       WHERE seller_id = $1 AND status = ANY($2)`,
      [user.id, ACTIVE_WITHDRAWAL_STATUSES],
    );
    const pending = await this.pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS n
       FROM finance.payout_requests
       WHERE seller_id = $1 AND status = 'PENDING'`,
      [user.id],
    );
    const onHold = await this.pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(ol.seller_payable_cents), 0)::int AS n
       FROM orders.order_lines ol
       JOIN orders.orders o ON o.id = ol.order_id
       JOIN escrow.escrow_orders e ON e.order_id = o.id
       WHERE ol.seller_id = $1 AND e.status = 'HELD'`,
      [user.id],
    );

    const releasedTotal = Number(released.rows[0].released);
    const withdrawnCents = Number(withdrawn.rows[0].n);
    const pendingCents = Number(pending.rows[0].n);
    return {
      available_cents: Math.max(releasedTotal - withdrawnCents, 0),
      on_hold_cents: Number(onHold.rows[0].n),
      pending_cents: pendingCents,
      withdrawn_cents: withdrawnCents,
      released_total_cents: releasedTotal,
    };
  }

  /** Paginated history of escrow releases paid out to this seller. */
  async getPayoutLedger(
    user: AuthUser,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ entries: PayoutLedgerEntry[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);
    const total = await this.pool.query<{ n: string }>(
      `SELECT count(*)::int AS n
       FROM escrow.ledger_entries
       WHERE entry_type = 'SELLER_PAYOUT' AND counterparty_type = 'SELLER' AND counterparty_id = $1`,
      [user.id],
    );
    const { rows } = await this.pool.query(
      `SELECT le.id, le.entry_type, le.amount_cents, le.reference, le.created_at, eo.order_id
       FROM escrow.ledger_entries le
       JOIN escrow.escrow_orders eo ON eo.id = le.escrow_order_id
       WHERE le.entry_type = 'SELLER_PAYOUT' AND le.counterparty_type = 'SELLER' AND le.counterparty_id = $1
       ORDER BY le.created_at DESC, le.sequence_no DESC
       LIMIT $2 OFFSET $3`,
      [user.id, limit, offset],
    );
    return {
      total: Number(total.rows[0].n),
      limit,
      offset,
      entries: rows.map((r) => ({
        id: String(r.id),
        entry_type: String(r.entry_type),
        // Ledger stores SELLER_PAYOUT as a negative credit; expose the positive amount.
        amount_cents: Math.abs(Number((r.amount_cents as string))),
        order_id: String(r.order_id),
        reference: r.reference ? String(r.reference) : null,
        created_at: new Date(r.created_at as string).toISOString(),
      })),
    };
  }

  private toPayoutRequest(row: Record<string, unknown>): PayoutRequestRecord {
    return {
      id: String(row.id),
      amount_cents: Number(row.amount_cents),
      status: row.status as PayoutRequestStatus,
      bank_account: null,
      transfer_reference: row.transfer_reference ? String(row.transfer_reference) : null,
      review_note: row.review_note ? String(row.review_note) : null,
      requested_at: new Date(row.requested_at as string).toISOString(),
      processed_at: row.processed_at ? new Date(row.processed_at as string).toISOString() : null,
    };
  }

  private async attachBankAccount(request: PayoutRequestRecord, row: Record<string, unknown>): Promise<PayoutRequestRecord> {
    if (!row.bank_account_id) return request;
    const { rows } = await this.pool.query(
      `SELECT id, bank_code, bank_name, account_number, account_name, is_primary
       FROM finance.seller_bank_accounts WHERE id = $1`,
      [row.bank_account_id],
    );
    const b = rows[0] as Record<string, unknown> | undefined;
    if (b) {
      request.bank_account = {
        id: String(b.id),
        bank_code: String(b.bank_code),
        bank_name: String(b.bank_name),
        account_number: String(b.account_number),
        account_name: String(b.account_name),
        is_primary: Boolean(b.is_primary),
      };
    }
    return request;
  }

  async requestPayout(
    user: AuthUser,
    input: { amount_cents?: number; bank_account_id?: string },
  ): Promise<PayoutRequestRecord> {
    await this.requireFullTier(user.id);
    const amount = Number(input.amount_cents);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Enter a positive withdrawal amount');
    }
    const bank = await this.pool.query<{ id: string }>(
      `SELECT id FROM finance.seller_bank_accounts WHERE id = $1 AND user_id = $2`,
      [input.bank_account_id, user.id],
    );
    if (!bank.rows[0]) {
      throw new BadRequestException('Choose one of your bank accounts to pay you in to');
    }
    const balance = await this.getPayoutBalance(user);
    // Reserved: pending requests hold the balance until they are approved or dropped.
    const withdrawable = balance.available_cents - balance.pending_cents;
    if (amount > withdrawable) {
      throw new BadRequestException(`Insufficient available balance (you have ₦${(withdrawable / 100).toLocaleString()})`);
    }
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO finance.payout_requests (seller_id, amount_cents, bank_account_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [user.id, amount, input.bank_account_id],
    );
    return this.attachBankAccount(this.toPayoutRequest(rows[0]), rows[0]);
  }

  /** List payout requests — own list, or (OPS/AGENT) the full queue. */
  async listPayoutRequests(
    actor: AuthUser,
    opts: { all?: boolean; status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ requests: PayoutRequestRecord[]; total: number; limit: number; offset: number }> {
    const privileged = this.isPrivileged(actor);
    if (opts.all && !privileged) throw new ForbiddenException('Only OPS/AGENT can list all payout requests');

    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);
    const where: string[] = [];
    const params: unknown[] = [];

    if (!opts.all) {
      params.push(actor.id);
      where.push(`pr.seller_id = $${params.length}`);
    }
    if (opts.status) {
      params.push(opts.status);
      where.push(`pr.status = $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = await this.pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM finance.payout_requests pr ${whereSql}`,
      params,
    );
    const { rows } = await this.pool.query(
      `SELECT pr.*, ba.bank_code, ba.bank_name, ba.account_number, ba.account_name, ba.is_primary
       FROM finance.payout_requests pr
       LEFT JOIN finance.seller_bank_accounts ba ON ba.id = pr.bank_account_id
       ${whereSql}
       ORDER BY pr.requested_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const requests = rows.map((r) => {
      const req = this.toPayoutRequest(r);
      if (r.bank_account_id) {
        req.bank_account = {
          id: String(r.bank_account_id),
          bank_code: String(r.bank_code),
          bank_name: String(r.bank_name),
          account_number: String(r.account_number),
          account_name: String(r.account_name),
          is_primary: Boolean(r.is_primary),
        };
      }
      return req;
    });
    return { requests, total: Number(total.rows[0].n), limit, offset };
  }

  /**
   * OPS/AGENT approval: turns a PENDING request into a settlement batch.
   * ledger_entries is append-only (REVOKE UPDATE/DELETE — V1 + V16), so we
   * INSERT into settlement_lines to link un-settled SELLER_PAYOUT entries
   * to the new batch instead of writing a reference on the ledger itself.
   */
  async approvePayout(
    actor: AuthUser,
    requestId: string,
    note?: string,
  ): Promise<{ ok: true; request_id: string; batch_id: string; status: PayoutRequestStatus }> {
    if (!this.isPrivileged(actor)) {
      throw new ForbiddenException('Only OPS/AGENT can approve payout requests');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const req = await client.query<Record<string, unknown>>(
        `SELECT * FROM finance.payout_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      );
      if (!req.rows[0]) throw new NotFoundException('Payout request not found');
      if (req.rows[0].status !== 'PENDING') {
        throw new BadRequestException('Only a pending payout request can be approved');
      }
      const sellerId = String(req.rows[0].seller_id);
      const amount = Number(req.rows[0].amount_cents);

      // Never approve withdrawals beyond what this seller has actually been released.
      const released = await client.query<{ n: string }>(
        `SELECT COALESCE(SUM(-amount_cents), 0)::int AS n
         FROM escrow.ledger_entries
         WHERE entry_type = 'SELLER_PAYOUT' AND counterparty_type = 'SELLER' AND counterparty_id = $1`,
        [sellerId],
      );
      const active = await client.query<{ n: string }>(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS n
         FROM finance.payout_requests
         WHERE seller_id = $1 AND status = ANY($2)`,
        [sellerId, [...ACTIVE_WITHDRAWAL_STATUSES, 'PENDING' as const]],
      );
      if (Number(active.rows[0].n) > Number(released.rows[0].n)) {
        throw new BadRequestException('Requested withdrawals exceed the released payout balance');
      }

      const batch = await client.query<{ id: string }>(
        `INSERT INTO escrow.settlement_batches (status, total_cents, submitted_at)
         VALUES ('SUBMITTED', $1, now()) RETURNING id`,
        [amount],
      );
      const batchId = String(batch.rows[0].id);

      await client.query(
        `UPDATE finance.payout_requests
         SET status = 'APPROVED', batch_id = $2, reviewed_by = $3, review_note = $4, processed_at = now()
         WHERE id = $1`,
        [requestId, batchId, actor.id, note?.trim() || null],
      );

      // Link un-settled SELLER_PAYOUT ledger entries to this batch via
      // settlement_lines (INSERT allowed on append-only ledger's child table).
      const { rows: unsettled } = await client.query<{ id: string; amount_cents: string }>(
        `SELECT le.id, ABS(le.amount_cents)::int AS amount_cents
         FROM escrow.ledger_entries le
         WHERE le.entry_type = 'SELLER_PAYOUT'
           AND le.counterparty_type = 'SELLER'
           AND le.counterparty_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM escrow.settlement_lines sl
             WHERE sl.ledger_entry_id = le.id
           )
         ORDER BY le.created_at ASC, le.sequence_no ASC`,
        [sellerId],
      );
      let remaining = amount;
      for (const entry of unsettled) {
        if (remaining <= 0) break;
        const entryAmt = Number(entry.amount_cents);
        const apply = Math.min(entryAmt, remaining);
        await client.query(
          `INSERT INTO escrow.settlement_lines (batch_id, ledger_entry_id, seller_id, amount_cents, status)
           VALUES ($1, $2, $3, $4, 'PENDING')`,
          [batchId, entry.id, sellerId, apply],
        );
        remaining -= apply;
      }

      await client.query('COMMIT');
      return { ok: true, request_id: requestId, batch_id: batchId, status: 'APPROVED' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listBankAccounts(user: AuthUser): Promise<SellerBankAccount[]> {
    const { rows } = await this.pool.query(
      `SELECT id, bank_code, bank_name, account_number, account_name, is_primary
       FROM finance.seller_bank_accounts
       WHERE user_id = $1
       ORDER BY is_primary DESC, created_at ASC`,
      [user.id],
    );
    return rows.map((r) => ({
      id: String(r.id),
      bank_code: String(r.bank_code),
      bank_name: String(r.bank_name),
      account_number: String(r.account_number),
      account_name: String(r.account_name),
      is_primary: Boolean(r.is_primary),
    }));
  }

  async addBankAccount(
    user: AuthUser,
    input: Partial<SellerBankAccount> & { is_primary?: boolean },
  ): Promise<SellerBankAccount> {
    await this.requireFullTier(user.id);
    const bankCode = String(input.bank_code ?? '').trim();
    const bankName = String(input.bank_name ?? '').trim();
    const accountNumber = String(input.account_number ?? '').trim();
    const accountName = String(input.account_name ?? '').trim();
    if (!/^\d{3,10}$/.test(bankCode)) throw new BadRequestException('Enter a valid bank code');
    if (!bankName) throw new BadRequestException('Enter the bank name');
    if (!/^\d{10}$/.test(accountNumber)) throw new BadRequestException('Enter a 10-digit NUBAN account number');
    if (!accountName) throw new BadRequestException('Enter the account name');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM finance.seller_bank_accounts WHERE user_id = $1`,
        [user.id],
      );
      const shouldBePrimary = Boolean(input.is_primary) || Number(existing.rows[0].n) === 0;
      if (shouldBePrimary) {
        await client.query(
          `UPDATE finance.seller_bank_accounts SET is_primary = FALSE WHERE user_id = $1 AND is_primary`,
          [user.id],
        );
      }
      const { rows } = await client.query<Record<string, unknown>>(
        `INSERT INTO finance.seller_bank_accounts (user_id, bank_code, bank_name, account_number, account_name, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user.id, bankCode, bankName, accountNumber, accountName, shouldBePrimary],
      );
      await client.query('COMMIT');
      return {
        id: String(rows[0].id),
        bank_code: bankCode,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        is_primary: shouldBePrimary,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      const e = err as { code?: string };
      if (e.code === '23505') throw new BadRequestException('That account is already on file');
      throw err;
    } finally {
      client.release();
    }
  }

  async setPrimaryBankAccount(user: AuthUser, accountId: string): Promise<{ ok: true }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE finance.seller_bank_accounts SET is_primary = FALSE WHERE user_id = $1 AND is_primary`,
        [user.id],
      );
      const { rowCount } = await client.query(
        `UPDATE finance.seller_bank_accounts SET is_primary = TRUE WHERE id = $1 AND user_id = $2`,
        [accountId, user.id],
      );
      if (rowCount === 0) throw new NotFoundException('Bank account not found');
      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteBankAccount(user: AuthUser, accountId: string): Promise<{ ok: true; removed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `DELETE FROM finance.seller_bank_accounts WHERE id = $1 AND user_id = $2`,
        [accountId, user.id],
      );
      if (rowCount === 0) throw new NotFoundException('Bank account not found');
      // If the primary was removed, promote the most recently added remaining account.
      await client.query(
        `UPDATE finance.seller_bank_accounts SET is_primary = TRUE
         WHERE id = (
           SELECT id FROM finance.seller_bank_accounts
           WHERE user_id = $1
             AND NOT EXISTS (SELECT 1 FROM finance.seller_bank_accounts WHERE user_id = $1 AND is_primary)
           ORDER BY created_at DESC LIMIT 1
         )`,
        [user.id],
      );
      await client.query('COMMIT');
      return { ok: true, removed: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}