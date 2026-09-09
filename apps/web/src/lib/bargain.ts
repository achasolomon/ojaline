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
 * Deterministic haggle price: a stable discount (5-13%) derived from the
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