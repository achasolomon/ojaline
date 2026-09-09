import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './icons';
import { getUnreadCount, subscribeNotifications } from '../lib/notifications';
import { getCartCount, subscribeCart } from '../lib/cart';
import { isLoggedIn, AUTH_EVENT } from '../lib/session';

export function MobileHeader({ minimal = false }: { minimal?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [query, setQuery] = useState('');
  const [notifCount, setNotifCount] = useState(() => getUnreadCount());
  const [cartCount, setCartCount] = useState(() => getCartCount());
  const [authed, setAuthed] = useState(() => isLoggedIn());

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/offers?q=${encodeURIComponent(query.trim())}`);
  };

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
            <form onSubmit={handleSearch} className="flex items-center bg-surface border border-border rounded-xl px-3 gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="2" className="shrink-0">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for produce, sellers, categories..."
                className="flex-1 border-none bg-transparent text-sm outline-none py-2.5 text-text placeholder:text-[#9CA3AF]"
              />
              <button type="submit" className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center border-none cursor-pointer" aria-label="Search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              </button>
            </form>
          </div>
        </>
      )}
    </header>
  );
}