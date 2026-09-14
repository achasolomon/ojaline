import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCartItems, setCartQty, removeFromCart, getCartSubtotalKobo, subscribeCart,
  type CartItem,
} from '../lib/cart';
import { naira } from '@ojaline/design';
import { Icon } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';

export default function CartPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>(() => getCartItems());
  const [subtotal, setSubtotal] = useState(() => getCartSubtotalKobo());

  useEffect(() => {
    const unsub = subscribeCart((updated) => {
      setItems(updated);
      setSubtotal(updated.reduce((s, i) => s + i.unit_price_kobo * i.qty, 0));
    });
    return unsub;
  }, []);

  return (
    <div className="min-h-full bg-surface/60">
      <PageTopBar title={`Your Cart${items.length ? ` (${items.length})` : ''}`} action={<button type="button" onClick={() => navigate('/offers')} className="text-[11px] font-bold text-primary">Edit</button>} />
      <div className="max-w-[1120px] mx-auto px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 hidden items-center justify-between lg:flex">
        <div>
          <h1 className="text-xl font-black text-text">Your Cart</h1>
          <p className="text-xs text-textSecondary mt-1">{items.length === 0 ? '' : `${items.length} item${items.length === 1 ? '' : 's'}`}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/offers')}
          className="text-xs font-semibold text-primary bg-transparent border-none cursor-pointer hover:underline"
        >
          Keep shopping
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-light text-primary flex items-center justify-center">
            <Icon name="cart" size={30} />
          </div>
          <p className="text-sm font-bold text-text">Your cart is empty</p>
          <p className="text-xs text-textSecondary mt-1 mb-5">Fresh produce from trusted sellers is one tap away.</p>
          <button
            type="button"
            onClick={() => navigate('/offers')}
            className="bg-primary text-white text-sm font-semibold rounded-xl px-6 py-3 border-none cursor-pointer hover:bg-primary-dark transition"
          >
            Browse offers
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px] lg:gap-6 items-start">
          <div className="overflow-hidden rounded-2xl border border-border bg-white divide-y divide-border">
            {items.map((item) => (
              <div key={item.offer_id} className="flex gap-3 p-3.5 sm:gap-4 sm:p-4">
                <div className="h-[74px] w-[74px] shrink-0 overflow-hidden rounded-xl bg-surface sm:h-20 sm:w-20">
                  {item.image_url ? (
                    <img src={`/api/media/${item.image_url}`} alt={item.product_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-textSecondary">
                      <Icon name="basket" size={24} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-extrabold text-text sm:text-sm">{item.product_name}</p>
                  <p className="mt-0.5 text-[11px] text-textSecondary">{item.seller_name}</p>
                  <p className="mt-0.5 text-[11px] text-textSecondary">
                    {naira.format(item.unit_price_kobo / 100)}{item.unit ? ` / ${item.unit}` : ''}
                  </p>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCartQty(item.offer_id, Math.max(1, item.qty - 1))}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text cursor-pointer hover:border-primary hover:text-primary transition bg-white"
                        aria-label="Decrease quantity"
                      >
                        <Icon name="minus" size={12} />
                      </button>
                      <span className="min-w-[32px] text-center text-sm font-bold">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => setCartQty(item.offer_id, item.qty + 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text cursor-pointer hover:border-primary hover:text-primary transition bg-white"
                        aria-label="Increase quantity"
                      >
                        <Icon name="plus" size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-text">{naira.format((item.unit_price_kobo * item.qty) / 100)}</span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.offer_id)}
                        className="w-8 h-8 rounded-lg text-textSecondary hover:text-danger hover:bg-danger/10 flex items-center justify-center cursor-pointer bg-transparent border-none transition"
                        aria-label="Remove item"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-white border border-border rounded-xl p-5 sticky top-[135px]">
            <h2 className="mb-4 text-sm font-extrabold text-text">Order summary</h2>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-textSecondary">Subtotal</span>
              <span className="font-semibold text-text">{naira.format(subtotal / 100)}</span>
            </div>
            <div className="flex justify-between text-sm mb-4">
              <span className="text-textSecondary">Delivery</span>
              <span className="text-xs text-textSecondary">Calculated at checkout</span>
            </div>
            <div className="border-t border-border pt-4 flex justify-between items-center mb-4">
              <span className="font-bold text-text">Total</span>
              <span className="text-lg font-black text-primary">{naira.format(subtotal / 100)}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/checkout')}
              className="w-full rounded-xl border-none bg-primary py-3.5 text-sm font-bold text-white transition hover:bg-primary-dark cursor-pointer"
            >
              Proceed to checkout
            </button>
            <p className="flex items-center justify-center gap-1 text-[10px] text-textSecondary mt-3">
              <Icon name="shield" size={11} /> Orders paid through Kika are protected
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
