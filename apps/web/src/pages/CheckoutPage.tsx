import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCartItems, getCartSubtotalKobo, clearCart, subscribeCart, type CartItem,
} from '../lib/cart';
import { getAddresses, createAddress, type SavedAddress } from '../lib/api';
import { setCartDelivery } from '../lib/cart';
import { nextDeliveryDates, DELIVERY_WINDOWS, formatDeliveryWindow } from '../lib/delivery';
import type { DeliveryWindow } from '../lib/delivery';
import { naira } from '@ojaline/design';
import { Icon } from '../components/icons';
import { pushNotification } from '../lib/notifications';
import { getUserId } from '../lib/session';

type DeliveryMode = 'INSTANT' | 'SCHEDULED' | 'MARKET_DAY';

const DELIVERY_OPTIONS: { mode: DeliveryMode; label: string; time: string; feeKobo: number; icon: 'bolt' | 'clock' | 'calendar' }[] = [
  { mode: 'INSTANT', label: 'Instant Delivery', time: 'Delivered within 2 hours', feeKobo: 120000, icon: 'bolt' },
  { mode: 'SCHEDULED', label: 'Scheduled Delivery', time: 'Pick a delivery window', feeKobo: 80000, icon: 'clock' },
  { mode: 'MARKET_DAY', label: 'Market Day Pickup', time: 'Collect at the market stall', feeKobo: 50000, icon: 'calendar' },
];

const PAYMENT_METHODS = [
  { label: 'Card', icon: 'card' as const },
  { label: 'Bank Transfer', icon: 'bank' as const },
  { label: 'USSD', icon: 'smartphone' as const },
];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>(() => getCartItems());
  const [subtotal, setSubtotal] = useState(() => getCartSubtotalKobo());
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [mode, setMode] = useState<DeliveryMode>('SCHEDULED');
  const [payment, setPayment] = useState('Card');
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  const [schedDate, setSchedDate] = useState<string | null>(() => items.find((i) => i.delivery_date)?.delivery_date ?? null);
  const [schedSlot, setSchedSlot] = useState<DeliveryWindow | null>(() => items.find((i) => i.delivery_window)?.delivery_window ?? null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ label: '', address_line1: '', city: '', state: 'Lagos', phone: '' });
  const [savingAddress, setSavingAddress] = useState(false);

  const pickSchedule = (date: string | null, window: DeliveryWindow | null) => {
    setSchedDate(date);
    setSchedSlot(window);
    items.forEach((i) => setCartDelivery(i.offer_id, { date, window }));
  };

  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    const unsub = subscribeCart((updated) => {
      setItems(updated);
      setSubtotal(updated.reduce((s, i) => s + i.unit_price_kobo * i.qty, 0));
    });
    getAddresses(userId).then((list) => {
      setAddresses(list);
      const def = list.find((a) => a.is_default) ?? list[0];
      if (def) setSelectedAddressId(def.id);
    }).catch(() => {});
    return unsub;
  }, []);

  const feeKobo = DELIVERY_OPTIONS.find((d) => d.mode === mode)?.feeKobo ?? 80000;
  const totalKobo = subtotal + feeKobo;

  const submitAddress = async () => {
    const userId = getUserId();
    if (!userId) return;
    setSavingAddress(true);
    try {
      const addr = await createAddress(userId, {
        label: addForm.label || 'Home',
        address_line1: addForm.address_line1,
        city: addForm.city,
        state: addForm.state,
        phone_number: addForm.phone || '08000000000',
        is_default: addresses.length === 0,
      });
      setAddresses([...addresses, addr]);
      setSelectedAddressId(addr.id);
      setShowAdd(false);
      setAddForm({ label: '', address_line1: '', city: '', state: 'Lagos', phone: '' });
    } catch {
      /* skip */
    } finally {
      setSavingAddress(false);
    }
  };

  const placeOrder = () => {
    setPlacing(true);
    setTimeout(() => {
      setPlacing(false);
      setPlaced(true);
      pushNotification({
        type: 'order',
        title: 'Order placed',
        body: `Your order (${naira.format(totalKobo / 100)}) has been received${
          mode === 'SCHEDULED' && schedDate ? ` and is scheduled for ${formatDeliveryWindow(schedDate, schedSlot)}` : ''
        }. We'll confirm availability shortly.`,
      });
      clearCart();
    }, 900);
  };

  if (placed) {
    return (
      <div className="max-w-[620px] mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-light text-primary flex items-center justify-center">
          <Icon name="check" size={28} />
        </div>
        <h1 className="text-xl font-black text-text mb-2">Order placed</h1>
        <p className="text-sm text-textSecondary mb-6">
          Thanks! Your order total is {naira.format(totalKobo / 100)}. You'll get a confirmation and delivery updates in your notifications.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => { setPlaced(false); navigate('/'); }}
            className="bg-primary text-white text-sm font-semibold rounded-xl px-6 py-3 border-none cursor-pointer hover:bg-primary-dark transition"
          >
            Back to home
          </button>
          <button
            type="button"
            onClick={() => { setPlaced(false); navigate('/notifications'); }}
            className="bg-white text-primary border border-primary text-sm font-semibold rounded-xl px-6 py-3 cursor-pointer hover:bg-primary-light transition"
          >
            View notifications
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-[620px] mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-light text-primary flex items-center justify-center">
          <Icon name="cart" size={28} />
        </div>
        <h1 className="text-xl font-black text-text mb-2">Nothing to check out</h1>
        <p className="text-sm text-textSecondary mb-6">Your cart is empty. Add some fresh produce first.</p>
        <button
          type="button"
          onClick={() => navigate('/offers')}
          className="bg-primary text-white text-sm font-semibold rounded-xl px-6 py-3 border-none cursor-pointer hover:bg-primary-dark transition"
        >
          Browse offers
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <h1 className="text-xl font-black text-text mb-6">Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-6">
          {/* Items */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-text mb-4">Items ({items.length})</h2>
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.offer_id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-14 h-14 rounded-lg bg-surface overflow-hidden shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img src={`/api/media/${item.image_url}`} alt={item.product_name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon name="basket" size={20} className="text-textSecondary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{item.product_name}</p>
                    <p className="text-xs text-textSecondary">{item.qty} x {naira.format(item.unit_price_kobo / 100)}</p>
                  </div>
                  <span className="text-sm font-bold text-text shrink-0">{naira.format((item.unit_price_kobo * item.qty) / 100)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Address */}
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-text">Delivery address</h2>
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className="text-xs font-semibold text-primary bg-transparent border-none cursor-pointer hover:underline"
              >
                {showAdd ? 'Cancel' : '+ Add new'}
              </button>
            </div>

            {showAdd ? (
              <div className="bg-surface rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={addForm.label}
                    onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                    placeholder="Label (Home / Office)"
                    className="col-span-2 sm:col-span-1 h-10 px-3 border border-border rounded-lg text-sm outline-none focus:border-primary bg-white"
                  />
                  <input
                    value={addForm.city}
                    onChange={(e) => setAddForm({ ...addForm, city: e.target.value })}
                    placeholder="City"
                    className="col-span-2 sm:col-span-1 h-10 px-3 border border-border rounded-lg text-sm outline-none focus:border-primary bg-white"
                  />
                </div>
                <input
                  value={addForm.address_line1}
                  onChange={(e) => setAddForm({ ...addForm, address_line1: e.target.value })}
                  placeholder="Street address"
                  className="w-full h-10 px-3 border border-border rounded-lg text-sm outline-none focus:border-primary bg-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={addForm.state}
                    onChange={(e) => setAddForm({ ...addForm, state: e.target.value })}
                    placeholder="State"
                    className="h-10 px-3 border border-border rounded-lg text-sm outline-none focus:border-primary bg-white"
                  />
                  <input
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="Phone number"
                    className="h-10 px-3 border border-border rounded-lg text-sm outline-none focus:border-primary bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitAddress}
                  disabled={savingAddress || !addForm.address_line1.trim()}
                  className="w-full bg-primary text-white text-sm font-semibold rounded-lg py-2.5 border-none cursor-pointer hover:bg-primary-dark transition disabled:opacity-50"
                >
                  {savingAddress ? 'Saving...' : 'Save address'}
                </button>
              </div>
            ) : addresses.length === 0 ? (
              <p className="text-xs text-textSecondary">No saved addresses yet. Add one to complete your order.</p>
            ) : (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-start gap-3 border rounded-xl px-4 py-3 cursor-pointer transition ${selectedAddressId === a.id ? 'border-primary bg-primary-light' : 'border-border bg-white'}`}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={selectedAddressId === a.id}
                      onChange={() => setSelectedAddressId(a.id)}
                      className="accent-primary mt-1"
                    />
                    <span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text">{a.label}</span>
                        {a.is_default && <span className="text-[9px] font-bold text-primary bg-primary-light rounded-full px-2 py-0.5">Default</span>}
                      </span>
                      <span className="block text-xs text-textSecondary mt-0.5">{a.address_line1}</span>
                      <span className="block text-xs text-textSecondary">{a.city}, {a.state}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Delivery mode */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-text mb-4">Delivery mode</h2>
            <div className="space-y-2">
              {DELIVERY_OPTIONS.map((opt) => (
                <label
                  key={opt.mode}
                  className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition ${mode === opt.mode ? 'border-primary bg-primary-light' : 'border-border bg-white'}`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    checked={mode === opt.mode}
                    onChange={() => setMode(opt.mode)}
                    className="accent-primary"
                  />
                  <span className="text-primary"><Icon name={opt.icon} size={18} /></span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-text">{opt.label}</span>
                    <span className="block text-xs text-textSecondary">
                      {opt.mode === 'SCHEDULED' && schedDate ? formatDeliveryWindow(schedDate, schedSlot) : opt.time}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-text shrink-0">{naira.format(opt.feeKobo / 100)}</span>
                </label>
              ))}
            </div>
            {mode === 'SCHEDULED' && (
              <div className="mt-3 rounded-xl bg-surface p-3">
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

          {/* Payment */}
          <div className="bg-white border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-text mb-4">Payment method</h2>
            <div className="flex gap-2 flex-wrap">
              {PAYMENT_METHODS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPayment(p.label)}
                  className={`flex items-center gap-2 text-xs font-semibold rounded-xl px-4 py-3 border cursor-pointer transition ${
                    payment === p.label ? 'border-primary bg-primary-light text-primary' : 'border-border bg-white text-text hover:border-primary/40'
                  }`}
                >
                  <Icon name={p.icon} size={15} /> {p.label}
                </button>
              ))}
            </div>
            <p className="flex items-center gap-1 text-[10px] text-textSecondary mt-3">
              <Icon name="shield" size={11} /> Payments are secured by Paystack. Pay only when availability is confirmed.
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white border border-border rounded-xl p-5 sticky top-[135px]">
          <h2 className="text-sm font-bold text-text mb-4">Order summary</h2>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-textSecondary">Subtotal</span>
            <span className="font-semibold">{naira.format(subtotal / 100)}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-textSecondary">Delivery ({DELIVERY_OPTIONS.find((d) => d.mode === mode)?.label})</span>
            <span className="font-semibold">{naira.format(feeKobo / 100)}</span>
          </div>
          {mode === 'SCHEDULED' && schedDate && (
            <div className="flex justify-between text-xs text-textSecondary mb-2">
              <span>Scheduled for</span>
              <span className="font-semibold text-text">{formatDeliveryWindow(schedDate, schedSlot)}</span>
            </div>
          )}
          <div className="border-t border-border pt-4 flex justify-between items-center mb-5">
            <span className="font-bold text-text">Total</span>
            <span className="text-lg font-black text-primary">{naira.format(totalKobo / 100)}</span>
          </div>
          <button
            type="button"
            onClick={placeOrder}
            disabled={placing || !selectedAddressId}
            className="w-full bg-primary text-white text-sm font-semibold rounded-xl py-3.5 border-none cursor-pointer hover:bg-primary-dark transition disabled:opacity-50"
          >
            {placing ? 'Placing order...' : selectedAddressId ? `Place order · ${naira.format(totalKobo / 100)}` : 'Add a delivery address'}
          </button>
        </div>
      </div>
    </div>
  );
}