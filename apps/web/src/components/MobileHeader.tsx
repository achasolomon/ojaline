import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './icons';
import { SearchBox } from './SearchBox';
import { getUnreadCount, subscribeNotifications } from '../lib/notifications';
import { getCartCount, subscribeCart } from '../lib/cart';
import { useNegotiationCount } from '../lib/negotiation';
import { isLoggedIn, AUTH_EVENT } from '../lib/session';

export function MobileHeader({ minimal = false }: { minimal?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [notifCount, setNotifCount] = useState(() => getUnreadCount());
  const [cartCount, setCartCount] = useState(() => getCartCount());
  const [authed, setAuthed] = useState(() => isLoggedIn());
  const haggleCount = useNegotiationCount();

  useEffect(() => {
    const unsubNotif = subscribeNotifications((list) =>
      setNotifCount(list.filter((n) => !n.read).length));
    const unsubCart = subscribeCart(() => setCartCount(getCartCount()));
    const onAuth = () => {
      setAuthed(isLoggedIn());
      setNotifCount(getUnreadCount());
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => {
      unsubNotif();
      unsubCart();
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
            <div className="flex items-center gap-2">
              <Icon name="pin" size={16} className="text-primary" />
              <div>
                <span className="block text-[11px] text-textSecondary">Deliver to</span>
                <span className="text-[13px] font-semibold text-text">Sabo, Yaba, Lagos</span>
              </div>
            </div>
          </div>

          <div className="px-4 pb-3">
            <SearchBox variant="mobile" />
          </div>
        </>
      )}
    </header>
  );
}