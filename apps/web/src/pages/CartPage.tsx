import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCartItems, setCartQty, removeFromCart, getCartSubtotalKobo, subscribeCart,
  type CartItem,
} from '../lib/cart';
import { naira } from '@ojaline/design';
import { Icon } from '../components/icons';

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
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="bg-white border border-border rounded-xl divide-y divide-border overflow-hidden">
            {items.map((item) => (
              <div key={item.offer_id} className="flex gap-4 p-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-surface shrink-0">
                  {item.image_url ? (
                    <img src={`/api/media/${item.image_url}`} alt={item.product_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-textSecondary">
                      <Icon name="basket" size={24} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text truncate">{item.product_name}</p>
                  <p className="text-xs text-textSecondary mt-0.5">{item.seller_name}</p>
                  <p className="text-xs text-textSecondary mt-0.5">
                    {naira.format(item.unit_price_kobo / 100)}{item.unit ? ` / ${item.unit}` : ''}
                  </p>

                  <div className="flex items-center justify-between mt-3">
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
            <h2 className="text-sm font-bold text-text mb-4">Order summary</h2>
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
              className="w-full bg-primary text-white text-sm font-semibold rounded-xl py-3.5 border-none cursor-pointer hover:bg-primary-dark transition"
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
  );
}