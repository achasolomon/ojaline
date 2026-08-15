# OJALINE — System Architecture v2.0
### Corrected & Authoritative — Supersedes v1.3-FINAL for Technical Design
**Author:** Principal Architect / Engineering Director
**Status:** Ready for Planning Phase
**Inputs:** Technical Architecture v1.3-FINAL, System Documentation v1.3-FINAL

---

## 0. Purpose of This Document

v1.3-FINAL correctly identified *what* rules must hold (channel enforcement, two-phase holds, PoD-gated escrow, multi-seller gates). It did not fully specify *how* those rules are enforced under concurrency, failure, and scale. This document closes that gap. Where I've changed or added to v1.3, it's marked **[CORRECTION]** or **[NEW]** with reasoning. Everything else from v1.3 is preserved as-is.

This is the document the team builds from. Sprint planning follows once this is approved.

---

## 1. Domain Model & Bounded Contexts

Five bounded contexts, matching v1.3's layer list — I'm keeping that boundary, it's correct:

| Context | Owns | Does NOT own |
|---|---|---|
| **Offer & Catalog** | Offers, channel, available/reserved/soft-held qty, grade standards | Payment, delivery |
| **Cart / Order** | Two-phase holds, order lines, checkout session | Stock truth (reads it, doesn't own it) |
| **Split-Escrow** | Paystack integration, escrow state, 24h silent release, payouts | Delivery confirmation logic |
| **Fulfilment** | Capacity, multi-seller gates, rider allocation, market-day/weather | Payment |
| **Trust** | PoD, OTP, dispute windows, QA tiers, fraud signals | Stock, payment |

**[CORRECTION] — Deployment shape.** v1.3's architecture doc implies five independently-deployed services from day one. I'm overriding this: **Phase 1 ships as a modular monolith** — five bounded contexts as separate modules/schemas inside one deployable, with enforced no-cross-module-DB-access at the code level (only via module's public interface). Reasoning:

- At pilot scale, five services = five deploy pipelines, five on-call surfaces, five sources of distributed-transaction risk — for a team that doesn't yet have the traffic to justify it.
- The two-phase hold and escrow flows are **transactionally coupled** (soft hold → payment webhook → hard reserve must be atomic). Splitting these across service boundaries from day one forces you into distributed transactions or sagas before you have the operational maturity to run them safely.
- Module boundaries are enforced now so extraction later (when a context needs independent scaling — Split-Escrow is the likely first candidate once payout volume grows) is a refactor, not a rewrite.

This is not "monolith forever" — it's "don't pay microservices tax before you have microservices problems."

---

## 2. Data Architecture

### 2.1 Corrected Schema

Base schema from v1.3 retained; corrections and additions marked.

```sql
-- OFFERS (Offer & Catalog context)
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id),
  channel TEXT NOT NULL CHECK (channel IN ('RETAILER','WHOLESALE','DIRECT','OPEN')),
  lot_id UUID NOT NULL,                        -- [NEW] links partial-channel splits of one physical lot
  available_qty INT NOT NULL CHECK (available_qty >= 0),
  reserved_qty INT NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  soft_held_qty INT NOT NULL DEFAULT 0 CHECK (soft_held_qty >= 0),
  min_order_qty INT NOT NULL DEFAULT 1,
  perishability TEXT NOT NULL CHECK (perishability IN ('SHELF_GT_7D','SHELF_LT_7D')),
  fulfilment_modes TEXT[] NOT NULL,
  geo GEOGRAPHY(POINT) NOT NULL,
  cluster_id UUID NOT NULL,                    -- [NEW] explicit FK, not implied by geo — multi-seller gate needs exact match, not distance calc
  version INT NOT NULL DEFAULT 0,               -- [NEW] optimistic concurrency for non-hot-path updates (price, description)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reserved_qty + soft_held_qty <= available_qty)   -- [NEW] DB-level invariant, not just app-level
);
CREATE INDEX idx_offers_channel_cluster ON offers(channel, cluster_id) WHERE available_qty > reserved_qty + soft_held_qty;

-- STOCK_HOLDS (Cart/Order context)
CREATE TABLE stock_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES offers(id),
  user_id UUID NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  kind TEXT NOT NULL CHECK (kind IN ('SOFT','HARD')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CONVERTED','RELEASED','EXPIRED')), -- [NEW] explicit status, not inferred from expires_at
  expires_at TIMESTAMPTZ NOT NULL,
  order_id UUID NULL,
  paystack_reference TEXT NULL,                 -- [NEW] separate from idempotency_key — see §3.2
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_holds_expiry ON stock_holds(expires_at) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX idx_holds_paystack_ref ON stock_holds(paystack_reference) WHERE paystack_reference IS NOT NULL; -- [NEW] webhook replay guard

-- AGENT_ACTIONS — [CORRECTION] append-only enforced at DB level
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON agent_actions FROM app_user;   -- [NEW] enforced immutability, not just convention

-- FRAUD_SIGNALS — [NEW TABLE] v1.3 mentioned fraud "where available" with no owning structure
CREATE TABLE fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('SELLER','RIDER','BUYER','DEVICE')),
  subject_id UUID NOT NULL,
  signal_type TEXT NOT NULL,          -- e.g. 'RAPID_BUY_LIST', 'DEVICE_REUSE', 'DISPUTE_VELOCITY'
  severity SMALLINT NOT NULL,
  evidence JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','DISMISSED','ACTIONED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**[CORRECTION] — `sellable` must not be a runtime-only computation.** v1.3 defines `sellable = available_qty - reserved_qty - soft_held_qty` as a comment. I've made it a DB CHECK constraint (`reserved_qty + soft_held_qty <= available_qty`) so it's impossible to violate even from a bug in application code, not just discouraged.

### 2.2 Data Ownership & Residency [NEW — not addressed in v1.3]

- **Region:** Single-region Postgres (Nigeria/pilot-cluster region). No cross-border PII replication until a DPA and legal basis exist for a second region.
- **PII isolation:** `users`, `payment_methods`, and KYC fields live in a separate schema (`pii`) with stricter access grants than transactional tables. Application services read via a view layer, never direct table grants, so a future encryption-at-column-level or tokenization change doesn't ripple through every service.
- **Retention:** `agent_actions` and `fraud_signals` — indefinite retention (they're the audit trail). Transactional PII — retention policy tied to NDPR deletion-request path, deletion cascades documented per table before Phase 1 exit, not discovered later.

---

## 3. Reservation & Concurrency Architecture — the core of the system

### 3.1 [CORRECTION] Concurrency mechanism

v1.3 specifies the algorithm (soft hold → hard reserve → release) but not the concurrency primitive. Given the NFR target of **soft-hold p99 <150ms** under contention (popular offers during a market rush are exactly the case that breaks naive designs), pure Postgres row-locking (`SELECT ... FOR UPDATE`) will not reliably hit that target once queue depth grows on a hot row.

**Decision: two-tier reservation.**

1. **Hot gate — Redis, atomic Lua script.** Each offer has a Redis hash tracking `available`, `reserved`, `soft_held`. Soft-hold acquisition is a single atomic Lua script: check `sellable ≥ qty`, decrement `soft_held` budget, set a TTL-matched key. This is what buyers hit at checkout — sub-10ms typically, no lock contention across unrelated offers, and correctness is atomic by construction (Lua scripts run single-threaded in Redis).
2. **System of record — Postgres.** Every Redis-approved hold is immediately persisted to `stock_holds` (ACTIVE, kind=SOFT). Postgres remains the durable source of truth; Redis is a fast-fail gate, never authoritative on its own. If Redis and Postgres ever disagree (Redis restart, eviction), Postgres wins and a reconciliation job rebuilds the Redis counters from Postgres on startup.

**Fail-closed, not fail-open:** if Redis is unavailable, checkout is unavailable for that offer — we do not silently fall back to unprotected Postgres locking under load, because that reintroduces the double-sell risk we built this to prevent. This is a deliberate availability/correctness trade-off given your own "0 double-sell incidents" target is non-negotiable in v1.3 §17.

### 3.2 [CORRECTION] Webhook idempotency — two layers, not one

v1.3 has `idempotency_key UNIQUE` on `stock_holds`, which protects against **duplicate client submission**. It does not protect against **Paystack webhook replay** (a legitimate, expected behavior of most payment webhooks — they retry on non-2xx or timeout).

- **Layer 1 (replay guard):** `paystack_reference` gets its own unique index (added in §2.1). Webhook handler does an upsert-style check: if this reference has already produced a CONVERTED hold, return 200 immediately without re-running the conversion transaction.
- **Layer 2 (duplicate submission guard):** `idempotency_key UNIQUE`, as v1.3 specified, protects the client-side checkout-init path.

Both are required. Neither substitutes for the other — they guard different actors (Paystack's retry behavior vs. the buyer's client).

### 3.3 Two-Phase Reservation — sequence (as designed, confirming v1.3's algorithm with the concurrency layer made explicit)

```
Buyer                Cart/Order         Redis Gate        Postgres           Paystack
  │  checkout start      │                  │                 │                 │
  ├─────────────────────▶│  Lua: check+decr │                 │                 │
  │                       ├─────────────────▶│                │                 │
  │                       │◀── OK / REJECT ──┤                │                 │
  │                       │  INSERT stock_holds (SOFT, TTL 8m) │                 │
  │                       ├────────────────────────────────────▶│                │
  │◀── hold confirmed ────┤                  │                 │                 │
  │  pay ─────────────────┼──────────────────┼─────────────────┼────────────────▶│
  │                       │◀── webhook (may retry) ─────────────┼─────────────────┤
  │                       │  check paystack_reference dedup     │                 │
  │                       │  TX: soft→hard, reserved_qty+=qty, order PAID         │
  │                       ├────────────────────────────────────▶│                │
  │                       │  emit order.paid event (Kafka)      │                 │
```

Reconciliation job (every 5 min, per v1.3) sweeps `ACTIVE` holds past `expires_at` and releases both the Postgres row and the Redis counter — this is the backstop for the case where a client disconnects mid-flow and no explicit release ever fires.

---

## 4. Event Architecture [NEW — v1.3 mentions Kafka but not schema discipline]

> **[AMENDMENT — ADR-008]** The transport below is superseded: Phase 1 uses a **Postgres outbox + worker**, not Kafka. The contract discipline in this section (versioning, coarse topics, dead-letter) is retained unchanged — the transport is the only change.

**[CORRECTION]** v1.3 says "Kafka for side effects" with no schema strategy. Given multiple independent consumers (fulfilment, USSD/SMS notification, cart price-change notifier, agent alerts, fraud signals) an unversioned event will break a consumer silently the first time a producer's payload shape changes.

- **Format:** JSON with a mandatory `schema_version` (int) and `event_type` field on every message. Not Avro/Protobuf — that tooling overhead (schema registry cluster, codegen pipeline) isn't justified at this scale; JSON Schema validation in CI is sufficient discipline for now.
- **Topics (coarse-grained, not one-per-action):**
  - `stock.events` — hold created/converted/released
  - `order.events` — order state transitions
  - `escrow.events` — PoD verified, release scheduled, released, disputed
  - `notification.events` — fan-out target for SMS/USSD/push adapters
- **Consumer contract:** consumers reject/dead-letter unknown major schema versions rather than guessing at field meaning. Producers may add optional fields freely (minor version); removing or repurposing a field is a major version bump with a deprecation window.

---

## 5. Security Architecture [NEW — not present in v1.3 as a distinct section]

| Concern | Approach |
|---|---|
| AuthN | Phone-number + OTP for buyers/farmers (matches existing OTP infra for PoD); standard session tokens, short-lived + refresh |
| AuthZ | Role-based (buyer, seller, rider, agent, ops) enforced at API gateway *and* re-checked at module boundary — never trust gateway-only enforcement for money/stock actions |
| Payment security | No card data ever touches Ojaline servers — Paystack-hosted checkout only. Webhook signature verification mandatory, non-negotiable, before any DB write |
| OTP | Hash stored (per v1.3), 15-min TTL, buyer-initiated renewal only — rider-only renewal explicitly rejected at the API layer, not just by policy |
| Rate limiting | Per-user and per-IP on checkout-init and OTP-request endpoints specifically — these are the two most valuable targets for abuse (stock-lock griefing, OTP brute force) |
| Secrets | Environment-injected via secrets manager (not `.env` in repo, not baked into images), rotated on a defined schedule |
| Audit | `agent_actions` (append-only) + structured audit log on channel-change and escrow-override actions specifically — these are the two v1.3 explicitly calls out as needing full audit trail |
| Fraud | `fraud_signals` table (§2.1) feeds an Ops review queue — pattern flags only, never auto-punitive action in Phase 1, per v1.3's own "not by claiming unspoofability" posture |

---

## 6. Scalability Evolution Path

| Stage | What exists | What does NOT exist yet |
|---|---|---|
| **MVP (Phase 1 pilot)** | Modular monolith, single Postgres primary + read replica, Redis single cluster, Kafka 4 topics | No service extraction, no multi-region, no read-model CQRS |
| **Production (post-pilot)** | Split-Escrow extracted as its own service once payout volume/compliance needs justify isolation; Postgres read replicas for catalog reads | Still no Kubernetes-scale orchestration unless deploy count justifies it |
| **Growth (multi-cluster)** | Fulfilment extracted (capacity/allocation is genuinely regional and benefits from independent scaling); cluster-sharded catalog reads | Full event sourcing — only if audit/replay requirements demand it, not by default |
| **High scale** | Full context-per-service, dedicated fraud/ML pipeline, multi-region with resolved data-residency legal basis | — |

I am explicitly **not** building Kubernetes, service mesh, or event-sourcing at Phase 1. Justify each promotion by an actual bottleneck observed in the NFR dashboards (§7), not by anticipation.

---

## 7. Observability [NEW]

Every NFR target in v1.3's engineering table gets a corresponding dashboard + alert, wired in Phase 0 before any real traffic:

- Soft-hold acquire latency (p50/p99), hard-reserve TX latency (p50/p99)
- Double-sell incident counter (should be permanently zero — alerts on >0, not on rate)
- Stock update propagation lag (target <30s)
- OTP verify → settlement-init lag (target <60s)
- Redis gate availability (fail-closed events counted and alerted separately from generic errors, since fail-closed here is *intended* behavior, not a bug)

---

## 8. Corrections Summary (change log against v1.3)

| # | v1.3 Gap | Correction | Why |
|---|---|---|---|
| 1 | No concurrency primitive specified | Redis Lua gate + Postgres system of record | Meets p99 NFR under contention; fail-closed preserves 0-double-sell guarantee |
| 2 | Idempotency only covers duplicate submission | Added `paystack_reference` unique index as separate replay guard | Webhook retry is expected behavior, not an edge case |
| 3 | `sellable` is a comment, not enforced | DB CHECK constraint | Prevents invariant violation even from application bugs |
| 4 | No event schema discipline | JSON Schema + version field, coarse topics | Prevents silent multi-consumer breakage |
| 5 | Fraud is a footnote | `fraud_signals` table + owning service boundary | Makes the arbitrage-block and dispute-velocity rules (v1.3 §2, §13) actually implementable |
| 6 | `agent_actions` mutability unspecified | DB-level REVOKE UPDATE/DELETE | It's the abuse audit trail — must be tamper-evident |
| 7 | No data residency decision | Single-region, PII schema isolation | Required before schema freeze, not after |
| 8 | Deployment shape implied five services | Modular monolith with enforced module boundaries | Matches team size and pilot traffic; avoids distributed-transaction risk on the hold/escrow flow specifically |

Nothing else in v1.3 is overridden — channel rules, multi-seller gates, PoD/escrow timing, market-day/weather logic, and the Phase 1 scope checklist all stand as written.

---

## 9. Ready for Planning

This architecture is stable enough to plan sprints against. Next artifact should be the **Phase 0/Phase 1 sprint board** built directly from §3 (reservation), §4 (events), and §2 (schema) as the first three sprints' technical backbone.
