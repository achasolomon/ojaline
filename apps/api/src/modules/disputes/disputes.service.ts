import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { OutboxService } from '../outbox/outbox.service.js';
import { NotifyService } from '../notifications/notify.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const REASONS = ['WRONG_ITEM', 'QUALITY', 'MISSING', 'DAMAGED', 'OTHER'] as const;
type ReturnReason = (typeof REASONS)[number];

export interface ReturnRequest {
  id: string;
  order_id: string;
  order_line_id: string;
  buyer_id: string;
  seller_id: string;
  product_name: string;
  qty: number;
  unit_price_cents: number;
  refund_cents: number;
  reason: string;
  reason_note: string | null;
  status: string;
  decision_note: string | null;
  dispute_id: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ReturnRequestPage {
  returns: ReturnRequest[];
  total: number;
  limit: number;
  offset: number;
}

export interface KycQueueRow {
  user_id: string;
  phone: string | null;
  full_name: string;
  id_type: string;
  status: string;
  submitted_at: string;
}

export interface DisputeRow {
  id: string;
  order_id: string;
  return_request_id: string | null;
  opened_by: string;
  type: string;
  reason: string;
  status: string;
  decision_notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface SellerRiskRow {
  user_id: string;
  full_name: string;
  tier: string;
  on_time_rate_30d: number | null;
  dispute_rate_30d: number | null;
  qa_rate: number | null;
  ops_override: boolean;
  updated_at: string;
}

export interface SellerStats {
  seller_id: string;
  revenue_cents: number;
  orders_total: number;
  orders_completed: number;
  orders_cancelled: number;
  on_time_rate: number;
  dispute_rate_30d: number;
  avg_rating: number | null;
  review_count: number;
  top_products: Array<{ offer_id: string; product_name: string; sold_qty: number; revenue_cents: number }>;
}

export interface SellerTrend {
  days: number;
  total_orders: number;
  total_sales_cents: number;
  total_released_cents: number;
  best_day: { date: string; sales_cents: number } | null;
  trend: Array<{ date: string; orders: number; sales_cents: number; released_cents: number }>;
}

export interface PlatformStats {
  sellers_total: number;
  orders_total: number;
  gmv_cents: number;
  pending_kyc: number;
  open_disputes: number;
  pending_payouts: number;
  returns_30d: number;
}

@Injectable()
export class DisputesService {
  private readonly isPrivileged = (actor: AuthUser) =>
    actor.roles.some((r) => r === 'OPS' || r === 'AGENT');

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(NotifyService) private readonly notify: NotifyService,
  ) {}

  async createReturn(
    buyer: AuthUser,
    input: { order_id?: string; order_line_id?: string; reason?: string; reason_note?: string; qty?: number },
  ): Promise<ReturnRequest> {
    if (!input.order_id || !input.order_line_id || !input.reason || !input.qty) {
      throw new BadRequestException('order_id, order_line_id, reason, and qty are required');
    }
    const reason = input.reason.toUpperCase() as ReturnReason;
    if (!REASONS.includes(reason)) {
      throw new BadRequestException(`reason must be one of ${REASONS.join(', ')}`);
    }
    if (input.qty < 1) throw new BadRequestException('qty must be >= 1');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: lineRows } = await client.query<{
        id: string;
        seller_id: string;
        qty: number;
        status: string;
        unit_price_cents: string;
        offer_id: string;
        order_status: string;
        order_buyer_id: string;
      }>(
        `SELECT ol.id, ol.seller_id, ol.qty, ol.status, ol.unit_price_cents::int AS unit_price_cents,
                ol.offer_id, o.status AS order_status, o.buyer_id AS order_buyer_id
         FROM orders.order_lines ol
         JOIN orders.orders o ON o.id = ol.order_id
         WHERE ol.id = $1 AND ol.order_id = $2`,
        [input.order_line_id, input.order_id],
      );
      if (lineRows.length === 0) throw new NotFoundException('order line not found');
      const line = lineRows[0];
      if (line.order_buyer_id !== buyer.id) throw new ForbiddenException('This order does not belong to you');
      if (line.status !== 'DELIVERED') {
        throw new BadRequestException(`line ${input.order_line_id} is in status ${line.status}; returns only on DELIVERED lines`);
      }
      if (input.qty > line.qty) {
        throw new BadRequestException(`cannot return more than ordered qty (${line.qty})`);
      }

      const { rows: existing } = await client.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM orders.return_requests
         WHERE order_line_id = $1 AND status IN ('AWAITING_SELLER','ACCEPTED','REJECTED','ESCALATED')`,
        [input.order_line_id],
      );
      if (Number(existing[0].n) > 0) {
        throw new BadRequestException('An active return request already exists for this line');
      }

      const { rows } = await client.query<Record<string, unknown>>(
        `INSERT INTO orders.return_requests (order_id, order_line_id, buyer_id, seller_id, reason, reason_note, qty, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'AWAITING_SELLER') RETURNING *`,
        [input.order_id, input.order_line_id, buyer.id, line.seller_id, reason, input.reason_note?.trim() || null, input.qty],
      );

      await client.query('COMMIT');
      await this.notify.notify(line.seller_id, {
        type: 'order',
        title: 'New return request',
        body: 'A buyer opened a return on one of your items — respond before it escalates.',
        deep_link: '/returns',
      });
      return this.toReturnRequest(rows[0], { unit_price_cents: Number(line.unit_price_cents), product_name: undefined });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async sellerRespond(
    seller: AuthUser,
    input: { return_id?: string; action?: string; note?: string },
  ): Promise<{ status: string; refund_cents?: number }> {
    if (!input.return_id || !input.action) {
      throw new BadRequestException('return_id and action are required');
    }
    const action = input.action.toUpperCase();
    if (action !== 'ACCEPT' && action !== 'REJECT') {
      throw new BadRequestException('action must be ACCEPT or REJECT');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<Record<string, unknown>>(
        `SELECT * FROM orders.return_requests WHERE id = $1 FOR UPDATE`,
        [input.return_id],
      );
      if (rows.length === 0) throw new NotFoundException('return request not found');
      const rr = rows[0];
      if (String(rr.seller_id) !== seller.id) throw new ForbiddenException('This return does not belong to you');
      if (String(rr.status) !== 'AWAITING_SELLER') {
        throw new BadRequestException(`return is in status ${rr.status}, expected AWAITING_SELLER`);
      }

      if (action === 'ACCEPT') {
        const refundCents = await this.applyRefund(client, rr);
        await client.query(
          `UPDATE orders.return_requests
           SET status = 'RESOLVED_REFUND', refund_cents = $2, decision_note = $3, decided_at = now(), decided_by = $4, updated_at = now()
           WHERE id = $1`,
          [input.return_id, refundCents, input.note?.trim() || null, seller.id],
        );
        await client.query('COMMIT');
        await this.notify.notify(String(rr.buyer_id), {
          type: 'order',
          title: 'Refund approved',
          body: 'The seller accepted your return — the value is being returned to you.',
          deep_link: '/returns',
        });
        return { status: 'RESOLVED_REFUND', refund_cents: refundCents };
      }

      // REJECT → escalate to dispute
      await client.query(
        `UPDATE orders.return_requests
         SET status = 'REJECTED', decision_note = $2, decided_at = now(), decided_by = $3, updated_at = now()
         WHERE id = $1`,
        [input.return_id, input.note?.trim() || null, seller.id],
      );
      await client.query('COMMIT');
      await this.notify.notify(String(rr.buyer_id), {
        type: 'order',
        title: 'Return declined',
        body: 'The seller declined your return — you can escalate it for mediation.',
        deep_link: '/returns',
      });
      return { status: 'REJECTED' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async escalateReturn(
    buyer: AuthUser,
    returnId: string,
  ): Promise<{ status: string; dispute_id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<Record<string, unknown>>(
        `SELECT * FROM orders.return_requests WHERE id = $1 FOR UPDATE`,
        [returnId],
      );
      if (rows.length === 0) throw new NotFoundException('return request not found');
      const rr = rows[0];
      if (String(rr.buyer_id) !== buyer.id) throw new ForbiddenException('This return does not belong to you');
      if (String(rr.status) !== 'REJECTED') {
        throw new BadRequestException(`return is in status ${rr.status}; can only escalate a rejected return`);
      }

      const typeMap: Record<string, string> = {
        WRONG_ITEM: 'MISSING', QUALITY: 'QUALITY', MISSING: 'MISSING', DAMAGED: 'QUALITY', OTHER: 'OTHER',
      };
      const disputeType = typeMap[String(rr.reason)] || 'OTHER';

const { rows: disputeRows } = await client.query<{ id: string }>(
      `INSERT INTO escrow.disputes (order_id, return_request_id, opened_by, type, reason, status)
       VALUES ($1, $2, 'BUYER', $3, $4, 'OPEN') RETURNING id`,
      [rr.order_id, returnId, disputeType, rr.reason_note || String(rr.reason)],
    );
      const disputeId = String(disputeRows[0].id);

      await client.query(
        `UPDATE orders.return_requests
         SET status = 'ESCALATED', dispute_id = $2, updated_at = now()
         WHERE id = $1`,
        [returnId, disputeId],
      );

      const { rows: escrowRows } = await client.query<{ id: string }>(
        `SELECT id FROM escrow.escrow_orders WHERE order_id = $1 AND status IN ('HELD')`,
        [rr.order_id],
      );
      if (escrowRows.length > 0) {
        await client.query(
          `UPDATE escrow.escrow_orders SET status = 'DISPUTED', updated_at = now() WHERE id = $1`,
          [escrowRows[0].id],
        );
      }

      await this.outbox.enqueue(client, 'escrow.disputed' as never, String(rr.order_id), {
        escrow_order_id: escrowRows[0]?.id ?? '',
        dispute_id: disputeId,
        type: disputeType,
      } as never);

      await client.query('COMMIT');
      await this.notify.notifyRoles(['OPS', 'AGENT'], {
        type: 'order',
        title: 'Return dispute escalated',
        body: 'A buyer escalated a return for mediation — review the dispute.',
        deep_link: '/ops-console',
      });
      return { status: 'ESCALATED', dispute_id: disputeId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async mediateReturn(
    ops: AuthUser,
    input: { return_id?: string; decision?: string; note?: string },
  ): Promise<{ status: string; refund_cents?: number }> {
    if (!this.isPrivileged(ops)) throw new ForbiddenException('Only OPS/AGENT can mediate returns');
    if (!input.return_id || !input.decision) {
      throw new BadRequestException('return_id and decision are required');
    }
    const decision = input.decision.toUpperCase();
    if (decision !== 'REFUND' && decision !== 'DISMISS') {
      throw new BadRequestException('decision must be REFUND or DISMISS');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<Record<string, unknown>>(
        `SELECT * FROM orders.return_requests WHERE id = $1 FOR UPDATE`,
        [input.return_id],
      );
      if (rows.length === 0) throw new NotFoundException('return request not found');
      const rr = rows[0];

      if (decision === 'REFUND') {
        const refundCents = await this.applyRefund(client, rr);
        await client.query(
          `UPDATE orders.return_requests
           SET status = 'RESOLVED_REFUND', refund_cents = $2, decision_note = $3, decided_at = now(), decided_by = $4, updated_at = now()
           WHERE id = $1`,
          [input.return_id, refundCents, input.note?.trim() || null, ops.id],
        );
        if (rr.dispute_id) {
          await client.query(
            `UPDATE escrow.disputes
             SET status = 'RESOLVED_BUYER', decision_notes = $2, decided_at = now(), updated_at = now()
             WHERE id = $1`,
            [rr.dispute_id, input.note?.trim() || null],
          );
        }
        await this.restoreEscrow(client, String(rr.order_id));
        await client.query('COMMIT');
        await this.notify.notify(String(rr.buyer_id), {
          type: 'order',
          title: 'Dispute resolved — refund issued',
          body: 'Mediation ended in your favour — the refund has been processed.',
          deep_link: '/returns',
        });
        await this.notify.notify(String(rr.seller_id), {
          type: 'order',
          title: 'Refund issued on your order',
          body: 'Mediation ordered a refund on one of your items.',
          deep_link: '/returns',
        });
        return { status: 'RESOLVED_REFUND', refund_cents: refundCents };
      }

      // DISMISS
      await client.query(
        `UPDATE orders.return_requests
         SET status = 'DISMISSED', decision_note = $2, decided_at = now(), decided_by = $3, updated_at = now()
         WHERE id = $1`,
        [input.return_id, input.note?.trim() || null, ops.id],
      );
      if (rr.dispute_id) {
        await client.query(
          `UPDATE escrow.disputes
           SET status = 'DISMISSED', decision_notes = $2, decided_at = now(), updated_at = now()
           WHERE id = $1`,
          [rr.dispute_id, input.note?.trim() || null],
        );
      }
      await this.restoreEscrow(client, String(rr.order_id));
      await client.query('COMMIT');
      await this.notify.notify(String(rr.buyer_id), {
        type: 'order',
        title: 'Dispute dismissed',
        body: 'Mediation dismissed your return request — the order stands as delivered.',
        deep_link: '/returns',
      });
      await this.notify.notify(String(rr.seller_id), {
        type: 'order',
        title: 'Dispute dismissed',
        body: 'Mediation dismissed a return request on one of your items — no refund issued.',
        deep_link: '/returns',
      });
      return { status: 'DISMISSED' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listReturns(
    actor: AuthUser,
    opts: { all?: boolean; status?: string; limit?: number; offset?: number } = {},
  ): Promise<ReturnRequestPage> {
    const isPriv = this.isPrivileged(actor);
    const all = opts.all && isPriv;
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);

    const where: string[] = [];
    const params: unknown[] = [];
    if (!all) {
      params.push(actor.id);
      where.push(`(rr.buyer_id = $${params.length} OR rr.seller_id = $${params.length})`);
    }
    if (opts.status) {
      params.push(opts.status.toUpperCase());
      where.push(`rr.status = $${params.length}`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: countRows } = await this.pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM orders.return_requests rr ${whereSql}`,
      params,
    );
    const total = Number(countRows[0].n);

    params.push(limit, offset);
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT rr.*, ol.unit_price_cents, l.product_name
       FROM orders.return_requests rr
       JOIN orders.order_lines ol ON ol.id = rr.order_line_id
       JOIN catalog.offers o ON o.id = ol.offer_id
       JOIN catalog.lots l ON l.id = o.lot_id
       ${whereSql}
       ORDER BY rr.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      returns: rows.map((r) => this.toReturnRequestFull(r)),
      total,
      limit,
      offset,
    };
  }

  async getReturn(actor: AuthUser, returnId: string): Promise<ReturnRequest> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT rr.*, ol.unit_price_cents, l.product_name
       FROM orders.return_requests rr
       JOIN orders.order_lines ol ON ol.id = rr.order_line_id
       JOIN catalog.offers o ON o.id = ol.offer_id
       JOIN catalog.lots l ON l.id = o.lot_id
       WHERE rr.id = $1`,
      [returnId],
    );
    if (rows.length === 0) throw new NotFoundException('return request not found');
    const rr = this.toReturnRequestFull(rows[0]);
    const isPriv = this.isPrivileged(actor);
    if (rr.buyer_id !== actor.id && rr.seller_id !== actor.id && !isPriv) {
      throw new ForbiddenException('You do not have access to this return');
    }
    return rr;
  }

  async listDisputes(
    actor: AuthUser,
    opts: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ disputes: DisputeRow[]; total: number; limit: number; offset: number }> {
    if (!this.isPrivileged(actor)) throw new ForbiddenException('Only OPS/AGENT can list disputes');
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);

    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status) {
      params.push(opts.status.toUpperCase());
      where.push(`d.status = $${params.length}`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: countRows } = await this.pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM escrow.disputes d ${whereSql}`,
      params,
    );
    const total = Number(countRows[0].n);

    params.push(limit, offset);
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT d.* FROM escrow.disputes d ${whereSql}
       ORDER BY d.opened_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      disputes: rows.map((r) => ({
        id: String(r.id),
        order_id: String(r.order_id),
        return_request_id: r.return_request_id ? String(r.return_request_id) : null,
        opened_by: String(r.opened_by),
        type: String(r.type),
        reason: String(r.reason),
        status: String(r.status),
        decision_notes: r.decision_notes ? String(r.decision_notes) : null,
        decided_at: r.decided_at ? String(r.decided_at) : null,
        created_at: String(r.created_at),
      })),
      total,
      limit,
      offset,
    };
  }

  /* ── OPS Console: KYC Queue ── */

  async listKycQueue(
    actor: AuthUser,
    opts: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ kyc: KycQueueRow[]; total: number; limit: number; offset: number }> {
    if (!this.isPrivileged(actor)) throw new ForbiddenException('Only OPS/AGENT');
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);
    const status = opts.status?.toUpperCase() || 'PENDING';

    const { rows: countRows } = await this.pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM pii.seller_kyc WHERE status = $1`,
      [status],
    );
    const total = Number(countRows[0].n);

    const { rows } = await this.pool.query<KycQueueRow>(
      `SELECT sk.user_id, p.phone, p.full_name, sk.id_type, sk.status, sk.submitted_at::text AS submitted_at
       FROM pii.seller_kyc sk
       JOIN pii.users p ON p.id = sk.user_id
       WHERE sk.status = $1
       ORDER BY sk.submitted_at ASC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset],
    );
    return { kyc: rows, total, limit, offset };
  }

  async approveKyc(
    actor: AuthUser,
    userId: string,
    action: 'APPROVED' | 'REJECTED',
    note?: string,
  ): Promise<{ user_id: string; status: string }> {
    if (!this.isPrivileged(actor)) throw new ForbiddenException('Only OPS/AGENT');
    if (action === 'REJECTED' && (!note || !note.trim())) {
      throw new BadRequestException('Rejection requires a review_note');
    }
    const { rowCount } = await this.pool.query(
      `UPDATE pii.seller_kyc
       SET status = $2, review_note = $3, reviewed_at = now(), reviewed_by = $4, updated_at = now()
       WHERE user_id = $1 AND status = 'PENDING'`,
      [userId, action, note?.trim() || null, actor.id],
    );
    if (rowCount === 0) throw new NotFoundException('No pending KYC found for this user');
    await this.notify.notify(userId, {
        type: 'system',
        title: `KYC ${action === 'APPROVED' ? 'approved' : 'rejected'}`,
        body: action === 'APPROVED'
          ? 'Your seller identity documents were approved — you are now a FULL seller.'
          : `Your seller identity documents were rejected${note ? `: ${note.trim()}` : ''}.`,
        deep_link: '/seller/products',
      });
    return { user_id: userId, status: action };
  }

  /* ── OPS Console: Seller Risk ── */

  async setSellerRisk(
    actor: AuthUser,
    input: { seller_id?: string; tier?: string; ops_override?: boolean },
  ): Promise<SellerRiskRow> {
    if (!this.isPrivileged(actor)) throw new ForbiddenException('Only OPS/AGENT');
    if (!input.seller_id) throw new BadRequestException('seller_id is required');

    const tier = input.tier?.toUpperCase();
    const validTiers = ['NEW', 'ELEVATED', 'VERIFIED_LOW'];
    if (tier && !validTiers.includes(tier)) {
      throw new BadRequestException(`tier must be one of ${validTiers.join(', ')}`);
    }

    const { rows } = await this.pool.query<SellerRiskRow>(
      `INSERT INTO trust.seller_risk_tiers (seller_id, tier, ops_override)
       VALUES ($1, $2, $3)
       ON CONFLICT (seller_id) DO UPDATE SET
         tier = COALESCE($2, trust.seller_risk_tiers.tier),
         ops_override = COALESCE($4, trust.seller_risk_tiers.ops_override),
         updated_at = now()
       RETURNING seller_id AS user_id, tier, on_time_rate_30d, dispute_rate_30d, qa_rate, ops_override, updated_at::text`,
      [input.seller_id, tier || 'NEW', input.ops_override ?? false, input.ops_override ?? null],
    );
    return rows[0];
  }

  async listSellerRisk(
    actor: AuthUser,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ sellers: SellerRiskRow[]; total: number }> {
    if (!this.isPrivileged(actor)) throw new ForbiddenException('Only OPS/AGENT');
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);

    const { rows: countRows } = await this.pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM trust.seller_risk_tiers`,
    );
    const { rows } = await this.pool.query<SellerRiskRow>(
      `SELECT rt.seller_id AS user_id, p.full_name, rt.tier, rt.on_time_rate_30d,
              rt.dispute_rate_30d, rt.qa_rate, rt.ops_override, rt.updated_at::text
       FROM trust.seller_risk_tiers rt
       JOIN pii.users p ON p.id = rt.seller_id
       ORDER BY rt.updated_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return { sellers: rows, total: Number(countRows[0].n) };
  }

  async recomputeRiskTiers(
    actor: AuthUser,
  ): Promise<{ updated: number }> {
    if (!this.isPrivileged(actor)) throw new ForbiddenException('Only OPS/AGENT');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: sellers } = await client.query<{ user_id: string }>(
        `SELECT user_id FROM catalog.seller_profiles WHERE user_id IS NOT NULL`,
      );
      let updated = 0;
      for (const seller of sellers) {
        const sid = seller.user_id;

        const { rows: orows } = await client.query<{ completed: string; total: string }>(
          `SELECT COALESCE(completed_orders, 0)::int AS completed,
                  COALESCE(total_orders, 0)::int AS total
           FROM catalog.seller_profiles WHERE user_id = $1`,
          [sid],
        );
        const { completed, total } = orows[0] || { completed: '0', total: '0' };
        const onTimeRate = Number(total) > 0 ? Number(completed) / Number(total) : 1;

        const { rows: drows } = await client.query<{ n: string }>(
          `SELECT count(*)::int AS n FROM escrow.disputes d
           JOIN orders.orders o ON o.id = d.order_id
           JOIN orders.order_lines ol ON ol.order_id = o.id
           WHERE ol.seller_id = $1
             AND d.opened_at >= now() - interval '30 days'`,
          [sid],
        );
        const disputes30d = Number(drows[0].n);
        const disputeRate = Number(total) > 0 ? disputes30d / Number(total) : 0;

        const { rows: rrows } = await client.query<{ avg_rating: string }>(
          `SELECT avg_rating FROM catalog.seller_profiles WHERE user_id = $1`,
          [sid],
        );
        const avgRating = rrows[0]?.avg_rating ? Number(rrows[0].avg_rating) : 4.5;
        const qaRate = avgRating / 5;

        let tier = 'NEW';
        if (onTimeRate >= 0.95 && disputeRate < 0.05 && qaRate >= 0.8) tier = 'VERIFIED_LOW';
        else if (onTimeRate < 0.8 || disputeRate >= 0.1) tier = 'ELEVATED';

        await client.query(
          `INSERT INTO trust.seller_risk_tiers (seller_id, tier, on_time_rate_30d, dispute_rate_30d, qa_rate, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (seller_id) DO UPDATE SET
             tier = CASE WHEN trust.seller_risk_tiers.ops_override = TRUE THEN trust.seller_risk_tiers.tier ELSE $2 END,
             on_time_rate_30d = $3, dispute_rate_30d = $4, qa_rate = $5, updated_at = now()`,
          [sid, tier, onTimeRate, disputeRate, qaRate],
        );
        updated++;
      }
      await client.query('COMMIT');
      return { updated };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /* ── Analytics: Seller Stats ── */

  async getSellerStats(actor: AuthUser): Promise<SellerStats> {
    const { rows: revRows } = await this.pool.query<{ n: string }>(
      `SELECT COALESCE(SUM(-amount_cents), 0)::int AS n
       FROM escrow.ledger_entries
       WHERE entry_type = 'SELLER_PAYOUT' AND counterparty_type = 'SELLER' AND counterparty_id = $1`,
      [actor.id],
    );

    const { rows: orderRows } = await this.pool.query<{ total: string; completed: string; cancelled: string }>(
      `SELECT
         count(DISTINCT o.id)::int AS total,
         count(DISTINCT CASE WHEN o.status NOT IN ('CANCELLED','PARTIALLY_REFUNDED','REFUNDED') THEN o.id END)::int AS completed,
         count(DISTINCT CASE WHEN o.status = 'CANCELLED' THEN o.id END)::int AS cancelled
       FROM orders.order_lines ol
       JOIN orders.orders o ON o.id = ol.order_id
       WHERE ol.seller_id = $1`,
      [actor.id],
    );

    const { rows: returnRows } = await this.pool.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM orders.return_requests
       WHERE seller_id = $1 AND created_at >= now() - interval '30 days'`,
      [actor.id],
    );

    const { rows: ratingRows } = await this.pool.query<{ avg_rating: string; review_count: string }>(
      `SELECT avg_rating, review_count FROM catalog.seller_profiles WHERE user_id = $1`,
      [actor.id],
    );

    const { rows: topProducts } = await this.pool.query<{ offer_id: string; product_name: string; sold_qty: string; revenue_cents: string }>(
      `SELECT ol.offer_id, l.product_name,
              SUM(ol.qty)::int AS sold_qty,
              SUM(ol.unit_price_cents * ol.qty)::int AS revenue_cents
       FROM orders.order_lines ol
       JOIN catalog.offers off ON off.id = ol.offer_id
       JOIN catalog.lots l ON l.id = off.lot_id
       WHERE ol.seller_id = $1 AND ol.status = 'DELIVERED'
       GROUP BY ol.offer_id, l.product_name
       ORDER BY revenue_cents DESC
       LIMIT 5`,
      [actor.id],
    );

    const orows = orderRows[0];
    const total = Number(orows.total);
    const completed = Number(orows.completed);
    const onTimeRate = total > 0 ? completed / total : 1;
    const disputes = Number(returnRows[0].n);
    const disputeRate = total > 0 ? disputes / total : 0;

    return {
      seller_id: actor.id,
      revenue_cents: Number(revRows[0].n),
      orders_total: total,
      orders_completed: completed,
      orders_cancelled: Number(orows.cancelled),
      on_time_rate: onTimeRate,
      dispute_rate_30d: disputeRate,
      avg_rating: ratingRows[0]?.avg_rating ? Number(ratingRows[0].avg_rating) : null,
      review_count: ratingRows[0]?.review_count ? Number(ratingRows[0].review_count) : 0,
      top_products: topProducts.map((p) => ({
        offer_id: p.offer_id,
        product_name: p.product_name,
        sold_qty: Number(p.sold_qty),
        revenue_cents: Number(p.revenue_cents),
      })),
    };
  }

  /**
   * Daily sales + released-payout trend for a seller over the last `days`.
   * Sales = value of active order lines placed that day; released = escrow
   * payouts credited that day. Zero-filled so the chart always has a full axis.
   */
  async getSellerTrend(actor: AuthUser, days = 14): Promise<SellerTrend> {
    const n = Math.min(Math.max(days, 3), 60);
    const { rows } = await this.pool.query(
      `WITH days AS (
         SELECT (now()::date - (($2::int - 1 - gs)::int))::date AS day
         FROM generate_series(0, $2::int - 1) gs
       ),
       orders AS (
         SELECT o.created_at::date AS day,
                count(DISTINCT o.id)::int AS orders,
                COALESCE(SUM(ol.unit_price_cents * ol.qty), 0)::int AS sales_cents
         FROM orders.order_lines ol
         JOIN orders.orders o ON o.id = ol.order_id
         WHERE ol.seller_id = $1
           AND ol.status IN ('PAID','DISPATCHED','DELIVERED','PENDING')
           AND o.created_at >= now()::date - ($2::int - 1)
         GROUP BY o.created_at::date
       ),
       released AS (
         SELECT created_at::date AS day,
                COALESCE(SUM(-amount_cents), 0)::int AS released_cents
         FROM escrow.ledger_entries
         WHERE entry_type = 'SELLER_PAYOUT' AND counterparty_type = 'SELLER' AND counterparty_id = $1
           AND created_at >= now()::date - ($2::int - 1)
         GROUP BY created_at::date
       )
       SELECT d.day::text AS date,
              COALESCE(o.orders, 0)::int AS orders,
              COALESCE(o.sales_cents, 0)::int AS sales_cents,
              COALESCE(r.released_cents, 0)::int AS released_cents
       FROM days d
       LEFT JOIN orders o ON o.day = d.day
       LEFT JOIN released r ON r.day = d.day
       ORDER BY d.day`,
      [actor.id, n],
    );

    const trend = rows.map((r) => ({
      date: new Date(`${r.date}T00:00:00`).toISOString(),
      orders: Number(r.orders),
      sales_cents: Number(r.sales_cents),
      released_cents: Number(r.released_cents),
    }));

    let best: { date: string; sales_cents: number } | null = null;
    for (const p of trend) {
      if (!best || p.sales_cents > best.sales_cents) best = { date: p.date, sales_cents: p.sales_cents };
    }

    return {
      days: n,
      total_orders: trend.reduce((s, p) => s + p.orders, 0),
      total_sales_cents: trend.reduce((s, p) => s + p.sales_cents, 0),
      total_released_cents: trend.reduce((s, p) => s + p.released_cents, 0),
      best_day: best && best.sales_cents > 0 ? best : null,
      trend,
    };
  }

  /* ── Analytics: Platform Stats (OPS) ── */

  async getPlatformStats(actor: AuthUser): Promise<PlatformStats> {
    if (!this.isPrivileged(actor)) throw new ForbiddenException('Only OPS/AGENT');

    const [sellersRes, ordersRes, gmvRes, kycRes, disputesRes, payoutsRes, returnsRes] = await Promise.all([
      this.pool.query<{ n: string }>(`SELECT count(*)::int AS n FROM catalog.seller_profiles`),
      this.pool.query<{ n: string }>(`SELECT count(*)::int AS n FROM orders.orders`),
      this.pool.query<{ n: string }>(
        `SELECT COALESCE(SUM(-amount_cents), 0)::int AS n
         FROM escrow.ledger_entries WHERE entry_type = 'SELLER_PAYOUT'`,
      ),
      this.pool.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM pii.seller_kyc WHERE status = 'PENDING'`,
      ),
      this.pool.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM escrow.disputes WHERE status = 'OPEN'`,
      ),
      this.pool.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM finance.payout_requests WHERE status = 'PENDING'`,
      ),
      this.pool.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM orders.return_requests
         WHERE created_at >= now() - interval '30 days'`,
      ),
    ]);

    return {
      sellers_total: Number(sellersRes.rows[0].n),
      orders_total: Number(ordersRes.rows[0].n),
      gmv_cents: Number(gmvRes.rows[0].n),
      pending_kyc: Number(kycRes.rows[0].n),
      open_disputes: Number(disputesRes.rows[0].n),
      pending_payouts: Number(payoutsRes.rows[0].n),
      returns_30d: Number(returnsRes.rows[0].n),
    };
  }

  /* ── Private helpers ── */

  private async applyRefund(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> },
    rr: Record<string, unknown>,
  ): Promise<number> {
    const escrowRows = await client.query(
      `SELECT id, status, amount_held_cents FROM escrow.escrow_orders WHERE order_id = $1`,
      [rr.order_id],
    );
    const escrow = escrowRows.rows[0];
    if (!escrow) throw new BadRequestException('No escrow found for this order');

    const lineRefundQty = Number(rr.qty);
    const totalQtyRow = await client.query(
      `SELECT SUM(qty) AS total FROM orders.order_lines WHERE order_id = $1`,
      [rr.order_id],
    );
    const totalQty = Number(totalQtyRow.rows[0]?.total) || 1;
    const escrowHeld = Number(escrow.amount_held_cents);
    const proportionalRefund = Math.round((escrowHeld * lineRefundQty) / totalQty);
    const actualRefund = Math.min(proportionalRefund, escrowHeld);

    await client.query(
      `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
       VALUES ($1, 'REFUND', $2, 'BUYER', $3, $4)`,
      [escrow.id, -actualRefund, rr.buyer_id, `return:${rr.id}:${Date.now()}`],
    );

    if (String(escrow.status) === 'RELEASED') {
      await client.query(
        `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
         VALUES ($1, 'MANUAL_ADJUSTMENT', $2, 'SELLER', $3, $4)`,
        [escrow.id, actualRefund, rr.seller_id, `return-clawback:${rr.id}:${Date.now()}`],
      );
    } else {
      await client.query(
        `UPDATE escrow.escrow_orders
         SET amount_held_cents = GREATEST(amount_held_cents - $1, 0), updated_at = now()
         WHERE id = $2`,
        [actualRefund, escrow.id],
      );
    }

    await client.query(
      `UPDATE orders.order_lines SET status = 'REFUNDED', updated_at = now() WHERE id = $1`,
      [rr.order_line_id],
    );

    const { rows: allLineStatuses } = await client.query(
      `SELECT status FROM orders.order_lines WHERE order_id = $1`,
      [rr.order_id],
    );
    const hasActive = allLineStatuses.some((l) => !['REFUNDED', 'CANCELLED'].includes(String(l.status)));
    const newOrderStatus = hasActive ? 'PARTIALLY_REFUNDED' : 'REFUNDED';
    await client.query(
      `UPDATE orders.orders SET status = $2, updated_at = now() WHERE id = $1`,
      [rr.order_id, newOrderStatus],
    );

    return actualRefund;
  }

  private async restoreEscrow(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
    orderId: string,
  ): Promise<void> {
    const { rows } = await client.query(
      `SELECT id, status FROM escrow.escrow_orders WHERE order_id = $1`,
      [orderId],
    );
    if (rows.length > 0 && String(rows[0].status) === 'DISPUTED') {
      await client.query(
        `UPDATE escrow.escrow_orders
         SET status = 'HELD', release_scheduled_at = now(), updated_at = now()
         WHERE id = $1`,
        [String(rows[0].id)],
      );
    }
  }

  private toReturnRequest(row: Record<string, unknown>, line: { unit_price_cents: number; product_name?: string }): ReturnRequest {
    return {
      id: String(row.id),
      order_id: String(row.order_id),
      order_line_id: String(row.order_line_id),
      buyer_id: String(row.buyer_id),
      seller_id: String(row.seller_id),
      product_name: line.product_name ?? 'Unknown',
      qty: Number(row.qty),
      unit_price_cents: line.unit_price_cents,
      refund_cents: Number(row.refund_cents ?? 0),
      reason: String(row.reason),
      reason_note: row.reason_note ? String(row.reason_note) : null,
      status: String(row.status),
      decision_note: row.decision_note ? String(row.decision_note) : null,
      dispute_id: row.dispute_id ? String(row.dispute_id) : null,
      decided_at: row.decided_at ? new Date(row.decided_at as string).toISOString() : null,
      created_at: new Date(row.created_at as string).toISOString(),
    };
  }

  private toReturnRequestFull(row: Record<string, unknown>): ReturnRequest {
    return {
      id: String(row.id),
      order_id: String(row.order_id),
      order_line_id: String(row.order_line_id),
      buyer_id: String(row.buyer_id),
      seller_id: String(row.seller_id),
      product_name: row.product_name ? String(row.product_name) : 'Unknown',
      qty: Number(row.qty),
      unit_price_cents: Number(row.unit_price_cents ?? 0),
      refund_cents: Number(row.refund_cents ?? 0),
      reason: String(row.reason),
      reason_note: row.reason_note ? String(row.reason_note) : null,
      status: String(row.status),
      decision_note: row.decision_note ? String(row.decision_note) : null,
      dispute_id: row.dispute_id ? String(row.dispute_id) : null,
      decided_at: row.decided_at ? new Date(row.decided_at as string).toISOString() : null,
      created_at: new Date(row.created_at as string).toISOString(),
    };
  }
}
