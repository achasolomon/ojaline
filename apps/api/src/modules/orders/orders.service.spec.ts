import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { OrdersService, type CreateCheckoutInput } from './orders.service.js';
import type { OutboxService } from '../outbox/outbox.service.js';
import type { PaystackService } from '../paystack/paystack.service.js';
import type { ReservationGate } from '../reservation/reservation.gate.js';
import type { MultiSellerGate } from '../fulfilment/multi-seller-gate.js';
import type { FulfilmentStateMachine } from '../fulfilment/fulfilment-state-machine.js';
import type { FeedService } from '../notifications/feed.service.js';

let admin: Pool;
let app: Pool;
let orders: OrdersService;
const allUserIds: string[] = [];
let clusterId: string;
let wholesaleOfferId: string;
let retailBuyerId: string;
let openBuyerId: string;

let gateCheckSpy: ReturnType<typeof vi.spyOn>;

const multiSellerStub = {
  checkGate: () => ({ allowed: false, reason: 'stub' }),
  checkCapacity: () => ({ available: 0 }),
  reserveCapacity: () => false,
} as unknown as MultiSellerGate;

const gateStub = {
  acquireSoftHold: vi.fn().mockResolvedValue(false),
  convertSoftToHard: vi.fn().mockResolvedValue(false),
  releaseSoftHold: vi.fn().mockResolvedValue(undefined),
} as unknown as ReservationGate;

async function insertUser(pool: Pool, channel: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `Checkout Test ${randomUUID().slice(0, 6)}`, null, channel],
  );
  allUserIds.push(r.rows[0].id as string);
  return r.rows[0].id as string;
}

async function insertCluster(pool: Pool): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.clusters (name, lga, centroid) VALUES ($1, $2, ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
    [`Checkout Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
  );
  return r.rows[0].id as string;
}

async function insertWholesaleOffer(pool: Pool, owner: string, cluster: string): Promise<string> {
  const lot = await pool.query(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [owner, 'Wholesale Test Product', `ref-${randomUUID()}`],
  );
  const r = await pool.query(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
     VALUES ($1, 'WHOLESALE', $2, 10, 1, 'SHELF_GT_7D', ARRAY['SCHEDULED'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
     RETURNING id`,
    [owner, lot.rows[0].id as string, cluster],
  );
  return r.rows[0].id as string;
}

function checkoutInput(buyerId: string, offerId: string): CreateCheckoutInput {
  return {
    buyer_id: buyerId,
    items: [{ offer_id: offerId, qty: 1, unit_price_cents: 5000 }],
    soft_hold_ids: [],
    window_start: '2026-09-15T08:00:00.000Z',
    window_end: '2026-09-15T16:00:00.000Z',
    delivery_mode: 'SCHEDULED',
  };
}

beforeAll(async () => {
  const c = loadConfig();
  admin = new Pool({
    host: c.DB_HOST,
    port: c.DB_PORT,
    database: process.env.POSTGRES_DB ?? 'ojaline',
    user: process.env.POSTGRES_USER ?? 'ojaline',
    password: process.env.POSTGRES_PASSWORD ?? 'ojaline_dev_pw',
  });
  app = new Pool({
    host: c.DB_HOST,
    port: c.DB_PORT,
    database: c.DB_NAME,
    user: c.DB_USER,
    password: c.DB_PASSWORD,
  });

  gateCheckSpy = vi.spyOn(multiSellerStub as any, 'checkGate');

  orders = new OrdersService(
    app,
    {} as unknown as OutboxService,
    {} as unknown as PaystackService,
    gateStub,
    multiSellerStub,
    {} as unknown as FulfilmentStateMachine,
    {} as unknown as FeedService,
  );

  clusterId = await insertCluster(admin);
  const owner = await insertUser(admin, 'WHOLESALE');
  wholesaleOfferId = await insertWholesaleOffer(admin, owner, clusterId);
  retailBuyerId = await insertUser(admin, 'RETAILER');
  openBuyerId = await insertUser(admin, 'OPEN');
});

beforeEach(() => {
  gateCheckSpy.mockClear();
});

afterAll(async () => {
  await app.end();
  await admin.query(`DELETE FROM catalog.offers WHERE id = $1`, [wholesaleOfferId]);
  await admin.query(`DELETE FROM catalog.lots WHERE seller_id = ANY($1)`, [allUserIds]);
  await admin.query(`DELETE FROM catalog.clusters WHERE id = $1`, [clusterId]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [allUserIds]);
  await admin.end();
});

describe('OrdersService channel lock on checkout (integration — requires postgres on DB_HOST)', () => {
  it('rejects checkout when the buyer channel does not match the offer channel', async () => {
    await expect(
      orders.createCheckout(checkoutInput(retailBuyerId, wholesaleOfferId)),
    ).rejects.toThrow(/buyer role must match to purchase/i);
    expect(gateCheckSpy).not.toHaveBeenCalled();
  });

  it('lets an OPEN buyer through the channel check (gate rejects later for a stub reason)', async () => {
    await expect(
      orders.createCheckout(checkoutInput(openBuyerId, wholesaleOfferId)),
    ).rejects.toThrow(/multi-seller gate rejected: stub/i);
    expect(gateCheckSpy).toHaveBeenCalledTimes(1);
  });
});