# OJALINE — Data Model v1.0
### Completes Architecture v2.0 §2 — full entity map + money-path DDL
**Author:** Principal Architect / Engineering Director
**Status:** For review — must be merged before Sprint 0.1's "schema freeze" is valid
**Companions:** ADR-000 (stack), ADR-007 (USSD deploy shape), ADR-008 (outbox transport)

---

## 0. Purpose

Architecture v2.0 §2.1 models four tables and leaves "supporting tables" undefined. The **money path** (escrow ledger, settlement, disputes) and **order path** are the core of this system — they cannot be "supporting tables" discovered during implementation. This document defines the complete entity map and gives full DDL for the critical infrastructure. Everything else is specified at entity level; Sprint 0.1 writes the migration DDL from this document.

## 1. Conventions (binding)

- **PKs:** `UUID` via `gen_random_uuid()`. Never expose sequential IDs in APIs.
- **Timestamps:** `TIMESTAMPTZ`. `created_at` everywhere; `updated_at` where mutable.
- **Money:** `BIGINT` minor units (kobo), `currency TEXT` (NGN only in Phase 1). **Floating point for money is prohibited** — unit tests must enforce this at the boundary.
- **Schema strategy:** one schema per bounded context + `pii` + `audit`. Cross-schema access is prohibited except through the owning module's public interface (Architecture §1; enforced by lint rule + code review).
- **Immutability:** ledger, outbox, audit, `agent_actions`, `fraud_signals` are append-only — enforced by `REVOKE UPDATE, DELETE`, not convention.
- **Soft delete:** only `users` (NDPR deletion path) and `offers` (delisting must preserve order-history FKs). Everything else hard-deletes or is append-only.
- **Versioning:** row `version INT` (optimistic concurrency) on non-hot-path catalog writes (price, description) only — never on reservation counters (those are guarded by the DB CHECK + Redis gate).
- **IDs vs references:** every reference column carries a named FK. No stringly-typed pointers.

## 2. Schema Map by Bounded Context

| Schema | Context | Tables |
|---|---|---|
| `pii` | Identity | users, user_roles, roles, phone_verifications, consents, devices, delete_requests |
| `catalog` | Offer & Catalog | offers, lots, categories, grade_standards, offer_media, offer_price_history, clusters, markets, market_day_status |
| `orders` | Cart / Order | stock_holds, checkout_sessions, orders, order_lines |
| `escrow` | Split-Escrow | escrow_orders, ledger_entries, settlement_batches, settlement_lines, disputes |
| `fulfilment` | Fulfilment | capacity_slots, rider_jobs, delivery_attempts, otp_verifications, weather_gates |
| `trust` | Trust | agent_actions, fraud_signals, seller_risk_tiers, qa_pool_entries, reviews |
| `audit` | Shared | outbox_events, audit_log |

Views expose `pii` data to modules; modules never hold direct table grants on `pii`.

---

## 3. Critical Infrastructure — Full DDL

### 3.1 Outbox (ADR-008) — replaces Kafka topics

```sql
CREATE TABLE audit.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,              -- 'stock.hold_created' | 'order.paid' | 'escrow.released' | ...
  schema_version INT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','DEAD')),
  attempts INT NOT NULL DEFAULT 0,
  dedup_key TEXT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ NULL,
  last_attempt_at TIMESTAMPTZ NULL
);
CREATE INDEX idx_outbox_pending ON audit.outbox_events(status, created_at) WHERE status IN ('PENDING','FAILED');
REVOKE UPDATE, DELETE ON audit.outbox_events FROM app_user;
```

Written **inside the same transaction** as the state change that emits it. Worker polls `idx_outbox_pending`; FAILED → retry with backoff; DEAD after max attempts (Ops alert).
**Grant model (ADR-008):** producers get INSERT only; the worker holds a **column-level UPDATE grant** on `(status, attempts, dispatched_at, last_attempt_at)` so it can run the lifecycle. `event_type`/`schema_version`/`aggregate_id`/`payload`/`occurred_at` are immutable; DELETE is never granted.

### 3.2 Audit log

```sql
CREATE TABLE audit.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NULL,                    -- NULL = system
  actor_type TEXT NOT NULL CHECK (actor_type IN ('USER','RIDER','AGENT','OPS','SYSTEM')),
  action TEXT NOT NULL,                  -- 'CHANNEL_CHANGE' | 'ESCROW_OVERRIDE' | ...
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before_payload JSONB,
  after_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON audit.audit_log FROM app_user;
```

**Mandatory writers** (Architecture §5): every channel change; every escrow override/manual release.

### 3.3 Order path

```sql
CREATE TABLE orders.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('RETAILER','WHOLESALE','DIRECT','OPEN')),
  status TEXT NOT NULL CHECK (status IN ('CHECKOUT','PENDING_PAYMENT','PAID','PARTIALLY_DISPATCHED','DISPATCHED','DELIVERED','PARTIALLY_REFUNDED','REFUNDED','CANCELLED','FAILED')),
  multi_seller BOOLEAN NOT NULL DEFAULT FALSE,
  checkout_session_id UUID NULL,
  item_total_cents BIGINT NOT NULL CHECK (item_total_cents >= 0),
  delivery_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  landed_total_cents BIGINT NOT NULL CHECK (landed_total_cents = item_total_cents + delivery_fee_cents),
  currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders.order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders.orders(id),
  offer_id UUID NOT NULL REFERENCES catalog.offers(id),
  seller_id UUID NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('PAID','DISPATCHED','DELIVERED','PENDING','REFUNDED','FAILED')),
  stock_hold_id UUID NULL,               -- hard hold that secured this line
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- order sum = sum of lines (app + test enforced; not a CHECK — cross-table)
```

### 3.4 Escrow ledger (money path — the critical DDL)

```sql
CREATE TABLE escrow.escrow_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders.orders(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING_PAYMENT','HELD','RELEASING','RELEASED','REFUNDED','DISPUTED')),
  amount_held_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_held_cents >= 0),
  release_scheduled_at TIMESTAMPTZ NULL,      -- set at delivery.verified = created_at + 24h (silent release)
  released_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_escrow_release_due ON escrow.escrow_orders(release_scheduled_at) WHERE status = 'HELD';

CREATE TABLE escrow.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_order_id UUID NOT NULL REFERENCES escrow.escrow_orders(id),
  sequence_no INT NOT NULL,                    -- per-escrow monotonic
  entry_type TEXT NOT NULL CHECK (entry_type IN ('PAYMENT_IN','FEE','DELIVERY_RELEASE','PARTIAL_RELEASE','REFUND','PAYOUT','MANUAL_ADJUSTMENT')),
  amount_cents BIGINT NOT NULL,                -- signed; PAYMENT_IN positive, RELEASE/REFUND negative
  running_balance_cents BIGINT NOT NULL,       -- denormalized; trigger-enforced (below)
  currency TEXT NOT NULL DEFAULT 'NGN',
  counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('SELLER','BUYER','OPS','PLATFORM')),
  counterparty_id UUID NULL,
  reference TEXT NULL,                         -- Paystack transfer ref / settlement batch id
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (escrow_order_id, sequence_no)
);
REVOKE UPDATE, DELETE ON escrow.ledger_entries FROM app_user;

-- Invariant: running_balance is always derived from prior entries
CREATE OR REPLACE FUNCTION escrow.trg_ledger_running_balance() RETURNS trigger AS $$
BEGIN
  NEW.sequence_no := COALESCE((SELECT MAX(sequence_no) FROM escrow.ledger_entries
                               WHERE escrow_order_id = NEW.escrow_order_id), 0) + 1;
  NEW.running_balance_cents := COALESCE((SELECT running_balance_cents FROM escrow.ledger_entries
                               WHERE escrow_order_id = NEW.escrow_order_id
                               ORDER BY sequence_no DESC LIMIT 1), 0) + NEW.amount_cents;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_ledger_running_balance BEFORE INSERT ON escrow.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION escrow.trg_ledger_running_balance();
-- Escrow-close invariant (app + reconciliation check, not trigger): status in
-- ('RELEASED','REFUNDED') requires running_balance_cents = 0.
```

```sql
CREATE TABLE escrow.settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','CONFIRMED','PARTIAL','FAILED')),
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  submitted_at TIMESTAMPTZ NULL,
  confirmed_at TIMESTAMPTZ NULL,
  reconciled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE escrow.settlement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES escrow.settlement_batches(id),
  ledger_entry_id UUID NOT NULL REFERENCES escrow.ledger_entries(id),
  seller_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  paystack_transfer_ref TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','SUBMITTED','CONFIRMED','FAILED','RECONCILED')),
  UNIQUE (batch_id, ledger_entry_id)
);

CREATE TABLE escrow.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders.orders(id),
  opened_by TEXT NOT NULL CHECK (opened_by IN ('BUYER','SELLER','RIDER','OPS')),
  type TEXT NOT NULL CHECK (type IN ('QUALITY','DELIVERY','MISSING','FRAUD','OTHER')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED_BUYER','RESOLVED_SELLER','RESOLVED_PARTIAL','DISMISSED')),
  decision_notes TEXT NULL,
  decided_at TIMESTAMPTZ NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Settlement rule:** money moves only via `ledger_entries` → `settlement_batches`/`settlement_lines` → Paystack Transfer. A release that cannot produce a `PAYOUT` ledger entry with a matching transfer ref is an incident, not a silent skip.

---

## 4. Entity Map (Sprint 0.1 writes migration DDL from these specs)

### 4.1 `pii` — Identity

| Table | Key columns | Notes |
|---|---|---|
| users | id, phone (unique, indexed), full_name, status, created_at, updated_at, deleted_at | soft-delete (NDPR) |
| roles | id, name | ROLES: BUYER, SELLER, RIDER, AGENT, OPS |
| user_roles | user_id, role_id, granted_at | join — a user can be farmer + buyer |
| phone_verifications | id, phone, purpose (LOGIN, POD, PAYOUT_CHECK, PASSWORDLESS), code_hash, expires_at, attempts, used_at | OTP: hash-only, 15-min TTL, attempt-capped |
| consents | user_id, scope, version, granted_at, revoked_at | NDPR; plain-language scopes |
| devices | user_id, device_id, signals JSONB | fraud device-reuse signals |
| delete_requests | user_id, requested_at, status, completed_at | NDPR deletion path |

### 4.2 `catalog` — Offer & Catalog

| Table | Key columns | Notes |
|---|---|---|
| offers | per Architecture §2.1, plus `seller_id` FK and `status` (ACTIVE, PAUSED, DELISTED) | soft-delete on DELISTED |
| lots | id, seller_id, product_id, physical_ref, created_at | links partial-channel splits |
| categories | id, name, perishability_default, parent_id, grade_standard_id | |
| grade_standards | id, category_id, criteria JSONB, ref_photo_required BOOL, version | System Doc §11 |
| offer_media | id, offer_id, kind (REFERENCE_PHOTO, GALLERY), storage_key, tiers JSONB, is_primary | compression tiers for low-bandwidth |
| offer_price_history | id, offer_id, old_price_cents, new_price_cents, changed_at | feeds cart price-change notify |
| clusters | id, name, lga, centroid GEOGRAPHY(POINT), created_at | explicit multi-seller gate key |
| markets | id, cluster_id, name, calendar JSONB, order_cutoff TIME, weather_gate_enabled BOOL | |
| market_day_status | market_id, market_date, status (OPEN, DISABLED_WEATHER, CANCELED), precip_probability, decided_at, UNIQUE(market_id, market_date) | |

### 4.3 `orders` — Cart / Order (stock_holds per Architecture §2.1)

| Table | Key columns | Notes |
|---|---|---|
| stock_holds | per Architecture §2.1 (SOFT/HARD, ACTIVE/CONVERTED/RELEASED/EXPIRED, paystack_reference + unique partial index, idempotency_key unique) | two-phase holds |
| checkout_sessions | id, buyer_id, status (OPEN, COMPLETED, EXPIRED, ABANDONED), items JSONB snapshot, soft_hold_ids UUID[], expires_at | 8-min soft-hold window |
| orders / order_lines | §3.3 | |
| cart_price_change_events | order_id, offer_id, old/new, notified_at | buyer notify-before-pay |

### 4.4 `fulfilment`

| Table | Key columns | Notes |
|---|---|---|
| capacity_slots | id, cluster_id, window_start, window_end, capacity, booked | Redis holds runtime counters; this is the record |
| rider_jobs | id, order_id, rider_id, allocation_score, status (OFFERED, ACCEPTED, REJECTED, IN_TRANSIT, COMPLETED, FAILED), accepted_at | weighted allocation 0.7/0.3 |
| delivery_attempts | id, order_id, rider_id, photo_storage_key, gps JSONB (lat/lng/accuracy/timestamp), pod_status (ATTEMPTED, POD_SUBMITTED, VERIFIED, OFFLINE_FALLBACK, UNDER_REVIEW), submitted_at, reviewed_at | PoD gate data |
| otp_verifications | id, delivery_attempt_id, purpose (POD), code_hash, expires_at, renewal_actor (BUYER, RIDER), used_at | rider-only renewal prohibited |
| weather_gates | id, market_id, date, precip_probability, threshold, decided_at | Market-day gate |

### 4.5 `trust`

| Table | Key columns | Notes |
|---|---|---|
| agent_actions | per Architecture §2.1 | append-only |
| fraud_signals | per Architecture §2.1 | append-only; Ops queue |
| seller_risk_tiers | seller_id, tier (NEW, ELEVATED, VERIFIED_LOW), dispute_rate_30d, qa_rate, updated_at | dynamic QA rate |
| qa_pool_entries | id, order_id, seller_id, amount_cents, rate, entered_at | QA pool contribution |
| reviews | id, reviewer_id, subject_id, order_id, rating, text, flags JSONB | self-dealing detection |

---

## 5. Invariants & Reconciliation (what QA tests prove)

1. `offers`: `reserved_qty + soft_held_qty <= available_qty` — DB CHECK (v2.0 §2.1).
2. `escrow_orders`: closed states require `running_balance_cents = 0` — reconciliation job + tests.
3. `ledger_entries.running_balance` — trigger-enforced (above).
4. `orders.landed_total_cents = item_total_cents + delivery_fee_cents` — DB CHECK.
5. `orders` totals reconcile to `order_lines` sums — app + test.
6. Immutability: `ledger_entries`, `audit_log`, `agent_actions`, `fraud_signals` reject UPDATE/DELETE; `outbox_events` payload is immutable with status updated only via the worker's column-level grant — DB REVOKE + test.
7. Every settlement line has a `paystack_transfer_ref` once CONFIRMED — job + test.
8. Money stored as minor-unit BIGINT end-to-end — boundary tests.
9. Escrow release requires a `delivery_attempts` row with `pod_status = VERIFIED` **or** a logged 24h-silent release with matching `release_scheduled_at` — tests (the §6 Phase-1 forbidden-suite item).

## 6. Data Lifecycle & Backup

- **Append-only, indefinite:** ledger_entries, outbox_events, audit_log, agent_actions, fraud_signals, offer_price_history.
- **Transactional PII:** retention tied to NDPR delete-request path; deletion-cascade map finalized **before Phase 1 exit** (task, not afterthought).
- **Backup:** PITR (WAL archiving) — **RPO ≤ 5 min, RTO ≤ 60 min**, restore drill completed and evidenced before Phase 1 exit. Added to exit-gate checklist.
- **Archival:** completed settlements and closed escrow_orders age out of hot tables to an archive table per policy (TBD with Ops; default ≥ 24 months hot).

## 7. Open Items (non-blocking for Sprint 0.1 — required before data freeze is declared final)

1. Category list + grade-standard catalogue content (product owner). Shapes `categories`, `grade_standards` seed data.
2. Deletion-cascade map sign-off (compliance). Required by Phase 1 exit.
3. Archive/retention policy numbers (Ops + product). Default above.

These three are content/policy inputs, not schema-design blockers — schema shapes are settled here and in Architecture §2.1.
