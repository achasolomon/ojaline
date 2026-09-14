/**
 * Delivery fee model (single source of truth for prices shown in the web UI
 * and charged by the orders service at checkout).
 *
 * The backend is authoritative: on checkout it resolves the delivery mode
 * (with the cart's offer fulfilment_modes) and stores the fee on the order.
 * Client displays preview only.
 */

export const FULFILMENT_MODES = ['INSTANT', 'SCHEDULED', 'MARKET_DAY'] as const;
export type FulfilmentMode = (typeof FULFILMENT_MODES)[number];

/** Fee in kobo per fulfilment/delivery mode. */
export const DELIVERY_FEE_CENTS: Record<FulfilmentMode, number> = {
  INSTANT: 120000,
  SCHEDULED: 80000,
  MARKET_DAY: 50000,
};

export function computeDeliveryFeeCents(mode: FulfilmentMode): number {
  return DELIVERY_FEE_CENTS[mode];
}

/** Preference order used when a requested mode is not offered by the cart. */
export const FULFILMENT_PREFERENCE: readonly FulfilmentMode[] = ['INSTANT', 'SCHEDULED', 'MARKET_DAY'];