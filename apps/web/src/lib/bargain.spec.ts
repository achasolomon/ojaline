import { describe, it, expect } from 'vitest';
import type { Offer } from './api';
import {
  bargainPriceKobo,
  bargainFloorKobo,
  volumeDepthPct,
  volumePerUnitKobo,
  volumeFloorKobo,
  volumeTiers,
  ladderQtys,
  pluralUnit,
  bargainSentence,
  sellerHonorific,
} from './bargain';

function offer(over: Partial<Offer>): Offer {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    seller_id: 's',
    seller_name: 'Mama Bisi',
    channel: 'RETAILER',
    sellable_qty: 10,
    min_order_qty: 1,
    perishability: 'SHELF_LT_7D',
    fulfilment_modes: ['INSTANT'],
    cluster_id: 'c',
    created_at: new Date().toISOString(),
    product_name: 'Tomatoes',
    physical_ref: 'p',
    price_cents: 100000, // ₦1,000 list
    category_id: null,
    primary_image: null,
    ...over,
  };
}

describe('volume depth — the more you buy, the cheaper each unit', () => {
  it('never prices a unit above the single-unit ask', () => {
    const o = offer({});
    const ask = bargainPriceKobo(o)!;
    for (const q of ladderQtys(o)) {
      expect(volumePerUnitKobo(o, q)!).toBeLessThanOrEqual(ask);
    }
  });

  it('never goes below 25% off the list price', () => {
    const o = offer({});
    const floor = o.price_cents! * 0.75;
    for (const q of ladderQtys(o)) {
      expect(volumePerUnitKobo(o, q)!).toBeGreaterThanOrEqual(floor);
    }
  });

  it('is monotonically non-increasing as quantity grows', () => {
    const o = offer({});
    const prices = ladderQtys(o).map((q) => volumePerUnitKobo(o, q)!);
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  it('reaches the deepest discount at full depth qty', () => {
    const o = offer({});
    const last = ladderQtys(o).at(-1)!;
    expect(volumePerUnitKobo(o, last)!).toBeLessThan(volumePerUnitKobo(o, 1)!);
  });

  it('wholesale sellers bless bulk deals harder than retailers (discretion)', () => {
    const id = '2d1c37a1-0000-4000-8000-000000000009';
    const wholesale = volumeDepthPct(offer({ id, channel: 'WHOLESALE' }));
    const direct = volumeDepthPct(offer({ id, channel: 'DIRECT' }));
    const retail = volumeDepthPct(offer({ id, channel: 'RETAILER' }));
    expect(wholesale).toBeGreaterThanOrEqual(direct);
    expect(direct).toBeGreaterThanOrEqual(retail);
  });

  it('volume floor stays at or below the volume ask', () => {
    const o = offer({});
    for (const q of ladderQtys(o)) {
      expect(volumeFloorKobo(o, q)!).toBeLessThanOrEqual(volumePerUnitKobo(o, q)!);
    }
  });

  it('single-unit floor still matches the historic bargain floor', () => {
    const o = offer({});
    expect(volumeFloorKobo(o, 1)).toBe(bargainFloorKobo(o));
  });
});

describe('volume tiers', () => {
  it('returns one tier per ladder qty with totals and savings', () => {
    const o = offer({});
    const tiers = volumeTiers(o);
    const qtys = ladderQtys(o);
    expect(tiers.map((t) => t.qty)).toEqual(qtys);
    const first = tiers[0];
    expect(first.per_unit_kobo).toBe(bargainPriceKobo(o));
    expect(first.total_kobo).toBe(first.per_unit_kobo * first.qty);
    for (const t of tiers) {
      expect(t.save_pct).toBeGreaterThanOrEqual(0);
      expect(t.total_kobo).toBe(t.per_unit_kobo * t.qty);
    }
  });

  it('is empty when the offer has no price', () => {
    expect(volumeTiers(offer({ price_cents: null }))).toEqual([]);
  });
});

describe('quantity ladder', () => {
  it('starts at min_order_qty and stays within sellable_qty', () => {
    const o = offer({ min_order_qty: 2, sellable_qty: 14 });
    const ladder = ladderQtys(o);
    expect(ladder[0]).toBe(2);
    expect(ladder.every((q) => q >= 2 && q <= 14)).toBe(true);
    expect(ladder.includes(14)).toBe(true);
  });

  it('degrades gracefully when there is little stock', () => {
    expect(ladderQtys(offer({ min_order_qty: 1, sellable_qty: 1 }))).toEqual([1]);
  });
});

describe('market banter helpers', () => {
  it('pluralises local units', () => {
    expect(pluralUnit('basket', 3)).toBe('baskets');
    expect(pluralUnit('bunch', 2)).toBe('bunches');
    expect(pluralUnit('bag', 5)).toBe('bags');
    expect(pluralUnit('glass', 2)).toBe('glasses');
    expect(pluralUnit('kg', 2)).toBe('kg');
    expect(pluralUnit('basket', 1)).toBe('basket');
  });

  it('says the agreed sentence a market person would say', () => {
    const o = offer({ channel: 'WHOLESALE', unit: 'crate', product_name: 'Tomatoes', price_cents: 2_000_000 });
    const sentence = bargainSentence(o, 3, 5_000_000);
    expect(sentence).toContain('Oga');
    expect(sentence).toContain('₦50,000');
    expect(sentence).toContain('3 crates');
    expect(sentence).toContain('Tomatoes');
  });

  it('uses Ma for retailers and Farmer for direct sellers', () => {
    expect(sellerHonorific('RETAILER')).toBe('Ma');
    expect(sellerHonorific('DIRECT')).toBe('Farmer');
  });
});