import type { Offer } from './api';
import type { DeliveryWindow } from './delivery';

const CART_KEY = 'kika_cart';

export interface CartItem {
  offer_id: string;
  product_name: string;
  unit_price_kobo: number;
  unit: string | null;
  min_order_qty: number;
  seller_name: string;
  image_url: string | null;
  qty: number;
  delivery_date: string | null;
  delivery_window: DeliveryWindow | null;
}

type CartListener = (items: CartItem[]) => void;

const listeners = new Set<CartListener>();

function emit() {
  const items = read();
  listeners.forEach((l) => l(items));
}

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch { /* ignore quota errors */ }
  emit();
}

export function getCartItems(): CartItem[] {
  return read();
}

export function getCartCount(): number {
  return read().reduce((sum, i) => sum + i.qty, 0);
}

export function getCartSubtotalKobo(): number {
  return read().reduce((sum, i) => sum + i.unit_price_kobo * i.qty, 0);
}

export interface CartSchedule {
  date: string | null;
  window: DeliveryWindow | null;
}

export function addToCart(offer: Offer, qty: number, priceKoboOverride?: number, schedule?: CartSchedule): CartItem[] {
  const items = read();
  const existing = items.find((i) => i.offer_id === offer.id);
  const nextQty = Math.min((existing?.qty ?? 0) + qty, offer.sellable_qty);
  if (existing) {
    existing.qty = nextQty;
    if (priceKoboOverride != null) existing.unit_price_kobo = priceKoboOverride;
    if (schedule) {
      existing.delivery_date = schedule.date;
      existing.delivery_window = schedule.window;
    }
  } else {
    items.push({
      offer_id: offer.id,
      product_name: offer.product_name,
      unit_price_kobo: priceKoboOverride ?? offer.price_cents ?? 0,
      unit: offer.unit ?? null,
      min_order_qty: offer.min_order_qty,
      seller_name: offer.seller_name,
      image_url: offer.primary_image?.storage_key ?? null,
      qty: nextQty,
      delivery_date: schedule?.date ?? null,
      delivery_window: schedule?.window ?? null,
    });
  }
  write(items);
  return read();
}

export function setCartDelivery(offerId: string, schedule: CartSchedule): CartItem[] {
  const items = read();
  const item = items.find((i) => i.offer_id === offerId);
  if (item) {
    item.delivery_date = schedule.date;
    item.delivery_window = schedule.window;
    write(items);
  }
  return read();
}

export function setCartQty(offerId: string, qty: number): CartItem[] {
  const items = read();
  const item = items.find((i) => i.offer_id === offerId);
  if (item) {
    item.qty = Math.max(1, qty);
    write(items);
  }
  return read();
}

export function removeFromCart(offerId: string): CartItem[] {
  write(read().filter((i) => i.offer_id !== offerId));
  return read();
}

export function clearCart(): void {
  write([]);
}

export function subscribeCart(listener: CartListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}