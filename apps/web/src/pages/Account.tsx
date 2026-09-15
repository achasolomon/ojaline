import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAddresses, setDefaultAddress, deleteAddress, type SavedAddress } from '../lib/api';
import { getCartCount, subscribeCart } from '../lib/cart';
import { getUnreadCount, subscribeNotifications } from '../lib/notifications';
import { getUser, getUserId, clearSession } from '../lib/session';
import { Icon, type IconName } from '../components/icons';
import { AddressForm } from '../components/AddressForm';

const QUICK_LINKS: { label: string; sub: string; icon: IconName; to: string }[] = [
  { label: 'Sell on Kika', sub: 'List a product', icon: 'store', to: '/offers/new' },
  { label: 'My Messages', sub: 'Chat with sellers', icon: 'message', to: '/chat' },
  { label: 'My Orders', sub: 'Track purchases', icon: 'box', to: '/orders' },
  { label: 'Notifications', sub: 'Alerts & updates', icon: 'bell', to: '/notifications' },
  { label: 'My Wishlist', sub: 'Items you saved', icon: 'heart', to: '/wishlist' },
  { label: 'Saved Addresses', sub: 'Manage delivery details', icon: 'pin', to: '#addresses' },
  { label: 'Help Center', sub: 'FAQs & support', icon: 'help', to: '/help' },
];

const AD_STUDIO_LINK: { label: string; sub: string; icon: IconName; to: string } = {
  label: 'Ad Studio',
  sub: 'Popup ads & banners',
  icon: 'megaphone',
  to: '/ads',
};

const PAYOUTS_LINK: { label: string; sub: string; icon: IconName; to: string } = {
  label: 'Payouts', sub: 'Earnings & withdrawals', icon: 'bank', to: '/payouts',
};

const RETURNS_LINK: { label: string; sub: string; icon: IconName; to: string } = {
  label: 'Returns & disputes', sub: 'Refunds, disputes & escalation', icon: 'refresh', to: '/returns',
};

const ANALYTICS_LINK: { label: string; sub: string; icon: IconName; to: string } = {
  label: 'My Analytics', sub: 'Orders, ratings & top products', icon: 'star', to: '/analytics',
};

const OPS_CONSOLE_LINK: { label: string; sub: string; icon: IconName; to: string } = {
  label: 'OPS Console', sub: 'KYC queue, disputes & risk', icon: 'shield', to: '/ops-console',
};

const SELLER_ORDERS_LINK: { label: string; sub: string; icon: IconName; to: string } = {
  label: 'Seller Orders', sub: 'Accept, dispatch & track sales', icon: 'box', to: '/seller/orders',
};

const SELLER_INVENTORY_LINK: { label: string; sub: string; icon: IconName; to: string } = {
  label: 'My Products', sub: 'Manage listings & inventory', icon: 'tag', to: '/seller/products',
};

export default function Account() {
  const navigate = useNavigate();
  const user = getUser();
  const userId = getUserId();
  const quickLinks = user?.seller_type ? [...QUICK_LINKS, SELLER_ORDERS_LINK, SELLER_INVENTORY_LINK, PAYOUTS_LINK, RETURNS_LINK, ANALYTICS_LINK, AD_STUDIO_LINK] : user?.roles?.some((r) => r === 'OPS' || r === 'AGENT') ? [...QUICK_LINKS, RETURNS_LINK, OPS_CONSOLE_LINK] : QUICK_LINKS;
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [cartCount, setCartCount] = useState(() => getCartCount());
  const [unread, setUnread] = useState(() => getUnreadCount());

  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getAddresses(userId).then(setAddresses).catch(() => {});
    if (window.location.hash === '#addresses') {
      setTimeout(() => {
        document.getElementById('addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
    const unsubCart = subscribeCart((items) => setCartCount(items.reduce((s, i) => s + i.qty, 0)));
    const unsubNotif = subscribeNotifications((items) => setUnread(items.filter((n) => !n.read).length));
    return () => { unsubCart(); unsubNotif(); };
  }, [userId]);

  const onSubmitAddress = async (addr: SavedAddress) => {
    setAddresses((prev) => [...prev, addr]);
    setShowAdd(false);
  };

  const makeDefault = async (id: string) => {
    if (!userId) return;
    await setDefaultAddress(userId, id).catch(() => {});
    getAddresses(userId).then(setAddresses).catch(() => {});
  };

  const removeAddress = async (id: string) => {
    if (!userId) return;
    await deleteAddress(userId, id).catch(() => {});
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  };

  const logout = () => {
    clearSession();
    navigate('/');
  };

  const goQuick = (to: string) => {
    if (to === '#addresses') {
      document.getElementById('addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate(to);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Profile header */}
      <div className="bg-white border border-border rounded-xl p-6 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-light text-primary flex items-center justify-center shrink-0">
          <Icon name="user" size={30} />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-black text-text">{user?.full_name || 'My Account'}</h1>
          <p className="text-xs text-textSecondary mt-0.5">{user?.phone || ''} {user?.email ? `· ${user.email}` : ''}</p>
          <p className="text-[10px] text-primary mt-1 bg-primary-light rounded-full inline-block px-2 py-0.5 font-semibold capitalize">{user?.roles?.join(', ') || 'Buyer'}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-4 text-center">
            <div className="px-4">
              <p className="text-lg font-black text-text">{cartCount}</p>
              <p className="text-[10px] text-textSecondary">in cart</p>
            </div>
            <div className="px-4 border-l border-border">
              <p className="text-lg font-black text-text">{unread}</p>
              <p className="text-[10px] text-textSecondary">unread</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger bg-transparent border border-danger/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-danger/5 transition"
          >
            <Icon name="logout" size={13} /> Log out
          </button>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {quickLinks.map((l) => (
          <button
            key={l.label}
            type="button"
            onClick={() => goQuick(l.to)}
            className="flex items-center gap-3 bg-white border border-border rounded-xl p-4 text-left cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition"
          >
            <span className="w-10 h-10 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
              <Icon name={l.icon} size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-text truncate">{l.label}</span>
              <span className="block text-[11px] text-textSecondary truncate">{l.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Saved addresses */}
      <div id="addresses" className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-black text-text">Saved Addresses</h2>
            <p className="text-xs text-textSecondary mt-0.5">
              {user?.seller_type ? 'Pickup location buyers see on your listings' : 'Delivery details used at checkout'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="text-xs font-semibold text-primary bg-transparent border-none cursor-pointer hover:underline"
          >
            {showAdd ? 'Cancel' : '+ Add address'}
          </button>
        </div>

        {showAdd && (
          <div className="mb-4">
            <AddressForm
              makeDefault={addresses.length === 0}
              onSaved={onSubmitAddress}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}

        {addresses.length === 0 ? (
          <p className="text-xs text-textSecondary text-center py-6">
            No saved addresses yet{showAdd ? '' : ' — add one to fast-track checkout'}.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {addresses.map((a) => (
              <div key={a.id} className="border border-border rounded-xl p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-text">{a.label}</span>
                    {a.recipient_name && (
                      <span className="text-[10px] font-semibold text-textSecondary">{a.recipient_name}</span>
                    )}
                    {a.is_default && (
                      <button type="button" onClick={() => makeDefault(a.id)} className="text-[9px] font-bold bg-primary-light text-primary rounded-full px-2 py-0.5 border-none cursor-pointer">Default</button>
                    )}
                  </div>
                  <p className="text-xs text-textSecondary mt-1">
                    {[a.address_line1, a.area, a.city, a.state].filter(Boolean).join(', ')}
                  </p>
                  {a.landmark && <p className="text-[11px] text-textSecondary">Near: {a.landmark}</p>}
                  {a.phone_number && <p className="text-[11px] text-textSecondary">{a.phone_number}</p>}
                  {!a.is_default && (
                    <button
                      type="button"
                      onClick={() => makeDefault(a.id)}
                      className="text-[11px] text-primary bg-transparent border-none cursor-pointer hover:underline px-0 py-1 mt-1 font-semibold"
                    >
                      Set as default
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeAddress(a.id)}
                  className="w-8 h-8 rounded-lg text-textSecondary hover:text-danger hover:bg-danger/10 flex items-center justify-center cursor-pointer bg-transparent border-none transition shrink-0"
                  aria-label="Delete address"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
