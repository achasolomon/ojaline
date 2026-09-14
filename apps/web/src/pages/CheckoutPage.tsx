import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCartItems, getCartSubtotalKobo, clearCart, subscribeCart, setCartDelivery, type CartItem,
} from '../lib/cart';
import { getAddresses, createCheckout, payOrder, getOrder, type SavedAddress, type Channel } from '../lib/api';
import { nextDeliveryDates, DELIVERY_WINDOWS, formatDeliveryWindow } from '../lib/delivery';
import type { DeliveryWindow } from '../lib/delivery';
import { naira } from '@ojaline/design';
import { DELIVERY_FEE_CENTS, FULFILMENT_PREFERENCE } from '@ojaline/contracts';
import { Icon } from '../components/icons';
import { AddressForm } from '../components/AddressForm';
import { pushNotification } from '../lib/notifications';
import { activeBuyerId, getUser } from '../lib/session';
import { PageTopBar } from '../components/PageTopBar';

type DeliveryMode = 'INSTANT' | 'SCHEDULED' | 'MARKET_DAY';

const FEE = DELIVERY_FEE_CENTS;

const DELIVERY_OPTIONS: { mode: DeliveryMode; label: string; time: string; icon: 'bolt' | 'clock' | 'calendar' }[] = [
  { mode: 'INSTANT', label: 'Instant Delivery', time: 'Delivered within 2 hours', icon: 'bolt' },
  { mode: 'SCHEDULED', label: 'Scheduled Delivery', time: 'Pick a delivery window', icon: 'clock' },
  { mode: 'MARKET_DAY', label: 'Market Day Pickup', time: 'Collect at the market stall', icon: 'calendar' },
];

const PAYMENT_METHODS = [
  { label: 'Card', hint: 'Visa, Mastercard & more', icon: 'card' as const },
  { label: 'Bank Transfer', hint: 'Instant bank transfer', icon: 'bank' as const },
  { label: 'USSD', hint: 'Dial from any phone', icon: 'smartphone' as const },
];

const SLOT_HOURS: Record<DeliveryWindow, { start: string; end: string }> = {
  Morning: { start: '08:00:00', end: '12:00:00' },
  Afternoon: { start: '12:00:00', end: '16:00:00' },
  Evening: { start: '16:00:00', end: '20:00:00' },
};

function isoAt(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

const PENDING_KEY = 'ojaline:pendingOrder';

interface PendingOrder {
  orderId: string;
  reference: string;
  landedTotalCents: number;
  softHoldExpiresAt: string | null;
}

function readPending(): PendingOrder | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingOrder) : null;
  } catch {
    return null;
  }
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>(() => getCartItems());
  const [subtotal, setSubtotal] = useState(() => getCartSubtotalKobo());
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [mode, setMode] = useState<DeliveryMode>(() => {
    const modes = getCartItems().flatMap((i) => i.fulfilment_modes ?? []);
    return (FULFILMENT_PREFERENCE.find((m) => modes.includes(m)) ?? 'SCHEDULED') as DeliveryMode;
  });
  const [payment, setPayment] = useState('Card');
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [paidTotalKobo, setPaidTotalKobo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [schedDate, setSchedDate] = useState<string | null>(() => items.find((i) => i.delivery_date)?.delivery_date ?? null);
  const [schedSlot, setSchedSlot] = useState<DeliveryWindow | null>(() => items.find((i) => i.delivery_window)?.delivery_window ?? null);

  const [showAdd, setShowAdd] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);

  const [hasOrder, setHasOrder] = useState(() => Boolean(readPending()?.orderId));
  const [reservationExpiresAt, setReservationExpiresAt] = useState<number | null>(() => {
    const raw = readPending()?.softHoldExpiresAt;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!reservationExpiresAt || placed) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [reservationExpiresAt, placed]);

  const pickSchedule = (date: string | null, window: DeliveryWindow | null) => {
    setSchedDate(date);
    setSchedSlot(window);
    items.forEach((i) => setCartDelivery(i.offer_id, { date, window }));
  };

  useEffect(() => {
    subscribeCart((updated) => {
      setItems(updated);
      setSubtotal(updated.reduce((s, i) => s + i.unit_price_kobo * i.qty, 0));
      const modes = Array.from(new Set(updated.flatMap((i) => i.fulfilment_modes ?? [])));
      setMode((prev) => (
        modes.length > 0 && !modes.includes(prev)
          ? ((FULFILMENT_PREFERENCE.find((m) => modes.includes(m)) ?? prev) as DeliveryMode)
          : prev
      ));
    });
    const userId = activeBuyerId();
    getAddresses(userId).then((list) => {
      setAddresses(list);
      const def = list.find((a) => a.is_default) ?? list[0];
      if (def) setSelectedAddressId(def.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (!status) return;
    const clean = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('reference');
      window.history.replaceState({}, '', url.toString());
    };
    clean();
    const pending = readPending();
    if (status === 'abandoned') {
      if (pending?.orderId) setHasOrder(true);
      pushNotification({
        type: 'order',
        title: 'Payment cancelled',
        body: pending ? 'Your order is saved here — you can retry payment.' : 'No payment was completed.',
      });
      setError('Payment was not completed. Your order is still reserved — tap "Pay" to retry.');
    } else if (pending?.orderId) {
      setHasOrder(true);
      setPlacing(true);
      let tries = 0;
      const timer = window.setInterval(async () => {
        try {
          const order = await getOrder(pending.orderId);
          if (order.status === 'PAID') {
            window.clearInterval(timer);
            sessionStorage.removeItem(PENDING_KEY);
            clearCart();
            setPlacing(false);
            setPaidTotalKobo(order.landed_total_cents);
            setPlacedOrderId(pending.orderId);
            setPlaced(true);
          } else if (++tries >= 6) {
            window.clearInterval(timer);
            setPlacing(false);
            setError('Payment received, but we are still confirming your order. Check Orders in a moment.');
          }
        } catch {
          if (++tries >= 6) {
            window.clearInterval(timer);
            setPlacing(false);
            setError('We could not confirm your payment yet. Check Orders in a moment.');
          }
        }
      }, 800);
    } else {
      setError('Payment status is unknown.');
    }
  }, []);

  const supportedModes = Array.from(new Set(items.flatMap((i) => i.fulfilment_modes ?? [])));
  const visibleOptions = supportedModes.length > 0
    ? DELIVERY_OPTIONS.filter((d) => supportedModes.includes(d.mode))
    : DELIVERY_OPTIONS;

  const feeKobo = FEE[mode] ?? FEE.SCHEDULED;
  const totalKobo = subtotal + feeKobo;
  const totalUnits = items.reduce((sum, i) => sum + i.qty, 0);

  const CHANNEL_LABELS: Record<Channel, string> = {
    RETAILER: 'Retail',
    WHOLESALE: 'Wholesale',
    DIRECT: 'Direct',
    OPEN: 'Open',
  };
  const buyerChannel = getUser()?.channel ?? 'OPEN';
  const blockedItems = items.filter(
    (i) => i.channel && i.channel !== 'OPEN' && buyerChannel !== 'OPEN' && i.channel !== buyerChannel,
  );
  const blockedChannels = [...new Set(blockedItems.map((i) => i.channel!))];

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;
  const selectedMode = DELIVERY_OPTIONS.find((d) => d.mode === mode) ?? DELIVERY_OPTIONS[1];
  const scheduledText = mode === 'SCHEDULED' ? formatDeliveryWindow(schedDate, schedSlot) : null;

  const remainingMs = reservationExpiresAt != null ? Math.max(0, reservationExpiresAt - now) : null;
  const reservationActive = remainingMs != null && remainingMs > 0;

  const stage = placed ? 2 : (placing || hasOrder ? 1 : 0);

  const onAddressSaved = (addr: SavedAddress) => {
    setAddresses((prev) => [...prev, addr]);
    setSelectedAddressId(addr.id);
    setShowAdd(false);
    setAddressOpen(false);
  };

  const placeOrder = async () => {
    if (placing) return;
    setPlacing(true);
    setError(null);
    try {
      const pending = readPending();
      let orderId = pending?.orderId ?? null;
      let landedTotalCents = pending?.landedTotalCents ?? 0;

      if (!orderId) {
        const checkoutItems = items.map((i) => ({
          offer_id: i.offer_id,
          qty: i.qty,
          unit_price_cents: i.unit_price_kobo,
        }));
        let windowStart: string;
        let windowEnd: string;
        if (mode === 'SCHEDULED' && schedDate && schedSlot && SLOT_HOURS[schedSlot]) {
          windowStart = isoAt(schedDate, SLOT_HOURS[schedSlot].start);
          windowEnd = isoAt(schedDate, SLOT_HOURS[schedSlot].end);
        } else {
          windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          windowEnd = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
        }
        const res = await createCheckout({
          buyerId: activeBuyerId(),
          items: checkoutItems,
          windowStart,
          windowEnd,
          deliveryMode: mode,
        });
        orderId = res.order_id;
        landedTotalCents = res.landed_total_cents;
        if (res.soft_hold_expires_at) {
          const t = new Date(res.soft_hold_expires_at).getTime();
          if (Number.isFinite(t)) {
            setReservationExpiresAt(t);
            setNow(Date.now());
          }
        }
        setHasOrder(true);
      }

      const callbackUrl = `${window.location.origin}/checkout`;
      const pay = await payOrder(orderId, callbackUrl);
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        orderId,
        reference: pay.reference,
        landedTotalCents,
        softHoldExpiresAt: reservationExpiresAt ? new Date(reservationExpiresAt).toISOString() : null,
      }));
      window.location.assign(pay.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong placing your order.');
      setPlacing(false);
    }
  };

  const renderStepper = (
    <div className="bg-white">
      {placed ? (
        <div className="mx-auto flex max-w-[520px] items-center justify-center gap-2 px-4 py-4">
          {['Review', 'Payment', 'Confirm'].map((step, index) => (
            <div key={step} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-white">
                  <Icon name="check" size={13} />
                </span>
                <span className="text-[9px] font-bold text-primary">{step}</span>
              </div>
              {index < 2 && <span className="h-px flex-1 bg-primary/40" />}
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto flex max-w-[520px] items-center justify-center gap-2 px-4 py-4">
          {['Review', 'Payment', 'Confirm'].map((step, index) => {
            const done = index < stage;
            const active = index === stage;
            return (
              <div key={step} className="flex flex-1 items-center gap-2 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${
                    done ? 'bg-primary text-white'
                    : active ? 'bg-primary text-white ring-4 ring-primary/15'
                    : 'border border-border bg-white text-textSecondary'
                  }`}>
                    {done ? <Icon name="check" size={13} /> : index + 1}
                  </span>
                  <span className={`text-[9px] font-bold ${done || active ? 'text-primary' : 'text-textSecondary'}`}>{step}</span>
                </div>
                {index < 2 && (
                  <span className={`h-px flex-1 ${index + 1 <= stage ? 'bg-primary/40' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (placed) {
    return (
      <div className="min-h-full bg-surface/60">
        <PageTopBar title="Checkout" />
        {renderStepper}
        <div className="mx-auto max-w-[520px] px-4 py-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary">
            <Icon name="check" size={28} />
          </div>
          <h1 className="mb-2 text-xl font-black text-text">Payment confirmed</h1>
          <p className="mb-6 text-sm text-textSecondary">
            Your order ({naira.format((paidTotalKobo ?? totalKobo) / 100)}) is paid and now held in escrow until delivery. You'll get delivery updates in your notifications.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate(placedOrderId ? `/orders/${placedOrderId}` : '/orders')}
              className="rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              View your order
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-xl border border-primary bg-white py-3 text-sm font-semibold text-primary transition hover:bg-primary-light"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-full bg-surface/60">
        <PageTopBar title="Checkout" />
        {renderStepper}
        <div className="mx-auto max-w-[520px] px-4 py-14 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary">
            <Icon name="cart" size={28} />
          </div>
          <h1 className="mb-2 text-xl font-black text-text">Nothing to check out</h1>
          <p className="mb-6 text-sm text-textSecondary">Your cart is empty. Add some fresh produce first.</p>
          <button
            type="button"
            onClick={() => navigate('/offers')}
            className="rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            Browse offers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface/60 pb-32">
      <PageTopBar title="Checkout" />
      {renderStepper}

      <div className="mx-auto max-w-[520px] space-y-3 px-4 pt-4">
        {/* Order summary */}
        <section className="rounded-2xl border border-border bg-white px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">Order summary</h2>
            <span className="text-xs font-semibold text-textSecondary">{totalUnits} item{totalUnits === 1 ? '' : 's'}</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-textSecondary">Subtotal</span>
              <span className="font-semibold text-text">{naira.format(subtotal / 100)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-textSecondary">Delivery fee</span>
              <span className="font-semibold text-text">{naira.format(feeKobo / 100)}</span>
            </div>
            {scheduledText && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-textSecondary">Scheduled for</span>
                <span className="font-semibold text-text">{scheduledText}</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-bold text-text">Total</span>
            <span className="text-lg font-black text-primary">{naira.format(totalKobo / 100)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowItems((v) => !v)}
            className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-textSecondary"
          >
            <Icon name={showItems ? 'chevronDown' : 'chevronRight'} size={13} />
            {showItems ? 'Hide items' : `View ${items.length} item${items.length === 1 ? '' : 's'}`}
          </button>
          {showItems && (
            <div className="mt-2 space-y-2 border-t border-border pt-3">
              {items.map((item) => (
                <div key={item.offer_id} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
                    {item.image_url ? (
                      <img src={`/api/media/${item.image_url}`} alt={item.product_name} className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="basket" size={18} className="text-textSecondary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text">{item.product_name}</p>
                    <p className="text-[11px] text-textSecondary">{item.qty} × {naira.format(item.unit_price_kobo / 100)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-text">{naira.format((item.unit_price_kobo * item.qty) / 100)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Delivery */}
        <section className="rounded-2xl border border-border bg-white px-4 py-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">Delivery</h2>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-primary"
            >
              <Icon name="plus" size={13} />
              {showAdd ? 'Cancel' : 'Add new'}
            </button>
          </div>

          {/* Address row */}
          <div className="flex items-start gap-3 py-2">
            <Icon name="pin" size={18} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              {selectedAddress ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    {selectedAddress.label}
                    {selectedAddress.is_default && (
                      <span className="rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-bold text-primary">Default</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-textSecondary">
                    {selectedAddress.address_line1}, {selectedAddress.city}, {selectedAddress.state}
                  </p>
                </>
              ) : addresses.length > 0 ? (
                <p className="text-xs text-textSecondary">Select the delivery address for this order.</p>
              ) : (
                <p className="text-xs text-textSecondary">No saved addresses yet. Add one to complete your order.</p>
              )}
            </div>
            {addresses.length > 0 && (
              <button
                type="button"
                onClick={() => setAddressOpen((v) => !v)}
                className="shrink-0 text-xs font-semibold text-primary"
              >
                {addressOpen ? 'Done' : 'Change'}
              </button>
            )}
          </div>

          {showAdd && (
            <div className="mt-1 border-t border-border pt-3">
              <AddressForm
                makeDefault={addresses.length === 0}
                onSaved={onAddressSaved}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          )}

          {addressOpen && !showAdd && addresses.length > 0 && (
            <div className="mt-1 space-y-1.5 border-t border-border pt-3">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                    selectedAddressId === a.id ? 'border-primary bg-primary-light' : 'border-border bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={selectedAddressId === a.id}
                    onChange={() => { setSelectedAddressId(a.id); setAddressOpen(false); }}
                    className="mt-1 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-text">{a.label}</span>
                      {a.is_default && <span className="rounded-full bg-primary-light px-1.5 py-0.5 text-[9px] font-bold text-primary">Default</span>}
                    </span>
                    <span className="block truncate text-xs text-textSecondary">{a.address_line1}, {a.city}, {a.state}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="my-2 border-t border-border" />

          {/* Delivery mode row */}
          <div className="flex items-center gap-3 py-2">
            <Icon name={selectedMode.icon} size={18} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{selectedMode.label}</p>
              <p className="text-xs text-textSecondary">
                {mode === 'SCHEDULED' && schedDate && schedSlot ? formatDeliveryWindow(schedDate, schedSlot) : selectedMode.time}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-bold text-text">{naira.format(feeKobo / 100)}</span>
              <button
                type="button"
                onClick={() => setModeOpen((v) => !v)}
                className="text-xs font-semibold text-primary"
              >
                {modeOpen ? 'Done' : 'Change'}
              </button>
            </div>
          </div>

          {modeOpen && (
            <div className="mt-1 space-y-1.5 border-t border-border pt-3">
              {visibleOptions.map((opt) => (
                <label
                  key={opt.mode}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    mode === opt.mode ? 'border-primary bg-primary-light' : 'border-border bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    checked={mode === opt.mode}
                    onChange={() => setMode(opt.mode)}
                    className="accent-primary"
                  />
                  <span className="text-primary"><Icon name={opt.icon} size={17} /></span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-text">{opt.label}</span>
                    <span className="block text-xs text-textSecondary">
                      {opt.mode === 'SCHEDULED' && schedDate ? formatDeliveryWindow(schedDate, schedSlot) : opt.time}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-text">{naira.format(FEE[opt.mode] / 100)}</span>
                </label>
              ))}
              {mode === 'SCHEDULED' && (
                <div className="mt-2 rounded-xl bg-surface p-3">
                  <p className="mb-2 text-xs font-bold text-text">Pick a date & time window</p>
                  <div className="mb-2 flex gap-1.5 overflow-x-auto">
                    {nextDeliveryDates(5).map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => pickSchedule(d.date, schedSlot)}
                        className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 transition cursor-pointer ${
                          (schedDate ?? nextDeliveryDates(5)[0].date) === d.date
                            ? 'border-primary bg-primary text-white'
                            : 'border-border bg-white text-text hover:border-primary/40'
                        }`}
                      >
                        <span className="text-[10px] font-bold">{d.label}</span>
                        <span className="text-[9px] opacity-80">{d.day}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {DELIVERY_WINDOWS.map((w) => (
                      <button
                        key={w.slot}
                        type="button"
                        onClick={() => pickSchedule(schedDate, w.slot)}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-center transition cursor-pointer ${
                          (schedSlot ?? DELIVERY_WINDOWS[1].slot) === w.slot
                            ? 'border-primary bg-primary text-white'
                            : 'border-border bg-white text-text hover:border-primary/40'
                        }`}
                      >
                        <span className="block text-[10px] font-bold">{w.label}</span>
                        <span className="block text-[9px] opacity-80">{w.hours}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Payment method */}
        <section className="rounded-2xl border border-border bg-white px-4 py-4">
          <h2 className="mb-3 text-sm font-bold text-text">Payment method</h2>
          <div className="space-y-1.5">
            {PAYMENT_METHODS.map((p) => {
              const selected = payment === p.label;
              return (
                <label
                  key={p.label}
                  onClick={() => setPayment(p.label)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                    selected ? 'border-primary bg-primary-light' : 'border-border bg-white'
                  }`}
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    selected ? 'border-primary bg-primary' : 'border-border'
                  }`}>
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-primary">
                    <Icon name={p.icon} size={16} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-text">{p.label}</span>
                    <span className="block text-xs text-textSecondary">{p.hint}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[9px] font-bold text-textSecondary">Paystack</span>
                </label>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-textSecondary">
            <Icon name="shield" size={13} className="text-primary" />
            Payments are secured by Paystack. Pay only when availability is confirmed.
          </p>
        </section>

        {/* Reservation notice */}
        {hasOrder && (
          <section className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
            reservationActive ? 'border-primary/25 bg-primary-light' : 'border-border bg-surface'
          }`}>
            <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0 text-xs">
              {reservationActive ? (
                <>
                  <p className="font-bold text-text">Two-step stock hold active</p>
                  <p className="mt-0.5 text-textSecondary">
                    Your items are reserved for <span className="font-bold tabular-nums text-primary">{formatCountdown(remainingMs ?? 0)}</span> while you complete payment.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-text">Items held in escrow</p>
                  <p className="mt-0.5 text-textSecondary">
                    Your reservation is held while you complete payment. Opening the payment page re-checks availability.
                  </p>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Bottom payment action */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_20px_rgba(15,48,28,0.08)]">
        <div className="mx-auto max-w-[520px]">
          {error && (
            <p className="mb-2 flex items-start gap-1.5 text-[11px] font-medium text-danger">
              <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          {blockedItems.length > 0 && (
            <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-medium leading-relaxed text-[#7a5200]">
              <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
              <span>
                {blockedItems.length} item{blockedItems.length > 1 ? 's' : ''} on the{' '}
                {blockedChannels.map((c) => CHANNEL_LABELS[c]).join(' / ')} channel
                {blockedItems.length > 1 ? 's' : ''} — your buyer channel is {CHANNEL_LABELS[buyerChannel]} and must match
                to purchase. Remove {blockedItems.length > 1 ? 'those items' : 'it'} from your cart or contact the seller.
              </span>
            </p>
          )}
          <button
            type="button"
            onClick={placeOrder}
            disabled={placing || blockedItems.length > 0}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {placing
              ? 'Processing payment…'
              : blockedItems.length > 0
                ? 'Channel required to purchase'
                : `Pay ${naira.format(totalKobo / 100)}`}
          </button>
        </div>
      </div>
    </div>
  );
}