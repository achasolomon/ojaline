import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './icons';
import { SearchBox } from './SearchBox';
import { AddressSwitcher, roleLabel } from './AddressSwitcher';
import { getUnreadCount, subscribeNotifications } from '../lib/notifications';
import { getCartCount, subscribeCart } from '../lib/cart';
import { useNegotiationCount } from '../lib/negotiation';
import { isLoggedIn, AUTH_EVENT } from '../lib/session';
import { subscribeAddresses, activeAddress, addressShortLabel } from '../lib/addresses';

export function MobileHeader({ minimal = false }: { minimal?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [notifCount, setNotifCount] = useState(() => getUnreadCount());
  const [cartCount, setCartCount] = useState(() => getCartCount());
  const [authed, setAuthed] = useState(() => isLoggedIn());
  const [addr, setAddr] = useState(() => activeAddress());
  const [addrOpen, setAddrOpen] = useState(false);
  const haggleCount = useNegotiationCount();

  useEffect(() => {
    const unsubNotif = subscribeNotifications((list) =>
      setNotifCount(list.filter((n) => !n.read).length));
    const unsubCart = subscribeCart(() => setCartCount(getCartCount()));
    const unsubAddr = subscribeAddresses(() => setAddr(activeAddress()));
    const onAuth = () => {
      setAuthed(isLoggedIn());
      setNotifCount(getUnreadCount());
      setAddr(activeAddress());
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => {
      unsubNotif();
      unsubCart();
      unsubAddr();
      window.removeEventListener(AUTH_EVENT, onAuth);
    };
  }, []);

  return (
    <header className="bg-white border-b border-border">
      <div className="flex items-center gap-2 px-4 py-2">
        {isHome ? (
          <div className="w-9" />
        ) : (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface text-text border-none cursor-pointer"
            aria-label="Go back"
          >
            <Icon name="arrowRight" size={18} className="rotate-180" />
          </button>
        )}
        <button type="button" onClick={() => navigate('/')} className="flex items-center bg-transparent border-none cursor-pointer p-0">
          <img src="/images/logo_green.png" alt="Kika" className="h-[30px] w-auto object-contain" />
        </button>
        <div className="flex-1" />
        <button type="button" onClick={() => navigate('/crowd-market')} className="w-9 h-9 flex items-center justify-center rounded-full bg-transparent border-none cursor-pointer" aria-label="Crowd market">
          <Icon name="megaphone" size={20} className="text-primary" />
        </button>
        {authed && (
          <button type="button" onClick={() => navigate('/negotiations')} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-transparent border-none cursor-pointer" aria-label="Your negotiations">
            <Icon name="handshake" size={20} />
            {haggleCount > 0 && <span className="absolute top-0.5 right-0.5 min-w-4 h-4 rounded-full bg-[#F5A623] text-[#4A2D00] text-[10px] font-bold flex items-center justify-center px-1">{haggleCount > 99 ? '99+' : haggleCount}</span>}
          </button>
        )}
        <button type="button" onClick={() => navigate('/cart')} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-transparent border-none cursor-pointer" aria-label="Cart">
          <Icon name="cart" size={20} />
          {cartCount > 0 && <span className="absolute top-0.5 right-0.5 min-w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center px-1">{cartCount > 99 ? '99+' : cartCount}</span>}
        </button>
        {authed && (
          <button type="button" onClick={() => navigate('/notifications')} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-transparent border-none cursor-pointer" aria-label="Notifications">
            <Icon name="bell" size={20} />
            {notifCount > 0 && <span className="absolute top-0.5 right-0.5 min-w-4 h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1">{notifCount}</span>}
          </button>
        )}
      </div>

      {!minimal && (
        <>
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={() => setAddrOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg bg-transparent border-none cursor-pointer p-0 text-left"
            >
              <Icon name="pin" size={16} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-textSecondary">{roleLabel()}</span>
                <span className="block truncate text-[13px] font-semibold text-text">
                  {addr ? addressShortLabel(addr) : 'Set your address'}
                </span>
              </span>
              <Icon name="chevronDown" size={14} className="shrink-0 text-textSecondary" />
            </button>
          </div>

          <div className="px-4 pb-3">
            <SearchBox variant="mobile" />
          </div>
        </>
      )}

      {addrOpen && <AddressSwitcher variant="sheet" onClose={() => setAddrOpen(false)} />}
    </header>
  );
}