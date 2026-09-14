import type { Offer } from './api';

export function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function firstName(name: string | null | undefined): string {
  return (name ?? '').split(' ')[0] || 'seller';
}

export function sellerTitle(offer: Offer): string {
  const first = firstName(offer.seller_name);
  switch (offer.channel) {
    case 'RETAILER':
      return `Mama ${first}`;
    case 'WHOLESALE':
      return `Oga ${first}`;
    case 'DIRECT':
      return `Farmer ${first}`;
    default:
      return first;
  }
}

/**
 * Deterministic bargain price: a stable discount (5-13%) derived from the
 * offer id, rounded down to the nearest ₦50. Stable across page loads so the
 * buyer always sees the same "market price".
 */
export function bargainPriceKobo(offer: Offer): number | null {
  if (offer.price_cents == null) return null;
  const pct = 5 + (hashCode(offer.id) % 9);
  const dropped = offer.price_cents * (1 - pct / 100);
  return Math.max(5000, Math.round(dropped / 5000) * 5000);
}

/**
 * The seller's floor: 15% below their ask, rounded to the nearest ₦100.
 * Used when the buyer counters below this line — the seller pushes back.
 */
export function bargainFloorKobo(offer: Offer): number | null {
  if (offer.price_cents == null) return null;
  const ask = bargainPriceKobo(offer) ?? offer.price_cents;
  return Math.max(5000, Math.round((ask * 0.85) / 10000) * 10000);
}

/* ------------------------------------------------------------------ */
/* Volume bargaining — "the more you buy, the cheaper each unit"       */
/* ------------------------------------------------------------------ */

export interface VolumeTier {
  qty: number; // units in the bundle
  per_unit_kobo: number; // seller's per-unit ask at this volume
  total_kobo: number; // per_unit_kobo * qty
  save_pct: number; // % off the listed (dialog) price, rounded to 1dp
}

function channelBonus(channel: Offer['channel']): number {
  switch (channel) {
    case 'WHOLESALE':
      return 8; // generous: bulk is the seller's game
    case 'DIRECT':
      return 4; // farmer moves stock in volume too
    case 'RETAILER':
      return 0; // Mama keeps her margin: discount is at her discretion
    default:
      return 2;
  }
}

/**
 * How much extra discount (in percentage points) this seller grants at
 * heavy volume. Deterministic per offer so the price ladder is stable —
 * every seller has a different depth, like a real stall owner bending
 * the price "just for you".
 */
export function volumeDepthPct(offer: Offer): number {
  const base = 4 + (hashCode(offer.id) % 7); // 4..10
  return base + channelBonus(offer.channel); // 4..18
}

/** The qty at which the seller's full volume discount is reached. */
export function fullDepthQty(offer: Offer): number {
  let stretch = 1;
  switch (offer.channel) {
    case 'WHOLESALE':
      stretch = 2;
      break;
    case 'DIRECT':
      stretch = 1;
      break;
    case 'RETAILER':
      stretch = 0;
      break;
    default:
      stretch = 1;
  }
  return 3 + (hashCode(offer.id) % 3) + stretch; // 3..7
}

/**
 * Per-unit asking price when buying `qty` units together. Never above the
 * single-unit bargain ask, never below 25% off the list price, rounded to
 * the nearest ₦100.
 */
export function volumePerUnitKobo(offer: Offer, qty: number): number | null {
  const single = bargainPriceKobo(offer);
  if (single == null || offer.price_cents == null || qty <= 0) return null;
  const depth = fullDepthQty(offer);
  const fill = Math.min(1, Math.max(0, qty - 1) / Math.max(1, depth - 1));
  const perUnit = single * (1 - (volumeDepthPct(offer) * fill) / 100);
  const hardFloor = offer.price_cents * 0.75;
  // Round to the same ₦50 grid as the single-unit ask so qty=1 never
  // floats above the historic bargain price.
  return Math.max(hardFloor, Math.round(perUnit / 5000) * 5000);
}

/** Per-unit floor the seller will finally settle for at this volume. */
export function volumeFloorKobo(offer: Offer, qty: number): number | null {
  if (qty <= 1) return bargainFloorKobo(offer);
  const ask = volumePerUnitKobo(offer, qty);
  if (ask == null) return null;
  return Math.max(5000, Math.round((ask * 0.9) / 10000) * 10000);
}

/** Quantity ladder offered in the bargaining sheet, e.g. [2, 3, 4, 5, 6]. */
export function ladderQtys(offer: Offer, limit = 7): number[] {
  const min = offer.min_order_qty;
  const top = Math.min(offer.sellable_qty, min + limit - 1);
  const out: number[] = [];
  for (let q = min; q <= top; q += 1) out.push(q);
  if (offer.sellable_qty > top) out.push(offer.sellable_qty);
  return out;
}

/**
 * The seller's full volume ladder: one tier per purchasable bundle, with
 * per-unit price monotonically non-increasing. Empty when not negotiable.
 */
export function volumeTiers(offer: Offer): VolumeTier[] {
  if (offer.price_cents == null) return [];
  let prev = Infinity;
  return ladderQtys(offer).map((qty) => {
    const perUnit = Math.min(prev, volumePerUnitKobo(offer, qty) ?? prev);
    prev = perUnit;
    return {
      qty,
      per_unit_kobo: perUnit,
      total_kobo: perUnit * qty,
      save_pct: Math.round(((offer.price_cents! - perUnit) / offer.price_cents!) * 1000) / 10,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Interactive go-make-I-give-you banter                               */
/* ------------------------------------------------------------------ */

export function pluralUnit(unit: string | null | undefined, qty: number): string {
  const u = unit?.trim() || 'unit';
  if (qty === 1 || /^[a-z]{1,2}$/i.test(u)) return u; // kg, ml, g stay unchanged
  if (/(ch|sh|x|z|ss)$/i.test(u)) return `${u}es`;
  if (/[bcdfghjklmnpqrstvwxz]y$/i.test(u)) return u.replace(/y$/i, 'ies');
  if (/s$/i.test(u)) return u;
  return `${u}s`;
}

/** Honorific for opening a market sentence: Oga / Ma / Broda / Farmer. */
export function sellerHonorific(channel: Offer['channel']): string {
  switch (channel) {
    case 'WHOLESALE':
      return 'Oga';
    case 'RETAILER':
      return 'Ma';
    case 'DIRECT':
      return 'Farmer';
    default:
      return 'Broda';
  }
}

/**
 * The market sentence the buyer shoots at the seller, e.g.
 * "Oga, make I give you ₦50,000 for 3 crates of tomatoes".
 */
export function bargainSentence(offer: Offer, qty: number, totalKobo: number): string {
  const unit = pluralUnit(offer.unit, qty);
  const n = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(totalKobo / 100);
  return `${sellerHonorific(offer.channel)}, make I give you ${n} for ${qty} ${unit} of ${offer.product_name}`;
}

type PitchFn = (priceLabel: string) => string;

const PITCHES: PitchFn[] = [
  (p) => `Oya my customer, na because na you I go drop am: ${p} today!`,
  (p) => `E fit no stay long! I get fresh stock — ${p} for you.`,
  (p) => `Abeg make you take am, ${p} me self don do.`,
  (p) => `Na today price that one: ${p}, before I climb am again.`,
];

export function sellerPitch(offer: Offer, priceLabel: string): string {
  return PITCHES[hashCode(offer.id) % PITCHES.length](priceLabel);
}

export function marketShout(offer: Offer, priceLabel: string): string {
  return `${sellerTitle(offer)}: ${offer.product_name} dey fly for market — ${priceLabel}${
    offer.unit ? `/${offer.unit}` : ''
  }`;
}