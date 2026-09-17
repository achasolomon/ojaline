import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { SearchBox } from '../SearchBox';
import { AddressSwitcher, roleLabel } from '../AddressSwitcher';
import { getCartCount, subscribeCart } from '../../lib/cart';
import { getUnreadCount, subscribeNotifications } from '../../lib/notifications';
import { useNegotiationCount } from '../../lib/negotiation';
import { isLoggedIn, AUTH_EVENT, getUser } from '../../lib/session';
import { subscribeAddresses, activeAddress, addressShortLabel, addressSummary } from '../../lib/addresses';

export function DesktopHeader() {
  const navigate = useNavigate();
  const [cartCount, setCartCount] = useState(() => getCartCount());
  const [unreadCount, setUnreadCount] = useState(() => getUnreadCount());
  const haggleCount = useNegotiationCount();
  const [authed, setAuthed] = useState(() => isLoggedIn());
  const [isSeller, setIsSeller] = useState(() => Boolean(getUser()?.seller_type));
  const [userName, setUserName] = useState(() => getUser()?.full_name?.split(' ')[0] ?? '');
  const [addr, setAddr] = useState(() => activeAddress());
  const [addrOpen, setAddrOpen] = useState(false);

  useEffect(() => {
    const unsubCart = subscribeCart((items) => setCartCount(items.reduce((s, i) => s + i.qty, 0)));
    const unsubNotif = subscribeNotifications((list) => setUnreadCount(list.filter((n) => !n.read).length));
    const unsubAddr = subscribeAddresses(() => setAddr(activeAddress()));
    const onAuth = () => {
      setAuthed(isLoggedIn());
      setIsSeller(Boolean(getUser()?.seller_type));
      setUserName(getUser()?.full_name?.split(' ')[0] ?? '');
      setAddr(activeAddress());
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => {
      unsubCart();
      unsubNotif();
      unsubAddr();
      window.removeEventListener(AUTH_EVENT, onAuth);
    };
  }, []);

  return (
    <header>
      <div className="h-1 bg-primary" />
      <div className="bg-white border-b border-border">
        <div className="max-w-[1200px] mx-auto h-[74px] grid items-center px-[30px]" style={{ gridTemplateColumns: '190px 160px minmax(0,1fr) auto', gap: '16px' }}>
          {/* Logo */}
          <a href="/" className="flex items-center no-underline min-w-0">
            <img src="/images/logo_green.png" alt="Kika" className="h-[38px] w-auto object-contain" />
          </a>

          {/* Location */}
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setAddrOpen((v) => !v)}
              title={addr ? addressSummary(addr) : 'Set your address'}
              className={`flex w-full items-center gap-1.5 bg-transparent border-none cursor-pointer text-left min-w-0 rounded-lg p-1.5 -m-1.5 transition hover:bg-surface ${
                addrOpen ? 'bg-surface' : ''
              }`}
            >
              <Icon name="pin" size={17} className="text-primary shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-textSecondary">{roleLabel()}</span>
                <b className="block truncate text-[13px] text-text font-semibold">
                  {addr ? addressShortLabel(addr) : 'Set your address'}
                </b>
              </span>
              <Icon name="chevronDown" size={13} className="shrink-0 text-textSecondary" />
            </button>
            {addrOpen && <AddressSwitcher variant="dropdown" onClose={() => setAddrOpen(false)} />}
          </div>

          {/* Search */}
          <SearchBox variant="desktop" className="min-w-0" />

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => navigate('/crowd-market')} title="Crowd market" className="flex h-9 items-center gap-1.5 rounded-full px-2 whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary hover:bg-surface transition">
              <Icon name="megaphone" size={16} className="text-primary shrink-0" />
              <span className="hidden xl:inline text-[11px] font-semibold">Crowd market</span>
            </button>
            <button type="button" onClick={() => navigate(isSeller ? '/seller/dashboard' : '/seller/products/new')} title="Sell on Kika" className="flex h-9 items-center gap-1.5 rounded-full px-2 whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary hover:bg-surface transition">
              <Icon name="store" size={16} className="shrink-0" />
              <span className="hidden xl:inline text-[11px] font-semibold">Sell</span>
            </button>
            {authed && (
              <button
                type="button"
                onClick={() => navigate('/negotiations')}
                aria-label="Your negotiations"
                title="Bargaining"
                className="relative grid h-9 w-9 place-items-center rounded-full text-text transition hover:bg-surface hover:text-primary shrink-0"
              >
                <Icon name="handshake" size={18} />
                {haggleCount > 0 && <sup className="absolute -top-0.5 -right-0.5 bg-[#F5A623] text-[#4A2D00] rounded-full px-1.5 py-px text-[8px] leading-none not-italic">{haggleCount}</sup>}
              </button>
            )}
            {authed && (
              <button type="button" onClick={() => navigate('/notifications')} title="Notifications" className="relative flex h-9 items-center gap-1.5 rounded-full px-2 whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary hover:bg-surface transition">
                <Icon name="bell" size={16} className="shrink-0" />
                {unreadCount > 0 && <sup className="absolute top-0.5 right-0 bg-[#df3535] text-white rounded-full px-1.5 py-px text-[8px] leading-none not-italic">{unreadCount}</sup>}
                <span className="hidden xl:inline text-[11px] font-semibold">Notifications</span>
              </button>
            )}
            {authed && (
              <button type="button" onClick={() => navigate('/chat')} title="Messages" className="flex h-9 items-center gap-1.5 rounded-full px-2 whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary hover:bg-surface transition">
                <Icon name="message" size={16} className="shrink-0" />
                <span className="hidden xl:inline text-[11px] font-semibold">Messages</span>
              </button>
            )}
            <button type="button" onClick={() => navigate('/cart')} title="Cart" className="relative flex h-9 items-center gap-1.5 rounded-full px-2 whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary hover:bg-surface transition">
              <Icon name="cart" size={16} className="shrink-0" />
              {cartCount > 0 && <sup className="absolute top-0.5 right-0 bg-[#df3535] text-white rounded-full px-1.5 py-px text-[8px] leading-none not-italic">{cartCount}</sup>}
              <span className="hidden xl:inline text-[11px] font-semibold">Cart</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(authed ? '/account' : '/login')}
              title={authed && userName ? userName : 'Sign in'}
              className="flex h-9 items-center gap-1.5 rounded-full px-2 whitespace-nowrap bg-transparent border-none cursor-pointer text-text hover:text-primary hover:bg-surface transition"
            >
              <Icon name="user" size={16} className="shrink-0" />
              <span className="hidden xl:inline text-[11px] font-semibold max-w-[80px] truncate">{authed && userName ? userName : 'Sign in'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
