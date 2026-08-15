

OJALINE
Complete System Documentation	

v1.3-FINAL — Marketplace-First · All residual risks converted to binding rules


Version	1.3-FINAL (supersedes v1.2)

Status	Authoritative product + operational baseline

Companion	Technical Architecture & Engineering Spec v1.3-FINAL

Date	13 August 2026

Ojaline is a full local African marketplace. Logistics is fulfilment infrastructure. This document encodes channel enforcement, two-phase stock holds, realistic PoD, multi-seller gates, perishability rules, farmer/USSD limits, agent transparency, rider terms, inventory sync targets, unit-economics thresholds, grade standards, escrow timing, NDPR consent, fraud monitoring, Ops runbooks, support SLAs and cold-start liquidity — as binding rules, not aspirations.
 
1.	Vision (Unchanged Core)

Marketplace of farmers, market women, wholesale buyers and consumers. Offers and people first; Instant / Scheduled / Market-day fulfilment second. Non-custodial settlement. Phase 1 narrow and honest.

2.	Channel Rules — Hard Enforcement

RULE: Channel is enforced at checkout. Violating orders are rejected, not only flagged.
•	Channels: RETAILER | WHOLESALE | DIRECT | OPEN. Default for many farm-gate bulk lots = RETAILER or WHOLESALE; DIRECT opt-in.
•	Partial-channel listings allowed: one physical lot may be split into multiple Offers (e.g. 300 RETAILER + 200 DIRECT) with separate qty and reservation.
•	Channel change: only if reserved_qty = 0; rate-limited (e.g. once per 7 days) or before first paid order; full audit trail.
•	Arbitrage block: a market woman who buys via RETAILER/WHOLESALE cannot list the same lot as DIRECT in a way that creates same-session resale gaming. Sourcing and resale are separate transactions with inventory reality checks; Ops monitors rapid buylist patterns.
•	Consumer value is preserved by transparent landed cost and optional DIRECT lots that meet min-qty rules — not by unrestricted undercutting of stalls.

3.	Stock Reservation — Two-Phase Holds

RULE: Soft hold on checkout start; hard reservation on payment confirmation; automatic release on timeout or failure.
•	Soft hold: when user enters checkout for an offer (not merely cart), hold qty for 8 minutes. Visible countdown optional.
•	Hard reservation: on Paystack success webhook (or confirmed debit), convert softhard in one DB transaction with idempotency key.
•	Payment lag: soft hold covers the 3–30s webhook window so a second payer cannot steal stock mid-payment.
•	Partial qty: buyer pays for N of available M  reserve N only; remainder stays available immediately.
•	Failure / abandon: release soft hold on timeout, cancel, or failed payment. Reconciliation job every 5 min releases reserved-but-unpaid older than 15 min.
•	Concurrent paid attempts: only one transaction wins the remaining units; loser gets clean stock-unavailable error.

4.	Proof of Delivery & QA Pool — Operational Definitions

RULE: PoD (photo + GPS + OTP) gates release; residual fraud is managed by tiered QA rates, OTP expiry, and defined offline fallback — not by claiming unspoofability.
•	OTP: expires in 15 minutes. Renewal requires buyer-side action (app/SMS), not rider-only request.
•	Offline buyer fallback (Ops-defined): (1) attempt automated call/SMS within 30 min of delivery attempt; (2) if no confirm by 2 hours, rider may mark “delivery attempted + PoD submitted”; (3) Ops reviews; (4) auto-release to seller at 24 hours after successful PoD unless dispute opened — buyer still may open quality dispute inside quality window.
•	QA pool: contribution rate is dynamic by seller risk tier (new / elevated dispute rate = higher rate; verified low-dispute = lower). Caps and depletion alerts to Ops.
•	Quality window separate from delivery confirm. Grade standards defined per category (see §11).

5.	Multi-Seller Orders — Explicit Gates

RULE: Phase 1 multi-seller only if all gates pass. Otherwise force single-seller or sequential orders.
Gates (all required): max 2 sellers per order; same LGA/cluster; each seller fulfilment rate  95% over last 30 days (or new with Ops flag); capacity confirmed for chosen window.
Partial fulfilment: if one line fails, buyer chooses — (a) continue without that line + refund that line, (b) cancel entire order, (c) request replacement seller (Ops/manual in pilot). Seller lines that completed are paid.
UI: per-line status always visible (Paid / Dispatched / Delivered / Pending / Refunded). Sequential Paystack settlement is OK; buyer messaging matches line state.

6.	Market-Day Aggregation — Classification & Weather

RULE: Catalog items carry perishability class. MARKET_DAY mode only if class allows and weather gate is open.
•	Classes: SHELF_GT_7D (eligible for market-day), SHELF_LT_7D (Instant/Scheduled only). Default conservative.
•	Hard order cutoff per market (e.g. day-before 18:00). Rotating calendars first-class in discovery filters (“Available for Thursday market — order by Wed 6pm”).
•	Weather: if forecast precip probability above threshold (e.g. 70%) for market day, auto-disable MARKET_DAY for that market/date; notify open orders; convert or refund per policy.

7.	Farmer Simple Sell & USSD Ceiling

RULE: Smartphone farmers are app/web-first; USSD is fallback with 5 screens per core flow.
•	Price guidance: range + sample size (e.g. “Recent: ■8,500–■12,000 · n=150”), not a single fixed recommend.
•	Min qty shown on offer cards in discovery, not only detail.
•	USSD core only: simple list (menu codes + defaults), order accept/reject (also via SMS “Reply 1/2”), payout check. No deep management on USSD.
•	SMS async for order actions so shared-phone / timeout does not kill acceptance.

8.	Agent — Prevention, Not Only Audit

RULE: Proactive alerts + farmer switch + performance visibility reduce abuse before it compounds.
 
•	If listing price < guidance low by >15%, SMS/push to farmer: “Your price is below recent range — adjust?”
•	Agent metrics internal; farmer-facing rating/track record where useful.
•	Farmer can switch Agent via short USSD/app flow.
•	Attribution remains mandatory for after-the-fact enforcement.

9.	Riders — Contract, Insurance, Allocation

RULE: Before pilot scale beyond initial cohort: signed independent-contractor terms, insurance product, weighted allocation.
•	Agreement: reject jobs allowed, own equipment, no exclusivity — legal review required.
•	Per-delivery insurance partnership (theft/damage/injury) before scaling rider count.
•	Job allocation: weighted (e.g. 70% performance, 30% exploration) so new/lower-rated riders are not starved.

10.	Market Woman Inventory Sync Targets

RULE: Stock sync target <30 seconds after seller update; price sync <5 minutes. USSD/SMS “SOLD item qty” supported.
•	Cart: if price changes while item in cart, update and notify buyer before pay.
•	EOD reconcile remains backup, not the primary control.

11.	Grade Standards & Escrow Timing

RULE: Each category has written grade criteria (size/weight/blemishes) and reference photo requirement at listing.
Escrow: release on delivery.verified; if buyer silent after valid PoD, auto-release at 24h (quality dispute window still available). Timeline shown at checkout.

12.	Unit Economics — Min Basket & Pickup

RULE: Minimum basket derives from marginal cost (Paystack + logistics floor + overhead), not arbitrary marketing.
•	Pickup fulfilment option for low-value orders to avoid forced delivery cost.
•	Phase-in: early pilot may subsidise; then enforce cost-based floor. Documented commercial appendix owns numbers.

13.	NDPR Consent & Fraud Monitoring

•	Explicit consent at signup (location, payments, communications) in plain language; deletion request path.
•	DPAs with Paystack, Africa’s Talking, insurers.
•	Fraud: pattern flags (self-dealing ratings, dispute velocity, device reuse); high-dispute sellers  manual review not auto-refund; device signals where available.

14.	Ops Runbooks, Support, Liquidity (Pre-Launch)

RULE: Named runbooks exist before go-live for: Paystack outage, rider no-show, quality dispute, offline buyer, multi-seller partial fail, weather cancel. Tabletop exercised once.
•	Support SLAs: critical 2h response; standard 24h. Channels: in-app, SMS, USSD callback, WhatsApp. Pilot staffing minimum defined.
•	Cold start: Agent-led farmer onboarding; market association partnerships; buyer incentives (e.g. first-order delivery relief); radio + WhatsApp + physical market presence. Liquidity mix dashboard weekly.

15.	Consumer Offline Browse (Elevated)

RULE: Phase 1 delivers cached offer browse + offline cart that syncs on reconnect. Not deferred as pure nice-to-have for pilot cluster.

16.	Phase 1 Scope Checklist

In: cluster markets; channel hard-enforce; two-phase holds; single-seller default + gated multi-seller; capacity Instant; PoD+tiered QA+24h silent release; farmer app-first + short USSD; Agent alerts/switch; MW stock update paths; grade criteria v1; NDPR consent; fraud flags; runbooks; support roster; liquidity plan; offline browse cache.
Out: unlicensed credit; unrestricted multi-seller; MARKET_DAY on SHELF_LT_7D; Agent-only farmer visibility.

17.	Success Metrics

GMV by channel mix; farmer repeat payout rate; same-seller repeat buy; on-time fulfilment; dispute rate; double-sell incidents (=0 target); support SLA adherence; net promoter / farmer clarity pulse.

Product Leadership · Ojaline v1.3-FINAL — residual risks closed as rules
