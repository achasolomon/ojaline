# ADR-007 — USSD/SMS Adapter Deploy Shape

**Status:** Proposed (Principal Architect decision — resolves conflict between Architecture v2.0 §1 and Sprint Plan §"Running in Parallel")
**Date:** 13 August 2026

---

## Context / conflict

- Architecture v2.0 §1: *"Phase 1 ships as a modular monolith — five bounded contexts as separate modules/schemas inside one deployable."*
- Sprint Plan (farmer USSD/SMS adapter): *"Separate deploy unit — different trust boundary than API traffic."*

Both documents are otherwise authoritative. This contradiction must be resolved formally before Sprint 1, when the farmer path is built.

## Decision

**The USSD/SMS adapter is a separate thin service from day one.** This is the one justified early extraction from the monolith.

Rationale — the extraction is about **failure and trust isolation, not scale**:

1. **Carrier traffic is the ugliest traffic Ojaline will handle.** USSD/SMS sessions come through Africa's Talking (and ultimately telco aggregators) with retries, timeouts, duplicate deliveries, and unbounded latency. This profile must not be able to degrade or hang the API process, nor be conflated with API incidents in on-call.
2. **Different TLS/trust posture.** The adapter terminates carrier callbacks; it has a narrower attack surface and its own ingress rules. Keeping it separate means the monolith never accepts carrier callbacks directly.
3. **Protocol coupling is local.** Session state (menu navigation, ≤5 screens, `SOLD <sku> <qty>` parsing) is stateful in a way the stateless HTTP API is not; it can tolerate a divergent release cadence.
4. **Bounded context rule preserved.** The adapter owns no schema of its own beyond session scratch data; all reads/writes go through the monolith's public interfaces (exactly the no-cross-module-DB-access rule, applied across the network boundary). It is *not* a sixth bounded context with private tables.

## What this is NOT

Not the first step toward service extraction as a scaling strategy. ADR-005 (modular monolith) remains the deployment shape for the five market contexts. If the adapter must merge back later, it merges; there is no write-side shared state to unwind.

## Consequences

- Two deployables total in Phase 1: the monolith (API + worker) and the USSD/SMS adapter.
- Adapter owns: Africa's Talking callback ingress, session/menu state, `SOLD` parser, SMS reply handling.
- Adapter does NOT own: offers, orders, escrow, users — all via monolith APIs/events.
- One CI job per deployable; adapter has its own contract tests against the monolith API in a test environment.

## Acceptance

Merged; Sprint Plan updated to cite this ADR instead of "different trust boundary" without a decision record.
